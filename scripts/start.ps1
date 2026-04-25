# DEditor - Windows dev launcher
$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

# --- Toolchain checks ---

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found."
    Write-Host "  Install Node 18+ from https://nodejs.org/"
    Write-Host "  Or via winget: winget install OpenJS.NodeJS.LTS"
    exit 1
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
    Write-Host "Node.js $(node --version) is too old. Need Node 18+."
    exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Rust (cargo) not found."
    Write-Host "  Install rustup from https://rustup.rs/"
    Write-Host "  Or via winget: winget install Rustlang.Rustup"
    Write-Host "  Then restart the terminal and run this script again."
    exit 1
}

# --- WebView2 check (Win10/11 normally has it) ---

$webview2Key = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
if (-not (Test-Path $webview2Key)) {
    Write-Host "Tip: WebView2 Runtime not detected. Tauri may still work but install it from:"
    Write-Host "  https://developer.microsoft.com/microsoft-edge/webview2/"
}

# --- Install deps if needed ---

if (-not (Test-Path node_modules) -or `
    (Get-Item package.json).LastWriteTime -gt (Get-Item node_modules\.install-stamp -ErrorAction SilentlyContinue).LastWriteTime) {
    Write-Host "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    New-Item -ItemType File -Path node_modules\.install-stamp -Force | Out-Null
}

# --- Run dev ---

Write-Host "Starting Tauri dev (this opens a window when ready)..."
Write-Host "First run compiles ~400 Rust crates and may take 5-15 minutes."
npm run tauri dev
