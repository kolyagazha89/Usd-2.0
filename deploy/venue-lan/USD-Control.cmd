@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0USD-Control.ps1"
if errorlevel 1 (
  echo USD: окно управления не запустилось. Проверьте PowerShell и файлы программы.
  pause
)
