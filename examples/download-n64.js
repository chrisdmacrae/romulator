#!/usr/bin/env node

/**
 * Example script for downloading Nintendo 64 ROMs
 * 
 * This demonstrates how to use the ROM downloader programmatically
 * instead of through the CLI interface.
 */

import { RomDownloader } from '../src/index.js';
import chalk from 'chalk';

async function downloadN64Roms() {
    const downloader = new RomDownloader({
        downloadDir: './n64-roms',
        headless: true
    });

    try {
        console.log(chalk.blue('🎮 Nintendo 64 ROM Downloader Example'));
        
        await downloader.init();
        
        const n64Url = 'https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064%20%28BigEndian%29/';
        const roms = await downloader.scrapeRomList(n64Url);
        
        // Filter for popular games (example)
        const popularGames = roms.filter(rom => {
            const name = rom.name.toLowerCase();
            return name.includes('mario') || 
                   name.includes('zelda') || 
                   name.includes('goldeneye') ||
                   name.includes('smash') ||
                   name.includes('mario kart');
        });
        
        console.log(chalk.yellow(`Found ${popularGames.length} popular games:`));
        popularGames.forEach(rom => {
            console.log(chalk.cyan(`  - ${rom.name} (${rom.size})`));
        });
        
        // You could automatically download these, or still use the interactive selection
        const selectedRoms = await downloader.selectRoms(popularGames);
        const results = await downloader.downloadRoms(selectedRoms);
        
        console.log(chalk.green(`\n✅ Downloaded ${results.successful.length} ROMs successfully!`));
        
    } catch (error) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
    } finally {
        await downloader.close();
    }
}

// Run the example
downloadN64Roms();
