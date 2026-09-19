@echo off
REM Blueberry - Startup Script (double-click to launch real browser)
REM Starts sidecar (135M puny, if available) + Blueberry Gecko browser
REM Usage: double-click this file, or put shortcut in shell:startup for autostart

setlocal
set "ROOT=%~dp0"
set "BROWSER=%ROOT%dist\Blueberry-Browser\Blueberry.bat"
set "SIDECAR=%ROOT%src\ai\local\server.py"
set "VENV=%ROOT%.venv\Scripts\python.exe"

echo [Blueberry] Starting...

REM 1. Check real browser exists, build if missing
if not exist "%BROWSER%" (
  echo [Blueberry] Real browser not found at %BROWSER%
  echo [Blueberry] Building extension + repack (first run ~20s)...
  pushd "%ROOT%"
  call npm run build:firefox:extension >nul 2>&1
  powershell -ExecutionPolicy Bypass -File scripts\build-real-browser.ps1
  popd
)

REM 2. Start 135M sidecar in background if python sidecar exists and not already running
netstat -ano | findstr ":11435" >nul 2>&1
if %errorlevel% neq 0 (
  if exist "%SIDECAR%" (
    echo [Blueberry] Starting 135M puny sidecar on http://127.0.0.1:11435 ...
    if exist "%VENV%" (
      start "" /min "%VENV%" "%SIDECAR%" --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny
    ) else (
      start "" /min python "%SIDECAR%" --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny
    )
    timeout /t 2 >nul
  ) else (
    echo [Blueberry] Sidecar not found, skipping (browser will run without local AI)
  )
) else (
  echo [Blueberry] Sidecar already running on :11435
)

REM 3. Launch real browser (isolated profile)
if exist "%BROWSER%" (
  echo [Blueberry] Launching browser...
  start "" "%BROWSER%"
) else (
  echo [Blueberry] Fallback: launching Firefox with extension
  pushd "%ROOT%"
  start "" powershell -ExecutionPolicy Bypass -File scripts\start-sidecar.ps1
  npm run dev:firefox
  popd
)

echo [Blueberry] Done.
endlocal
