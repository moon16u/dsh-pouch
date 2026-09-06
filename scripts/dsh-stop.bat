@echo off
setlocal
title DSH Stop
wsl.exe -e bash -lc "cd \"$(wslpath -u '%~dp0')\" && exec ./dsh-stop.sh"
set "exit_code=%errorlevel%"
echo.
pause
endlocal & exit /b %exit_code%
