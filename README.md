# ROM Downloader

[![Build and Deploy](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/docker-build-deploy.yml/badge.svg)](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/docker-build-deploy.yml)
[![Security Scan](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/security-scan.yml/badge.svg)](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/security-scan.yml)
[![Docker Image](https://ghcr-badge.deta.dev/chrisdmacrae/rom-downloader/latest_tag?trim=major&label=latest)](https://github.com/chrisdmacrae/rom-downloader/pkgs/container/rom-downloader)

A modern web-based ROM downloader with automated organization, built with React, Express, and Playwright.

### Quick Start with Docker

```bash
# Using Docker Compose (Recommended)
curl -O https://raw.githubusercontent.com/chrisdmacrae/rom-downloader/main/docker-compose.yml
docker-compose up -d
```

```bash
# Using Docker Run
docker run -d \
  --name rom-downloader \
  -p 3001:3001 \
  -v ./downloads:/app/downloads \
  -v ./config:/app/config \
  -v ./organized:/app/organized \
  ghcr.io/chrisdmacrae/rom-downloader:latest
```

### Available Images

- `ghcr.io/chrisdmacrae/rom-downloader:latest` - Latest stable release
- `ghcr.io/chrisdmacrae/rom-downloader:develop` - Development build
- `ghcr.io/chrisdmacrae/rom-downloader:v1.0.0` - Specific version

### Multi-Architecture Support

Images are available for:
- `linux/amd64` (Intel/AMD x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

For detailed Docker deployment instructions, see [DOCKER-DEPLOYMENT.md](DOCKER-DEPLOYMENT.md).

## Features

- 🔍 **Web Scraping**: Automatically scrapes ROM lists from Myrient archive pages
- 📋 **Interactive Selection**: CLI checklist interface for selecting which ROMs to download
- ⬇️ **Batch Downloads**: Download multiple ROMs with progress tracking
- 🎨 **Colorful Output**: Beautiful CLI interface with colors and progress bars
- 📁 **Organized Downloads**: Automatically creates download directory
- ⚡ **Fast & Reliable**: Uses Playwright for robust web automation

## Installation

1. Clone or create the project directory:
```bash
mkdir rom-downloader
cd rom-downloader
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npm run install-browsers
```

## Usage

### Basic CLI Usage

Download ROMs from a Myrient archive page:

```bash
npm start "https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064%20%28BigEndian%29/"
```

### Advanced Options

```bash
# Specify custom download directory
npm start "https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation/" --download-dir ./my-roms

# Run with visible browser (for debugging)
npm start "https://example.com/roms" --no-headless

# Set custom timeout (in milliseconds)
npm start "https://example.com/roms" --timeout 60000
```

### Command Line Options

- `<url>` - **Required**: URL of the ROM archive page
- `-d, --download-dir <dir>` - Download directory (default: `./downloads`)
- `--no-headless` - Run browser in visible mode for debugging
- `-t, --timeout <ms>` - Page load timeout in milliseconds (default: 30000)

## Basic Web Usage

```bash
npm run web:dev
```

The server will run on localhost:3001

## Example URLs

### Nintendo 64 (BigEndian)
```
https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064%20%28BigEndian%29/
```

### PlayStation
```
https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation/
```

### Game Boy Advance
```
https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Game%20Boy%20Advance/
```

## How It Works

1. **Scraping**: The tool uses Playwright to navigate to the provided URL and extract ROM information from the directory listing table
2. **Selection**: An interactive CLI checklist allows you to select which ROMs to download
3. **Download**: Selected ROMs are downloaded sequentially with progress tracking
4. **Organization**: All downloads are saved to the specified directory

## Interactive Selection

The CLI checklist interface allows you to:
- Use **arrow keys** to navigate
- Use **spacebar** to select/deselect ROMs
- Use **Enter** to confirm your selection
- See ROM names and file sizes for easy identification

## Output

The tool provides:
- Colorful status messages
- Progress bars during downloads
- Download summary with success/failure counts
- Error details for failed downloads

## Requirements

- Node.js 16+ 
- npm or yarn
- Internet connection

## Troubleshooting

### Browser Installation Issues
If you get browser-related errors, try:
```bash
npm run install-browsers
```

### Download Failures
- Check your internet connection
- Verify the URL is accessible
- Try increasing the timeout with `--timeout 60000`
- Use `--no-headless` to see what's happening in the browser

### Permission Issues
Make sure you have write permissions to the download directory.

## 🚀 CI/CD Pipeline

This project uses GitHub Actions for:

- **Automated Testing**: Runs tests on every PR and push
- **Multi-Platform Builds**: Builds Docker images for AMD64 and ARM64
- **Security Scanning**: Vulnerability scanning with Trivy and CodeQL
- **Automated Releases**: Creates releases with changelogs and Docker images
- **Dependency Updates**: Automated dependency updates with Dependabot

### Deployment Environments

- **Development**: `develop` branch → `ghcr.io/chrisdmacrae/rom-downloader:develop`
- **Production**: `main` branch → `ghcr.io/chrisdmacrae/rom-downloader:latest`
- **Releases**: Git tags → `ghcr.io/chrisdmacrae/rom-downloader:v1.0.0`

## License

MIT License - feel free to use and modify as needed.
