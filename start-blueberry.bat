@echo off
REM Blueberry - Startup (Fixed: visible, logs, robust)
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
if "%ROOT:~-1%" neq "\" set "ROOT=%ROOT%\"
set "BROWSER_BAT=%ROOT%dist\Blueberry-Browser\Blueberry.bat"
set "BROWSER_EXE=%ROOT%dist\Blueberry-Browser\firefox.exe"
set "SIDECAR=%ROOT%src\ai\local\server.py"
set "VENV=%ROOT%.venv\Scripts\python.exe"
set "LOG=%ROOT%blueberry-startup.log"

echo [%date% %time%] Starting Blueberry > "%LOG%"
echo [Blueberry] Starting...
echo [Blueberry] ROOT=%ROOT%

REM 1. Ensure extension built
if not exist "%ROOT%dist\firefox-extension\manifest.json" (
  echo [Blueberry] Building extension...
  pushd "%ROOT%"
  where npm >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] npm not found. Install Node 18+ >> "%LOG%"
    echo [ERROR] npm not found. Install Node.js and add to PATH.
    pause
    exit /b 1
  )
  call npm run build:firefox:extension
  if errorlevel 1 (
    echo [ERROR] Extension build failed >> "%LOG%"
    pause
    exit /b 1
  )
  popd
)

REM 2. Ensure real browser exists
if not exist "%BROWSER_EXE%" (
  echo [Blueberry] Real browser missing, building (20s)...
  pushd "%ROOT%"
  powershell -ExecutionPolicy Bypass -File "%ROOT%scripts\build-real-browser.ps1"
  if errorlevel 1 (
    echo [ERROR] Browser repack failed >> "%LOG%"
    pause
    exit /b 1
  )
  popd
)

REM 3. Sidecar - check port 11435 with powershell (fast, no netstat)
powershell -Command "try { $c=New-Object System.Net.Sockets.TcpClient('127.0.0.1',11435); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
  echo [Blueberry] Sidecar already running on :11435
) else (
  if exist "%SIDECAR%" (
    echo [Blueberry] Starting local sidecar (profile auto - yoga on Yoga 9), window stays open...
    if exist "%VENV%" (
      start "Blueberry Sidecar" "%VENV%" "%SIDECAR%" --profile auto --port 11435 --host 127.0.0.1
    ) else (
      where python >nul 2>&1
      if errorlevel 1 (
        echo [WARN] python not found, skipping sidecar. Browser will run without local AI.
      ) else (
        start "Blueberry Sidecar" python "%SIDECAR%" --profile auto --port 11435 --host 127.0.0.1
      )
    )
    timeout /t 3 /nobreak >nul
  ) else (
    echo [Blueberry] Sidecar not found, skipping.
  )
)

REM 4. Launch browser
if exist "%BROWSER_BAT%" (
  echo [Blueberry] Launching Blueberry...
  call "%BROWSER_BAT%"
  if errorlevel 1 (
    echo [ERROR] Launch failed. Close all Firefox windows and try again.
    pause
    exit /b 1
  )
) else if exist "%BROWSER_EXE%" (
  echo [Blueberry] Launching firefox.exe directly...
  start "" "%BROWSER_EXE%" -profile "%ROOT%dist\Blueberry-Browser\BlueberryProfile" -no-remote
) else (
  echo [Blueberry] Fallback to web-ext...
  pushd "%ROOT%"
  call npm run dev:firefox
  popd
)

echo [Blueberry] Done. See %LOG%
timeout /t 4
endlocal
