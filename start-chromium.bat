@echo off
REM Blueberry Chromium - Startup (Electron + 135M puny local, no Ollama)
REM Standalone Chrome-based browser (Blink) with same premium UI + agents as Gecko
REM Usage: double-click this file. For autostart: Win+R -> shell:startup -> copy shortcut

setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
if "%ROOT:~-1%" neq "\" set "ROOT=%ROOT%\"
set "SIDECAR=%ROOT%src\ai\local\server.py"
set "VENV=%ROOT%.venv\Scripts\python.exe"
set "LOG=%ROOT%blueberry-chromium.log"

echo [%date% %time%] Starting Blueberry Chromium > "%LOG%"
echo [Blueberry Chromium] Starting...
echo [Blueberry Chromium] ROOT=%ROOT%

REM 1. Ensure deps built
if not exist "%ROOT%out\main\index.js" (
  echo [Blueberry Chromium] Building Electron (first run ~15s)...
  pushd "%ROOT%"
  where npm >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] npm not found. Install Node 18+ and add to PATH.
    pause
    exit /b 1
  )
  call npm run build:electron
  if errorlevel 1 (
    echo [ERROR] Electron build failed. See above.
    pause
    exit /b 1
  )
  popd
)

REM 2. Sidecar - same 135M puny as Gecko, shared on :11435
powershell -Command "try { $c=New-Object System.Net.Sockets.TcpClient('127.0.0.1',11435); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
  echo [Blueberry Chromium] Sidecar already running on :11435
) else (
  if exist "%SIDECAR%" (
    echo [Blueberry Chromium] Starting 135M sidecar - first run downloads 280MB, window stays open...
    if exist "%VENV%" (
      start "Blueberry Sidecar (Chromium)" "%VENV%" "%SIDECAR%" --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny --host 127.0.0.1
    ) else (
      where python >nul 2>&1
      if errorlevel 1 (
        echo [WARN] python not found, skipping sidecar. Browser will run with cloud/mock.
      ) else (
        start "Blueberry Sidecar (Chromium)" python "%SIDECAR%" --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny --host 127.0.0.1
      )
    )
    timeout /t 3 /nobreak >nul
  ) else (
    echo [Blueberry Chromium] Sidecar not found, skipping.
  )
)

REM 3. Launch Electron (Chromium)
echo [Blueberry Chromium] Launching Electron...
pushd "%ROOT%"
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found.
  pause
  exit /b 1
)
REM Use dev for HMR, or built out/main if you prefer prod
if exist "%ROOT%out\main\index.js" (
  echo [Blueberry Chromium] Running built Electron (out/main)...
  start "" npm run dev:electron
) else (
  npm run dev:electron
)
popd

echo [Blueberry Chromium] Done. Check %LOG% and Sidecar window.
timeout /t 4
endlocal
