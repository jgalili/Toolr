@echo off
title NailedIt
cd /d "%~dp0"

echo.
echo  ==========================================
echo   NailedIt - starting up
echo  ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  Node.js is not installed.
  echo.
  echo  1. Go to  https://nodejs.org
  echo  2. Download the big green "LTS" button
  echo  3. Install it, close this window, and run START-HERE again
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -v') do set NODEMAJOR=%%v
set NODEMAJOR=%NODEMAJOR:v=%
if %NODEMAJOR% LSS 20 (
  echo  Your Node.js is too old ^(version %NODEMAJOR%^). NailedIt needs 20 or newer.
  echo  Get the LTS build from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  First run - downloading the libraries.
  echo  This takes a few minutes and only happens once.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Something went wrong downloading the libraries.
    echo  Check your internet connection and try again.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo  Starting NailedIt...
echo.
echo   - Press  W  to open it in your browser
echo   - Or scan the QR code with the Expo Go app on your phone
echo     ^(phone and PC must be on the same Wi-Fi^)
echo.

call npm start

pause
