#!/usr/bin/env node

import { spawn } from 'child_process';

/**
 * Test script to verify curl HEAD request functionality for file size detection
 */

// Test URLs - you can modify these to test with actual ROM download URLs
const testUrls = [
    'https://httpbin.org/bytes/1024',  // 1KB test file
    'https://httpbin.org/bytes/1048576',  // 1MB test file
    'https://www.google.com',  // Should have content-length
];

async function getFileSizeWithCurl(url) {
    return new Promise((resolve, reject) => {
        console.log(`🔍 Getting file size for: ${url}`);
        
        const curlArgs = [
            url,
            '-I',                          // HEAD request only
            '-L',                          // Follow redirects
            '--max-redirs', '10',          // Max redirects
            '--connect-timeout', '10',     // Connection timeout
            '--max-time', '30',            // Max total time
            '--user-agent', 'curl/8.0.0', // User agent
            '--fail',                      // Fail on HTTP errors
            '--silent',                    // Silent mode
            '--show-error',                // Show errors
            '--write-out', '%{size_download}\\n%{content_type}\\n%{response_code}\\n' // Output stats
        ];

        console.log(`🌐 Executing HEAD request: curl ${curlArgs.join(' ')}`);

        const curl = spawn('curl', curlArgs);
        let outputBuffer = '';
        let errorBuffer = '';

        curl.stdout.on('data', (data) => {
            outputBuffer += data.toString();
        });

        curl.stderr.on('data', (data) => {
            errorBuffer += data.toString();
        });

        curl.on('close', (code) => {
            if (code !== 0) {
                console.log(`⚠️ HEAD request failed (code ${code})`);
                console.log(`⚠️ Error: ${errorBuffer.trim()}`);
                return resolve(0);
            }

            console.log(`📋 Raw curl output:`);
            console.log(outputBuffer);

            // Parse the headers from the output
            const lines = outputBuffer.split('\n');
            let contentLength = 0;
            
            for (const line of lines) {
                const lowerLine = line.toLowerCase();
                if (lowerLine.startsWith('content-length:')) {
                    const match = line.match(/content-length:\s*(\d+)/i);
                    if (match) {
                        contentLength = parseInt(match[1]);
                        break;
                    }
                }
            }

            if (contentLength > 0) {
                console.log(`📊 File size detected: ${(contentLength / 1024 / 1024).toFixed(2)} MB (${contentLength} bytes)`);
            } else {
                console.log(`⚠️ No Content-Length header found in HEAD response`);
            }

            resolve(contentLength);
        });

        curl.on('error', (error) => {
            console.log(`⚠️ HEAD request error:`, error.message);
            resolve(0);
        });
    });
}

async function testCurlHeadRequests() {
    console.log('🧪 Testing curl HEAD request functionality for file size detection\n');
    
    // First check if curl is available
    try {
        await new Promise((resolve, reject) => {
            const curl = spawn('curl', ['--version']);
            curl.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error('curl not available'));
                }
            });
            curl.on('error', reject);
        });
        console.log('✅ curl binary found and ready\n');
    } catch (error) {
        console.log('❌ curl binary not found. Please install curl.');
        return;
    }
    
    for (const url of testUrls) {
        console.log(`\n🌐 Testing URL: ${url}`);
        console.log('='.repeat(60));
        
        try {
            const startTime = Date.now();
            const fileSize = await getFileSizeWithCurl(url);
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
    
    console.log('🏁 curl HEAD request tests completed');
}

// Run the tests
testCurlHeadRequests().catch(console.error);
