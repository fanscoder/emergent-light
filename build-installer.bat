@echo off
setlocal
cd /d "%~dp0"
call npm run tauri -- build
exit /b %ERRORLEVEL%
