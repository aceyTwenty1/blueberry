# Blueberry - Install to Windows Startup (autostart on login)
# Creates shortcut in shell:startup + optional Task Scheduler entry
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install-startup.ps1
# Remove: powershell -ExecutionPolicy Bypass -File scripts/install-startup.ps1 -Remove

param([switch]$Remove)

$root = "D:\Blueberry"
$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Blueberry.lnk"
$targetBat = Join-Path $root "start-blueberry.bat"
$targetPs = Join-Path $root "scripts\start-blueberry.ps1"

if ($Remove) {
  if (Test-Path $shortcutPath) { Remove-Item -Force $shortcutPath; Write-Host "[Blueberry] Removed $shortcutPath" -ForegroundColor Yellow }
  Unregister-ScheduledTask -TaskName "Blueberry" -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "[Blueberry] Autostart removed. Re-run without -Remove to reinstall." -ForegroundColor Green
  exit 0
}

# Ensure start-blueberry.bat exists
if (-not (Test-Path $targetBat)) { Write-Error "start-blueberry.bat not found at $targetBat"; exit 1 }

# 1. Create startup shortcut (shell:startup)
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetBat
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$root\resources\icon.ico"
$shortcut.Description = "Blueberry - AI-native Gecko browser (autostart)"
$shortcut.Save()
Write-Host "[Blueberry] Created startup shortcut: $shortcutPath" -ForegroundColor Green

# 2. Optional: Task Scheduler for silent start (no UAC, delay 10s after login)
$action = New-ScheduledTaskAction -Execute $targetBat -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = "PT10S"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 0)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
try {
  Register-ScheduledTask -TaskName "Blueberry" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Blueberry browser autostart" -Force | Out-Null
  Write-Host "[Blueberry] Task Scheduler entry created (Blueberry, at logon +10s)" -ForegroundColor Green
} catch {
  Write-Host "[Blueberry] Task Scheduler skipped (needs admin): $_" -ForegroundColor Yellow
}

Write-Host "`n[Blueberry] Autostart installed!" -ForegroundColor Cyan
Write-Host "  Shortcut: $shortcutPath" -ForegroundColor White
Write-Host "  Test: restart Windows or run: Start-Process `"$shortcutPath`"" -ForegroundColor Gray
Write-Host "  Remove: powershell -ExecutionPolicy Bypass -File scripts/install-startup.ps1 -Remove" -ForegroundColor Gray
