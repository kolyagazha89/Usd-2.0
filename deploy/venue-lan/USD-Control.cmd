@echo off
cd /d "%~dp0"
chcp 65001 >nul
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0USD-Control.ps1" -HideLauncherConsole
if not errorlevel 1 exit /b 0
echo USD: окно управления не запустилось. Скопируйте текст ошибки выше.
pause
exit /b 1
