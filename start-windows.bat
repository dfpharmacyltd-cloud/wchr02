@echo off
cd /d %~dp0
if not exist node_modules ( echo Installing... & call npm install )
if not exist .env ( copy .env.example .env & echo Fill in .env then run this file again. & notepad .env & exit /b )
start "" http://localhost:3000
node server/index.js
pause
