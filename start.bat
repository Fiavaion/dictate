@echo off
title FiavaionDictate

:: ── Check Python ─────────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Python 3 is required but was not found.
    echo.
    echo  Steps:
    echo    1. The Python download page will open in your browser
    echo    2. Download and run the installer
    echo    3. IMPORTANT: check "Add Python to PATH" during install
    echo    4. Close this window and run start.bat again
    echo.
    start "" "https://www.python.org/downloads/"
    pause
    exit /b
)

:: ── Start server in a minimised background window ────────────────────────────
echo  Starting FiavaionDictate...
start "FiavaionDictate Server" /min python server.py

:: ── Poll until server responds (max 20 seconds) ──────────────────────────────
set /a n=0
:poll
timeout /t 1 /nobreak >nul
powershell -Command "try{Invoke-WebRequest 'http://localhost:8080/api/system/check' -UseBasicParsing -TimeoutSec 1|Out-Null;exit 0}catch{exit 1}" >nul 2>&1
if not errorlevel 1 goto open
set /a n+=1
if %n% lss 20 goto poll

:: ── Open browser ─────────────────────────────────────────────────────────────
:open
start "" "http://localhost:8080"
echo  FiavaionDictate is running.
echo  Close the "FiavaionDictate Server" taskbar window to stop it.
timeout /t 4 /nobreak >nul
