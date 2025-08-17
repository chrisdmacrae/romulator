# ROM Downloader

[![Build and Deploy](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/docker-build-deploy.yml/badge.svg)](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/docker-build-deploy.yml)
[![Security Scan](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/security-scan.yml/badge.svg)](https://github.com/chrisdmacrae/rom-downloader/actions/workflows/security-scan.yml)
[![Docker Image](https://ghcr-badge.deta.dev/chrisdmacrae/rom-downloader/latest_tag?trim=major&label=latest)](https://github.com/chrisdmacrae/rom-downloader/pkgs/container/rom-downloader)

A modern web-based ROM downloader with automated organization, built with React, Express, and Playwright.

### Quick Start with Docker

```bash
# Using Docker Compose (Recommended)
mkdir romulator && cd romulator
curl -O https://raw.githubusercontent.com/chrisdmacrae/romulator/main/docker-compose.yml
```

Then, edit the docker compose, updating the volumes to match your local paths:

```yaml
volumes:
    # Downloads directory - where ROMs are saved
    - ./downloads:/app/downloads
    # Organized directory - where organized ROMs are moved
    - ./organized:/app/organized
```

> replace `./downloads` and `./organized` with your local paths

```bash
docker-compose up -d
```

```bash
# Using Docker Run
docker run -d \
  --name romulator \
  -p 3001:3001 \
  -v ./path/to/downloads:/app/downloads \
  -v ./config:/app/config \
  -v ./path/to/games:/app/organized \
  ghcr.io/chrisdmacrae/romulator:latest
```

### Available Images

- `ghcr.io/chrisdmacrae/romulator:latest` - Latest stable release
- `ghcr.io/chrisdmacrae/romulator:develop` - Development build
- `ghcr.io/chrisdmacrae/romulator:v1.0.0` - Specific version

### Multi-Architecture Support

Images are available for:
- `linux/amd64` (Intel/AMD x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

For detailed Docker deployment instructions, see [DOCKER-DEPLOYMENT.md](DOCKER-DEPLOYMENT.md).

## Features

- 🔍 **Web Scraping**: Automatically scrapes ROM lists from Myrient archive pages
- 📋 **Interactive Selection**: CLI checklist interface for selecting which ROMs to download
- ⬇️ **Batch Downloads**: Download multiple ROMs with progress tracking
- 📊 **Speed Monitoring**: Real-time download speeds, ETA, and session statistics
- ⚡ **Parallel Downloads**: Multi-chunk parallel downloading for maximum speed
- 🎨 **Colorful Output**: Beautiful CLI interface with colors and progress bars
- 📁 **Organized Downloads**: Automatically creates download directory
- ⚡ **Fast & Reliable**: Uses Playwright for web scraping and native HTTP for downloads

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

### Docker Deployment

#### Quick Start with Docker Compose

1. **Setup directory permissions** (required for volume mounts):
```bash
./setup-permissions.sh
```

2. **Start the application**:
```bash
docker-compose up -d
```

3. **Access the application**:
   - Open http://localhost:3001 in your browser
   - Downloads will be saved to `./downloads/`
   - Organized ROMs will be in `./organized/`
   - Configuration files in `./config/`

#### Docker Configuration

The application is configured to use the system Chromium browser instead of downloading Playwright's bundled browsers:

- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` - Prevents downloading Playwright browsers
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser` - Points to system Chromium
- `PUID=1000` and `PGID=1000` - Set user/group IDs for proper file permissions

#### Volume Mounts

The Docker Compose setup includes three volume mounts:
- `./downloads:/app/downloads` - Downloaded ROM files
- `./config:/app/config` - Configuration files and rulesets
- `./organized:/app/organized` - Organized ROM files

#### Troubleshooting Docker Permissions

If you encounter permission issues:

1. **Run the setup script**:
```bash
./setup-permissions.sh
```

2. **Manual permission fix**:
```bash
sudo chown -R $(id -u):$(id -g) downloads config organized
chmod -R 755 downloads config organized
```

3. **Check container logs**:
```bash
docker-compose logs -f rom-downloader
```

#### Parallel Download Configuration

The application uses parallel chunk downloading for maximum speed. You can configure this behavior:

**Environment Variables:**
- `MAX_CONCURRENT_CHUNKS=8` - Number of concurrent chunks (default: 8)
- `CHUNK_SIZE=1048576` - Fixed chunk size in bytes (default: 1MB)
- `MIN_PARALLEL_FILE_SIZE=2097152` - Minimum file size for parallel download (default: 2MB)
- `DISABLE_PARALLEL_DOWNLOAD=true` - Disable parallel downloads (use single-threaded)

**How it works:**
1. **Range Request Check**: Tests if server supports HTTP range requests
2. **Continuous Chunking**: Downloads file in fixed-size chunks (e.g., 1MB each)
3. **Concurrent Downloads**: Maintains 8 concurrent chunk downloads at all times
4. **Progressive Assembly**: Combines chunks into final file as they complete
5. **Fallback**: Uses single-threaded download if ranges not supported

**Example:** A 100MB file becomes 100 chunks of 1MB each, with 8 downloading simultaneously until complete.

**Performance Benefits:**
- 🚀 **5-10x faster** downloads on high-bandwidth connections
- ⚡ **Automatic optimization** based on file size and server capabilities
- 🔄 **Intelligent fallback** for servers that don't support ranges
- 📊 **Real-time progress** tracking across all chunks

## Architecture

### Download Method

The application uses a hybrid approach:

- **Web Scraping**: Playwright with Chromium for scraping ROM lists and extracting download URLs
- **File Downloads**: Native Node.js HTTP/HTTPS requests for efficient, resource-friendly downloads

This approach provides the best of both worlds:
- Robust scraping of dynamic web content
- Efficient downloads without browser overhead
- Better resource management in containerized environments
- Improved reliability and reduced memory usage

## Troubleshooting

### Socket Connection Errors

If you encounter "xhr poll error" or Socket.IO connection issues:

1. **Port Configuration**: Ensure the server is running on the correct port:
   - Development: Server runs on port 3001, Vite dev server on port 3000
   - Production/Docker: Server runs on port 3001 (mapped from container)

2. **CORS Issues**: The application is configured to allow connections from:
   - `http://localhost:3000` (Vite dev server)
   - `http://localhost:3001` (Production server)
   - `http://localhost:3002` (Legacy support)

3. **Docker Networking**: When running in Docker, the frontend automatically detects the environment and connects to the appropriate endpoint.

### Browser Launch Errors

If you see "Failed to launch browser" errors in Docker:

1. The application is configured to use system Chromium instead of Playwright's bundled browsers
2. Environment variables `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser` handle this automatically
3. The Docker image includes all necessary Chromium dependencies

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
