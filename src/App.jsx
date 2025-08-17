import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import UrlInput from './components/UrlInput';
import RomTable from './components/RomTable';
import DownloadQueue from './components/DownloadQueue';
import Settings from './components/Settings';
import './App.css';

// Component to handle ROM routes with URL parameters
const RomRouteHandler = ({
  roms,
  selectedRoms,
  onSelectionChange,
  onStartDownload,
  onReset,
  loading,
  onUrlSubmit
}) => {
  const params = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [isCancelled, setIsCancelled] = useState(false);

  // Extract URL from the route parameter (everything after /roms/)
  const urlParam = params['*'];

  useEffect(() => {
    if (urlParam && roms.length === 0 && !hasAttemptedLoad) {
      // Create abort controller for cancellation
      const controller = new AbortController();
      setAbortController(controller);

      // Decode the URL and fetch ROMs
      const decodedUrl = decodeURIComponent(urlParam);
      setIsLoading(true);
      setHasAttemptedLoad(true);

      console.log(`🔄 Loading ROMs for URL: ${decodedUrl}`);

      onUrlSubmit(decodedUrl, controller.signal)
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }

    // Cleanup function to abort request if component unmounts
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [urlParam, roms.length, onUrlSubmit, hasAttemptedLoad]);

  const handleBackToBrowse = () => {
    // Cancel the ongoing request
    if (abortController) {
      abortController.abort();
    }
    setIsLoading(false);
    setIsCancelled(true);
  };

  // Show loading state when initially loading ROMs from URL
  if (urlParam && (isLoading || isCancelled) && roms.length === 0) {
    return (
      <div className="rom-loading-container">
        <div className="rom-loading-header">
          <h2>{isCancelled ? '❌ Loading Cancelled' : '📁 Loading ROM Archive'}</h2>
          <p className="rom-loading-subtitle">
            {isCancelled
              ? 'ROM loading was cancelled'
              : `Fetching ROMs from ${decodeURIComponent(urlParam)}`
            }
          </p>
        </div>
        <div className="rom-loading-content">
          {!isCancelled && <div className="spinner"></div>}
          <p>
            {isCancelled
              ? 'The ROM loading operation was cancelled. You can try again or browse other archives.'
              : 'Please wait while we load the ROM list...'
            }
          </p>
          <Link
            to="/"
            className="back-to-browse-button"
            onClick={handleBackToBrowse}
          >
            ← Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  if (roms.length > 0) {
    return (
      <RomTable
        roms={roms}
        selectedRoms={selectedRoms}
        onSelectionChange={onSelectionChange}
        onStartDownload={onStartDownload}
        onReset={onReset}
        loading={loading}
      />
    );
  }

  return (
    <UrlInput
      onSubmit={onUrlSubmit}
      loading={loading || isLoading}
      defaultUrl="https://myrient.erista.me/files/No-Intro/"
    />
  );
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [roms, setRoms] = useState([]);
  const [selectedRoms, setSelectedRoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [queueCount, setQueueCount] = useState(0);

  // Shared room ID - everyone uses the same room
  const SHARED_ROOM_ID = 'shared-room';

  useEffect(() => {
    // Initialize socket connection to shared room
    const initializeSocket = async () => {
      try {
        console.log('🏠 Using shared room:', SHARED_ROOM_ID);

        // Initialize socket connection
        // In production/Docker, connect to the same origin
        // In development, connect to the backend server port
        const socketUrl = window.location.hostname === 'localhost' && window.location.port === '3000'
          ? 'http://localhost:3001'  // Development: Vite dev server connecting to backend
          : window.location.origin;  // Production/Docker: same origin

        console.log('🔌 Connecting to socket at:', socketUrl);
        const newSocket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          forceNew: true,
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
          maxReconnectionAttempts: 5
        });
        setSocket(newSocket);

        // Handle socket connection
        newSocket.on('connect', () => {
          console.log('🔌 Socket connected:', newSocket.id);

          // Join shared room immediately
          console.log('🏠 Joining shared room:', SHARED_ROOM_ID);
          newSocket.emit('joinUserRoom', SHARED_ROOM_ID);
          console.log('🏠 Emitted joinUserRoom for shared room');
        });

        newSocket.on('disconnect', () => {
          console.log('🔌 Socket disconnected');
        });

        newSocket.on('connect_error', (error) => {
          console.error('🔌 Socket connection error:', error);
        });

        // Listen for room updates (new single event for user's room)
        newSocket.on('roomUpdate', (roomData) => {
          console.log('📊 Received room update:', roomData);

          // Calculate queue count from room data - count all non-complete items
          let queuedItems = 0;
          if (roomData.roms && Array.isArray(roomData.roms)) {
            // Count all ROMs that are not complete (pending, downloading, failed, etc.)
            queuedItems = roomData.roms.filter(rom =>
              rom.status !== 'complete' && rom.status !== 'success'
            ).length;
          } else if (roomData.totalRoms && roomData.completedRoms) {
            // Fallback: calculate from totals if individual ROM data not available
            queuedItems = roomData.totalRoms - roomData.completedRoms;
          } else if (roomData.currentRom) {
            // Fallback: if there's a current ROM, assume at least 1 item in queue
            queuedItems = 1;
          }

          console.log('📊 Calculated queued items:', queuedItems, 'from room data:', {
            totalRoms: roomData.totalRoms,
            completedRoms: roomData.completedRoms,
            romsArray: roomData.roms?.length
          });
          setQueueCount(queuedItems);
        });

        // Listen for download progress updates
        newSocket.on('downloadProgress', (progress) => {
          console.log('📥 Download progress received:', progress);
        });

        // Listen for download completion
        newSocket.on('downloadComplete', (result) => {
          console.log('✅ Download complete received:', result);
        });

        // Listen for download state restoration (only for active downloads)
        newSocket.on('downloadStateRestored', (downloadState) => {
          console.log('🔄 Download state restored from server:', downloadState);

          // Only navigate to queue if there's an active download
          if (downloadState.status === 'downloading') {
            console.log('🔄 Navigating to queue page (download in progress)');
            navigate('/queue');
          }
          // Don't navigate for 'complete' status - let user stay where they are


        });

        // Initial queue count will be set via roomUpdate events

        return newSocket;

      } catch (error) {
        console.error('❌ Failed to initialize socket:', error);
      }
    };

    const socketPromise = initializeSocket();

    return () => {
      socketPromise.then(socket => {
        if (socket) {
          socket.off('roomUpdate');
          socket.off('downloadProgress');
          socket.off('downloadComplete');
          socket.off('downloadStateRestored');
          socket.off('connect');
          socket.off('disconnect');
          socket.off('connect_error');
          socket.close();
        }
      });
    };
  }, []);



  const handleUrlSubmit = async (url, abortSignal = null) => {
    setLoading(true);
    setError(null);

    try {
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      };

      // Add abort signal if provided
      if (abortSignal) {
        fetchOptions.signal = abortSignal;
      }

      const response = await fetch('/api/scrape', fetchOptions);

      if (!response.ok) {
        throw new Error('Failed to scrape ROM list');
      }

      const data = await response.json();
      // sessionId is now the same as userRoomId, so we don't need to set it separately
      setRoms(data.roms);
      // Encode the URL to make it safe for use in the route
      const encodedUrl = encodeURIComponent(url);
      navigate(`/roms/${encodedUrl}`);
    } catch (err) {
      // Don't set error if the request was aborted
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      // Don't set loading to false if the request was aborted
      if (!abortSignal || !abortSignal.aborted) {
        setLoading(false);
      }
    }
  };

  const handleRomSelection = (selected) => {
    console.log('🎯 ROM selection changed:', selected.length, 'ROMs selected');
    console.log('🎯 Selected ROM names:', selected.map(rom => rom.name));
    setSelectedRoms(selected);
  };

  const handleStartDownload = async (ruleset = null) => {
    console.log('🚀 Starting download with selectedRoms:', selectedRoms.length, 'ROMs');
    console.log('🚀 Selected ROM names for download:', selectedRoms.map(rom => rom.name));

    if (selectedRoms.length === 0) {
      setError('Please select at least one ROM to download');
      return;
    }

    setLoading(true);
    setError(null);

    // Join the download room for real-time updates
    if (socket) {
      socket.emit('joinDownloadRoom', SHARED_ROOM_ID);
    }

    try {
      const requestBody = {
        sessionId: SHARED_ROOM_ID, // Use shared room ID
        selectedRoms,
      };

      // Add ruleset if provided
      if (ruleset) {
        requestBody.ruleset = ruleset;
      }

      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to start download');
      }

      // Navigate to queue page to show download progress
      navigate('/queue');

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    // Clean up session using shared room ID
    try {
      await fetch(`/api/session/${SHARED_ROOM_ID}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Error cleaning up session:', err);
    }

    // Reset state
    setRoms([]);
    setSelectedRoms([]);
    setError(null);
    navigate('/');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>🎮 ROM Downloader</h1>
            <span className="header-subtitle">Download ROMs from Myrient archive with ease</span>
          </div>

          <nav className="app-nav">
            <Link
              to="/"
              className={`nav-button ${location.pathname === '/' || location.pathname.startsWith('/roms') ? 'active' : ''}`}
            >
              📁 Browse ROMs
            </Link>
            <Link
              to="/queue"
              className={`nav-button ${location.pathname === '/queue' ? 'active' : ''}`}
            >
              📋 Download Queue
              {queueCount > 0 && (
                <span className="queue-badge">
                  {queueCount > 100 ? '100+' : queueCount}
                </span>
              )}
            </Link>
            <Link
              to="/settings"
              className={`nav-button ${location.pathname === '/settings' ? 'active' : ''}`}
            >
              ⚙️ Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <span>❌ {error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <Routes>
          <Route
            path="/"
            element={
              <UrlInput
                onSubmit={handleUrlSubmit}
                loading={loading}
                defaultUrl="https://myrient.erista.me/files/No-Intro/"
              />
            }
          />
          <Route
            path="/roms/*"
            element={
              <RomRouteHandler
                roms={roms}
                selectedRoms={selectedRoms}
                onSelectionChange={handleRomSelection}
                onStartDownload={handleStartDownload}
                onReset={handleReset}
                loading={loading}
                onUrlSubmit={handleUrlSubmit}
              />
            }
          />
          <Route
            path="/queue"
            element={
              <DownloadQueue
                socket={socket}
                userRoomId={SHARED_ROOM_ID}
              />
            }
          />
          <Route
            path="/settings"
            element={<Settings />}
          />
        </Routes>
      </main>

      <footer className="app-footer">
        <p>Built with React, Express, and Playwright</p>
      </footer>
    </div>
  );
}

export default App;
