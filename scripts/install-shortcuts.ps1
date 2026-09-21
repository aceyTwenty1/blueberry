# Blueberry - One-click install: Desktop + Start Menu shortcuts
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install-shortcuts.ps1
# Remove: powershell -ExecutionPolicy Bypass -File scripts/install-shortcuts.ps1 -Remove
# Result: double-click "Blueberry" on the Desktop or find it in Start Menu.
# It launches start-blueberry.bat (sidecar on :11435 + Gecko browser).

param([switch]$Remove)

$ErrorActionPreference = "Stop"
$root = "D:\Blueberry"
$target = Join-Path $root "start-blueberry.bat"
$icon = Join-Path $root "resources\icon.ico"

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\Blueberry"

$shortcuts = @(
  (Join-Path $desktop "Blueberry.lnk"),
  (Join-Path $startMenu "Blueberry.lnk")
)

if ($Remove) {
  foreach ($s in $shortcuts) {
    if (Test-Path $s) { Remove-Item -Force $s; Write-Host "[Blueberry] Removed $s" -ForegroundColor Yellow }
  }
  if ((Test-Path $startMenu) -and -not (Get-ChildItem $startMenu -Force)) {
    Remove-Item -Force $startMenu
  }
  Write-Host "[Blueberry] Shortcuts removed." -ForegroundColor Green
  exit 0
}

if (-not (Test-Path $target)) { Write-Error "Launcher not found: $target"; exit 1 }

if (-not (Test-Path $startMenu)) { New-Item -ItemType Directory -Force -Path $startMenu | Out-Null }

$WshShell = New-Object -ComObject WScript.Shell
foreach ($s in $shortcuts) {
  $sc = $WshShell.CreateShortcut($s)
  $sc.TargetPath = $target
  $sc.WorkingDirectory = $root
  if (Test-Path $icon) { $sc.IconLocation = $icon }
  $sc.Description = "Blueberry - AI-native browser (sidecar + Gecko)"
  $sc.Save()
  Write-Host "[Blueberry] Created: $s" -ForegroundColor Green
}

Write-Host "`n[Blueberry] Done - double-click Blueberry on the Desktop." -ForegroundColor Cyan
Write-Host "  Remove: powershell -ExecutionPolicy Bypass -File scripts/install-shortcuts.ps1 -Remove" -ForegroundColor Gray
