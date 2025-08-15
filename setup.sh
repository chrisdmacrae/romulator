#!/bin/bash

# ROM Downloader Setup Script
# This script sets up the ROM downloader project

set -e

echo "🚀 Setting up ROM Downloader..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium

# Create downloads directory
echo "📁 Creating downloads directory..."
mkdir -p downloads

# Make scripts executable
chmod +x src/index.js
chmod +x examples/download-n64.js

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎮 Usage examples:"
echo ""
echo "  # Download Nintendo 64 ROMs:"
echo "  npm start \"https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064%20%28BigEndian%29/\""
echo ""
echo "  # Download PlayStation ROMs:"
echo "  npm start \"https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation/\""
echo ""
echo "  # Custom download directory:"
echo "  npm start \"<url>\" --download-dir ./my-roms"
echo ""
echo "  # Run example script:"
echo "  node examples/download-n64.js"
echo ""
echo "📖 See README.md for more information"
