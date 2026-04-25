# DEditor - Windows production build (.msi + .exe)
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

Write-Host ""
Write-Host "Build complete."
Write-Host ""

if (Test-Path "$bundleDir\msi") {
    Write-Host "MSI installer:"
    Get-ChildItem "$bundleDir\msi\*.msi" | ForEach-Object { Write-Host "  $($_.FullName)" }
}

if (Test-Path "$bundleDir\nsis") {
    Write-Host ""
    Write-Host "NSIS .exe installer:"
    Get-ChildItem "$bundleDir\nsis\*.exe" | ForEach-Object { Write-Host "  $($_.FullName)" }
}

Write-Host ""
Write-Host "Reminder: unsigned installers will trigger SmartScreen warnings."
Write-Host "  Configure bundle.windows.certificateThumbprint in tauri.conf.json for production."
