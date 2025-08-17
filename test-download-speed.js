#!/usr/bin/env node

/**
 * Download Speed Test Script
 * Tests raw download performance to identify bottlenecks
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import { performance } from 'perf_hooks';

// Create optimized agents
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 60000,
    freeSocketTimeout: 30000
});

const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 60000,
    freeSocketTimeout: 30000
});

function formatSpeed(bytesPerSecond) {
    const mbps = bytesPerSecond / (1024 * 1024);
    if (mbps >= 1) {
        return `${mbps.toFixed(2)} MB/s`;
    } else {
        const kbps = bytesPerSecond / 1024;
        return `${kbps.toFixed(1)} KB/s`;
    }
}

function testDownloadSpeed(url, testName = 'Download Test') {
    return new Promise((resolve, reject) => {
        console.log(`\n🚀 Starting ${testName}`);
        console.log(`📍 URL: ${url}`);
        
        const startTime = performance.now();
        let downloadedBytes = 0;
        let lastTime = startTime;
        let lastBytes = 0;
        
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        const agent = protocol === https ? httpsAgent : httpAgent;
        
        const requestOptions = {
            agent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            },
            timeout: 120000
        };
        
        const request = protocol.get(url, requestOptions, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            }
            
            const totalBytes = parseInt(response.headers['content-length']) || null;
            console.log(`📊 Content-Length: ${totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
            
            // Create a dummy write stream to /dev/null equivalent
            const writeStream = fs.createWriteStream('/dev/null', {
                highWaterMark: 1024 * 1024 // 1MB buffer
            });
            
            response.pipe(writeStream);
            
            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                
                const now = performance.now();
                const timeDiff = (now - lastTime) / 1000; // seconds
                
                // Update every second
                if (timeDiff >= 1.0) {
                    const bytesDiff = downloadedBytes - lastBytes;
                    const currentSpeed = bytesDiff / timeDiff;
                    const overallSpeed = downloadedBytes / ((now - startTime) / 1000);
                    
                    const progress = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : 'N/A';
                    
                    console.log(`📊 Progress: ${progress}% | Current: ${formatSpeed(currentSpeed)} | Average: ${formatSpeed(overallSpeed)} | Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
                    
                    lastTime = now;
                    lastBytes = downloadedBytes;
                }
            });
            
            response.on('end', () => {
                const endTime = performance.now();
                const totalTime = (endTime - startTime) / 1000; // seconds
                const averageSpeed = downloadedBytes / totalTime;
                
                console.log(`\n✅ ${testName} Complete!`);
                console.log(`📊 Total Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
                console.log(`⏱️  Total Time: ${totalTime.toFixed(2)} seconds`);
                console.log(`🚀 Average Speed: ${formatSpeed(averageSpeed)}`);
                
                resolve({
                    bytes: downloadedBytes,
                    time: totalTime,
                    speed: averageSpeed
                });
            });
            
            response.on('error', reject);
            writeStream.on('error', reject);
        });
        
        request.on('error', reject);
        request.setTimeout(120000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// Test URLs - you can modify these
const testUrls = [
    // Test with a known fast server first
    'https://httpbin.org/bytes/10485760', // 10MB test file

    // Then test myrient
    'https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation%20Portable/Ape%20Escape%20-%20On%20the%20Loose%20(USA).7z',
];

async function runTests() {
    console.log('🔧 ROM Downloader Speed Test');
    console.log('============================');
    
    for (let i = 0; i < testUrls.length; i++) {
        try {
            const result = await testDownloadSpeed(testUrls[i], `Test ${i + 1}`);
            
            if (result.speed < 100 * 1024) { // Less than 100 KB/s
                console.log('⚠️  WARNING: Very slow download speed detected!');
                console.log('   This could indicate:');
                console.log('   - Network connectivity issues');
                console.log('   - Server-side rate limiting');
                console.log('   - DNS resolution problems');
                console.log('   - Firewall/proxy interference');
            }
            
        } catch (error) {
            console.error(`❌ Test ${i + 1} failed:`, error.message);
        }
        
        // Wait between tests
        if (i < testUrls.length - 1) {
            console.log('\n⏳ Waiting 2 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n🏁 All tests completed!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(console.error);
}

export { testDownloadSpeed };
