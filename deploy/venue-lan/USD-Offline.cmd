@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action offline
if errorlevel 1 (
  echo USD: offline start failed. Do not delete Docker volumes.
  pause
)
