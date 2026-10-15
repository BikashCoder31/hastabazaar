@echo off
setlocal
cd /d "%~dp0"
call npm.cmd run dev
set "launchResult=%ERRORLEVEL%"
if not "%launchResult%"=="0" (
  echo.
  echo Local launch stopped. Read the message above and LOCAL-START.md.
  pause
)
endlocal & exit /b %launchResult%
