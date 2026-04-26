#!/usr/bin/env bash
# DEditor - macOS production build (.dmg + .app)
# Usage:
#   ./scripts/build-mac.sh                          # current arch, version 0.0.1 (default)
#   ./scripts/build-mac.sh --universal              # universal (Apple Silicon + Intel), 0.0.1
#   ./scripts/build-mac.sh --version 0.2.0          # bump to 0.2.0 and build
#   ./scripts/build-mac.sh --version 0.2.0 --universal
set -e

cd "$(dirname "$0")/.."

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script must run on macOS."
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  fi
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust (cargo) not found. Install rustup first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node 18+ first."
  exit 1
fi

# --- Argument parsing ---
# Default version when --version is omitted. Every build pins a known
# version into the three manifest files so the About dialog and bundle
# filenames are always in sync.
VERSION="0.0.1"
TARGET_ARG=""
TARGET_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version|-v)
      if [ -z "${2:-}" ]; then
        echo "--version requires an argument, e.g. --version 0.2.0"
        exit 1
      fi
      VERSION="$2"
      shift 2
      ;;
    --universal)
      TARGET_ARG="--target universal-apple-darwin"
      TARGET_DIR="universal-apple-darwin/"
      shift
      ;;
    -h|--help)
      sed -n '2,7p' "$0"
      exit 0
      ;;
    # Common typos — fail loudly so they don't silently fall through to *)
    # and get drowned in build output.
    --verison|--vesion|--vresion|--versoin|--versino|--ver|-V)
      echo "ERROR: unknown flag \"$1\". Did you mean --version ?"
      echo "Example: ./scripts/build-mac.sh --version 0.2.0"
      exit 1
      ;;
    *)
      echo "ERROR: unknown argument: $1"
      echo "Valid flags:"
      echo "  --version <X.Y.Z>   bump version before building (default 0.0.1)"
      echo "  --universal         build a universal arm64+x64 bundle"
      echo "  -h | --help         show usage"
      exit 1
      ;;
  esac
done

# Validate version format.
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "Version must look like X.Y.Z (got: $VERSION)"
    exit 1
    ;;
esac
echo "Bumping version → $VERSION"
# Replace top-level version fields in the three files that drive the
# bundle. Using `sed -i.bak` for BSD/GNU portability and removing the
# backup afterwards. Each pattern is anchored so we only touch the
# canonical version line and not, e.g., a dependency's version field.
sed -i.bak 's/^version = "[^"]*"/version = "'"$VERSION"'"/' src-tauri/Cargo.toml
rm -f src-tauri/Cargo.toml.bak
# tauri.conf.json: only the top-level "version" key (file has no other).
sed -i.bak 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' src-tauri/tauri.conf.json
rm -f src-tauri/tauri.conf.json.bak
# package.json: only the top-level "version" (npm convention — no nested
# version keys exist; dependencies use simple string maps).
sed -i.bak 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' package.json
rm -f package.json.bak

if [ -n "$TARGET_ARG" ]; then
  echo "Preparing universal-apple-darwin toolchain..."
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
fi

# --- Install deps if needed ---
if [ ! -d node_modules ]; then
  echo "Installing npm dependencies..."
  npm install
fi

# --- Build ---
echo "Building production bundle..."
# shellcheck disable=SC2086
npm run tauri build -- $TARGET_ARG

# --- Locate artifacts ---
BUNDLE_DIR="src-tauri/target/${TARGET_DIR}release/bundle"

echo
echo "Build complete."
echo

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$BUNDLE_DIR/dmg" ]; then
  # Set custom Finder icon on the .dmg file. Modern .icns is data-fork only
  # (DeRez can't read it directly), so route through sips: bake an icon
  # resource into a PNG copy, extract, then Rez-append onto the .dmg.
  SRC_PNG="src-tauri/icons/128x128@2x.png"
  if [ -f "$SRC_PNG" ] && command -v sips >/dev/null && command -v Rez >/dev/null && command -v DeRez >/dev/null && command -v SetFile >/dev/null; then
    TMP_PNG="$(mktemp -t deditor-pngicon).png"
    TMP_RSRC="$(mktemp -t deditor-rsrc).rsrc"
    if cp "$SRC_PNG" "$TMP_PNG" \
       && sips -i "$TMP_PNG" >/dev/null 2>&1 \
       && DeRez -only icns "$TMP_PNG" > "$TMP_RSRC" 2>/dev/null \
       && [ -s "$TMP_RSRC" ]; then
      for dmg in "$BUNDLE_DIR/dmg"/*.dmg; do
        [ -e "$dmg" ] || continue
        Rez -append "$TMP_RSRC" -o "$dmg" 2>/dev/null && SetFile -a C "$dmg" 2>/dev/null
      done
    fi
    rm -f "$TMP_PNG" "$TMP_RSRC"
  fi

  echo "DMG installer (copied next to this script):"
  for dmg in "$BUNDLE_DIR/dmg"/*.dmg; do
    [ -e "$dmg" ] || continue
    cp -f "$dmg" "$SCRIPTS_DIR/"
    echo "  $SCRIPTS_DIR/$(basename "$dmg")"
  done
fi

echo
echo "Original artifacts (kept for debugging):"
[ -d "$BUNDLE_DIR/dmg" ]   && echo "  $BUNDLE_DIR/dmg/"
[ -d "$BUNDLE_DIR/macos" ] && echo "  $BUNDLE_DIR/macos/"

echo
echo "Reminder: unsigned apps will trigger Gatekeeper warnings on first launch."
echo "  Right-click .app -> Open  (local test)"
echo "  Or configure signingIdentity + notarization in tauri.conf.json (distribution)"
