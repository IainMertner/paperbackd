@echo off
REM Firebase CLI, same shape as test.bat since Node isn't on PATH.
REM Calls the installed binary directly rather than through `npm exec`, which
REM re-resolves the package each run and can swallow the interactive prompts.
REM
REM   firebase.bat login
REM   firebase.bat deploy --only functions
"C:\Program Files\nodejs\node.exe" "%~dp0node_modules\firebase-tools\lib\bin\firebase.js" %*
