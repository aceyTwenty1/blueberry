# Blueberry - Dual Browser Launcher (Gecko + Chromium)
# Lets you choose which engine to start - both share the same 135M sidecar on :11435 and same premium UI
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start-dual.ps1

param([ValidateSet("gecko","chromium","both")][string]$Engine = "")

$root = "D:\Blueberry"

function Show-Menu {
  Clear-Host
  Write-Host @"
   ____  _            _                          
  | __ )| |_   _  ___| |__   ___ _ __ _ __ _   _ 
  |  _ \| | | | |/ _ \ '_ \ / _ \ '__| '__| | | |
  | |_) | | |_| |  __/ |_) |  __/ |  | |  | |_| |
  |____/|_|\__,_|\___|_.__/ \___|_|  |_|   \__, |
                                           |___/ 
  Dual Browser - Gecko (Firefox) + Chromium (Electron)
  Same 135M puny local model (HuggingFaceTB/SmolLM2-135M-Instruct) on :11435
"@ -ForegroundColor Cyan
  Write-Host "  [1] Gecko (Firefox) - real browser at dist/Blueberry-Browser (348MB, vertical tabs, userChrome)" -ForegroundColor White
  Write-Host "  [2] Chromium (Electron) - standalone at out/main (WebContentsView, premium)" -ForegroundColor White
  Write-Host "  [3] Both (side-by-side, share sidecar)" -ForegroundColor Gray
  Write-Host "  [q] Quit" -ForegroundColor DarkGray
  Write-Host ""
}

# Ensure sidecar helper
function Ensure-Sidecar {
  try { $c=New-Object System.Net.Sockets.TcpClient("127.0.0.1",11435); $c.Close(); Write-Host "[Blueberry] Sidecar already on :11435" -ForegroundColor Gray; return } catch {}
  $py = Join-Path $root ".venv\Scripts\python.exe"
  if (-not (Test-Path $py)) { $py = "python" }
  $sidecar = Join-Path $root "src\ai\local\server.py"
  if (Test-Path $sidecar) {
    Write-Host "[Blueberry] Starting 135M sidecar..." -ForegroundColor Yellow
    Start-Process $py -ArgumentList @($sidecar,"--model","HuggingFaceTB/SmolLM2-135M-Instruct","--port","11435","--puny") -WindowStyle Minimized
    Start-Sleep 2
  }
}

if (-not $Engine) {
  Show-Menu
  $choice = Read-Host "Choose [1/2/3/q]"
  switch ($choice) {
    "1" { $Engine="gecko" }
    "2" { $Engine="chromium" }
    "3" { $Engine="both" }
    default { exit 0 }
  }
}

Ensure-Sidecar

switch ($Engine) {
  "gecko" {
    Write-Host "`n[Blueberry] Launching Gecko..." -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts/start-blueberry.ps1")
  }
  "chromium" {
    Write-Host "`n[Blueberry] Launching Chromium..." -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts/start-chromium.ps1")
  }
  "both" {
    Write-Host "`n[Blueberry] Launching BOTH - Gecko + Chromium (share :11435)..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-ExecutionPolicy","Bypass","-File", (Join-Path $root "scripts/start-blueberry.ps1")
    Start-Sleep 2
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts/start-chromium.ps1")
  }
}
