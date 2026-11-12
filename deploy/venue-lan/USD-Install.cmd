@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action install
if errorlevel 1 (
  echo USD: setup incomplete. Do not delete Docker volumes.
  pause
)
