# Blueberry Chromium - Startup (PowerShell, Electron + 135M puny)
# Standalone Chrome-based (Blink) browser - same agents as Gecko, premium UI
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start-chromium.ps1
#        powershell -ExecutionPolicy Bypass -File scripts/start-chromium.ps1 -NoSidecar
param(
  [switch]$NoSidecar,
  [switch]$BuildOnly,
  [string]$Model = "HuggingFaceTB/SmolLM2-135M-Instruct"
)

$ErrorActionPreference = "Continue"
$root = "D:\Blueberry"
$sidecarPy = Join-Path $root "src\ai\local\server.py"
$venvPy = Join-Path $root ".venv\Scripts\python.exe"
$log = Join-Path $root "blueberry-chromium.log"

Write-Host "`n[Blueberry Chromium] Starting..." -ForegroundColor Cyan
"[$(Get-Date)] Starting Chromium" | Out-File -FilePath $log -Encoding utf8

# 1. Build check
if (-not (Test-Path (Join-Path $root "out\main\index.js"))) {
  Write-Host "[Blueberry Chromium] First run - building Electron..." -ForegroundColor Yellow
  Set-Location $root
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Error "npm not found - install Node 18+"; exit 1 }
  npm run build:electron | Out-Host
  if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
}

if ($BuildOnly) { Write-Host "[Blueberry Chromium] Build only - done." -ForegroundColor Green; exit 0 }

# 2. Sidecar
if (-not $NoSidecar) {
  $portOpen = $false
  try { $c = New-Object System.Net.Sockets.TcpClient("127.0.0.1",11435); $c.Close(); $portOpen=$true } catch {}
  if ($portOpen) {
    Write-Host "[Blueberry Chromium] Sidecar already on :11435" -ForegroundColor Gray
  } elseif (Test-Path $sidecarPy) {
    Write-Host "[Blueberry Chromium] Starting 135M sidecar ($Model)..." -ForegroundColor Yellow
    $py = if (Test-Path $venvPy) { $venvPy } else { "python" }
    $args = @($sidecarPy, "--model", $Model, "--port", "11435", "--puny", "--host", "127.0.0.1")
    Start-Process $py -ArgumentList $args -WindowStyle Minimized
    Start-Sleep -Seconds 2
    Write-Host "[Blueberry Chromium] Sidecar launched (check 'Blueberry Sidecar' window)" -ForegroundColor Green
  }
}

# 3. Launch Electron
Write-Host "[Blueberry Chromium] Launching Electron (Chromium)..." -ForegroundColor Cyan
Set-Location $root
# Prefer dev with HMR for best DX; for prod use: npm run build:electron; npx electron out/main/index.js
Start-Process "npm" -ArgumentList "run","dev:electron" -WindowStyle Normal
Write-Host "[Blueberry Chromium] Electron launching - check new window." -ForegroundColor Green
Write-Host "  Log: $log" -ForegroundColor Gray
Write-Host "  Sidecar: http://127.0.0.1:11435/health" -ForegroundColor Gray
