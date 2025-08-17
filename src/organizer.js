import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import yauzl from 'yauzl';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../config');
const ORGANIZED_DIR = process.env.ORGANIZED_DIR || path.join(__dirname, '../organized');
const RULESETS_FILE = path.join(CONFIG_DIR, 'rulesets.yaml');

export class RomOrganizer {
    constructor() {
        this.ensureConfigDir();
    }

    async ensureConfigDir() {
        await fs.ensureDir(CONFIG_DIR);
        
        // Create default rulesets file if it doesn't exist
        if (!await fs.pathExists(RULESETS_FILE)) {
            const defaultRulesets = {
                rulesets: [
                    {
                        name: 'n64',
                        extract: true,
                        move: './n64',
                        rename: '{name}.z64'
                    },
                    {
                        name: 'psx',
                        extract: true,
                        move: './psx',
                        rename: '{name}.bin'
                    },
                    {
                        name: 'gba',
                        extract: true,
                        move: './gba',
                        rename: '{name}.gba'
                    }
                ]
            };
            await this.saveRulesets(defaultRulesets);
        }
    }

    async loadRulesets() {
        try {
            const content = await fs.readFile(RULESETS_FILE, 'utf8');
            return yaml.load(content);
        } catch (error) {
            console.error('Error loading rulesets:', error);
            return { rulesets: [] };
        }
    }

    async saveRulesets(rulesets) {
        try {
            const yamlContent = yaml.dump(rulesets, { 
                indent: 2,
                lineWidth: -1 
            });
            await fs.writeFile(RULESETS_FILE, yamlContent, 'utf8');
            return true;
        } catch (error) {
            console.error('Error saving rulesets:', error);
            return false;
        }
    }

    async getRulesets() {
        const config = await this.loadRulesets();
        return config.rulesets || [];
    }

    async getRuleset(name) {
        const rulesets = await this.getRulesets();
        return rulesets.find(ruleset => ruleset.name === name);
    }

    async addRuleset(ruleset) {
        const config = await this.loadRulesets();
        
        // Check if ruleset with same name already exists
        const existingIndex = config.rulesets.findIndex(r => r.name === ruleset.name);
        if (existingIndex !== -1) {
            throw new Error(`Ruleset with name '${ruleset.name}' already exists`);
        }

        config.rulesets.push(ruleset);
        return await this.saveRulesets(config);
    }

    async updateRuleset(name, updatedRuleset) {
        const config = await this.loadRulesets();
        const index = config.rulesets.findIndex(r => r.name === name);
        
        if (index === -1) {
            throw new Error(`Ruleset '${name}' not found`);
        }

        config.rulesets[index] = { ...updatedRuleset, name: updatedRuleset.name || name };
        return await this.saveRulesets(config);
    }

    async deleteRuleset(name) {
        const config = await this.loadRulesets();
        const index = config.rulesets.findIndex(r => r.name === name);
        
        if (index === -1) {
            throw new Error(`Ruleset '${name}' not found`);
        }

        config.rulesets.splice(index, 1);
        return await this.saveRulesets(config);
    }

    async extractArchive(archivePath, extractPath) {
        return new Promise((resolve, reject) => {
            // First, check if the file exists and has a reasonable size
            fs.stat(archivePath, (statErr, stats) => {
                if (statErr) {
                    reject(new Error(`Archive file not found: ${archivePath}`));
                    return;
                }

                if (stats.size === 0) {
                    reject(new Error(`Archive file is empty: ${archivePath}`));
                    return;
                }

                console.log(`📊 Archive size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

                yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
                    if (err) {
                        // Handle specific ZIP corruption errors
                        if (err.code === 'Z_DATA_ERROR' || err.message.includes('invalid stored block lengths')) {
                            reject(new Error(`Corrupted ZIP file: ${path.basename(archivePath)}. The download may have been incomplete or the file is damaged.`));
                        } else {
                            reject(new Error(`Failed to open ZIP file: ${err.message}`));
                        }
                        return;
                    }

                    const extractedFiles = [];
                    let hasError = false;

                    zipfile.readEntry();
                    zipfile.on('entry', (entry) => {
                        if (hasError) return;

                        if (/\/$/.test(entry.fileName)) {
                            // Directory entry
                            zipfile.readEntry();
                        } else {
                            // File entry
                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) {
                                    hasError = true;
                                    if (err.code === 'Z_DATA_ERROR') {
                                        reject(new Error(`Corrupted data in ZIP file: ${path.basename(archivePath)}`));
                                    } else {
                                        reject(err);
                                    }
                                    return;
                                }

                                const filePath = path.join(extractPath, entry.fileName);
                                fs.ensureDir(path.dirname(filePath)).then(() => {
                                    const writeStream = fs.createWriteStream(filePath);

                                    // Handle stream errors
                                    readStream.on('error', (streamErr) => {
                                        hasError = true;
                                        writeStream.destroy();
                                        if (streamErr.code === 'Z_DATA_ERROR') {
                                            reject(new Error(`Corrupted data while extracting: ${entry.fileName}`));
                                        } else {
                                            reject(streamErr);
                                        }
                                    });

                                    writeStream.on('error', (writeErr) => {
                                        hasError = true;
                                        readStream.destroy();
                                        reject(writeErr);
                                    });

                                    readStream.pipe(writeStream);

                                    writeStream.on('close', () => {
                                        if (!hasError) {
                                            extractedFiles.push(filePath);
                                            zipfile.readEntry();
                                        }
                                    });
                                }).catch(reject);
                            });
                        }
                    });

                    zipfile.on('end', () => {
                        if (!hasError) {
                            resolve(extractedFiles);
                        }
                    });

                    zipfile.on('error', (err) => {
                        hasError = true;
                        if (err.code === 'Z_DATA_ERROR' || err.message.includes('invalid stored block lengths')) {
                            reject(new Error(`ZIP file corruption detected: ${path.basename(archivePath)}. Please re-download the file.`));
                        } else {
                            reject(err);
                        }
                    });
                });
            });
        });
    }

    formatFileName(template, romName) {
        // Remove file extension from ROM name for template replacement
        const nameWithoutExt = path.parse(romName).name;
        
        // Replace template variables
        return template.replace(/{name}/g, nameWithoutExt);
    }

    async applyRuleset(rulesetName, romFilePath) {
        const ruleset = await this.getRuleset(rulesetName);
        if (!ruleset) {
            throw new Error(`Ruleset '${rulesetName}' not found`);
        }

        const romName = path.basename(romFilePath);
        const romDir = path.dirname(romFilePath);
        const results = {
            ruleset: rulesetName,
            originalFile: romFilePath,
            extractedFiles: [],
            movedFiles: [],
            errors: []
        };

        let extractPath = null;
        let rulesetSuccessful = false;

        try {
            let filesToProcess = [romFilePath];

            // Step 1: Extract if needed
            if (ruleset.extract && path.extname(romFilePath).toLowerCase() === '.zip') {
                console.log(`📦 Extracting ${romName}...`);
                extractPath = path.join(romDir, 'extracted', path.parse(romName).name);
                await fs.ensureDir(extractPath);

                const extractedFiles = await this.extractArchive(romFilePath, extractPath);
                results.extractedFiles = extractedFiles;
                filesToProcess = extractedFiles;

                console.log(`✅ Extracted ${extractedFiles.length} files`);
            }

            // Step 2: Move and rename files
            if (ruleset.move) {
                const baseRomsDir = path.resolve(ORGANIZED_DIR);
                const moveDir = path.resolve(baseRomsDir, ruleset.move);
                await fs.ensureDir(moveDir);

                for (const filePath of filesToProcess) {
                    const fileName = path.basename(filePath);
                    let newFileName = fileName;

                    // Apply rename template if specified
                    if (ruleset.rename) {
                        const ext = path.extname(fileName);
                        const templateExt = path.extname(ruleset.rename);

                        // Use template extension if provided, otherwise keep original
                        const finalExt = templateExt || ext;
                        newFileName = this.formatFileName(ruleset.rename, fileName);

                        // Ensure the file has the correct extension
                        if (!newFileName.endsWith(finalExt)) {
                            newFileName += finalExt;
                        }
                    }

                    const newFilePath = path.join(moveDir, newFileName);

                    console.log(`📁 Moving ${fileName} to ${newFilePath}`);
                    await fs.move(filePath, newFilePath, { overwrite: true });
                    results.movedFiles.push(newFilePath);
                }

                console.log(`✅ Moved ${results.movedFiles.length} files to ${moveDir}`);
            }

            // Mark ruleset as successful
            rulesetSuccessful = true;

            // Cleanup: Remove original zip file if ruleset was successful
            if (rulesetSuccessful && path.extname(romFilePath).toLowerCase() === '.zip') {
                console.log(`🗑️ Removing original zip file: ${romName}`);
                await fs.remove(romFilePath);
                console.log(`✅ Removed original zip file: ${romName}`);
            }

            return results;

        } catch (error) {
            results.errors.push(error.message);
            console.error(`❌ Error applying ruleset '${rulesetName}':`, error);

            // Cleanup will happen in finally block
            throw error;
        } finally {
            // Always cleanup extracted contents (whether success or failure)
            if (extractPath && await fs.pathExists(extractPath)) {
                try {
                    console.log(`🗑️ Cleaning up extracted files from: ${extractPath}`);
                    await fs.remove(extractPath);
                    console.log(`✅ Cleaned up extracted files`);
                } catch (cleanupError) {
                    console.error(`❌ Failed to cleanup extracted files:`, cleanupError);
                }
            }
        }
    }

    async applyRulesetToMultiple(rulesetName, romFilePaths) {
        const results = [];
        
        for (const filePath of romFilePaths) {
            try {
                const result = await this.applyRuleset(rulesetName, filePath);
                results.push(result);
            } catch (error) {
                results.push({
                    ruleset: rulesetName,
                    originalFile: filePath,
                    extractedFiles: [],
                    movedFiles: [],
                    errors: [error.message]
                });
            }
        }

        return results;
    }
}
