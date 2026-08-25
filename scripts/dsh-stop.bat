@echo off
setlocal
title DSH Stop
wsl.exe --cd ~ bash -lc "cd 'Agent YueJian/dsh-pouch/scripts' && exec ./dsh-stop.sh"
set "exit_code=%errorlevel%"
echo.
pause
endlocal & exit /b %exit_code%
