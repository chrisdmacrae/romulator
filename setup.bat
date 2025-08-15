@echo off
setlocal enabledelayedexpansion

echo 🚀 Setting up ROM Downloader...

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 16+ first.
    echo    Visit: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js detected: 
node --version

:: Install dependencies
echo 📦 Installing dependencies...
call npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

:: Install Playwright browsers
echo 🌐 Installing Playwright browsers...
call npx playwright install chromium
if errorlevel 1 (
    echo ❌ Failed to install Playwright browsers
    pause
    exit /b 1
)

:: Create downloads directory
echo 📁 Creating downloads directory...
if not exist "downloads" mkdir downloads

echo.
echo ✅ Setup complete!
echo.
echo 🎮 Usage examples:
echo.
echo   # Download Nintendo 64 ROMs:
echo   npm start "https://myrient.erista.me/files/No-Intro/Nintendo%%20-%%20Nintendo%%2064%%20%%28BigEndian%%29/"
echo.
echo   # Download PlayStation ROMs:
echo   npm start "https://myrient.erista.me/files/Redump/Sony%%20-%%20PlayStation/"
echo.
echo   # Custom download directory:
echo   npm start "^<url^>" --download-dir ./my-roms
echo.
echo   # Run example script:
echo   node examples/download-n64.js
echo.
echo 📖 See README.md for more information
echo.
pause
