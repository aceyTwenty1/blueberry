# Blueberry - Startup Script (PowerShell, premium)
# Starts 135M puny sidecar + real Gecko browser (dist/Blueberry-Browser)
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start-blueberry.ps1
# Autostart: powershell -ExecutionPolicy Bypass -File scripts/install-startup.ps1
param(
  [switch]$NoSidecar,
  [switch]$Minimize,
  [string]$Model = "HuggingFaceTB/SmolLM2-135M-Instruct"
)

$ErrorActionPreference = "Continue"
$root = "D:\Blueberry"
$browerBat = Join-Path $root "dist\Blueberry-Browser\Blueberry.bat"
$sidecarPy = Join-Path $root "src\ai\local\server.py"
$venvPy = Join-Path $root ".venv\Scripts\python.exe"

Write-Host "`n[Blueberry] Starting..." -ForegroundColor Cyan

# 1. Ensure real browser exists
if (-not (Test-Path $browerBat)) {
  Write-Host "[Blueberry] Real browser not found, building..." -ForegroundColor Yellow
  Set-Location $root
  npm run build:firefox:extension | Out-Host
  & powershell -ExecutionPolicy Bypass -File "$root\scripts\build-real-browser.ps1" | Out-Host
}

# 2. Start sidecar if needed
if (-not $NoSidecar) {
  $portOpen = $false
  try { $null = Test-NetConnection -ComputerName "127.0.0.1" -Port 11435 -InformationLevel Quiet -WarningAction SilentlyContinue; $portOpen = $? } catch {}
  # Fallback netstat check
  if (-not $portOpen) {
    try { $net = netstat -ano 2>$null | Select-String ":11435"; if ($net) { $portOpen = $true } } catch {}
  }

  if (-not $portOpen -and (Test-Path $sidecarPy)) {
    Write-Host "[Blueberry] Starting 135M sidecar ($Model) on :11435..." -ForegroundColor Yellow
    $py = if (Test-Path $venvPy) { $venvPy } else { "python" }
    $args = @($sidecarPy, "--model", $Model, "--port", "11435", "--puny", "--host", "127.0.0.1")
    if ($Minimize) {
      Start-Process $py -ArgumentList $args -WindowStyle Minimized
    } else {
      Start-Process $py -ArgumentList $args -WindowStyle Minimized
    }
    Start-Sleep -Seconds 2
    Write-Host "[Blueberry] Sidecar launched" -ForegroundColor Green
  } elseif ($portOpen) {
    Write-Host "[Blueberry] Sidecar already running on :11435" -ForegroundColor Gray
  }
}

# 3. Launch browser
if (Test-Path $browerBat) {
  Write-Host "[Blueberry] Launching Gecko browser..." -ForegroundColor Cyan
  Start-Process $browerBat -WindowStyle Normal
  Write-Host "[Blueberry] Browser launched - profile: dist/Blueberry-Browser/BlueberryProfile" -ForegroundColor Green
} else {
  Write-Host "[Blueberry] Browser bat missing, trying web-ext..." -ForegroundColor Yellow
  Set-Location $root
  npm run dev:firefox
}

Write-Host "[Blueberry] All done. Close this window." -ForegroundColor Gray
