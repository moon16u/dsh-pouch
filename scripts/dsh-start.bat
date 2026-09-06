@echo off
setlocal
title DSH Start
wsl.exe -e bash -lc "cd \"$(wslpath -u '%~dp0')\" && exec ./dsh-start.sh"
set "exit_code=%errorlevel%"
echo.
pause
endlocal & exit /b %exit_code%
