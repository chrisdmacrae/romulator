#!/usr/bin/env node

import { chromium } from 'playwright';
import inquirer from 'inquirer';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import Fuse from 'fuse.js';

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
        this.enableSearch = options.enableSearch !== false; // Default to true
    }

    async init() {
        console.log(chalk.blue('🚀 Initializing ROM Downloader...'));

        // Ensure download directory exists
        await fs.ensureDir(this.downloadDir);

        // Configure browser launch options
        const launchOptions = {
            headless: this.headless
        };

        // Use system Chromium if specified via environment variable
        if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
            console.log(chalk.yellow(`🔧 Using system Chromium at: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`));
        }

        // Launch browser
        this.browser = await chromium.launch(launchOptions);

        // Create browser context with download settings
        this.context = await this.browser.newContext({
            acceptDownloads: true,
            downloadsPath: path.resolve(this.downloadDir)
        });

        this.page = await this.context.newPage();

        console.log(chalk.green('✅ Browser initialized'));
    }

    async scrapeRomList(url) {
        console.log(chalk.blue(`🔍 Scraping ROM list from: ${url}`));
        
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
            
            console.log(chalk.green(`✅ Found ${roms.length} ROMs`));
            return roms;
            
        } catch (error) {
            console.error(chalk.red(`❌ Error scraping ROM list: ${error.message}`));
            throw error;
        }
    }

    async searchRoms(roms) {
        console.log(chalk.yellow('\n🔍 Search ROMs:'));
        console.log(chalk.gray('Enter search terms to filter ROMs (leave empty to see all)'));

        // Show some popular search suggestions
        const suggestions = this.getSearchSuggestions(roms);
        if (suggestions.length > 0) {
            console.log(chalk.gray(`💡 Popular terms: ${suggestions.join(', ')}`));
        }

        // Configure Fuse.js for fuzzy searching
        const fuse = new Fuse(roms, {
            keys: ['name'],
            threshold: 0.4, // Lower = more strict matching
            includeScore: true,
            minMatchCharLength: 2
        });

        const searchAnswer = await inquirer.prompt([
            {
                type: 'input',
                name: 'searchTerm',
                message: 'Search for ROMs (e.g., "mario", "zelda", "final fantasy"):',
                validate: (input) => {
                    return true; // Allow empty input to show all ROMs
                }
            }
        ]);

        let filteredRoms = roms;

        if (searchAnswer.searchTerm.trim()) {
            const searchResults = fuse.search(searchAnswer.searchTerm);
            filteredRoms = searchResults.map(result => result.item);

            if (filteredRoms.length === 0) {
                console.log(chalk.red(`❌ No ROMs found matching "${searchAnswer.searchTerm}"`));

                // Try to suggest similar terms
                const allWords = this.extractWords(roms);
                const wordFuse = new Fuse(allWords, { threshold: 0.6 });
                const wordSuggestions = wordFuse.search(searchAnswer.searchTerm).slice(0, 3);

                if (wordSuggestions.length > 0) {
                    const suggestions = wordSuggestions.map(s => s.item).join(', ');
                    console.log(chalk.yellow(`💡 Did you mean: ${suggestions}?`));
                }

                console.log(chalk.yellow('💡 Try a different search term or leave empty to see all ROMs'));
                return this.searchRoms(roms); // Recursive search
            }

            console.log(chalk.green(`✅ Found ${filteredRoms.length} ROMs matching "${searchAnswer.searchTerm}"`));
        } else {
            console.log(chalk.blue(`📋 Showing all ${roms.length} ROMs`));
        }

        return filteredRoms;
    }

    getSearchSuggestions(roms) {
        // Extract common game series and popular terms
        const commonTerms = ['mario', 'zelda', 'final fantasy', 'street fighter', 'tekken', 'resident evil', 'crash', 'spyro', 'sonic', 'pokemon'];
        const suggestions = [];

        for (const term of commonTerms) {
            const count = roms.filter(rom => rom.name.toLowerCase().includes(term)).length;
            if (count > 0) {
                suggestions.push(`${term} (${count})`);
            }
            if (suggestions.length >= 5) break; // Limit suggestions
        }

        return suggestions;
    }

    extractWords(roms) {
        const words = new Set();
        roms.forEach(rom => {
            const romWords = rom.name
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ') // Remove special characters
                .split(/\s+/)
                .filter(word => word.length > 2); // Only words longer than 2 chars

            romWords.forEach(word => words.add(word));
        });

        return Array.from(words);
    }

    async selectRoms(roms) {
        let filteredRoms = roms;

        // Only show search if enabled and there are many ROMs
        if (this.enableSearch && roms.length > 20) {
            filteredRoms = await this.searchRoms(roms);
        } else if (roms.length > 20) {
            console.log(chalk.yellow(`\n📋 Found ${roms.length} ROMs (search disabled)`));
            console.log(chalk.gray('💡 Use --enable-search to filter ROMs with fuzzy search'));
        }

        console.log(chalk.yellow('\n📋 Select ROMs to download:'));

        const choices = filteredRoms.map(rom => ({
            name: `${rom.name} (${rom.size})`,
            value: rom,
            short: rom.name
        }));

        const answers = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'selectedRoms',
                message: 'Choose ROMs to download (use space to select, enter to confirm):',
                choices,
                pageSize: 15,
                validate: (answer) => {
                    if (answer.length < 1) {
                        return 'You must choose at least one ROM.';
                    }
                    return true;
                }
            }
        ]);

        // Ask if user wants to search again or add more ROMs (only if search was used)
        if (this.enableSearch && filteredRoms.length < roms.length) {
            const continueAnswer = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'searchAgain',
                    message: 'Do you want to search for more ROMs to add to your selection?',
                    default: false
                }
            ]);

            if (continueAnswer.searchAgain) {
                const additionalRoms = await this.selectRoms(roms);
                // Combine selections, avoiding duplicates
                const combinedRoms = [...answers.selectedRoms];
                additionalRoms.forEach(rom => {
                    if (!combinedRoms.find(existing => existing.name === rom.name)) {
                        combinedRoms.push(rom);
                    }
                });
                return combinedRoms;
            }
        }

        return answers.selectedRoms;
    }

    async downloadRoms(selectedRoms) {
        console.log(chalk.blue(`\n⬇️  Starting download of ${selectedRoms.length} ROMs...`));
        
        const progressBar = new cliProgress.SingleBar({
            format: 'Progress |{bar}| {percentage}% | {value}/{total} | {filename}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        });
        
        progressBar.start(selectedRoms.length, 0, { filename: 'Initializing...' });
        
        const results = {
            successful: [],
            failed: []
        };
        
        for (let i = 0; i < selectedRoms.length; i++) {
            const rom = selectedRoms[i];
            progressBar.update(i, { filename: rom.name });
            
            try {
                await this.downloadSingleRom(rom);
                results.successful.push(rom);
                console.log(chalk.green(`\n✅ Downloaded: ${rom.name}`));
            } catch (error) {
                results.failed.push({ rom, error: error.message });
                console.log(chalk.red(`\n❌ Failed: ${rom.name} - ${error.message}`));
            }
        }
        
        progressBar.update(selectedRoms.length, { filename: 'Complete!' });
        progressBar.stop();
        
        return results;
    }

    async downloadSingleRom(rom) {
        try {
            // First, navigate to the parent directory to establish context
            const parentUrl = rom.downloadUrl.substring(0, rom.downloadUrl.lastIndexOf('/') + 1);
            await this.page.goto(parentUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Wait for the download event and click the link
            const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });

            // Find the link by text content instead of href attribute
            const linkSelector = `a:has-text("${rom.name}")`;
            await this.page.click(linkSelector);

            // Wait for the download to start
            const download = await downloadPromise;

            // Save the download
            const filename = await download.suggestedFilename();
            const filepath = path.join(this.downloadDir, filename);
            await download.saveAs(filepath);

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
                await this.page.evaluate((romName) => {
                    const links = document.querySelectorAll('a');
                    for (const link of links) {
                        if (link.textContent.trim() === romName) {
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
            console.log(chalk.blue('🔒 Browser closed'));
        }
    }
}

// CLI Setup
const program = new Command();

program
    .name('rom-downloader')
    .description('Download ROMs from Myrient archive with interactive selection')
    .version('1.0.0')
    .argument('<url>', 'URL of the ROM archive page')
    .option('-d, --download-dir <dir>', 'Download directory', './downloads')
    .option('--no-headless', 'Run browser in visible mode')
    .option('-t, --timeout <ms>', 'Page load timeout in milliseconds', '30000')
    .option('--no-search', 'Disable fuzzy search functionality')
    .action(async (url, options) => {
        const downloader = new RomDownloader({
            downloadDir: options.downloadDir,
            headless: options.headless,
            timeout: parseInt(options.timeout),
            enableSearch: options.search !== false
        });
        
        try {
            await downloader.init();
            
            const roms = await downloader.scrapeRomList(url);
            
            if (roms.length === 0) {
                console.log(chalk.yellow('⚠️  No ROMs found on this page'));
                return;
            }
            
            const selectedRoms = await downloader.selectRoms(roms);
            
            const results = await downloader.downloadRoms(selectedRoms);
            
            // Summary
            console.log(chalk.blue('\n📊 Download Summary:'));
            console.log(chalk.green(`✅ Successful: ${results.successful.length}`));
            console.log(chalk.red(`❌ Failed: ${results.failed.length}`));
            
            if (results.failed.length > 0) {
                console.log(chalk.red('\nFailed downloads:'));
                results.failed.forEach(({ rom, error }) => {
                    console.log(chalk.red(`  - ${rom.name}: ${error}`));
                });
            }
            
        } catch (error) {
            console.error(chalk.red(`❌ Error: ${error.message}`));
            process.exit(1);
        } finally {
            await downloader.close();
        }
    });

program.parse();
