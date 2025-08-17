import { chromium } from 'playwright';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { NativeCurlDownloader } from './nativeCurlDownloader.js';

// Removed HTTP agents - using curl-style downloader

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

        // Initialize native curl downloader
        this.curlDownloader = new NativeCurlDownloader({
            downloadDir: this.downloadDir,
            progressCallback: this.progressCallback
        });
    }

    async init() {
        console.log('🚀 Initializing ROM Downloader...');

        // Initialize curl downloader
        await this.curlDownloader.init();

        // Configure browser launch options
        const launchOptions = {
            headless: this.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off'
            ]
        };

        console.log('🌐 Launching browser...');
        this.browser = await chromium.launch(launchOptions);

        this.context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });

        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(this.timeout);

        console.log('✅ ROM Downloader initialized successfully');
    }

    async scrapeRomList(url) {
        console.log(`🔍 Scraping ROM list from: ${url}`);

        try {
            await this.page.goto(url, { waitUntil: 'networkidle' });
            console.log('📄 Page loaded successfully');

            // Wait for the page to be fully loaded
            await this.page.waitForLoadState('domcontentloaded');

            // Extract ROM links with better filtering and URL resolution
            const romLinks = await this.page.evaluate((currentUrl) => {
                const links = Array.from(document.querySelectorAll('a'));
                return links
                    .filter(link => {
                        const href = link.getAttribute('href');
                        const text = link.textContent.trim();

                        // Must have both href and text
                        if (!href || !text) return false;

                        // Filter for ROM file extensions
                        const hasRomExtension = (
                            text.includes('.zip') ||
                            text.includes('.7z') ||
                            text.includes('.rar') ||
                            text.includes('.iso') ||
                            text.includes('.bin') ||
                            text.includes('.cue') ||
                            text.includes('.chd') ||
                            text.includes('.pbp') ||
                            text.includes('.cso')
                        );

                        // Exclude parent directory links and other navigation
                        const isNavigationLink = (
                            href === '../' ||
                            href === './' ||
                            text.includes('Parent Directory') ||
                            text.includes('..') ||
                            text.startsWith('[') // Often used for directories
                        );

                        return hasRomExtension && !isNavigationLink;
                    })
                    .map(link => {
                        const href = link.getAttribute('href');
                        const text = link.textContent.trim();

                        // Convert relative URLs to absolute URLs
                        let absoluteUrl = href;
                        if (!href.startsWith('http')) {
                            try {
                                absoluteUrl = new URL(href, currentUrl).href;
                            } catch (e) {
                                // If URL construction fails, keep original href
                                absoluteUrl = href;
                            }
                        }

                        return {
                            name: text,
                            url: href, // Keep original for compatibility
                            downloadUrl: absoluteUrl, // Add resolved absolute URL
                            size: null // Will be populated if available
                        };
                    });
            }, this.page.url());

            console.log(`📊 Found ${romLinks.length} ROM files`);

            // Debug: Log first few ROMs to verify URL structure
            if (romLinks.length > 0) {
                console.log('🔍 Sample ROM data:');
                romLinks.slice(0, 3).forEach((rom, index) => {
                    console.log(`  ${index + 1}. Name: ${rom.name}`);
                    console.log(`     URL: ${rom.url}`);
                    console.log(`     Download URL: ${rom.downloadUrl}`);
                });
            }

            return romLinks;

        } catch (error) {
            console.error('❌ Error scraping ROM list:', error);
            throw error;
        }
    }

    async downloadRoms(roms) {
        console.log(`📥 Starting download of ${roms.length} ROMs`);

        const results = [];
        for (const rom of roms) {
            try {
                console.log(`\n🎮 Processing ROM: ${rom.name}`);

                // Convert relative URLs to absolute URLs
                if (rom.url && !rom.url.startsWith('http')) {
                    const baseUrl = this.page.url();
                    rom.downloadUrl = new URL(rom.url, baseUrl).href;
                } else {
                    rom.downloadUrl = rom.url;
                }

                const filepath = await this.downloadSingleRomHTTP(rom);
                results.push({ rom, filepath, status: 'success' });

            } catch (error) {
                console.error(`❌ Failed to download ${rom.name}:`, error.message);
                results.push({ rom, error: error.message, status: 'failed' });
            }
        }

        return results;
    }

    async downloadSingleRom(rom) {
        console.log(`🎮 Downloading ROM: ${rom.name}`);

        try {
            // Navigate to the ROM page if needed
            if (rom.url && !rom.downloadUrl) {
                console.log(`🌐 Navigating to ROM page: ${rom.url}`);
                await this.page.goto(rom.url, { waitUntil: 'networkidle' });

                // Look for the ROM link on the current page
                console.log(`🔍 Searching for ROM link: ${rom.name}`);
                const romLink = await this.page.locator(`a:has-text("${rom.name}")`).first();

                if (await romLink.count() > 0) {
                    const href = await romLink.getAttribute('href');
                    if (href) {
                        rom.downloadUrl = href.startsWith('http') ? href : new URL(href, this.page.url()).href;
                        console.log(`🔗 Found download URL: ${rom.downloadUrl}`);
                    }
                }
            }

            // Use HTTP download
            return await this.downloadSingleRomHTTP(rom);

        } catch (error) {
            console.error(`❌ Error downloading ROM ${rom.name}:`, error);
            throw error;
        }
    }

    async downloadSingleRomPlaywright(rom) {
        console.log(`🎭 Using Playwright download for: ${rom.name}`);

        try {
            console.log(`🔍 Looking for link with text: ${rom.name}`);

            // Use a more reliable method to find and click the link
            const linkFound = await this.page.locator(`a:has-text("${rom.name}")`).first().click();
            console.log(`👆 Clicked download link for: ${rom.name}`);

            // Wait for the download to start
            const downloadPromise = this.page.waitForDownload();
            console.log(`⬇️ Download started for: ${rom.name}`);

            // Get download info
            const download = await downloadPromise;
            const filename = await download.suggestedFilename();
            const filepath = path.join(this.downloadDir, filename);
            console.log(`📁 Download directory: ${this.downloadDir}`);
            console.log(`📁 Download filename: ${filename}`);
            console.log(`📁 Download filepath: ${filepath}`);

            // Save the download
            await download.saveAs(filepath);
            console.log(`✅ Download completed: ${filepath}`);

            return filepath;

        } catch (error) {
            console.error(`❌ Playwright download failed for ${rom.name}:`, error);
            throw error;
        }
    }

    async downloadSingleRomHTTP(rom) {
        console.log(`🔄 Using curl-style downloader: ${rom.name}`);

        // Ensure we have a download URL
        if (!rom.downloadUrl && !rom.url) {
            throw new Error(`Cannot download ROM without downloadUrl or url: ${rom.name}. Please re-scrape the ROM list to get updated download URLs.`);
        }

        // Use downloadUrl if available, otherwise use url
        let downloadUrl = rom.downloadUrl || rom.url;

        // Convert relative URLs to absolute URLs if needed
        if (downloadUrl && !downloadUrl.startsWith('http')) {
            // If we have a page context, use it to resolve relative URLs
            if (this.page && this.page.url()) {
                const baseUrl = this.page.url();
                downloadUrl = new URL(downloadUrl, baseUrl).href;
                console.log(`🔗 Converted relative URL to absolute: ${downloadUrl}`);
            } else {
                throw new Error(`Cannot resolve relative URL without page context: ${downloadUrl}`);
            }
        }

        // Update the ROM object with the resolved URL
        rom.downloadUrl = downloadUrl;

        console.log(`📍 Final download URL: ${rom.downloadUrl}`);

        // Use the new curl-style downloader
        return this.curlDownloader.downloadRom(rom);
    }

    // Cancel a specific download
    cancelDownload(romName) {
        return this.curlDownloader.cancelDownload(romName);
    }

    // Check if a download is cancelled
    isDownloadCancelled(romName) {
        return this.curlDownloader.isDownloadCancelled(romName);
    }

    // Clear cancelled status (for retries)
    clearCancelledStatus(romName) {
        return this.curlDownloader.clearCancelledStatus(romName);
    }

    async close() {
        await this.curlDownloader.close();
        if (this.context) {
            await this.context.close();
        }
        if (this.browser) {
            await this.browser.close();
        }
    }
}
