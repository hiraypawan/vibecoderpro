@echo off
title Qwen3 Vibe CLI

:: Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ========================================================
    echo  Node.js is not installed!
    echo  Please install Node.js from https://nodejs.org/
    echo  and try again.
    echo ========================================================
    pause
    exit /b
)

:: Check if node_modules exists, install dependencies if missing
if not exist node_modules (
    echo Installing necessary dependencies...
    call npm install
)

echo Starting Qwen3 Coder Agent...
node agent.mjs
pause