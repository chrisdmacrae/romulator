import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import yauzl from 'yauzl';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '../config');
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
                        move: './organized/n64',
                        rename: '{name}.z64'
                    },
                    {
                        name: 'psx',
                        extract: true,
                        move: './organized/psx',
                        rename: '{name}.bin'
                    },
                    {
                        name: 'gba',
                        extract: true,
                        move: './organized/gba',
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
            yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    reject(err);
                    return;
                }

                const extractedFiles = [];

                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    if (/\/$/.test(entry.fileName)) {
                        // Directory entry
                        zipfile.readEntry();
                    } else {
                        // File entry
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            const filePath = path.join(extractPath, entry.fileName);
                            fs.ensureDir(path.dirname(filePath)).then(() => {
                                const writeStream = fs.createWriteStream(filePath);
                                readStream.pipe(writeStream);
                                
                                writeStream.on('close', () => {
                                    extractedFiles.push(filePath);
                                    zipfile.readEntry();
                                });
                            });
                        });
                    }
                });

                zipfile.on('end', () => {
                    resolve(extractedFiles);
                });

                zipfile.on('error', (err) => {
                    reject(err);
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

        try {
            let filesToProcess = [romFilePath];

            // Step 1: Extract if needed
            if (ruleset.extract && path.extname(romFilePath).toLowerCase() === '.zip') {
                console.log(`📦 Extracting ${romName}...`);
                const extractPath = path.join(romDir, 'extracted', path.parse(romName).name);
                await fs.ensureDir(extractPath);
                
                const extractedFiles = await this.extractArchive(romFilePath, extractPath);
                results.extractedFiles = extractedFiles;
                filesToProcess = extractedFiles;
                
                console.log(`✅ Extracted ${extractedFiles.length} files`);
            }

            // Step 2: Move and rename files
            if (ruleset.move) {
                const moveDir = path.resolve(ruleset.move);
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

            return results;

        } catch (error) {
            results.errors.push(error.message);
            console.error(`❌ Error applying ruleset '${rulesetName}':`, error);
            throw error;
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
