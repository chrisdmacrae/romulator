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
        this.downloadDir = options.downloadDir || './downloads';
        this.headless = options.headless !== false;
        this.timeout = options.timeout || 30000;
    }

    async init() {
        console.log('🚀 Initializing ROM Downloader...');

        // Ensure download directory exists
        await fs.ensureDir(this.downloadDir);

        // Launch browser
        this.browser = await chromium.launch({
            headless: this.headless
        });

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

            // Save the download
            const filename = await download.suggestedFilename();
            const filepath = path.join(this.downloadDir, filename);
            await download.saveAs(filepath);
            console.log(`💾 Saved to: ${filepath}`);

            return filepath;
        } catch (error) {
            // Fallback: try finding the link by exact text match
            try {
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
                await download.saveAs(filepath);

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
