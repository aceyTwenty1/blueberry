@echo off
REM Blueberry local sidecar — double-click to start, like Humaize chat.bat
REM Hardware-aware profile (auto: yoga on Yoga 9 = 360M, else 135M), no Ollama, download once then offline

set "BLUEBERRY=D:\Blueberry"
cd /d "%BLUEBERRY%"

echo [Blueberry] Starting local sidecar on http://127.0.0.1:11435 (profile auto)
echo [Blueberry] First run downloads the model once, then offline

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

.venv\Scripts\python src\ai\local\server.py --profile auto --port 11435 --host 127.0.0.1
pause
