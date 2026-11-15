@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action certificate
if errorlevel 1 (
  echo USD: certificate not ready. Start the offline server, then try again.
  echo Do not delete Docker volumes or any data.
  pause
)
