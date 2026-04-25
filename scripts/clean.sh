#!/usr/bin/env bash
# DEditor - clean build artifacts
# Usage:
#   ./scripts/clean.sh         # remove build outputs (target, dist, copied bundles)
#   ./scripts/clean.sh --all   # also remove node_modules + package-lock.json
set -e

cd "$(dirname "$0")/.."

ALL=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --all)     ALL=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg"
      exit 1
      ;;
  esac
done

remove() {
  local p="$1"
  [ -e "$p" ] || return 0
  local size=""
  if [ -d "$p" ]; then
    size=" ($(du -sh "$p" 2>/dev/null | cut -f1))"
  fi
  if $DRY_RUN; then
    echo "  [dry-run] would remove: $p$size"
  else
    rm -rf "$p"
    echo "  removed: $p$size"
  fi
}

echo "Cleaning build artifacts..."

# Frontend
remove dist
remove dist-ssr

# Rust target dir (largest - usually GB)
remove src-tauri/target

# Tauri auto-generated schemas
remove src-tauri/gen

# Bundles copied next to scripts
SCRIPTS_DIR="$(cd scripts && pwd)"
shopt -s nullglob
for f in "$SCRIPTS_DIR"/*.dmg "$SCRIPTS_DIR"/*.app "$SCRIPTS_DIR"/*.msi "$SCRIPTS_DIR"/*.exe; do
  remove "$f"
done
shopt -u nullglob

# Stale stamp files
remove node_modules/.install-stamp

if $ALL; then
  remove node_modules
  remove package-lock.json
  remove .DS_Store
fi

echo
if $DRY_RUN; then
  echo "Dry run complete. Re-run without --dry-run to actually delete."
else
  echo "Clean complete."
fi
$ALL || echo "(Tip: pass --all to also wipe node_modules + package-lock.json)"
