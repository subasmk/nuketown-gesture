@echo off
cd /d "%~dp0"
node --version
call npm ci
if errorlevel 1 goto end
call npm start
:end
pause
