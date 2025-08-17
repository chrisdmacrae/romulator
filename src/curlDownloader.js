import fs from 'fs-extra';
import path from 'path';
import https from 'https';
import http from 'http';

/**
 * Curl-inspired ROM downloader
 * Optimized for maximum speed with minimal overhead
 */
export class CurlDownloader {
    constructor(options = {}) {
        this.downloadDir = options.downloadDir || './downloads';
        this.progressCallback = options.progressCallback;
        this.activeDownloads = new Map();
        this.cancelledDownloads = new Set();
    }

    async init() {
        await fs.ensureDir(this.downloadDir);
        console.log(`📁 Download directory ready: ${this.downloadDir}`);
    }

    // Main download method
    async downloadRom(rom) {
        console.log(`🔄 Starting curl-style download: ${rom.name}`);

        if (!rom.downloadUrl) {
            throw new Error(`Cannot download ROM without downloadUrl: ${rom.name}`);
        }

        const filename = rom.name;
        const filepath = path.join(this.downloadDir, filename);
        
        console.log(`📍 URL: ${rom.downloadUrl}`);
        console.log(`📁 File: ${filepath}`);

        return this.curlStyleDownload(rom.downloadUrl, filepath, rom.name);
    }

    // Get file size using HEAD request first
    async getFileSize(url) {
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
                        console.log(`⚠️ HEAD request failed, will try GET without size info`);
                        return resolve(0);
                    }

                    const contentLength = parseInt(response.headers['content-length']) || 0;
                    if (contentLength > 0) {
                        console.log(`📊 File size: ${(contentLength / 1024 / 1024).toFixed(2)} MB`);
                    } else {
                        console.log(`⚠️ No Content-Length header found`);
                    }

                    response.destroy();
                    resolve(contentLength);
                });

                request.on('error', (error) => {
                    console.log(`⚠️ HEAD request error, will try GET without size info:`, error.message);
                    resolve(0);
                });

                request.on('timeout', () => {
                    console.log(`⚠️ HEAD request timeout, will try GET without size info`);
                    request.destroy();
                    resolve(0);
                });

                request.end();
            };

            performHeadRequest(url);
        });
    }

    // Curl-inspired download implementation
    curlStyleDownload(url, filepath, romName) {
        return new Promise(async (resolve, reject) => {
            const startTime = process.hrtime.bigint();
            let downloadedBytes = 0;
            let totalBytes = 0;

            try {
                // First, try to get file size with HEAD request
                totalBytes = await this.getFileSize(url);
                if (totalBytes > 0) {
                    console.log(`✅ Pre-download file size detected: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
                }
            } catch (error) {
                console.log(`⚠️ Could not get file size, proceeding with download:`, error.message);
            }

            // Follow redirects like curl does
            const performRequest = (requestUrl, redirectCount = 0) => {
                if (redirectCount > 10) {
                    return reject(new Error('Too many redirects'));
                }

                const urlObj = new URL(requestUrl);
                const protocol = urlObj.protocol === 'https:' ? https : http;

                // Curl-style request options - minimal and fast
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'curl/8.0.0', // Mimic curl user agent
                        'Accept': '*/*',
                        'Accept-Encoding': 'identity', // No compression for speed
                        'Connection': 'close' // Simple connection handling
                    },
                    timeout: 30000
                };

                console.log(`🌐 Connecting to ${urlObj.hostname}:${urlObj.port || (protocol === https ? 443 : 80)}`);

                const request = protocol.request(options, (response) => {
                    console.log(`📡 HTTP ${response.statusCode} ${response.statusMessage}`);

                    // Handle redirects like curl
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        console.log(`🔄 Redirect to: ${response.headers.location}`);
                        response.destroy();
                        return performRequest(response.headers.location, redirectCount + 1);
                    }

                    if (response.statusCode !== 200) {
                        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    }

                    // Use pre-fetched size or fall back to Content-Length header
                    const responseContentLength = parseInt(response.headers['content-length']) || 0;
                    if (totalBytes === 0 && responseContentLength > 0) {
                        totalBytes = responseContentLength;
                        console.log(`📊 Content-Length from GET response: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
                    } else if (totalBytes > 0) {
                        console.log(`📊 Using pre-fetched file size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
                    }

                    // Create file descriptor directly (like curl's file handling)
                    const fileHandle = fs.createWriteStream(filepath, {
                        flags: 'w',
                        highWaterMark: 64 * 1024 // 64KB buffer like curl
                    });

                    // Track download for cancellation
                    this.activeDownloads.set(romName, {
                        request: request,
                        response: response,
                        fileHandle: fileHandle,
                        filepath: filepath
                    });

                    // Pure data transfer - no processing overhead
                    response.on('data', (chunk) => {
                        // Check cancellation with minimal overhead
                        if (this.isDownloadCancelled(romName)) {
                            response.destroy();
                            fileHandle.destroy();
                            return;
                        }
                        
                        downloadedBytes += chunk.length;
                        fileHandle.write(chunk);
                    });

                    response.on('end', () => {
                        fileHandle.end();
                        
                        // Calculate final statistics
                        const endTime = process.hrtime.bigint();
                        const durationNs = endTime - startTime;
                        const durationSeconds = Number(durationNs) / 1e9;
                        const speedBps = downloadedBytes / durationSeconds;
                        const speedMBps = speedBps / (1024 * 1024);

                        console.log(`✅ Download complete: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB in ${durationSeconds.toFixed(2)}s`);
                        console.log(`🚀 Average speed: ${speedMBps.toFixed(2)} MB/s`);

                        // Clean up tracking
                        this.activeDownloads.delete(romName);

                        // Final progress callback
                        if (this.progressCallback) {
                            this.progressCallback({
                                type: 'fileProgress',
                                romName: romName,
                                filename: romName,
                                progress: 100,
                                downloadedBytes: downloadedBytes,
                                totalBytes: downloadedBytes,
                                status: 'complete',
                                currentSpeed: speedBps,
                                averageSpeed: speedBps,
                                overallAverageSpeed: speedBps
                            });
                        }

                        resolve(filepath);
                    });

                    response.on('error', (error) => {
                        fileHandle.destroy();
                        fs.unlink(filepath).catch(() => {});
                        this.activeDownloads.delete(romName);
                        reject(error);
                    });

                    fileHandle.on('error', (error) => {
                        response.destroy();
                        this.activeDownloads.delete(romName);
                        reject(error);
                    });
                });

                request.on('error', (error) => {
                    this.activeDownloads.delete(romName);
                    reject(error);
                });

                request.on('timeout', () => {
                    request.destroy();
                    this.activeDownloads.delete(romName);
                    reject(new Error('Request timeout'));
                });

                request.end();
            };

            // Start the request
            performRequest(url);
        });
    }

    // Cancel a specific download
    cancelDownload(romName) {
        console.log(`🚫 Cancelling download: ${romName}`);
        this.cancelledDownloads.add(romName);

        const downloadInfo = this.activeDownloads.get(romName);
        if (downloadInfo) {
            if (downloadInfo.request) downloadInfo.request.destroy();
            if (downloadInfo.response) downloadInfo.response.destroy();
            if (downloadInfo.fileHandle) downloadInfo.fileHandle.destroy();
            
            // Clean up partial file
            if (downloadInfo.filepath) {
                fs.unlink(downloadInfo.filepath).catch(() => {});
            }
            
            this.activeDownloads.delete(romName);
        }
    }

    // Check if a download is cancelled
    isDownloadCancelled(romName) {
        return this.cancelledDownloads.has(romName);
    }

    // Clear cancelled status (for retries)
    clearCancelledStatus(romName) {
        this.cancelledDownloads.delete(romName);
    }

    async close() {
        // Cancel all active downloads
        for (const romName of this.activeDownloads.keys()) {
            this.cancelDownload(romName);
        }
    }
}
