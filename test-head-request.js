#!/usr/bin/env node

import https from 'https';
import http from 'http';

/**
 * Test script to verify HEAD request functionality for file size detection
 */

// Test URLs - you can modify these to test with actual ROM download URLs
const testUrls = [
    'https://httpbin.org/bytes/1024',  // 1KB test file
    'https://httpbin.org/bytes/1048576',  // 1MB test file
    'https://www.google.com',  // Should have content-length
];

async function getFileSize(url) {
    return new Promise((resolve, reject) => {
        const performHeadRequest = (requestUrl, redirectCount = 0) => {
            if (redirectCount > 10) {
                return reject(new Error('Too many redirects'));
            }

            const urlObj = new URL(requestUrl);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: 'HEAD',
                headers: {
                    'User-Agent': 'curl/8.0.0',
                    'Accept': '*/*',
                    'Connection': 'close'
                },
                timeout: 10000
            };

            console.log(`🔍 Getting file size from ${urlObj.hostname}:${urlObj.port || (protocol === https ? 443 : 80)}`);

            const request = protocol.request(options, (response) => {
                console.log(`📡 HEAD ${response.statusCode} ${response.statusMessage}`);
                
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    console.log(`🔄 HEAD redirect to: ${response.headers.location}`);
                    response.destroy();
                    return performHeadRequest(response.headers.location, redirectCount + 1);
                }

                if (response.statusCode !== 200) {
                    console.log(`⚠️ HEAD request failed, status: ${response.statusCode}`);
                    return resolve(0);
                }

                const contentLength = parseInt(response.headers['content-length']) || 0;
                if (contentLength > 0) {
                    console.log(`📊 File size: ${(contentLength / 1024 / 1024).toFixed(2)} MB (${contentLength} bytes)`);
                } else {
                    console.log(`⚠️ No Content-Length header found`);
                }
                
                // Log all headers for debugging
                console.log(`📋 Response headers:`, response.headers);
                
                response.destroy();
                resolve(contentLength);
            });

            request.on('error', (error) => {
                console.log(`⚠️ HEAD request error:`, error.message);
                resolve(0);
            });

            request.on('timeout', () => {
                console.log(`⚠️ HEAD request timeout`);
                request.destroy();
                resolve(0);
            });

            request.end();
        };

        performHeadRequest(url);
    });
}

async function testHeadRequests() {
    console.log('🧪 Testing HEAD request functionality for file size detection\n');
    
    for (const url of testUrls) {
        console.log(`\n🌐 Testing URL: ${url}`);
        console.log('='.repeat(60));
        
        try {
            const startTime = Date.now();
            const fileSize = await getFileSize(url);
            const duration = Date.now() - startTime;
            
            if (fileSize > 0) {
                console.log(`✅ Success: File size detected in ${duration}ms`);
            } else {
                console.log(`⚠️ No file size detected (${duration}ms)`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        console.log(''); // Empty line for spacing
    }
    
    console.log('🏁 HEAD request tests completed');
}

// Run the tests
testHeadRequests().catch(console.error);
