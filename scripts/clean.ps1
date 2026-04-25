# DEditor - clean build artifacts
# Usage:
#   .\scripts\clean.ps1            # remove build outputs (target, dist, copied bundles)
#   .\scripts\clean.ps1 -All       # also remove node_modules + package-lock.json
#   .\scripts\clean.ps1 -DryRun    # show what would be removed without deleting
param(
    [switch]$All,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

function Remove-Item-Logged {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $size = ""
    try {
        $item = Get-Item -LiteralPath $Path
        if ($item.PSIsContainer) {
            $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
                      Measure-Object -Property Length -Sum).Sum
            if ($bytes -gt 0) { $size = " ({0:N1} MB)" -f ($bytes / 1MB) }
        } else {
            $size = " ({0:N1} KB)" -f ($item.Length / 1KB)
        }
    } catch {}
    if ($DryRun) {
        Write-Host "  [dry-run] would remove: $Path$size"
    } else {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  removed: $Path$size"
    }
}

Write-Host "Cleaning build artifacts..."

# Frontend
Remove-Item-Logged "dist"
Remove-Item-Logged "dist-ssr"

# Rust target dir (largest - usually GB)
Remove-Item-Logged "src-tauri\target"

# Tauri auto-generated schemas
Remove-Item-Logged "src-tauri\gen"

# Bundles copied next to scripts
foreach ($pattern in "*.dmg", "*.app", "*.msi", "*.exe") {
    Get-ChildItem -LiteralPath "scripts" -Filter $pattern -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-Item-Logged $_.FullName }
}

# Stale stamp file
Remove-Item-Logged "node_modules\.install-stamp"

if ($All) {
    Remove-Item-Logged "node_modules"
    Remove-Item-Logged "package-lock.json"
}

Write-Host ""
if ($DryRun) {
    Write-Host "Dry run complete. Re-run without -DryRun to actually delete."
} else {
    Write-Host "Clean complete."
}
if (-not $All) {
    Write-Host "(Tip: pass -All to also wipe node_modules + package-lock.json)"
}
