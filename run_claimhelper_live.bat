@echo off
REM ClaimHelper — LIVE mode. Runs the app in Chrome against your real Firebase
REM project (claimhelper-38152). Requires, one time:
REM   1) Fill the Web apiKey/appId in lib/firebase_options.dart
REM      (Firebase console -> Project settings -> Web app -> SDK config),
REM      or run: flutterfire configure --project claimhelper-38152
REM   2) Deploy Cloud Functions, or run the emulator, so AI/Stripe calls work.
title ClaimHelper (Live)
set "PATH=C:\Users\Nojus\dev\flutter\bin;C:\Users\Nojus\dev\node;%PATH%"
cd /d "C:\Users\Nojus\Desktop\AI insurance-denial appeal assistant\claimhelper"
echo.
echo   Starting ClaimHelper in LIVE mode (real Firebase backend)...
echo   Chrome will open automatically. Close this window to stop the app.
echo.
call flutter run -d chrome
echo.
echo   App stopped.
pause
