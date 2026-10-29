@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install from https://nodejs.org and reopen this file.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Installing PI Hub server dependencies...
  call npm install
  if errorlevel 1 (pause & exit /b 1)
)
start "PI Hub Server" /D "%~dp0" cmd /k "npm start"
timeout /t 3 >nul
start "" http://127.0.0.1:4173
