#!/usr/bin/env bash
# DEditor - macOS / Linux dev launcher
#
# Usage:
#   ./scripts/start.sh             dev launch + wipe vite cache + WebView persistence (default)
#   ./scripts/start.sh --no-reset  skip the wipe (faster restart, but stale state may bite)
set -e

cd "$(dirname "$0")/.."

RESET=1
for arg in "$@"; do
  case "$arg" in
    --no-reset|--keep-cache)
      RESET=0
      ;;
    --reset|--clean-cache)
      RESET=1
      ;;
    -h|--help)
      sed -n '2,6p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 2
      ;;
  esac
done

# --- Reset (default; opt out with --no-reset) ---

if [ "$RESET" -eq 1 ]; then
  case "$(uname -s)" in
    Darwin*)
      if pgrep -f "DEditor.app/Contents/MacOS/DEditor" >/dev/null 2>&1; then
        echo "DEditor is still running. Quit the app (Cmd+Q) first, then re-run." >&2
        echo "(or pass --no-reset to skip the cache wipe and start anyway)" >&2
        exit 1
      fi
      ;;
    Linux*)
      if pgrep -x "deditor" >/dev/null 2>&1; then
        echo "DEditor is still running. Quit it first, then re-run." >&2
        echo "(or pass --no-reset to skip the cache wipe and start anyway)" >&2
        exit 1
      fi
      ;;
  esac

  echo "Clearing vite dep cache (node_modules/.vite)..."
  rm -rf node_modules/.vite

  case "$(uname -s)" in
    Darwin*)
      WEBKIT_DIR="$HOME/Library/WebKit/com.deditor.app"
      if [ -d "$WEBKIT_DIR" ]; then
        echo "Clearing macOS WebView storage ($WEBKIT_DIR)..."
        rm -rf "$WEBKIT_DIR"
      fi
      ;;
    Linux*)
      for d in "$HOME/.local/share/com.deditor.app" "$HOME/.cache/com.deditor.app"; do
        if [ -d "$d" ]; then
          echo "Clearing Linux WebView storage ($d)..."
          rm -rf "$d"
        fi
      done
      ;;
  esac
fi

# --- Toolchain checks ---

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found."
  echo "  Install Node 18+ from https://nodejs.org/"
  echo "  macOS:    brew install node"
  echo "  Linux:    use your distro package manager or nvm"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js $(node --version) is too old. Need Node 18+."
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  fi
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust (cargo) not found."
  echo "  Install rustup. Mainland China users:"
  echo "    curl --proto '=https' --tlsv1.2 -sSf https://rsproxy.cn/rustup-init.sh | sh -s -- -y"
  echo "  Elsewhere:"
  echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"
  echo "  Then re-open the shell and run this script again."
  exit 1
fi

# --- Platform-specific build deps ---

case "$(uname -s)" in
  Linux*)
    if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null && ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
      echo "Tip: install Tauri Linux deps:"
      echo "  Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev"
    fi
    ;;
esac

# --- Install deps if needed ---

if [ ! -d node_modules ] || [ package.json -nt node_modules/.install-stamp ]; then
  echo "Installing npm dependencies..."
  npm install
  touch node_modules/.install-stamp
fi

# --- Run dev ---

echo "Starting Tauri dev (this opens a window when ready)..."
echo "First run compiles ~400 Rust crates and may take 5-10 minutes."
exec npm run tauri dev
