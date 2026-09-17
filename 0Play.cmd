@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Invalid Image needs Node.js 20 or newer.
  echo Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found on PATH.
  echo Reinstall Node.js with npm included, then try again.
  pause
  exit /b 1
)

npm run dev
if errorlevel 1 (
  echo.
  echo Invalid Image failed to start.
  pause
)
