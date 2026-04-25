#!/usr/bin/env bash
# DEditor - macOS production build (.dmg + .app)
# Usage:
#   ./scripts/build-mac.sh                # current arch (arm64 or x64)
#   ./scripts/build-mac.sh --universal    # universal (Apple Silicon + Intel)
set -e

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
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

# --- Optional universal target ---
TARGET_ARG=""
TARGET_DIR=""
if [[ "${1:-}" == "--universal" ]]; then
  echo "Preparing universal-apple-darwin toolchain..."
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  TARGET_ARG="--target universal-apple-darwin"
  TARGET_DIR="universal-apple-darwin/"
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
