@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0venue-control.ps1" -Action update-live
if errorlevel 1 (
  echo USD LIVE: update incomplete. API and PostgreSQL were not changed.
  echo Do not delete any containers or volumes.
  pause
)
