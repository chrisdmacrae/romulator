import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

/**
 * Native curl downloader - uses actual curl binary for maximum speed
 * This bypasses all Node.js HTTP limitations
 */
export class NativeCurlDownloader {
    constructor(options = {}) {
        this.downloadDir = options.downloadDir || './downloads';
        this.progressCallback = options.progressCallback;
        this.activeDownloads = new Map();
        this.cancelledDownloads = new Set();
    }

    async init() {
        await fs.ensureDir(this.downloadDir);
        console.log(`📁 Download directory ready: ${this.downloadDir}`);
        
        // Check if curl is available
        try {
            await this.checkCurlAvailable();
            console.log('✅ curl binary found and ready');
        } catch (error) {
            throw new Error('curl binary not found. Please install curl.');
        }
    }

    // Check if curl is available
    checkCurlAvailable() {
        return new Promise((resolve, reject) => {
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
    }

    // Main download method using native curl
    async downloadRom(rom) {
        console.log(`🚀 Starting native curl download: ${rom.name}`);

        if (!rom.downloadUrl) {
            throw new Error(`Cannot download ROM without downloadUrl: ${rom.name}`);
        }

        const filename = rom.name;
        const filepath = path.join(this.downloadDir, filename);
        
        console.log(`📍 URL: ${rom.downloadUrl}`);
        console.log(`📁 File: ${filepath}`);

        return this.nativeCurlDownload(rom.downloadUrl, filepath, rom.name);
    }

    // Native curl download implementation
    nativeCurlDownload(url, filepath, romName) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let downloadedBytes = 0;
            let totalBytes = 0;
            let lastProgressTime = startTime;
            let lastProgressBytes = 0;

            // Curl arguments for maximum speed and compatibility
            const curlArgs = [
                url,                           // URL to download
                '-o', filepath,                // Output file
                '-L',                          // Follow redirects
                '-C', '-',                     // Resume partial downloads
                '--max-redirs', '10',          // Max redirects
                '--connect-timeout', '30',     // Connection timeout
                '--max-time', '3600',          // Max total time (1 hour)
                '--retry', '3',                // Retry on failure
                '--retry-delay', '1',          // Delay between retries
                '--user-agent', 'curl/8.0.0', // User agent
                '--compressed',                // Accept compression
                '--location-trusted',          // Trust redirects
                '--fail',                      // Fail on HTTP errors
                '--show-error',                // Show errors
                '--silent',                    // Silent mode (no progress bar)
                '--write-out', '%{size_download}\\n%{speed_download}\\n%{time_total}\\n' // Output stats
            ];

            console.log(`🌐 Executing: curl ${curlArgs.join(' ')}`);

            // Spawn curl process
            const curl = spawn('curl', curlArgs);

            // Track this download for cancellation
            this.activeDownloads.set(romName, {
                process: curl,
                filepath: filepath,
                startTime: startTime
            });

            let outputBuffer = '';

            // Handle curl output (stats)
            curl.stdout.on('data', (data) => {
                outputBuffer += data.toString();
            });

            // Handle curl errors
            curl.stderr.on('data', (data) => {
                const errorText = data.toString();
                console.log(`📊 curl progress: ${errorText.trim()}`);
            });

            // Handle curl completion
            curl.on('close', (code) => {
                this.activeDownloads.delete(romName);

                if (this.isDownloadCancelled(romName)) {
                    // Clean up partial file
                    fs.unlink(filepath).catch(() => {});
                    return reject(new Error(`Download cancelled: ${romName}`));
                }

                if (code !== 0) {
                    // Clean up partial file on error
                    fs.unlink(filepath).catch(() => {});
                    return reject(new Error(`curl failed with exit code ${code}`));
                }

                // Parse curl output stats
                const lines = outputBuffer.trim().split('\n');
                const sizeDownloaded = parseInt(lines[0]) || 0;
                const speedDownload = parseFloat(lines[1]) || 0;
                const timeTotal = parseFloat(lines[2]) || 0;

                const speedMBps = speedDownload / (1024 * 1024);

                console.log(`✅ Download complete: ${(sizeDownloaded / 1024 / 1024).toFixed(2)} MB in ${timeTotal.toFixed(2)}s`);
                console.log(`🚀 Average speed: ${speedMBps.toFixed(2)} MB/s`);

                // Final progress callback
                if (this.progressCallback) {
                    this.progressCallback({
                        type: 'fileProgress',
                        romName: romName,
                        filename: romName,
                        progress: 100,
                        downloadedBytes: sizeDownloaded,
                        totalBytes: sizeDownloaded,
                        status: 'complete',
                        currentSpeed: speedDownload,
                        averageSpeed: speedDownload,
                        overallAverageSpeed: speedDownload
                    });
                }

                resolve(filepath);
            });

            // Handle curl process errors
            curl.on('error', (error) => {
                this.activeDownloads.delete(romName);
                fs.unlink(filepath).catch(() => {});
                reject(new Error(`curl process error: ${error.message}`));
            });

            // Monitor file size for progress (optional)
            if (this.progressCallback) {
                const progressInterval = setInterval(async () => {
                    if (this.isDownloadCancelled(romName)) {
                        clearInterval(progressInterval);
                        return;
                    }

                    try {
                        const stats = await fs.stat(filepath);
                        const currentBytes = stats.size;
                        const now = Date.now();
                        const timeDiff = (now - lastProgressTime) / 1000;

                        if (timeDiff >= 2 && currentBytes > lastProgressBytes) {
                            const bytesDiff = currentBytes - lastProgressBytes;
                            const currentSpeed = bytesDiff / timeDiff;
                            const overallSpeed = currentBytes / ((now - startTime) / 1000);

                            console.log(`📊 Progress: ${(currentBytes / 1024 / 1024).toFixed(1)} MB | Speed: ${(currentSpeed / 1024 / 1024).toFixed(2)} MB/s`);

                            this.progressCallback({
                                type: 'fileProgress',
                                romName: romName,
                                filename: romName,
                                progress: 50, // Unknown total, show indeterminate
                                downloadedBytes: currentBytes,
                                totalBytes: null,
                                status: 'downloading',
                                currentSpeed: currentSpeed,
                                averageSpeed: overallSpeed,
                                overallAverageSpeed: overallSpeed
                            });

                            lastProgressTime = now;
                            lastProgressBytes = currentBytes;
                        }
                    } catch (error) {
                        // File doesn't exist yet or other error, ignore
                    }
                }, 2000);

                // Clean up interval when download completes
                curl.on('close', () => {
                    clearInterval(progressInterval);
                });
            }
        });
    }

    // Cancel a specific download
    cancelDownload(romName) {
        console.log(`🚫 Cancelling download: ${romName}`);
        this.cancelledDownloads.add(romName);

        const downloadInfo = this.activeDownloads.get(romName);
        if (downloadInfo) {
            if (downloadInfo.process) {
                downloadInfo.process.kill('SIGTERM');
            }
            
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
