@echo off
REM ClaimHelper — DEMO mode. Runs the full app in Chrome with an in-memory
REM backend. No Firebase project, no OpenAI key, no internet needed.
title ClaimHelper (Demo)
set "PATH=C:\Users\Nojus\dev\flutter\bin;C:\Users\Nojus\dev\node;%PATH%"
cd /d "C:\Users\Nojus\Desktop\AI insurance-denial appeal assistant\claimhelper"
echo.
echo   Starting ClaimHelper in DEMO mode (mocked AI + payments)...
echo   Chrome will open automatically. Close this window to stop the app.
echo.
call flutter run -d chrome --dart-define=USE_MOCKS=true
echo.
echo   App stopped.
pause
