import { chromium } from 'playwright';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RomDownloader {
    constructor(options = {}) {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.downloadDir = options.downloadDir || process.env.DOWNLOADS_DIR || './downloads';
        this.headless = options.headless !== false;
        this.timeout = options.timeout || parseInt(process.env.DOWNLOAD_TIMEOUT) || 30000;
        this.progressCallback = options.progressCallback || null;
    }

    async init() {
        console.log('🚀 Initializing ROM Downloader...');

        // Ensure download directory exists
        await fs.ensureDir(this.downloadDir);

        // Configure browser launch options
        const launchOptions = {
            headless: this.headless
        };

        // Use system Chromium if specified via environment variable
        if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
            console.log(`🔧 Using system Chromium at: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`);
        }

        // Launch browser
        this.browser = await chromium.launch(launchOptions);

        // Create browser context with download settings
        this.context = await this.browser.newContext({
            acceptDownloads: true,
            downloadsPath: path.resolve(this.downloadDir)
        });

        this.page = await this.context.newPage();

        console.log('✅ Browser initialized');
    }

    async scrapeRomList(url) {
        console.log(`🔍 Scraping ROM list from: ${url}`);
        
        try {
            await this.page.goto(url, { waitUntil: 'networkidle' });
            
            // Wait for the table to load
            await this.page.waitForSelector('table', { timeout: this.timeout });
            
            // Extract ROM information
            const roms = await this.page.evaluate(() => {
                const rows = document.querySelectorAll('table tbody tr');
                const romList = [];
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const nameCell = cells[0];
                        const sizeCell = cells[1];
                        const dateCell = cells[2];
                        
                        const link = nameCell.querySelector('a');
                        if (link && !link.textContent.includes('Parent directory')) {
                            const name = link.textContent.trim();
                            const downloadUrl = link.href;
                            const size = sizeCell.textContent.trim();
                            const date = dateCell.textContent.trim();
                            
                            // Only include .zip files (ROMs)
                            if (name.endsWith('.zip')) {
                                romList.push({
                                    name,
                                    downloadUrl,
                                    size,
                                    date
                                });
                            }
                        }
                    }
                });
                
                return romList;
            });
            
            console.log(`✅ Found ${roms.length} ROMs`);
            return roms;
            
        } catch (error) {
            console.error(`❌ Error scraping ROM list: ${error.message}`);
            throw error;
        }
    }

    async downloadSingleRom(rom) {
        try {
            console.log(`🔄 Downloading ROM: ${rom.name}`);

            // Handle missing downloadUrl (for legacy sessions)
            if (!rom.downloadUrl) {
                console.log(`⚠️ ROM missing downloadUrl, attempting to find it by scraping: ${rom.name}`);

                // Try to find the ROM by scraping the current page
                try {
                    const currentUrl = this.page.url();
                    console.log(`🔍 Current page URL: ${currentUrl}`);

                    // If we're not on a ROM listing page, we can't find the download URL
                    if (!currentUrl || !currentUrl.includes('/files/')) {
                        throw new Error(`Not on a ROM listing page. Current URL: ${currentUrl}`);
                    }

                    // Look for the ROM link on the current page
                    console.log(`🔍 Searching for ROM link: ${rom.name}`);
                    const romLink = await this.page.locator(`a:has-text("${rom.name}")`).first();

                    if (await romLink.count() > 0) {
                        const href = await romLink.getAttribute('href');
                        if (href) {
                            // Convert relative URL to absolute if needed
                            rom.downloadUrl = href.startsWith('http') ? href : new URL(href, currentUrl).href;
                            console.log(`🔧 Found downloadUrl by scraping: ${rom.downloadUrl}`);
                        } else {
                            throw new Error(`ROM link found but no href attribute`);
                        }
                    } else {
                        throw new Error(`ROM link not found on current page`);
                    }
                } catch (scrapingError) {
                    console.error(`❌ Could not find ROM by scraping:`, scrapingError.message);
                    throw new Error(`Cannot find downloadUrl for ROM: ${rom.name}. Please re-scrape the ROM list to get updated download URLs.`);
                }
            }

            console.log(`📍 Download URL: ${rom.downloadUrl}`);

            // First, navigate to the parent directory to establish context
            const parentUrl = rom.downloadUrl.substring(0, rom.downloadUrl.lastIndexOf('/') + 1);
            console.log(`🌐 Navigating to parent URL: ${parentUrl}`);

            await this.page.goto(parentUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Wait for the download event and click the link
            const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });

            // Find the link by text content instead of href attribute
            console.log(`🔍 Looking for link with text: ${rom.name}`);

            // Use a more reliable method to find and click the link
            const linkFound = await this.page.locator(`a:has-text("${rom.name}")`).first().click();
            console.log(`👆 Clicked download link for: ${rom.name}`);

            // Wait for the download to start
            const download = await downloadPromise;
            console.log(`⬇️ Download started for: ${rom.name}`);

            // Get download info
            const filename = await download.suggestedFilename();
            const filepath = path.join(this.downloadDir, filename);
            console.log(`📁 Download directory: ${this.downloadDir}`);
            console.log(`📁 Download filename: ${filename}`);
            console.log(`📁 Full download path: ${filepath}`);

            // Track download progress if callback is provided
            if (this.progressCallback) {
                console.log(`🔄 Starting progress tracking for: ${rom.name}`);

                // Start progress tracking - emit initial state
                this.progressCallback({
                    type: 'fileProgress',
                    romName: rom.name,
                    filename: filename,
                    progress: 0,
                    downloadedBytes: 0,
                    totalBytes: null,
                    status: 'downloading'
                });

                // Parse total size from ROM metadata if available
                let totalSize = null;
                if (rom.size) {
                    console.log(`🔍 Parsing size from: "${rom.size}"`);
                    // Updated regex to handle more size formats including "GiB", "MiB", etc.
                    const sizeMatch = rom.size.match(/([0-9.]+)\s*(KB|MB|GB|KiB|MiB|GiB)/i);
                    if (sizeMatch) {
                        const value = parseFloat(sizeMatch[1]);
                        const unit = sizeMatch[2].toUpperCase();
                        console.log(`🔍 Parsed: ${value} ${unit}`);
                        switch (unit) {
                            case 'KB':
                            case 'KIB': totalSize = value * 1024; break;
                            case 'MB':
                            case 'MIB': totalSize = value * 1024 * 1024; break;
                            case 'GB':
                            case 'GIB': totalSize = value * 1024 * 1024 * 1024; break;
                        }
                        console.log(`📏 Estimated total size: ${totalSize} bytes (${rom.size})`);
                    } else {
                        console.log(`⚠️ Could not parse size format: "${rom.size}"`);
                    }
                } else {
                    console.log(`⚠️ No size information available for ROM: ${rom.name}`);
                }

                // Monitor download progress using Playwright's download API
                const progressInterval = setInterval(async () => {
                    try {
                        let currentSize = 0;
                        let isComplete = false;
                        let foundFile = null;

                        console.log(`🔍 Checking download progress for: ${filename}`);

                        // First, try to get progress from Playwright's download object
                        try {
                            // Check if download is still in progress
                            const downloadPath = await download.path();
                            if (downloadPath) {
                                console.log(`📊 Playwright download path: ${downloadPath}`);
                                if (await fs.pathExists(downloadPath)) {
                                    const stats = await fs.stat(downloadPath);
                                    currentSize = stats.size;
                                    foundFile = path.basename(downloadPath);
                                    console.log(`📊 Found download file via Playwright: ${foundFile}, size: ${currentSize} bytes`);
                                }
                            }
                        } catch (downloadError) {
                            // Download might be complete or path not available yet
                            console.log(`🔍 Playwright download path not available: ${downloadError.message}`);
                        }

                        // Fallback: Check for various temporary download file patterns
                        if (currentSize === 0) {
                            const tempPatterns = [
                                filepath + '.crdownload',  // Chrome
                                filepath + '.part',        // Firefox
                                filepath + '.download',    // Generic
                                filepath + '.tmp'          // Temporary
                            ];

                            // Check temp files first
                            for (const tempPath of tempPatterns) {
                                if (await fs.pathExists(tempPath)) {
                                    const stats = await fs.stat(tempPath);
                                    currentSize = stats.size;
                                    foundFile = path.basename(tempPath);
                                    console.log(`📊 Found temp file: ${foundFile}, size: ${currentSize} bytes`);
                                    break;
                                }
                            }

                            // Check final file if no temp file found
                            if (currentSize === 0 && await fs.pathExists(filepath)) {
                                const stats = await fs.stat(filepath);
                                currentSize = stats.size;
                                isComplete = true;
                                foundFile = path.basename(filepath);
                                console.log(`✅ Found final file: ${foundFile}, size: ${currentSize} bytes`);
                            }

                            if (currentSize === 0) {
                                console.log(`⏳ No download files found yet for: ${filename}`);
                                console.log(`🔍 Checked paths:`, tempPatterns.concat([filepath]));
                            }
                        }

                        // Calculate progress
                        let progressPercent = 0;
                        if (totalSize && totalSize > 0 && currentSize > 0) {
                            progressPercent = Math.min(100, (currentSize / totalSize) * 100);
                            console.log(`📊 Progress calculation: ${currentSize} / ${totalSize} = ${progressPercent}%`);
                        } else if (isComplete) {
                            progressPercent = 100;
                            console.log(`📊 Download complete: 100%`);
                        } else if (currentSize > 0) {
                            // Show activity even without total size - more conservative progress
                            const mbDownloaded = currentSize / (1024 * 1024);
                            progressPercent = Math.min(95, 5 + (mbDownloaded * 2)); // 2% per MB, max 95%
                            console.log(`📊 Progress without total size: ${mbDownloaded.toFixed(1)} MB = ${progressPercent}%`);
                        } else {
                            // No file activity yet, but show that download has started
                            progressPercent = 1;
                            console.log(`📊 Download started but no file activity yet: 1%`);
                        }

                        // Always emit progress updates
                        const progressData = {
                            type: 'fileProgress',
                            romName: rom.name,
                            filename: filename,
                            progress: Math.round(progressPercent),
                            downloadedBytes: currentSize,
                            totalBytes: totalSize,
                            status: isComplete ? 'complete' : 'downloading'
                        };

                        console.log(`📊 Emitting progress for ${rom.name}: ${progressData.progress}% (${currentSize} bytes)`);
                        this.progressCallback(progressData);

                        // Stop tracking if complete
                        if (isComplete) {
                            clearInterval(progressInterval);
                        }
                    } catch (err) {
                        console.error(`❌ Progress tracking error:`, err);
                    }
                }, 500); // Check every 500ms for more responsive updates

                try {
                    // Save the download
                    await download.saveAs(filepath);
                    clearInterval(progressInterval);

                    // Wait a moment for file to be fully written
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Get final file size and emit completion
                    let finalSize = 0;
                    if (await fs.pathExists(filepath)) {
                        const stats = await fs.stat(filepath);
                        finalSize = stats.size;
                    }

                    const completionData = {
                        type: 'fileProgress',
                        romName: rom.name,
                        filename: filename,
                        progress: 100,
                        downloadedBytes: finalSize,
                        totalBytes: finalSize,
                        status: 'complete'
                    };

                    console.log(`✅ Download complete, emitting:`, completionData);
                    this.progressCallback(completionData);

                } catch (saveError) {
                    clearInterval(progressInterval);
                    console.error(`❌ Download save error:`, saveError);
                    throw saveError;
                }
            } else {
                console.log(`⚠️ No progress callback provided for: ${rom.name}`);
                // No progress tracking, just save
                await download.saveAs(filepath);
            }

            console.log(`💾 Saved to: ${filepath}`);
            return filepath;
        } catch (error) {
            // Fallback: try finding the link by exact text match
            try {
                // Ensure downloadUrl exists for fallback too
                if (!rom.downloadUrl) {
                    throw new Error(`Cannot perform fallback download without downloadUrl for ROM: ${rom.name}. Please re-scrape the ROM list to get updated download URLs.`);
                }

                const parentUrl = rom.downloadUrl.substring(0, rom.downloadUrl.lastIndexOf('/') + 1);
                await this.page.goto(parentUrl, {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });

                const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });

                // Try to find the link by evaluating and clicking
                console.log(`🔄 Fallback: Looking for exact text match: ${rom.name}`);
                await this.page.evaluate((romName) => {
                    const links = document.querySelectorAll('a');
                    for (const link of links) {
                        if (link.textContent.trim() === romName) {
                            console.log(`Found link: ${link.href}`);
                            link.click();
                            return;
                        }
                    }
                    throw new Error(`Could not find link for ${romName}`);
                }, rom.name);

                const download = await downloadPromise;
                const filename = await download.suggestedFilename();
                const filepath = path.join(this.downloadDir, filename);

                // Track progress for fallback as well
                if (this.progressCallback) {
                    this.progressCallback({
                        type: 'fileProgress',
                        romName: rom.name,
                        filename: filename,
                        progress: 0,
                        downloadedBytes: 0,
                        totalBytes: null,
                        status: 'downloading'
                    });
                }

                await download.saveAs(filepath);

                if (this.progressCallback) {
                    // Get final file size
                    let finalSize = 0;
                    if (await fs.pathExists(filepath)) {
                        const stats = await fs.stat(filepath);
                        finalSize = stats.size;
                    }

                    this.progressCallback({
                        type: 'fileProgress',
                        romName: rom.name,
                        filename: filename,
                        progress: 100,
                        downloadedBytes: finalSize,
                        totalBytes: finalSize,
                        status: 'complete'
                    });
                }

                return filepath;
            } catch (fallbackError) {
                throw new Error(`Download failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
            }
        }
    }

    async close() {
        if (this.context) {
            await this.context.close();
        }
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }
}
