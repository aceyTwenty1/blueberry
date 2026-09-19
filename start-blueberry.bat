@echo off
REM Blueberry - Startup (Fixed: visible, logs, no hidden /min)
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
if "%ROOT:~-1%" neq "\" set "ROOT=%ROOT%\"
set "BROWSER=%ROOT%dist\Blueberry-Browser\Blueberry.bat"
set "SIDECAR=%ROOT%src\ai\local\server.py"
set "VENV=%ROOT%.venv\Scripts\python.exe"
set "LOG=%ROOT%blueberry-startup.log"

echo [%date% %time%] Starting Blueberry > "%LOG%"
echo [Blueberry] Starting...
echo [Blueberry] ROOT=%ROOT%
echo [Blueberry] BROWSER=%BROWSER%
echo [Blueberry] SIDECAR=%SIDECAR%

REM 1. Ensure real browser exists
if not exist "%BROWSER%" (
  echo [Blueberry] Real browser not found, building...
  echo [Blueberry] Building extension...
  pushd "%ROOT%"
  where npm >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] npm not found on PATH. Install Node.js 18+ and add to PATH.
    echo [ERROR] npm not found >> "%LOG%"
    pause
    exit /b 1
  )
  call npm run build:firefox:extension
  if errorlevel 1 (
    echo [ERROR] Extension build failed. See above.
    pause
    exit /b 1
  )
  echo [Blueberry] Repacking Firefox...
  powershell -ExecutionPolicy Bypass -File "%ROOT%scripts\build-real-browser.ps1"
  if errorlevel 1 (
    echo [ERROR] Browser repack failed.
    pause
    exit /b 1
  )
  popd
)

REM 2. Check if sidecar already running (use powershell test, more reliable than netstat)
powershell -Command "try { $c=New-Object System.Net.Sockets.TcpClient('127.0.0.1',11435); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
  echo [Blueberry] Sidecar already running on :11435
) else (
  if exist "%SIDECAR%" (
    echo [Blueberry] Starting 135M sidecar (this takes 30-60s first run, downloads 280MB once)...
    echo [Blueberry] Starting sidecar... >> "%LOG%"
    if exist "%VENV%" (
      echo [Blueberry] Using .venv python: %VENV%
      start "Blueberry Sidecar" "%VENV%" "%SIDECAR%" --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny --host 127.0.0.1
    ) else (
      where python >nul 2>&1
      if errorlevel 1 (
        echo [WARN] python not found, skipping sidecar (browser will run without local AI)
        echo [WARN] Install python 3.10+ or run scripts\start-sidecar.ps1 to create .venv
      ) else (
        echo [Blueberry] Using system python
        start "Blueberry Sidecar" python "%SIDECAR%" --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny --host 127.0.0.1
      )
    )
    echo [Blueberry] Waiting 3s for sidecar to initialize...
    timeout /t 3 /nobreak >nul
  ) else (
    echo [Blueberry] Sidecar not found at %SIDECAR%, skipping.
  )
)

REM 3. Launch browser - check again
if exist "%BROWSER%" (
  echo [Blueberry] Launching browser...
  echo [Blueberry] Running: "%BROWSER%"
  call "%BROWSER%"
  if errorlevel 1 (
    echo [ERROR] Browser launch failed with code %errorlevel%
    echo [ERROR] Try closing Firefox completely and run again.
    pause
    exit /b 1
  )
  echo [Blueberry] Browser launched. If you don't see a window, close all Firefox and try again.
) else (
  echo [Blueberry] Real browser missing, fallback to web-ext...
  pushd "%ROOT%"
  npm run dev:firefox
  popd
)

echo [Blueberry] Done. This window will close in 5s. Check blueberry-startup.log for details.
timeout /t 5
endlocal
