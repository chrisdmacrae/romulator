#!/usr/bin/env node

import { chromium } from 'playwright';

async function testPlaywrightConfig() {
    console.log('🧪 Testing Playwright configuration...');
    
    try {
        // Configure browser launch options
        const launchOptions = {
            headless: true
        };

        // Use system Chromium if specified via environment variable
        if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
            console.log(`🔧 Using system Chromium at: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`);
        } else {
            console.log('📦 Using bundled Chromium');
        }

        console.log('🚀 Launching browser...');
        const browser = await chromium.launch(launchOptions);
        
        console.log('✅ Browser launched successfully!');
        
        const page = await browser.newPage();
        console.log('📄 Created new page');
        
        await page.goto('https://example.com');
        console.log('🌐 Navigated to example.com');
        
        const title = await page.title();
        console.log(`📝 Page title: ${title}`);
        
        await browser.close();
        console.log('🔒 Browser closed');
        
        console.log('✅ Playwright test completed successfully!');
        
    } catch (error) {
        console.error('❌ Playwright test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

testPlaywrightConfig();
