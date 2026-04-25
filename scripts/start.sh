#!/usr/bin/env bash
# DEditor - macOS / Linux dev launcher
set -e

cd "$(dirname "$0")/.."

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
