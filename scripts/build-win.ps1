# DEditor - Windows production build (.msi + .exe)
# Usage:
#   .\scripts\build-win.ps1                    # keep current project version
#   .\scripts\build-win.ps1 -Version 0.2.0     # PowerShell style
#   .\scripts\build-win.ps1 --version 0.2.0    # GNU style (also accepted)
param(
    # Read the project version unless explicitly overridden.
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content "package.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
}

# ---------------------------------------------------------------------------
# Argument fix-up: PowerShell only recognises `-Version 0.2.0`. If the user
# writes `--version 0.2.0` the parser positional-binds "--version" into
# $Version and pushes "0.2.0" into $args, which trips the regex check
# below. Recover that here so both syntaxes work, and surface a clear
# message for common typos like `--verison`.
# ---------------------------------------------------------------------------
if ($Version.StartsWith("-")) {
    $flag = $Version
    $typos = @("--verison", "--vesion", "--vresion", "--versoin", "--versino", "--ver")
    if ($typos -contains $flag.ToLower()) {
        Write-Host "ERROR: unknown flag '$flag'. Did you mean --version ?"
        exit 1
    }
    if ($flag -ine "--version" -and $flag -ine "-v") {
        Write-Host "ERROR: unknown flag '$flag'"
        Write-Host "Use:"
        Write-Host "  .\scripts\build-win.ps1 -Version 0.2.0"
        Write-Host "  .\scripts\build-win.ps1 --version 0.2.0"
        exit 1
    }
    if ($args.Count -lt 1) {
        Write-Host "ERROR: $flag requires a value, e.g. $flag 0.2.0"
        exit 1
    }
    $Version = [string]$args[0]
    if ($args.Count -gt 1) {
        $args = $args[1..($args.Count - 1)]
    } else {
        $args = @()
    }
}

if ($args.Count -gt 0) {
    Write-Host "ERROR: unknown extra arguments: $($args -join ' ')"
    Write-Host "Use:"
    Write-Host "  -Version <X.Y.Z>   (PowerShell) or"
    Write-Host "  --version <X.Y.Z>  (GNU style)"
    exit 1
}

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
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "Version must look like X.Y.Z (got: $Version)"
    exit 1
}
Write-Host "Bumping version -> $Version"

function Update-BuildManifest([string]$Path, [string]$Pattern, [string]$Replacement) {
    # Windows PowerShell 5.1 defaults to the system code page. Keep manifest
    # metadata and comments as UTF-8 on both Windows PowerShell and PowerShell 7.
    $manifestPath = Join-Path (Get-Location).Path $Path
    $content = [System.IO.File]::ReadAllText($manifestPath)
    $updated = $content -replace $Pattern, $Replacement
    if ($updated -cne $content) {
        [System.IO.File]::WriteAllText($manifestPath, $updated, (New-Object System.Text.UTF8Encoding($false)))
    }
}

# src-tauri/Cargo.toml — `(?m)^version = "..."` only matches a line whose
# first character is `v`. Dependencies use inline tables (`tauri = { version =
# "2", ... }`) where `version` isn't at line start, so they're untouched.
Update-BuildManifest "src-tauri\Cargo.toml" '(?m)^version = "[^"]*"' ('version = "' + $Version + '"')

# src-tauri/tauri.conf.json — only the top-level "version" key exists in
# our config (no plugin or build sub-object uses that key), so a global
# replace is safe. PowerShell's -replace has no "count" parameter.
Update-BuildManifest "src-tauri\tauri.conf.json" '"version":\s*"[^"]*"' ('"version": "' + $Version + '"')

# package.json — top-level "version" only (npm dependency entries are
# `"<name>": "<range>"`, never `"version": "..."`).
Update-BuildManifest "package.json" '"version":\s*"[^"]*"' ('"version": "' + $Version + '"')

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
    Get-ChildItem "$bundleDir\msi\DEditor_${Version}_*.msi" | ForEach-Object {
        Copy-Item -Force $_.FullName -Destination $scriptsDir
        Write-Host "  $scriptsDir\$($_.Name)"
    }
}

if (Test-Path "$bundleDir\nsis") {
    Write-Host ""
    Write-Host "NSIS .exe installer (copied next to this script):"
    Get-ChildItem "$bundleDir\nsis\DEditor_${Version}_*.exe" | ForEach-Object {
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
