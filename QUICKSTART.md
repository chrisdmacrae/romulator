# Quick Start Guide

Get up and running with ROM Downloader in 5 minutes!

## 1. Prerequisites

Make sure you have Node.js 16+ installed:
```bash
node --version
```

If not installed, download from [nodejs.org](https://nodejs.org/)

## 2. Setup

### Option A: Automatic Setup (Recommended)

**Linux/macOS:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows:**
```cmd
setup.bat
```

### Option B: Manual Setup

```bash
npm install
npm run install-browsers
mkdir downloads
```

## 3. Download ROMs

### Nintendo 64 ROMs
```bash
npm start "https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064%20%28BigEndian%29/"
```

### PlayStation ROMs
```bash
npm start "https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation/"
```

### Game Boy Advance ROMs
```bash
npm start "https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Game%20Boy%20Advance/"
```

## 4. Using the Interface

1. **Wait for scraping**: The tool will automatically scan the page for ROMs
2. **Select ROMs**: Use the interactive checklist:
   - ↑↓ arrows to navigate
   - Space to select/deselect
   - Enter to confirm
3. **Download**: Watch the progress as ROMs download
4. **Find files**: Check the `downloads/` folder for your ROMs

## 5. Tips

- **Large collections**: Use Ctrl+C to cancel if you accidentally select too many
- **Custom folder**: Add `--download-dir ./my-roms` to save elsewhere
- **Debugging**: Add `--no-headless` to see the browser in action
- **Slow connection**: Add `--timeout 60000` for longer page load times

## Common URLs

| System | URL |
|--------|-----|
| Nintendo 64 | `https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064%20%28BigEndian%29/` |
| PlayStation | `https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation/` |
| Game Boy Advance | `https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Game%20Boy%20Advance/` |
| SNES | `https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/` |
| Genesis | `https://myrient.erista.me/files/No-Intro/Sega%20-%20Mega%20Drive%20-%20Genesis/` |

## Need Help?

- Check the full [README.md](README.md) for detailed documentation
- Make sure your internet connection is stable
- Verify the URL is accessible in your browser first
- Try running with `--no-headless` to see what's happening

Happy ROM collecting! 🎮
