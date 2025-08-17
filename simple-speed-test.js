#!/usr/bin/env node

/**
 * Simple Download Speed Test
 * Tests basic HTTP download without any optimization to find the bottleneck
 */

import https from 'https';
import http from 'http';
import fs from 'fs';

function formatSpeed(bytesPerSecond) {
    const mbps = bytesPerSecond / (1024 * 1024);
    if (mbps >= 1) {
        return `${mbps.toFixed(2)} MB/s`;
    } else {
        const kbps = bytesPerSecond / 1024;
        return `${kbps.toFixed(1)} KB/s`;
    }
}

function testBasicDownload(url, testName = 'Basic Download Test') {
    return new Promise((resolve, reject) => {
        console.log(`\n🚀 ${testName}`);
        console.log(`📍 URL: ${url}`);
        
        const startTime = Date.now();
        let downloadedBytes = 0;
        let lastTime = startTime;
        let lastBytes = 0;
        
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        // Minimal request options
        const request = protocol.get(url, (response) => {
            console.log(`📊 Status: ${response.statusCode}`);
            console.log(`📊 Headers:`, response.headers);

            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                console.log(`🔄 Following redirect to: ${response.headers.location}`);
                return testBasicDownload(response.headers.location, testName).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            }
            
            const totalBytes = parseInt(response.headers['content-length']) || null;
            console.log(`📊 Content-Length: ${totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
            
            // Don't write to file, just measure speed
            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;
                
                // Update every second
                if (timeDiff >= 1.0) {
                    const bytesDiff = downloadedBytes - lastBytes;
                    const currentSpeed = bytesDiff / timeDiff;
                    const overallSpeed = downloadedBytes / ((now - startTime) / 1000);
                    
                    const progress = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : 'N/A';
                    
                    console.log(`📊 ${progress}% | Current: ${formatSpeed(currentSpeed)} | Average: ${formatSpeed(overallSpeed)} | Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
                    
                    lastTime = now;
                    lastBytes = downloadedBytes;
                }
            });
            
            response.on('end', () => {
                const endTime = Date.now();
                const totalTime = (endTime - startTime) / 1000;
                const averageSpeed = downloadedBytes / totalTime;
                
                console.log(`\n✅ ${testName} Complete!`);
                console.log(`📊 Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
                console.log(`⏱️  Time: ${totalTime.toFixed(2)} seconds`);
                console.log(`🚀 Speed: ${formatSpeed(averageSpeed)}`);
                
                resolve({
                    bytes: downloadedBytes,
                    time: totalTime,
                    speed: averageSpeed
                });
            });
            
            response.on('error', reject);
        });
        
        request.on('error', (error) => {
            console.error(`❌ Request error:`, error);
            reject(error);
        });
        
        request.setTimeout(60000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

async function runSpeedTests() {
    console.log('🔧 Simple Download Speed Test');
    console.log('==============================');
    
    const tests = [
        // Test with a known fast server (10MB)
        { url: 'https://speed.hetzner.de/10MB.bin', name: 'Fast Server Test (10MB)' },

        // Test with myrient (will follow redirect)
        { url: 'https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation%20Portable/Ape%20Escape%20-%20On%20the%20Loose%20(USA).7z', name: 'Myrient Server Test' },
    ];
    
    for (const test of tests) {
        try {
            const result = await testBasicDownload(test.url, test.name);
            
            if (result.speed < 100 * 1024) { // Less than 100 KB/s
                console.log('⚠️  WARNING: Very slow download speed!');
                console.log('   Possible causes:');
                console.log('   - Network throttling');
                console.log('   - Server rate limiting');
                console.log('   - DNS issues');
                console.log('   - Container network limits');
            }
            
        } catch (error) {
            console.error(`❌ ${test.name} failed:`, error.message);
        }
        
        console.log('\n⏳ Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('🏁 Speed tests completed!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runSpeedTests().catch(console.error);
}

export { testBasicDownload };
