@echo off
REM Blueberry 135M puny sidecar — double-click to start, like Humaize chat.bat
REM Fully local HF (HuggingFaceTB/SmolLM2-135M-Instruct), no Ollama, ~280MB download once then offline

set "BLUEBERRY=D:\Blueberry"
cd /d "%BLUEBERRY%"

echo [Blueberry] Starting 135M puny sidecar on http://127.0.0.1:11435
echo [Blueberry] First run downloads ~280MB then offline

where python >nul 2>&1
if %errorlevel% neq 0 (
  echo python not found on PATH
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [Blueberry] Creating .venv ...
  python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r src\ai\local\requirements.txt
)

.venv\Scripts\python src\ai\local\server.py --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny --host 127.0.0.1
pause
