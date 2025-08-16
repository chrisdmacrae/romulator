import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs-extra';
import { RomDownloader } from './romDownloader.js';
import { RomOrganizer } from './organizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Configure CORS origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ["http://localhost:3000", "http://localhost:3001"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Single shared room for all users
const SHARED_ROOM_ID = 'shared-room';
let sharedRoomData = {
  sessionId: SHARED_ROOM_ID,
  roms: [],
  currentRom: null,
  downloadHistory: [],
  ruleset: null,
  lastActivity: new Date().toISOString(),
  createdAt: new Date().toISOString()
};

// Function to compute room status dynamically
function computeRoomStatus(roomData) {
  if (!roomData.roms || roomData.roms.length === 0) {
    return 'idle';
  }

  const hasDownloading = roomData.roms.some(rom => rom.status === 'downloading');
  const hasAvailable = roomData.roms.some(rom => rom.status === 'available');
  const hasPending = roomData.roms.some(rom => rom.status === 'pending');

  if (hasDownloading) {
    return 'downloading';
  }

  if (hasAvailable || hasPending) {
    return 'ready';
  }

  // All ROMs are either success, failed, error, or needs-rescrape
  return 'complete';
}

// Function to get enhanced room data with computed status
function getEnhancedRoomData(roomData) {
  const status = computeRoomStatus(roomData);
  const totalRoms = roomData.roms.length;
  const completedRoms = roomData.roms.filter(rom => rom.status === 'success' || rom.status === 'complete').length;
  const failedRoms = roomData.roms.filter(rom =>
    rom.status === 'failed' ||
    rom.status === 'error' ||
    rom.status === 'needs-rescrape'
  ).length;

  return {
    ...roomData,
    status,
    totalRoms,
    completedRoms,
    failedRoms
  };
}

// Room-based download processor
class RoomDownloadProcessor {
  constructor() {
    this.isProcessing = false;
    this.currentDownload = null;
    this.downloader = null;
  }

  // Start processing downloads for the room
  async startProcessing(roomData) {
    if (this.isProcessing) {
      console.log(`⚠️ Download processing already in progress`);
      return;
    }

    const availableRoms = roomData.roms.filter(rom => rom.status === 'available');
    if (availableRoms.length === 0) {
      console.log(`⚠️ No available ROMs to download`);
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Starting download processing (${availableRoms.length} ROMs)`);

    try {
      // Initialize downloader if needed
      if (!this.downloader) {
        console.log(`🚀 Initializing downloader`);
        this.downloader = new RomDownloader({
          headless: true,
          timeout: 30000,
          progressCallback: (progressData) => {
            // Emit progress to the shared room
            console.log(`📊 Downloader emitting progress to shared room:`, progressData);
            io.to(SHARED_ROOM_ID).emit('fileProgress', progressData);
          }
        });

        await this.downloader.init();
      }

      // Process ROMs one by one
      for (const rom of availableRoms) {
        // Check if ROM is still available (might have been removed)
        const romIndex = roomData.roms.findIndex(r => r.name === rom.name);
        if (romIndex === -1 || roomData.roms[romIndex].status !== 'available') {
          console.log(`⚠️ ROM ${rom.name} no longer available - skipping`);
          continue;
        }

        this.currentDownload = rom;

        try {
          await this.processDownloadItem(rom, roomData);
        } catch (error) {
          console.error(`❌ Failed to process download item:`, error);
          await this.handleDownloadError(rom, error, roomData);
        }

        this.currentDownload = null;
      }

    } catch (error) {
      console.error(`❌ Error in download processing:`, error);
    } finally {
      this.isProcessing = false;
      console.log(`✅ Download processing completed`);
    }
  }

  // Process a single download item
  async processDownloadItem(rom, roomData) {
    const ruleset = roomData.ruleset;

    console.log(`⬇️ Processing download: ${rom.name}`);

    // Update room state
    roomData.currentRom = rom.name;
    roomData.lastActivity = new Date().toISOString();

    // Update ROM status in room
    const romIndex = roomData.roms.findIndex(r => r.name === rom.name);
    if (romIndex !== -1) {
      roomData.roms[romIndex].status = 'downloading';
    }

    // Emit room update to all connected clients
    let enhancedRoomData = getEnhancedRoomData(roomData);
    io.to(SHARED_ROOM_ID).emit('roomUpdate', {
      roomId: SHARED_ROOM_ID,
      ...enhancedRoomData
    });

    // Download the ROM
    const filepath = await this.downloader.downloadSingleRom(rom);
    console.log(`✅ Successfully downloaded: ${rom.name} to ${filepath}`);

    // Apply ruleset if specified
    let organizationResult = null;
    if (ruleset) {
      try {
        console.log(`📦 Applying ruleset "${ruleset}" to ${rom.name}`);
        organizationResult = await organizer.applyRuleset(ruleset, filepath);
        console.log(`✅ Successfully organized: ${rom.name}`);
        if (organizationResult.movedFiles.length > 0) {
          console.log(`📁 Files moved to: ${organizationResult.movedFiles.join(', ')}`);
        }
      } catch (orgError) {
        console.error(`❌ Error applying ruleset to ${rom.name}:`, orgError.message);
        organizationResult = {
          ruleset: ruleset,
          originalFile: filepath,
          extractedFiles: [],
          movedFiles: [],
          errors: [orgError.message]
        };
      }
    }

    // Update room data for success
    if (romIndex !== -1) {
      roomData.roms[romIndex].status = 'success';
    }
    roomData.downloadHistory = roomData.downloadHistory || [];
    roomData.downloadHistory.push({
      name: rom.name,
      status: 'success',
      completedAt: new Date().toISOString(),
      originalPath: filepath,
      organizationResult
    });

    // Clear current ROM and recalculate state
    roomData.currentRom = null;
    roomData.lastActivity = new Date().toISOString();
    recalculateQueueState(roomData);

    // Emit room update to all connected clients (status is computed automatically)
    enhancedRoomData = getEnhancedRoomData(roomData);
    io.to(SHARED_ROOM_ID).emit('roomUpdate', {
      roomId: SHARED_ROOM_ID,
      ...enhancedRoomData
    });

    // Save sessions
    saveSessions();
  }

  // Handle download errors
  async handleDownloadError(rom, error, roomData) {

    console.error(`❌ Download failed for ${rom.name}:`, error);

    // Update ROM status in room
    const romIndex = roomData.roms.findIndex(r => r.name === rom.name);
    if (romIndex !== -1) {
      // Check if this is a missing downloadUrl error
      if (error.message.includes('downloadUrl') || error.message.includes('re-scrape')) {
        roomData.roms[romIndex].status = 'needs-rescrape';
        console.log(`🔄 Marked ROM as needing re-scrape: ${rom.name}`);
      } else {
        roomData.roms[romIndex].status = 'failed';
      }
    }

    roomData.downloadHistory = roomData.downloadHistory || [];
    roomData.downloadHistory.push({
      name: rom.name,
      status: error.message.includes('downloadUrl') ? 'needs-rescrape' : 'failed',
      completedAt: new Date().toISOString(),
      error: error.message
    });

    // Clear current ROM and recalculate state
    roomData.currentRom = null;
    roomData.lastActivity = new Date().toISOString();
    recalculateQueueState(roomData);

    // Emit room update to all connected clients (status is computed automatically)
    const enhancedRoomDataError = getEnhancedRoomData(roomData);
    io.to(SHARED_ROOM_ID).emit('roomUpdate', {
      roomId: SHARED_ROOM_ID,
      ...enhancedRoomDataError
    });

    // Save sessions
    saveSessions();
  }

  // Clean shutdown
  async shutdown() {
    console.log(`🛑 Shutting down download processor`);
    this.isProcessing = false;
    this.currentDownload = null;

    if (this.downloader) {
      await this.downloader.close();
      this.downloader = null;
    }
  }
}

// Create download processor instance
const downloadProcessor = new RoomDownloadProcessor();

// Session persistence file
const SESSION_FILE = path.join(process.cwd(), 'data', 'shared-session.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(SESSION_FILE);
  if (!await fs.pathExists(dataDir)) {
    await fs.ensureDir(dataDir);
  }
}

// Load shared session from disk
async function loadSessions() {
  try {
    await ensureDataDir();
    if (await fs.pathExists(SESSION_FILE)) {
      const data = await fs.readJson(SESSION_FILE);
      console.log(`📂 Loading shared session from disk`);

      // Clean up old session data - remove lastSessionUrl
      if (data.lastSessionUrl) {
        delete data.lastSessionUrl;
        console.log(`🧹 Cleaned up lastSessionUrl from shared session`);
      }

      // Check for ROMs without downloadUrl (legacy sessions)
      if (data.roms && Array.isArray(data.roms)) {
        const romsWithoutUrl = data.roms.filter(rom => !rom.downloadUrl);
        if (romsWithoutUrl.length > 0) {
          console.log(`⚠️ Shared session has ${romsWithoutUrl.length} ROMs without downloadUrl`);
          // Mark these ROMs as needing re-scraping
          romsWithoutUrl.forEach(rom => {
            if (rom.status === 'available') {
              rom.status = 'needs-rescrape';
            }
          });
        }
      }

      // Merge loaded data with default structure
      sharedRoomData = { ...sharedRoomData, ...data };
      console.log(`📂 Loaded shared session successfully`);
    } else {
      console.log(`📂 No existing shared session file found`);
    }
  } catch (error) {
    console.error('❌ Error loading shared session:', error);
  }
}

// Save shared session to disk
async function saveSessions() {
  try {
    await ensureDataDir();
    await fs.writeJson(SESSION_FILE, sharedRoomData, { spaces: 2 });
    console.log(`💾 Saved shared session to disk`);
  } catch (error) {
    console.error('❌ Error saving shared session:', error);
  }
}

// Auto-save sessions every 30 seconds
setInterval(saveSessions, 30000);

// Clean up inactive sessions every hour
setInterval(cleanupInactiveSessions, 60 * 60 * 1000); // 1 hour

// Function to update last activity for the shared room
function updateLastActivity() {
  sharedRoomData.lastActivity = new Date().toISOString();
}

// Function to recalculate queue state based on current ROM statuses
function recalculateQueueState(roomData) {
  if (!roomData || !roomData.roms || !Array.isArray(roomData.roms)) {
    return;
  }

  const roms = roomData.roms;

  // Recalculate totals based on current ROM statuses
  roomData.totalRoms = roms.length;
  roomData.completedRoms = roms.filter(rom => rom.status === 'success' || rom.status === 'complete').length;
  roomData.failedRoms = roms.filter(rom =>
    rom.status === 'failed' ||
    rom.status === 'error' ||
    rom.status === 'needs-rescrape'
  ).length;

  // Calculate pending ROMs (available, downloading, pending)
  const pendingRoms = roms.filter(rom =>
    rom.status === 'available' ||
    rom.status === 'downloading' ||
    rom.status === 'pending'
  ).length;

  console.log(`📊 Recalculated queue state: ${roomData.totalRoms} total, ${roomData.completedRoms} completed, ${roomData.failedRoms} failed, ${pendingRoms} pending`);

  // Update last activity
  roomData.lastActivity = new Date().toISOString();
}

// Function to clean up inactive sessions
function cleanupInactiveSessions() {
  const now = new Date();
  const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
  let cleanedCount = 0;

  console.log(`🧹 Running periodic cleanup of inactive sessions...`);

  for (const [roomId, roomData] of userRooms.entries()) {
    if (roomData && roomData.lastActivity) {
      const lastActivity = new Date(roomData.lastActivity);
      const inactiveTime = now - lastActivity;

      if (inactiveTime > oneHour && roomData.status !== 'downloading') {
        console.log(`🧹 Cleaning up inactive session: ${roomId} (inactive for ${Math.round(inactiveTime / 1000 / 60)} minutes)`);

        // Clear the session data but keep the room
        roomData.status = 'idle';
        roomData.roms = [];
        roomData.currentRom = null;
        roomData.totalRoms = 0;
        roomData.completedRoms = 0;
        roomData.failedRoms = 0;
        roomData.downloadHistory = [];
        roomData.ruleset = null;
        roomData.lastActivity = now.toISOString();

        // Recalculate queue state after clearing (should result in all zeros)
        recalculateQueueState(roomData);

        cleanedCount++;
      }
    }
  }

  if (cleanedCount > 0) {
    console.log(`✅ Cleaned up ${cleanedCount} inactive sessions`);
    saveSessions();
  } else {
    console.log(`✅ No inactive sessions to clean up`);
  }
}

// Initialize organizer
const organizer = new RomOrganizer();

// Helper functions for shared room (simplified)
function getUserRoomId(req) {
  return SHARED_ROOM_ID;
}

function getOrCreateUserRoom(req) {
  return SHARED_ROOM_ID;
}

// API Routes
app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Use shared room
    const userRoomId = SHARED_ROOM_ID;
    const roomData = sharedRoomData;

    // Create a new downloader instance with progress callback
    const downloader = new RomDownloader({
      headless: true,
      timeout: 30000,
      progressCallback: (progressData) => {
        // Emit file download progress to the user's room
        console.log(`📊 Server emitting file progress to room ${userRoomId}:`, progressData);
        io.to(userRoomId).emit('fileProgress', progressData);

        // Also emit to download room for backwards compatibility
        const downloadRoom = `download-${userRoomId}`;
        io.to(downloadRoom).emit('fileProgress', progressData);
      }
    });

    await downloader.init();

    // Scrape the ROM list
    const roms = await downloader.scrapeRomList(url);

    // Update room metadata but don't add ROMs to queue yet
    // ROMs will be added to the queue only when user selects them for download
    roomData.sessionId = userRoomId;
    roomData.lastActivity = new Date().toISOString();

    console.log(`📋 Scraped ${roms.length} ROMs for selection (not added to queue yet)`);

    res.json({
      sessionId: userRoomId,
      roomId: userRoomId,
      roms,
      totalCount: roms.length
    });

  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/scrape-categories', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Create a temporary downloader instance for scraping categories
    const downloader = new RomDownloader({
      headless: true,
      timeout: 30000
    });

    await downloader.init();

    try {
      // Navigate to the archive page
      await downloader.page.goto(url, { waitUntil: 'networkidle' });

      // Wait for the table to load
      await downloader.page.waitForSelector('table', { timeout: 10000 });

      // Extract category information
      const categories = await downloader.page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        const categoryList = [];

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const nameCell = cells[0];
            const link = nameCell.querySelector('a');

            if (link && !link.textContent.includes('Parent directory')) {
              const name = link.textContent.trim();
              const href = link.href;

              // Only include directories (they end with /)
              if (name.endsWith('/')) {
                const cleanName = name.slice(0, -1); // Remove trailing slash
                categoryList.push({
                  name: cleanName,
                  url: href
                });
              }
            }
          }
        });

        return categoryList;
      });

      await downloader.close();

      console.log(`📁 Found ${categories.length} categories for ${url}`);

      res.json({
        categories: categories // Return ALL categories, no limit
      });

    } catch (scrapeError) {
      await downloader.close();
      throw scrapeError;
    }

  } catch (error) {
    console.error('Category scraping error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/download', async (req, res) => {
  try {
    console.log('📥 Download request received');
    const { sessionId, selectedRoms, ruleset } = req.body;
    console.log(`📋 Session ID: ${sessionId}`);
    console.log(`📦 Selected ROMs: ${selectedRoms?.length || 0}`);
    console.log(`📋 Ruleset: ${ruleset || 'None'}`);

    if (!sessionId || !selectedRoms || !Array.isArray(selectedRoms)) {
      console.log('❌ Invalid request parameters');
      return res.status(400).json({ error: 'Session ID and selected ROMs are required' });
    }

    // Get user room (should match the sessionId which is the userRoomId)
    const userRoomId = getUserRoomId(req);
    if (sessionId !== userRoomId) {
      return res.status(403).json({ error: 'Session does not match user' });
    }

    const roomData = sharedRoomData;

    // Update room data for download
    roomData.sessionId = sessionId;
    roomData.currentRom = null;
    roomData.startTime = roomData.startTime || new Date().toISOString(); // Keep original start time if exists
    roomData.lastActivity = new Date().toISOString();
    roomData.ruleset = ruleset || null; // Store the optional ruleset

    // Add new ROMs to existing queue (don't replace)
    const newRoms = selectedRoms.map(rom => ({
      name: rom.name,
      size: rom.size,
      downloadUrl: rom.downloadUrl, // Preserve downloadUrl
      status: 'available' // Mark as available for processing
    }));

    // Filter out ROMs that are already in the queue with active status (available, downloading, pending)
    // Allow re-adding ROMs that have completed, failed, or errored
    const activeRomNames = new Set(
      roomData.roms
        .filter(rom => ['available', 'downloading', 'pending'].includes(rom.status))
        .map(rom => rom.name)
    );
    const romsToAdd = newRoms.filter(rom => !activeRomNames.has(rom.name));

    if (romsToAdd.length > 0) {
      roomData.roms.push(...romsToAdd);
      console.log(`📋 Added ${romsToAdd.length} new ROMs to queue (${selectedRoms.length - romsToAdd.length} were already active in queue)`);
    } else {
      console.log(`⚠️ All ${selectedRoms.length} ROMs were already active in the queue`);
    }

    // Recalculate queue state
    recalculateQueueState(roomData);

    // Start download processing if there are new ROMs
    if (romsToAdd.length > 0) {
      console.log(`📋 Starting download processing for ${romsToAdd.length} new ROMs`);
      downloadProcessor.startProcessing(roomData);
    }

    // Response
    res.json({
      message: romsToAdd.length > 0 ? 'Download started' : 'ROMs already queued',
      totalRoms: selectedRoms.length,
      newRoms: romsToAdd.length,
      alreadyQueued: selectedRoms.length - romsToAdd.length
    });

    // Emit room update to show queued status
    const enhancedRoomDataDownload = getEnhancedRoomData(roomData);
    io.to(userRoomId).emit('roomUpdate', {
      roomId: userRoomId,
      ...enhancedRoomDataDownload
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retry failed ROM download
app.post('/api/rom/:romName/retry', async (req, res) => {
  try {
    const userRoomId = getOrCreateUserRoom(req);
    const roomData = sharedRoomData;

    const romName = decodeURIComponent(req.params.romName);
    console.log(`🔄 Retrying ROM download: ${romName}`);

    // Find the ROM
    const romIndex = roomData.roms.findIndex(rom => rom.name === romName);
    if (romIndex === -1) {
      return res.status(404).json({ error: 'ROM not found in queue' });
    }

    const rom = roomData.roms[romIndex];

    // Only allow retry for failed ROMs
    if (!['failed', 'error', 'needs-rescrape'].includes(rom.status)) {
      return res.status(400).json({ error: 'Can only retry failed downloads' });
    }

    // Reset ROM status to available for retry
    roomData.roms[romIndex].status = 'available';
    roomData.lastActivity = new Date().toISOString();

    // Recalculate queue state after status change
    recalculateQueueState(roomData);

    console.log(`✅ ROM marked for retry: ${romName}`);

    // Start processing to handle the retry
    downloadProcessor.startProcessing(roomData);

    // Emit room update
    const enhancedRoomDataRetry = getEnhancedRoomData(roomData);
    io.to(userRoomId).emit('roomUpdate', {
      roomId: userRoomId,
      ...enhancedRoomDataRetry
    });

    // Save sessions
    saveSessions();

    res.json({
      message: 'ROM retry started',
      romName: romName
    });

  } catch (error) {
    console.error('Error retrying ROM download:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove ROM from queue
app.delete('/api/rom/:romName', (req, res) => {
  try {
    const userRoomId = getOrCreateUserRoom(req);
    const roomData = sharedRoomData;

    const romName = decodeURIComponent(req.params.romName);
    console.log(`🗑️ Removing ROM from queue: ${romName}`);

    // Find and remove the ROM
    const romIndex = roomData.roms.findIndex(rom => rom.name === romName);
    if (romIndex === -1) {
      return res.status(404).json({ error: 'ROM not found in queue' });
    }

    const removedRom = roomData.roms[romIndex];

    // Don't allow removal if currently downloading
    if (removedRom.status === 'downloading') {
      return res.status(400).json({ error: 'Cannot remove ROM that is currently downloading' });
    }

    // No need to remove from global queue since we're using room-based processing

    // Remove the ROM from the room queue
    roomData.roms.splice(romIndex, 1);
    updateLastActivity(userRoomId);

    // Recalculate queue state after removing ROM
    recalculateQueueState(roomData);

    console.log(`✅ Removed ROM: ${romName}. Queue now has ${roomData.roms.length} ROMs`);

    // Emit room update
    const enhancedRoomDataRemove = getEnhancedRoomData(roomData);
    io.to(userRoomId).emit('roomUpdate', {
      roomId: userRoomId,
      ...enhancedRoomDataRemove
    });

    // Save sessions
    saveSessions();

    res.json({
      message: 'ROM removed from queue',
      romName: romName,
      remainingCount: roomData.roms.length
    });

  } catch (error) {
    console.error('Error removing ROM from queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Organizer API endpoints
app.get('/api/rulesets', async (req, res) => {
  try {
    const rulesets = await organizer.getRulesets();
    res.json({ rulesets });
  } catch (error) {
    console.error('Error fetching rulesets:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rulesets', async (req, res) => {
  try {
    const { name, extract, move, rename } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Ruleset name is required' });
    }

    const ruleset = { name, extract: !!extract, move, rename };
    await organizer.addRuleset(ruleset);
    res.json({ message: 'Ruleset created successfully', ruleset });
  } catch (error) {
    console.error('Error creating ruleset:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/rulesets/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { extract, move, rename, newName } = req.body;

    const updatedRuleset = {
      name: newName || name,
      extract: !!extract,
      move,
      rename
    };

    await organizer.updateRuleset(name, updatedRuleset);
    res.json({ message: 'Ruleset updated successfully', ruleset: updatedRuleset });
  } catch (error) {
    console.error('Error updating ruleset:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/rulesets/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await organizer.deleteRuleset(name);
    res.json({ message: 'Ruleset deleted successfully' });
  } catch (error) {
    console.error('Error deleting ruleset:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/organize', async (req, res) => {
  try {
    const { rulesetName, filePaths } = req.body;

    if (!rulesetName || !filePaths || !Array.isArray(filePaths)) {
      return res.status(400).json({ error: 'Ruleset name and file paths are required' });
    }

    const results = await organizer.applyRulesetToMultiple(rulesetName, filePaths);
    res.json({ message: 'Organization completed', results });
  } catch (error) {
    console.error('Error organizing files:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rooms', (req, res) => {
  try {
    // Return the shared room as a single-item array for compatibility
    const enhancedRoomDataRooms = getEnhancedRoomData(sharedRoomData);
    const rooms = [{
      sessionId: SHARED_ROOM_ID,
      ...enhancedRoomDataRooms
    }];
    res.json({ rooms });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: error.message });
  }
});



// Function to scan downloads folder and get completed downloads
async function getCompletedDownloads() {
  try {
    const downloadsDir = path.join(__dirname, '../downloads');

    // Ensure downloads directory exists
    await fs.ensureDir(downloadsDir);

    // Read all files in downloads directory
    const files = await fs.readdir(downloadsDir);

    const completedDownloads = [];

    for (const file of files) {
      const filePath = path.join(downloadsDir, file);
      const stats = await fs.stat(filePath);

      if (stats.isFile()) {
        completedDownloads.push({
          name: file,
          filePath: filePath,
          size: formatFileSize(stats.size),
          completedAt: stats.mtime.toISOString(),
          sizeBytes: stats.size
        });
      }
    }

    // Sort by completion time (newest first)
    completedDownloads.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    return completedDownloads;
  } catch (error) {
    console.error('Error reading downloads folder:', error);
    return [];
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

app.get('/api/completed-downloads', async (req, res) => {
  try {
    const completedDownloads = await getCompletedDownloads();
    res.json({ completedDownloads });
  } catch (error) {
    console.error('Error fetching completed downloads:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    // Note: With shared room architecture, we don't delete individual sessions
    // This endpoint is kept for compatibility but doesn't do anything
    console.log(`⚠️ Session deletion requested for ${sessionId}, but using shared room architecture`);

    res.json({ message: 'Session closed' });
  } catch (error) {
    console.error('Session cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user room ID endpoint
app.get('/api/user-room', async (req, res) => {
  try {
    const userRoomId = getOrCreateUserRoom(req);
    const roomData = sharedRoomData;

    console.log(`🔍 API user-room request for ${userRoomId}:`, 'Shared room data');

    // Get completed downloads
    const completedDownloads = await getCompletedDownloads();

    // Enhance room data with completed downloads
    const enhancedRoomData = {
      ...roomData,
      completedDownloads
    };

    res.json({
      userRoomId,
      room: enhancedRoomData
    });
  } catch (error) {
    console.error('Error getting user room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Note: downloadSingleRomAsync removed - now handled by GlobalDownloadQueue
// (function removed to clean up unused code)


// Note: downloadRomsAsync removed - now handled by GlobalDownloadQueue


// Function to start downloads for available ROMs (auto-start on session restore)
async function startDownloadForAvailableRoms(userRoomId, roomData) {
  try {
    const availableRoms = roomData.roms.filter(rom => rom.status === 'available');

    if (availableRoms.length === 0) {
      console.log(`⚠️ No available ROMs to download in room ${userRoomId}`);
      return;
    }

    console.log(`🚀 Auto-starting download of ${availableRoms.length} available ROMs for room ${userRoomId}`);

    // Start download processing
    downloadProcessor.startProcessing(roomData);

    console.log(`✅ Started download processing for ${availableRoms.length} ROMs in room ${userRoomId}`);

  } catch (error) {
    console.error(`❌ Error auto-starting downloads for room ${userRoomId}:`, error);

    // Update room status to indicate error
    roomData.status = 'error';
    roomData.lastActivity = new Date().toISOString();

    // Emit error to the room
    io.to(userRoomId).emit('roomUpdate', {
      roomId: userRoomId,
      ...roomData,
      error: error.message
    });
  }
}

// Function to restart interrupted downloads
async function restartDownload(userRoomId, roomData) {
  try {
    console.log(`🔄 Restarting download for room ${userRoomId}`);

    // Find ROMs that need to be downloaded (downloading, pending, or available)
    // Available ROMs are those that were selected but never processed
    const romsToDownload = roomData.roms?.filter(rom =>
      rom.status === 'downloading' || rom.status === 'pending' || rom.status === 'available'
    ) || [];

    console.log(`🔍 Found ${romsToDownload.length} ROMs to restart:`, romsToDownload.map(r => `${r.name} (${r.status})`));

    // Check if any ROMs are missing downloadUrl (legacy sessions)
    const romsWithoutUrl = romsToDownload.filter(rom => !rom.downloadUrl);
    if (romsWithoutUrl.length > 0) {
      console.log(`⚠️ Found ${romsWithoutUrl.length} ROMs without downloadUrl. These may fail to download.`);
      console.log(`💡 Recommendation: Re-scrape the ROM list to get proper download URLs.`);
    }

    if (romsToDownload.length === 0) {
      console.log(`⚠️ No ROMs to restart for room ${userRoomId}`);

      // Check if downloads are actually complete since there's nothing to restart
      const hasActiveDownloads = roomData.roms.some(r => r.status === 'downloading' || r.status === 'pending');
      const hasAvailableRoms = roomData.roms.some(r => r.status === 'available');

      const enhancedRoomDataRestart = getEnhancedRoomData(roomData);
      if (!hasActiveDownloads && !hasAvailableRoms && enhancedRoomDataRestart.status !== 'complete') {
        console.log(`✅ All downloads complete for room ${userRoomId}`);
        roomData.lastActivity = new Date().toISOString();

        // Emit room update to reflect completion
        io.to(userRoomId).emit('roomUpdate', {
          roomId: userRoomId,
          ...enhancedRoomDataRestart
        });

        // Save sessions
        saveSessions();
      }

      return;
    }

    // Mark ROMs as available for processing
    romsToDownload.forEach(rom => {
      if (rom.status === 'downloading' || rom.status === 'pending') {
        rom.status = 'available';
      }
      // ROMs that are already 'available' stay as 'available'
    });

    // Start download processing for the available ROMs
    console.log(`📋 Starting download processing for ${romsToDownload.length} ROMs for restart`);
    downloadProcessor.startProcessing(roomData);

    console.log(`✅ Restarted downloads for room ${userRoomId}`);

  } catch (error) {
    console.error(`❌ Error restarting download for room ${userRoomId}:`, error);

    // Update room status to error
    if (roomData) {
      roomData.status = 'error';
      roomData.lastActivity = new Date().toISOString();

      io.to(userRoomId).emit('roomUpdate', {
        roomId: userRoomId,
        ...roomData
      });

      saveSessions();
    }
  }
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle joining the shared room
  socket.on('joinUserRoom', (userRoomId) => {
    // Everyone joins the same shared room
    socket.join(SHARED_ROOM_ID);
    socket.userRoomId = SHARED_ROOM_ID;
    console.log(`🏠 Client ${socket.id} joined shared room`);

    // Get shared room data
    const roomData = sharedRoomData;
    console.log(`🔍 Shared room data:`, roomData);

    // Update last activity since user is connecting
    updateLastActivity();

    // Check if session should be cleared due to inactivity (1 hour = 3600000ms)
    if (roomData && roomData.lastActivity) {
      const lastActivity = new Date(roomData.lastActivity);
      const now = new Date();
      const inactiveTime = now - lastActivity;
      const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

      if (inactiveTime > oneHour && roomData.status !== 'downloading') {
        console.log(`🧹 Clearing inactive session for room ${userRoomId} (inactive for ${Math.round(inactiveTime / 1000 / 60)} minutes)`);

        // Clear the session data
        roomData.status = 'idle';
        roomData.roms = [];
        roomData.currentRom = null;
        roomData.totalRoms = 0;
        roomData.completedRoms = 0;
        roomData.failedRoms = 0;
        roomData.downloadHistory = [];
        roomData.ruleset = null;
        roomData.lastActivity = now.toISOString();

        // Recalculate queue state after clearing (should result in all zeros)
        recalculateQueueState(roomData);

        // Save the cleared session
        saveSessions();

        console.log(`✅ Session cleared for room ${userRoomId} due to inactivity`);
      } else if (inactiveTime > oneHour && roomData.status === 'downloading') {
        console.log(`⏳ Session for room ${userRoomId} is inactive but has active downloads - not clearing`);
      }
    }

    if (roomData) {
      console.log(`🔄 Checking download state for room ${userRoomId}:`, {
        status: roomData.status,
        romsCount: roomData.roms?.length || 0,
        currentRom: roomData.currentRom
      });

      // Send room update with session restoration data
      const enhancedRoomDataSocket = getEnhancedRoomData(roomData);
      socket.emit('roomUpdate', {
        roomId: userRoomId,
        ...enhancedRoomDataSocket
      });

      // Restore download state and restart downloads if needed
      if (enhancedRoomDataSocket.status === 'downloading' || enhancedRoomDataSocket.status === 'ready') {
        console.log(`🔄 Restoring interrupted download for room ${userRoomId}`);

        // Emit download state restoration
        socket.emit('downloadStateRestored', {
          status: enhancedRoomDataSocket.status,
          currentRom: roomData.currentRom,
          totalRoms: enhancedRoomDataSocket.totalRoms,
          completedRoms: enhancedRoomDataSocket.completedRoms,
          failedRoms: enhancedRoomDataSocket.failedRoms
        });

        // Restart the download process
        restartDownload(userRoomId, roomData);

      } else if (enhancedRoomDataSocket.status === 'ready' && roomData.roms && roomData.roms.some(rom => rom.status === 'available')) {
        // Just emit the ready state - don't auto-start downloads
        console.log(`📋 Room ready with ${roomData.roms.filter(rom => rom.status === 'available').length} available ROMs in room ${userRoomId}`);

        const availableRoms = roomData.roms.filter(rom => rom.status === 'available');

        // Emit ready state (not starting downloads automatically)
        socket.emit('downloadStateRestored', {
          status: 'ready',
          currentRom: null,
          totalRoms: enhancedRoomDataSocket.totalRoms,
          completedRoms: enhancedRoomDataSocket.completedRoms,
          failedRoms: enhancedRoomDataSocket.failedRoms,
          availableRoms: availableRoms.length
        });

      } else if (enhancedRoomDataSocket.status === 'complete') {
        console.log(`🔄 Emitting completed download state for room status: ${roomData.status}`);
        socket.emit('downloadStateRestored', {
          status: roomData.status,
          currentRom: roomData.currentRom,
          totalRoms: roomData.totalRoms,
          completedRoms: roomData.completedRoms,
          failedRoms: roomData.failedRoms
        });
      } else {
        console.log(`🔄 No download state to restore - room status: ${roomData.status}`);
      }
    } else {
      console.log(`🔍 No room data found for ${userRoomId}`);
    }
  });

  // Handle download room joining (for active downloads)
  socket.on('joinDownloadRoom', (userRoomId) => {
    const downloadRoom = `download-${userRoomId}`;
    socket.join(downloadRoom);
    console.log(`📥 Client ${socket.id} joined download room: ${downloadRoom}`);
  });

  // Handle leaving rooms
  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    console.log(`🚪 Client ${socket.id} left room: ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3002;

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Load sessions on startup
  await loadSessions();
});

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('Shutting down server...');

  // Shutdown download processor
  try {
    await downloadProcessor.shutdown();
  } catch (error) {
    console.error(`❌ Error shutting down download processor:`, error);
  }

  // Save sessions before exit
  console.log('💾 Saving sessions before exit...');
  await saveSessions();

  // Download processor shutdown handles downloader cleanup
  console.log('✅ Download processor shutdown completed');

  process.exit(0);
});

process.on('SIGTERM', async () => {
  await saveSessions();
  process.exit(0);
});
