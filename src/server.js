import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { RomDownloader } from './romDownloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Store active downloaders by session
const activeDownloaders = new Map();

// Store active download rooms with their metadata and progress
const downloadRooms = new Map();

// Store user rooms by user hash
const userRooms = new Map();

// Generate a unique user room ID based on IP and User-Agent
function getUserRoomId(req) {
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
             (req.connection.socket ? req.connection.socket.remoteAddress : null) || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const fingerprint = `${ip}-${userAgent}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
}

// Get or create user room
function getOrCreateUserRoom(req) {
  const userRoomId = getUserRoomId(req);

  if (!userRooms.has(userRoomId)) {
    const roomData = {
      roomId: userRoomId,
      sessionId: null,
      totalRoms: 0,
      completedRoms: 0,
      failedRoms: 0,
      currentRom: null,
      status: 'idle',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      roms: [],
      downloadHistory: []
    };
    userRooms.set(userRoomId, roomData);
    downloadRooms.set(userRoomId, roomData);
  }

  return userRoomId;
}

// API Routes
app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Get or create user room
    const userRoomId = getOrCreateUserRoom(req);
    const roomData = userRooms.get(userRoomId);

    // Create a new downloader instance
    const downloader = new RomDownloader({
      headless: true,
      timeout: 30000
    });

    await downloader.init();

    // Store the downloader for this user room
    activeDownloaders.set(userRoomId, downloader);

    // Scrape the ROM list
    const roms = await downloader.scrapeRomList(url);

    // Update room data
    roomData.sessionId = userRoomId;
    roomData.lastActivity = new Date().toISOString();
    roomData.status = 'ready';

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

app.post('/api/download', async (req, res) => {
  try {
    console.log('📥 Download request received');
    const { sessionId, selectedRoms } = req.body;
    console.log(`📋 Session ID: ${sessionId}`);
    console.log(`📦 Selected ROMs: ${selectedRoms?.length || 0}`);

    if (!sessionId || !selectedRoms || !Array.isArray(selectedRoms)) {
      console.log('❌ Invalid request parameters');
      return res.status(400).json({ error: 'Session ID and selected ROMs are required' });
    }

    // Get user room (should match the sessionId which is the userRoomId)
    const userRoomId = getUserRoomId(req);
    if (sessionId !== userRoomId) {
      return res.status(403).json({ error: 'Session does not match user' });
    }

    const downloader = activeDownloaders.get(userRoomId);
    if (!downloader) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const roomData = userRooms.get(userRoomId);
    if (!roomData) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Update room data for download
    roomData.sessionId = sessionId;
    roomData.totalRoms = selectedRoms.length;
    roomData.completedRoms = 0;
    roomData.failedRoms = 0;
    roomData.currentRom = null;
    roomData.status = 'downloading';
    roomData.startTime = new Date().toISOString();
    roomData.lastActivity = new Date().toISOString();
    roomData.roms = selectedRoms.map(rom => ({
      name: rom.name,
      size: rom.size,
      status: 'pending'
    }));

    // Start download process
    res.json({ message: 'Download started', totalRoms: selectedRoms.length });

    // Handle downloads with progress updates via WebSocket
    const socketRoom = `download-${userRoomId}`;

    // Emit initial room update
    io.emit('roomsUpdate', Array.from(downloadRooms.entries()).map(([id, room]) => ({
      roomId: id,
      ...room
    })));

    for (let i = 0; i < selectedRoms.length; i++) {
      const rom = selectedRoms[i];

      try {
        console.log(`Starting download ${i + 1}/${selectedRoms.length}: ${rom.name}`);

        // Update room data
        roomData.currentRom = rom.name;
        roomData.lastActivity = new Date().toISOString();
        const romIndex = roomData.roms.findIndex(r => r.name === rom.name);
        if (romIndex !== -1) {
          roomData.roms[romIndex].status = 'downloading';
        }

        // Emit progress update
        io.to(socketRoom).emit('downloadProgress', {
          current: i + 1,
          total: selectedRoms.length,
          currentRom: rom.name,
          status: 'downloading'
        });

        // Emit room update
        io.emit('roomsUpdate', Array.from(downloadRooms.entries()).map(([id, room]) => ({
          roomId: id,
          ...room
        })));

        const filepath = await downloader.downloadSingleRom(rom);
        console.log(`✅ Successfully downloaded: ${rom.name} to ${filepath}`);

        // Update room data
        roomData.completedRoms++;
        if (romIndex !== -1) {
          roomData.roms[romIndex].status = 'success';
        }
        roomData.downloadHistory.push({
          name: rom.name,
          status: 'success',
          completedAt: new Date().toISOString()
        });

        // Emit success for this ROM
        io.to(socketRoom).emit('downloadComplete', {
          rom: rom.name,
          status: 'success'
        });

      } catch (error) {
        console.error(`❌ Failed to download ${rom.name}:`, error.message);

        // Update room data
        roomData.failedRoms++;
        const romIndex = roomData.roms.findIndex(r => r.name === rom.name);
        if (romIndex !== -1) {
          roomData.roms[romIndex].status = 'error';
        }
        roomData.downloadHistory.push({
          name: rom.name,
          status: 'error',
          error: error.message,
          completedAt: new Date().toISOString()
        });

        // Emit error for this ROM
        io.to(socketRoom).emit('downloadComplete', {
          rom: rom.name,
          status: 'error',
          error: error.message
        });
      }

      // Emit room update after each ROM
      io.emit('roomsUpdate', Array.from(downloadRooms.entries()).map(([id, room]) => ({
        roomId: id,
        ...room
      })));
    }
    
    // Update final room status
    roomData.status = 'complete';
    roomData.currentRom = null;
    roomData.lastActivity = new Date().toISOString();

    // Emit final completion
    io.to(socketRoom).emit('downloadProgress', {
      current: selectedRoms.length,
      total: selectedRoms.length,
      status: 'complete'
    });

    // Emit final room update
    io.emit('roomsUpdate', Array.from(downloadRooms.entries()).map(([id, room]) => ({
      roomId: id,
      ...room
    })));
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rooms', (req, res) => {
  try {
    const rooms = Array.from(downloadRooms.entries()).map(([sessionId, room]) => ({
      sessionId,
      ...room
    }));
    res.json({ rooms });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const downloader = activeDownloaders.get(sessionId);

    if (downloader) {
      await downloader.close();
      activeDownloaders.delete(sessionId);
    }

    // Clean up room data
    downloadRooms.delete(sessionId);

    res.json({ message: 'Session closed' });
  } catch (error) {
    console.error('Session cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('joinDownload', (sessionId) => {
    socket.join(`download-${sessionId}`);
    console.log(`Client ${socket.id} joined download room: download-${sessionId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // Close all active downloaders
  for (const [sessionId, downloader] of activeDownloaders) {
    try {
      await downloader.close();
    } catch (error) {
      console.error(`Error closing downloader ${sessionId}:`, error);
    }
  }
  
  process.exit(0);
});
