# DEditor - Windows production build (.msi + .exe)
# Usage:
#   .\scripts\build-win.ps1                  # version 0.0.1 (default)
#   .\scripts\build-win.ps1 -Version 0.2.0   # bump to 0.2.0 and build
param(
    # Default version when -Version is omitted. Every build pins a known
    # version into the three manifest files so the About dialog and
    # bundle filenames stay in sync.
    [string]$Version = "0.0.1"
)

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
    Write-Host "This script must run on Windows."
    exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Rust (cargo) not found. Install rustup from https://rustup.rs/"
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Install Node 18+ from https://nodejs.org/"
    exit 1
}

# --- Visual C++ Build Tools check ---
$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $cl) {
    Write-Host "Tip: cl.exe not on PATH. If build fails, install:"
    Write-Host "  https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    Write-Host "  (Workload: Desktop development with C++)"
}

# --- Version bump ---
if ($Version -notmatch '^\d+\.\d+\.\d+') {
    Write-Host "Version must look like X.Y.Z (got: $Version)"
    exit 1
}
Write-Host "Bumping version -> $Version"

# src-tauri/Cargo.toml — anchored to start-of-line so we don't touch
# version fields inside dependency inline tables.
$cargo = Get-Content "src-tauri\Cargo.toml" -Raw
$cargo = $cargo -replace '(?m)^version = "[^"]*"', ('version = "' + $Version + '"')
Set-Content -NoNewline -Path "src-tauri\Cargo.toml" -Value $cargo

# src-tauri/tauri.conf.json — only the top-level "version" key exists.
$conf = Get-Content "src-tauri\tauri.conf.json" -Raw
$conf = $conf -replace '"version":\s*"[^"]*"', ('"version": "' + $Version + '"'), 1
Set-Content -NoNewline -Path "src-tauri\tauri.conf.json" -Value $conf

# package.json — top-level "version" only.
$pkg = Get-Content "package.json" -Raw
$pkg = $pkg -replace '"version":\s*"[^"]*"', ('"version": "' + $Version + '"'), 1
Set-Content -NoNewline -Path "package.json" -Value $pkg

# --- Install deps if needed ---
if (-not (Test-Path node_modules)) {
    Write-Host "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# --- Build ---
Write-Host "Building production bundle..."
npm run tauri build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# --- Locate artifacts ---
$bundleDir = "src-tauri\target\release\bundle"
$scriptsDir = $PSScriptRoot

Write-Host ""
Write-Host "Build complete."
Write-Host ""

if (Test-Path "$bundleDir\msi") {
    Write-Host "MSI installer (copied next to this script):"
    Get-ChildItem "$bundleDir\msi\*.msi" | ForEach-Object {
        Copy-Item -Force $_.FullName -Destination $scriptsDir
        Write-Host "  $scriptsDir\$($_.Name)"
    }
}

if (Test-Path "$bundleDir\nsis") {
    Write-Host ""
    Write-Host "NSIS .exe installer (copied next to this script):"
    Get-ChildItem "$bundleDir\nsis\*.exe" | ForEach-Object {
        Copy-Item -Force $_.FullName -Destination $scriptsDir
        Write-Host "  $scriptsDir\$($_.Name)"
    }
}

Write-Host ""
Write-Host "Original artifacts (kept for debugging):"
if (Test-Path "$bundleDir\msi")  { Write-Host "  $bundleDir\msi\" }
if (Test-Path "$bundleDir\nsis") { Write-Host "  $bundleDir\nsis\" }

Write-Host ""
Write-Host "Reminder: unsigned installers will trigger SmartScreen warnings."
Write-Host "  Configure bundle.windows.certificateThumbprint in tauri.conf.json for production."
