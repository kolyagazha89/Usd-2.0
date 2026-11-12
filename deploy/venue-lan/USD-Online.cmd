@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action online
if errorlevel 1 (
  echo USD: failed to stop local services safely. Do not delete volumes.
  pause
)
