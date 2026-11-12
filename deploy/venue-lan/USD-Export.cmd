@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action export
if errorlevel 1 (
  echo USD: return package export failed. Keep all local records and Docker volumes.
  pause
)
