# Blueberry Real Browser - Repack Firefox Gecko as Blueberry (no source build)
# Produces dist/Blueberry-Browser/ - a real, double-clickable browser with Blueberry system addon + userChrome + policies
# Mirrors Floorp/Waterfox distribution model: official Firefox binary + distribution/ overlay
# Base MUST be ESR/Developer (Release refuses unsigned add-ons). Default: .esr-base\core (Firefox ESR, local).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-real-browser.ps1 [-FirefoxSrc "C:\path\to\firefox"]
# Output: dist/Blueberry-Browser/Blueberry.exe (launcher) + firefox base + Blueberry

param([string]$FirefoxSrc = "")

$ErrorActionPreference = "Stop"
$blueberryRoot = "D:\Blueberry"
if ([string]::IsNullOrWhiteSpace($FirefoxSrc)) {
  $esrBase = Join-Path $blueberryRoot ".esr-base\core"
  if (Test-Path (Join-Path $esrBase "firefox.exe")) {
    $firefoxSrc = $esrBase
    Write-Host "[Blueberry] Using local Firefox ESR base (unsigned add-ons allowed)" -ForegroundColor Gray
  } else {
    $firefoxSrc = "C:\Program Files\Mozilla Firefox"
    Write-Host "[Blueberry] WARNING: no .esr-base found, using stock Firefox (unsigned add-ons will NOT install)" -ForegroundColor Yellow
  }
} else {
  $firefoxSrc = $FirefoxSrc
}
$outRoot = Join-Path $blueberryRoot "dist\Blueberry-Browser"
$distSrc = Join-Path $blueberryRoot "dist\firefox-extension"

Write-Host "`n[Blueberry] Building REAL browser - Gecko repack" -ForegroundColor Cyan
Write-Host "[Blueberry] Source Firefox: $firefoxSrc" -ForegroundColor Gray
Write-Host "[Blueberry] Blueberry XPI: $distSrc" -ForegroundColor Gray

if (-not (Test-Path $firefoxSrc)) { Write-Error "Firefox not found at $firefoxSrc - install Firefox first"; exit 1 }
if (-not (Test-Path $distSrc)) {
  Write-Host "[Blueberry] Building extension first..." -ForegroundColor Yellow
  Set-Location $blueberryRoot; npm run build:firefox:extension | Out-Host
}

# 1. Clean & copy Firefox
if (Test-Path $outRoot) { Remove-Item -Recurse -Force $outRoot }
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
Write-Host "[Blueberry] Copying Firefox binary (this may take 20s)..." -ForegroundColor Yellow
# Use robocopy for speed + hidden files
& robocopy "$firefoxSrc" "$outRoot" /MIR /NFL /NDL /NJH /NJS /R:0 /W:0 | Out-Null
Write-Host "[Blueberry] Copy done" -ForegroundColor Green

# 2. Inject distribution
$distDir = Join-Path $outRoot "distribution"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Copy-Item -Force "$blueberryRoot\src\firefox\distribution\policies.json" (Join-Path $distDir "policies.json")
Write-Host "[Blueberry] Injected distribution/policies.json" -ForegroundColor Green

# 3. Inject system addon - Firefox loads distribution/extensions/*.xpi automatically
$extDir = Join-Path $distDir "extensions"
New-Item -ItemType Directory -Force -Path $extDir | Out-Null
# Pack current dist/firefox-extension as XPI into distribution/extensions
$artifacts = Get-ChildItem -LiteralPath (Join-Path $blueberryRoot "dist") -Filter "blueberry*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($artifacts) {
  $xpiName = "blueberry@blueberry.browser.xpi"
  Copy-Item -Force $artifacts.FullName (Join-Path $extDir $xpiName)
  Write-Host "[Blueberry] Injected system addon $xpiName ($($artifacts.Length/1KB) KB)" -ForegroundColor Green
} else {
  # Fallback: zip dist/firefox-extension ourselves
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tmpXpi = Join-Path $extDir "blueberry@blueberry.browser.xpi"
  if (Test-Path $tmpXpi) { Remove-Item -Force $tmpXpi }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($distSrc, $tmpXpi)
  Write-Host "[Blueberry] Packed dist/firefox-extension → $tmpXpi" -ForegroundColor Green
}

# 4. Autoconfig - pref("sidebar.verticalTabs", true) etc
$defaultsPref = Join-Path $outRoot "defaults\pref"
New-Item -ItemType Directory -Force -Path $defaultsPref | Out-Null
Set-Content -LiteralPath (Join-Path $defaultsPref "autoconfig.js") -Value 'pref("general.config.filename", "blueberry.cfg"); pref("general.config.obscure_value", 0);' -Encoding Ascii
Copy-Item -Force "$blueberryRoot\src\firefox\autoconfig\blueberry.js" (Join-Path $outRoot "blueberry.cfg")
Write-Host "[Blueberry] Injected autoconfig (blueberry.cfg)" -ForegroundColor Green

# 5. Premium branding - replace firefox.exe icon resources? For now, create Blueberry launcher
$launcher = Join-Path $outRoot "Blueberry.exe"
# Create a simple launcher that just starts firefox.exe with Blueberry profile
$launcherPs = @'
$exe = Join-Path $PSScriptRoot "firefox.exe"
$profile = Join-Path $PSScriptRoot "BlueberryProfile"
if (-not (Test-Path $profile)) { New-Item -ItemType Directory -Force -Path $profile | Out-Null }
$chrome = Join-Path $profile "chrome"
if (-not (Test-Path (Join-Path $chrome "userChrome.css"))) {
  New-Item -ItemType Directory -Force -Path $chrome | Out-Null
  Copy-Item -Force "D:\Blueberry\src\firefox\userChrome.css" (Join-Path $chrome "userChrome.css") -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $chrome "userChrome.css"))) {
    Copy-Item -Force (Join-Path $PSScriptRoot "..\..\src\firefox\userChrome.css") (Join-Path $chrome "userChrome.css") -ErrorAction SilentlyContinue
  }
}
Write-Host "[Blueberry] Launching $exe with profile $profile"
try { Start-Process $exe -ArgumentList "-profile `"$profile`" -no-remote" -ErrorAction Stop } catch {
  Start-Process $exe -ArgumentList "-profile `"$profile`" -new-instance"
}
'@
Set-Content -LiteralPath (Join-Path $outRoot "Blueberry.ps1") -Value $launcherPs -Encoding UTF8
# Also create a .bat launcher for double-click without powershell restriction (fixed: handles already-running Firefox)
Set-Content -LiteralPath (Join-Path $outRoot "Blueberry.bat") -Value '@echo off
REM Blueberry Browser Launcher (Fixed)
setlocal
set "PROFILE=%~dp0BlueberryProfile"
set "SRC_USERCHROME=D:\Blueberry\src\firefox\userChrome.css"
if not exist "%PROFILE%\chrome" mkdir "%PROFILE%\chrome" >nul 2>&1
if not exist "%PROFILE%\chrome\userChrome.css" (
  if exist "%SRC_USERCHROME%" copy /Y "%SRC_USERCHROME%" "%PROFILE%\chrome\userChrome.css" >nul 2>&1
)
echo [Blueberry] Launching Firefox with profile: %PROFILE%
start "" "%~dp0firefox.exe" -profile "%PROFILE%" -no-remote
timeout /t 2 /nobreak >nul
tasklist /FI "IMAGENAME eq firefox.exe" 2>nul | find /I "firefox.exe" >nul
if errorlevel 1 (
  echo [Blueberry] Retrying with -new-instance...
  start "" "%~dp0firefox.exe" -profile "%PROFILE%" -new-instance
)
endlocal
' -Encoding Ascii
Write-Host "[Blueberry] Created Blueberry.bat + Blueberry.ps1 launchers (profile-isolated)" -ForegroundColor Green

# 6. Branding - copy premium icons to root for installer visibility
foreach ($s in @("16","32","64")) {
  $src = "$blueberryRoot\resources\icon-$s.png"
  if (Test-Path $src) { Copy-Item -Force $src (Join-Path $outRoot "blueberry-icon-$s.png") }
}
Copy-Item -Force "$blueberryRoot\resources\icon.png" (Join-Path $outRoot "blueberry.png") -ErrorAction SilentlyContinue

# 7. Newtab & onboarding - inject into distribution (Firefox newtab override)
$newTabSrc = Join-Path $blueberryRoot "src\firefox\extension\newtab"
if (Test-Path $newTabSrc) {
  # will be added via extension manifest chrome_url_overrides in future; for now just note
  Write-Host "[Blueberry] Newtab source found at $newTabSrc (will be loaded via extension)" -ForegroundColor Gray
}

# 8. Summary
$sizeMB = [math]::Round(((Get-ChildItem -Recurse -File $outRoot | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "`n[Blueberry] REAL browser ready!" -ForegroundColor Cyan
Write-Host "  Path: $outRoot" -ForegroundColor White
Write-Host "  Size: $sizeMB MB" -ForegroundColor White
Write-Host "  Launch: double-click Blueberry.bat (or Blueberry.ps1) - isolated profile at BlueberryProfile\" -ForegroundColor White
Write-Host "  System addon: distribution/extensions/blueberry@blueberry.browser.xpi" -ForegroundColor Gray
Write-Host "  userChrome: BlueberryProfile/chrome/userChrome.css (Arc-style vertical tabs)" -ForegroundColor Gray
Write-Host "  To make installer: use Inno Setup on $outRoot or zip it" -ForegroundColor Yellow
Write-Host ""
