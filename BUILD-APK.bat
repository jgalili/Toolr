@echo off
title NailedIt - build the Android app
cd /d "%~dp0"

echo.
echo  ==========================================
echo   NailedIt - building an installable APK
echo  ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  Node.js is not installed. Get the LTS build from https://nodejs.org
  echo  then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  Downloading the libraries first. This only happens once.
  echo.
  call npm install
  if errorlevel 1 goto :npmfail
  echo.
)

REM ---------------------------------------------------------------
REM  Find the Android SDK. Android Studio installs it here by default;
REM  ANDROID_HOME wins if it is already set.
REM ---------------------------------------------------------------
set "SDK=%ANDROID_HOME%"
if "%SDK%"=="" set "SDK=%ANDROID_SDK_ROOT%"
if "%SDK%"=="" if exist "%LOCALAPPDATA%\Android\Sdk" set "SDK=%LOCALAPPDATA%\Android\Sdk"

if "%SDK%"=="" goto :nosdk
if not exist "%SDK%\platform-tools" goto :nosdk

echo  Using the Android SDK at:
echo    %SDK%
echo.

set "ANDROID_HOME=%SDK%"
set "ANDROID_SDK_ROOT=%SDK%"

REM  Gradle needs to be told where the SDK is, in a file it looks for.
> android_sdk_path.tmp echo sdk.dir=%SDK:\=\\%

echo  Step 1 of 3 - generating the native Android project...
echo  (this rewrites the android\ folder from app.json - safe to repeat)
echo.
call npx expo prebuild --platform android --clean
if errorlevel 1 goto :prebuildfail

move /y android_sdk_path.tmp android\local.properties >nul

echo.
echo  Step 2 of 3 - compiling. First run takes 10-20 minutes.
echo  Gradle downloads a lot the first time. Leave it running.
echo.
cd android
call gradlew.bat assembleRelease
if errorlevel 1 goto :gradlefail
cd ..

echo.
echo  Step 3 of 3 - collecting the file...
copy /y "android\app\build\outputs\apk\release\app-release.apk" "NailedIt.apk" >nul
if errorlevel 1 goto :copyfail

echo.
echo  ==========================================
echo   Done.
echo.
echo   NailedIt.apk  is in this folder:
echo   %CD%
echo.
echo   To put it on your phone, either:
echo     - plug the phone in and run:  adb install -r NailedIt.apk
echo     - or email/Drive the file to yourself, open it on the phone,
echo       and allow "install from this source" when Android asks.
echo  ==========================================
echo.
pause
exit /b 0

:nosdk
echo  I could not find an Android SDK on this machine.
echo.
echo  Two ways forward:
echo.
echo   A) Install it - open Android Studio, go to
echo      More Actions ^> SDK Manager, install "Android SDK Platform"
echo      and "Android SDK Build-Tools", then run this script again.
echo.
echo   B) Build in the cloud instead - no SDK needed. Run these three:
echo         npx eas login
echo         npx eas init
echo         npx eas build -p android --profile preview
echo      Expo builds it on their servers and gives you a download link.
echo.
if exist android_sdk_path.tmp del android_sdk_path.tmp
pause
exit /b 1

:npmfail
echo.
echo  Downloading the libraries failed. Check your internet and retry.
echo.
pause
exit /b 1

:prebuildfail
echo.
echo  Generating the Android project failed. Copy the red text above
echo  and send it to Claude - it is usually one line in app.json.
echo.
if exist android_sdk_path.tmp del android_sdk_path.tmp
pause
exit /b 1

:gradlefail
cd ..
echo.
echo  The compile failed. The useful part of the error is usually
echo  the line starting with "* What went wrong:". Send me that.
echo.
pause
exit /b 1

:copyfail
echo.
echo  Built, but I could not find the APK where I expected it.
echo  Look in:  android\app\build\outputs\apk\release\
echo.
pause
exit /b 1
