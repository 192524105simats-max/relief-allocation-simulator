@echo off
title Relief Allocation Simulator
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed on this computer.
  echo  Download the LTS version from https://nodejs.org, install it, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules\express" (
  echo Installing dependencies...
  call npm install
)

set OPEN_BROWSER=1
node server\server.js
pause
