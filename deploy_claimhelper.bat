@echo off
REM One-shot publish for ClaimHelper: logs in, sets the OpenAI secret, builds
REM the web app, and deploys Cloud Functions + rules + Hosting to
REM project claimhelper-38152.
title Deploy ClaimHelper
setlocal
set "PATH=C:\Users\Nojus\dev\flutter\bin;C:\Users\Nojus\dev\node;%PATH%"
REM Raise the function discovery timeout — the default 10s can be exceeded on
REM Windows while loading the admin/OpenAI/Stripe SDKs.
set "FUNCTIONS_DISCOVERY_TIMEOUT=120"
cd /d "C:\Users\Nojus\Desktop\AI insurance-denial appeal assistant\claimhelper"

echo ==============================================================
echo  ClaimHelper deploy  (project: claimhelper-38152)
echo ==============================================================
echo.
echo [1/6] Firebase login (a browser window opens the first time)...
call firebase login
if errorlevel 1 goto :fail

echo.
echo [2/6] Setting OPENAI_API_KEY secret from functions\.env.local...
powershell -NoProfile -Command "$m = Select-String -Path 'functions\.env.local' -Pattern '^OPENAI_API_KEY=(.+)$'; if ($m) { Set-Content -Path \"$env:TEMP\ch_key.txt\" -Value $m.Matches[0].Groups[1].Value -NoNewline -Encoding ascii } else { exit 1 }"
if errorlevel 1 (echo Could not read OPENAI_API_KEY from functions\.env.local & goto :fail)
call firebase functions:secrets:set OPENAI_API_KEY --data-file "%TEMP%\ch_key.txt"
del "%TEMP%\ch_key.txt" >nul 2>&1

echo.
echo [3/6] Generating and validating marketing assets...
call node tool\marketing_build.mjs
if errorlevel 1 goto :fail
call node tool\accessibility_check.mjs web
if errorlevel 1 goto :fail

echo.
echo [4/6] Building the web app...
call flutter build web
if errorlevel 1 goto :fail

echo.
echo [4b/6] Staging crawlable guides and discovery files...
call node tool\marketing_build.mjs --stage-build
if errorlevel 1 goto :fail

echo.
echo [5/6] Deploying functions, rules, indexes, and hosting...
REM --force auto-configures the Artifact Registry cleanup policy. If Firebase
REM Storage isn't set up yet, drop ",storage" from the list below.
call firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting --force
if errorlevel 1 goto :fail

echo.
echo [6/6] Notifying IndexNow search engines about updated pages...
call node tools\indexnow-ping.mjs
if errorlevel 1 echo WARNING: Deploy succeeded, but IndexNow notification failed. It is safe to retry later.

echo.
echo  DONE. Your app is live at: https://claimhelper-38152.web.app
echo  (Stripe stays optional until you set STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET.)
goto :end

:fail
echo.
echo  Deploy stopped due to an error above. Fix it and re-run.
:end
pause
endlocal
