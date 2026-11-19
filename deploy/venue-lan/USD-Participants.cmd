@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action directory
if errorlevel 1 (
  echo USD: participant directory update refused. Keep local registration, results and Docker volumes.
  pause
)
