# Blueberry 135M puny sidecar — Humaize-style, local HF, no Ollama needed
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start-sidecar.ps1
# Or:    python src/ai/local/server.py --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
# Actually D:\Blueberry is parent of scripts
$blueberry = "D:\Blueberry"
Set-Location -LiteralPath $blueberry

Write-Host "[Blueberry] Starting 135M puny sidecar (Humaize-style) on http://127.0.0.1:11435" -ForegroundColor Cyan
Write-Host "[Blueberry] First run downloads ~280MB (HuggingFaceTB/SmolLM2-135M-Instruct) then offline" -ForegroundColor Yellow

# Check python
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) { Write-Error "python not found on PATH"; exit 1 }

# Install deps if needed (light)
if (-not (Test-Path "$blueberry\.venv")) {
  Write-Host "[Blueberry] Creating .venv and installing torch+transformers (CPU) ..." -ForegroundColor Yellow
  & python -m venv .venv
  & .\.venv\Scripts\python -m pip install --upgrade pip
  & .\.venv\Scripts\python -m pip install -r src/ai/local/requirements.txt
  Write-Host "[Blueberry] .venv ready" -ForegroundColor Green
  $pyExe = "$blueberry\.venv\Scripts\python.exe"
} else {
  $pyExe = "$blueberry\.venv\Scripts\python.exe"
  if (-not (Test-Path $pyExe)) { $pyExe = "python" }
}

# Pre-check health
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:11435/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
  Write-Host "[Blueberry] Sidecar already running: $($h.Content)" -ForegroundColor Green
  exit 0
} catch {}

Write-Host "[Blueberry] Launching server.py ..." -ForegroundColor Cyan
& $pyExe src/ai/local/server.py --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny --host 127.0.0.1
