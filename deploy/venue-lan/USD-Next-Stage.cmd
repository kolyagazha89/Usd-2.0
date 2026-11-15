@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action next
if errorlevel 1 (
  echo USD: stage switch incomplete. Previous results and Docker volumes are preserved.
  pause
)
