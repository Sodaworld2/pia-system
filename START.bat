@echo off
echo ========================================
echo   PIA - Project Intelligence Agent
echo ========================================
echo.
echo Starting server...
echo Dashboard will open at: http://localhost:3000
echo.
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0"
start http://localhost:3000
npm start
