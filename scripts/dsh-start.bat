@echo off
setlocal
title DSH Start
wsl.exe --cd ~ bash -lc "cd 'Agent YueJian/dsh-pouch/scripts' && exec ./dsh-start.sh"
set "exit_code=%errorlevel%"
echo.
pause
endlocal & exit /b %exit_code%
