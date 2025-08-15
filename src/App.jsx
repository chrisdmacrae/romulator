import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import UrlInput from './components/UrlInput';
import RomTable from './components/RomTable';
import DownloadProgress from './components/DownloadProgress';
import DownloadQueue from './components/DownloadQueue';
import Settings from './components/Settings';
import './App.css';

function App() {
  const [currentStep, setCurrentStep] = useState('url'); // 'url', 'roms', 'downloading', 'queue', 'settings'
  const [sessionId, setSessionId] = useState(null);
  const [roms, setRoms] = useState([]);
  const [selectedRoms, setSelectedRoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
    currentRom: '',
    status: 'idle'
  });
  const [downloadResults, setDownloadResults] = useState([]);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('downloadProgress', (progress) => {
      setDownloadProgress(progress);
    });

    newSocket.on('downloadComplete', (result) => {
      setDownloadResults(prev => [...prev, result]);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const handleUrlSubmit = async (url) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Failed to scrape ROM list');
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      setRoms(data.roms);
      setCurrentStep('roms');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRomSelection = (selected) => {
    setSelectedRoms(selected);
  };

  const handleStartDownload = async (ruleset = null) => {
    if (selectedRoms.length === 0) {
      setError('Please select at least one ROM to download');
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentStep('downloading');
    setDownloadResults([]);

    // Join the download room for real-time updates
    if (socket) {
      socket.emit('joinDownload', sessionId);
    }

    try {
      const requestBody = {
        sessionId,
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

    } catch (err) {
      setError(err.message);
      setCurrentStep('roms');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    // Clean up session
    if (sessionId) {
      try {
        await fetch(`/api/session/${sessionId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('Error cleaning up session:', err);
      }
    }

    // Reset state
    setCurrentStep('url');
    setSessionId(null);
    setRoms([]);
    setSelectedRoms([]);
    setError(null);
    setDownloadProgress({
      current: 0,
      total: 0,
      currentRom: '',
      status: 'idle'
    });
    setDownloadResults([]);
  };

  const handleViewQueue = () => {
    setCurrentStep('queue');
  };

  const handleViewSettings = () => {
    setCurrentStep('settings');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎮 ROM Downloader</h1>
        <p>Download ROMs from Myrient archive with ease</p>

        {/* Navigation */}
        <div className="app-nav">
          <button
            className={`nav-button ${currentStep === 'url' || currentStep === 'roms' || currentStep === 'downloading' ? 'active' : ''}`}
            onClick={() => setCurrentStep('url')}
          >
            📁 Browse ROMs
          </button>
          <button
            className={`nav-button ${currentStep === 'queue' ? 'active' : ''}`}
            onClick={handleViewQueue}
          >
            📋 My Queue
          </button>
          <button
            className={`nav-button ${currentStep === 'settings' ? 'active' : ''}`}
            onClick={handleViewSettings}
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <span>❌ {error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {currentStep === 'url' && (
          <UrlInput 
            onSubmit={handleUrlSubmit} 
            loading={loading}
            defaultUrl="https://myrient.erista.me/files/No-Intro/"
          />
        )}

        {currentStep === 'roms' && (
          <RomTable
            roms={roms}
            selectedRoms={selectedRoms}
            onSelectionChange={handleRomSelection}
            onStartDownload={handleStartDownload}
            onReset={handleReset}
            loading={loading}
          />
        )}

        {currentStep === 'downloading' && (
          <DownloadProgress
            progress={downloadProgress}
            results={downloadResults}
            selectedRoms={selectedRoms}
            onReset={handleReset}
          />
        )}

        {currentStep === 'queue' && (
          <DownloadQueue
            socket={socket}
            sessionId={sessionId}
          />
        )}

        {currentStep === 'settings' && (
          <Settings />
        )}
      </main>

      <footer className="app-footer">
        <p>Built with React, Express, and Playwright</p>
      </footer>
    </div>
  );
}

export default App;
