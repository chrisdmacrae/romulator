import React, { useState, useEffect } from 'react';
import Organizer from './Organizer';
import SpeedChart from './SpeedChart';
import './DownloadQueue.css';

const DownloadQueue = ({ socket, userRoomId }) => {
  const [queueData, setQueueData] = useState(null);
  const [completedDownloads, setCompletedDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOrganizer, setShowOrganizer] = useState(false);

  const [downloadProgress, setDownloadProgress] = useState(null);
  const [isActiveDownload, setIsActiveDownload] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketConnecting, setSocketConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fileProgress, setFileProgress] = useState(null);
  const [speedHistory, setSpeedHistory] = useState([]);

  useEffect(() => {
    // Fetch initial queue data and completed downloads (show loading for initial load)
    fetchQueueData(true);
    fetchCompletedDownloads();

    // Listen for socket events
    if (socket) {
      console.log('🔌 DownloadQueue setting up socket listeners');

      // Listen for room updates (single event for user's room)
      socket.on('roomUpdate', (roomData) => {
        console.log('📊 DownloadQueue received room update:', roomData);

        // Update queue data directly from room update
        setQueueData(roomData);

        // Check if there's an active download
        const hasActiveDownload = roomData.status === 'downloading' && roomData.currentRom;
        setIsActiveDownload(hasActiveDownload);

        // Update speed history from room update if available (but don't replace existing data)
        if (roomData?.sessionStats?.speedHistory) {
          console.log('📊 Updating speed history from socket room update:', roomData.sessionStats.speedHistory.length, 'data points');
          const formattedHistory = roomData.sessionStats.speedHistory.map(point => ({
            timestamp: point.timestamp,
            speed: point.speed / (1024 * 1024) // Convert bytes/s to MB/s
          }));
          setSpeedHistory(formattedHistory);
        }

        // Refresh completed downloads when room updates
        fetchCompletedDownloads();
      });

      // Listen for individual download completions
      socket.on('downloadComplete', (downloadResult) => {
        console.log('📦 Download completed:', downloadResult);

        // Refresh completed downloads
        fetchCompletedDownloads();
      });

      // Listen for download progress updates
      socket.on('downloadProgress', (progress) => {
        console.log('📥 DownloadQueue received download progress:', progress);
        setDownloadProgress(progress);
      });

      // Listen for individual file download progress
      socket.on('fileProgress', (progress) => {
        console.log('📁 DownloadQueue received file progress:', progress);
        setFileProgress(progress);

        // Add speed data point to history if we have speed data
        if (progress.currentSpeed && progress.currentSpeed > 0) {
          const timestamp = Date.now();
          const speedMBps = progress.currentSpeed / (1024 * 1024);

          setSpeedHistory(prev => {
            const newHistory = [...prev, { timestamp, speed: speedMBps }];
            // Keep only last 60 data points (about 1 minute of data if updated every second)
            return newHistory.slice(-60);
          });
        }
      });

      // Handle connection status
      socket.on('connect', () => {
        console.log('🔌 DownloadQueue socket connected:', socket.id);
        setSocketConnected(true);
        setSocketConnecting(false);
      });

      socket.on('disconnect', () => {
        console.log('🔌 DownloadQueue socket disconnected');
        setSocketConnected(false);
        setSocketConnecting(false);
      });

      socket.on('connect_error', (error) => {
        console.log('🔌 DownloadQueue socket connection error:', error);
        setSocketConnected(false);
        setSocketConnecting(false);
      });

      // Handle connecting state
      if (!socket.connected && socket.connecting) {
        setSocketConnecting(true);
      }

      // Set initial connection status and log it
      const initialConnectionState = socket.connected;
      console.log('🔌 DownloadQueue initial socket state:', {
        connected: initialConnectionState,
        id: socket.id,
        readyState: socket.readyState
      });
      setSocketConnected(initialConnectionState);

      // Periodic connection check (in case we miss events)
      const connectionCheckInterval = setInterval(() => {
        const currentState = socket.connected;
        if (currentState !== socketConnected) {
          console.log('🔌 DownloadQueue connection state changed via polling:', currentState);
          setSocketConnected(currentState);
          setSocketConnecting(false);
        }
      }, 1000);

      return () => {
        clearInterval(connectionCheckInterval);
        socket.off('roomUpdate');
        socket.off('downloadComplete');
        socket.off('downloadProgress');
        socket.off('fileProgress');
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
      };
    }
  }, [socket, socketConnected]);

  // Debug effect to log socket state changes
  useEffect(() => {
    console.log('🔌 DownloadQueue socket state changed:', {
      connected: socketConnected,
      connecting: socketConnecting,
      socketId: socket?.id,
      socketConnected: socket?.connected
    });
  }, [socketConnected, socketConnecting, socket]);

  const fetchQueueData = async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      // Always use the user room endpoint
      const response = await fetch('/api/user-room');

      if (!response.ok) {
        throw new Error('Failed to fetch queue data');
      }

      const data = await response.json();
      console.log('📊 DownloadQueue fetchQueueData received:', data);
      setQueueData(data.room);

      // Check if there's an active download from initial API data
      const hasActiveDownload = data.room?.status === 'downloading' && data.room?.currentRom;
      setIsActiveDownload(hasActiveDownload);
      console.log('📊 Initial active download state:', hasActiveDownload, 'Current ROM:', data.room?.currentRom);

      // Initialize speed history from session stats if available
      if (data.room?.sessionStats?.speedHistory) {
        console.log('📊 Initializing speed history from API:', data.room.sessionStats.speedHistory.length, 'data points');
        const formattedHistory = data.room.sessionStats.speedHistory.map(point => ({
          timestamp: point.timestamp,
          speed: point.speed / (1024 * 1024) // Convert bytes/s to MB/s
        }));
        setSpeedHistory(formattedHistory);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  };

  const fetchCompletedDownloads = async () => {
    try {
      const response = await fetch('/api/completed-downloads');
      if (!response.ok) {
        throw new Error('Failed to fetch completed downloads');
      }
      const data = await response.json();
      setCompletedDownloads(data.completedDownloads);
    } catch (err) {
      console.error('Error fetching completed downloads:', err);
      // Don't set error state for this, just log it
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'downloading': return '⬇️';
      case 'success': return '✅';
      case 'error': return '❌';
      case 'failed': return '❌';
      case 'available': return '📄';
      case 'complete': return '✅';
      case 'needs-rescrape': return '🔄';
      case 'corrupted': return '💥';
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ffc107';
      case 'downloading': return '#007bff';
      case 'success': return '#28a745';
      case 'error': return '#dc3545';
      case 'failed': return '#dc3545';
      case 'available': return '#6c757d';
      case 'complete': return '#28a745';
      case 'needs-rescrape': return '#fd7e14';
      case 'corrupted': return '#e83e8c';
      default: return '#6c757d';
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const getOverallProgress = () => {
    if (!queueData || !queueData.totalRoms || queueData.totalRoms === 0) return 0;
    const completed = queueData.completedRoms || 0;
    const failed = queueData.failedRoms || 0;
    return Math.round(((completed + failed) / queueData.totalRoms) * 100);
  };

  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond || bytesPerSecond === 0) return 'N/A';

    const mbps = bytesPerSecond / (1024 * 1024);
    if (mbps >= 1) {
      return `${mbps.toFixed(2)} MB/s`;
    } else {
      const kbps = bytesPerSecond / 1024;
      return `${kbps.toFixed(1)} KB/s`;
    }
  };

  const formatETA = (seconds) => {
    if (!seconds || seconds <= 0) return null;

    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };



  const getCompletedDownloads = () => {
    return completedDownloads;
  };

  const handleOrganizeDownloads = () => {
    setShowOrganizer(true);
  };

  const handleRemoveRom = async (romName) => {
    try {
      console.log(`🗑️ Removing ROM from queue: ${romName}`);

      const response = await fetch(`/api/rom/${encodeURIComponent(romName)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove ROM');
      }

      const result = await response.json();
      console.log(`✅ ROM removed:`, result);

      // Refresh queue data
      fetchQueueData();

    } catch (error) {
      console.error('❌ Error removing ROM:', error);
      alert(`Failed to remove ROM: ${error.message}`);
    }
  };

  const handleCancelDownload = async (romName) => {
    try {
      console.log(`🚫 Cancelling download: ${romName}`);

      const response = await fetch('/api/cancel-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ romName })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel download');
      }

      const result = await response.json();
      console.log(`✅ Download cancelled:`, result);

      // Refresh queue data
      fetchQueueData();

    } catch (error) {
      console.error('❌ Error cancelling download:', error);
      alert(`Failed to cancel download: ${error.message}`);
    }
  };

  const handleRetryRom = async (romName) => {
    try {
      console.log(`🔄 Retrying ROM download: ${romName}`);

      const response = await fetch(`/api/rom/${encodeURIComponent(romName)}/retry`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to retry ROM');
      }

      const result = await response.json();
      console.log(`✅ ROM retry started:`, result);

      // Refresh queue data
      fetchQueueData();

    } catch (error) {
      console.error('❌ Error retrying ROM:', error);
      alert(`Failed to retry ROM: ${error.message}`);
    }
  };

  const handleRetryAllFailed = async () => {
    if (!queueData || !queueData.roms) return;

    const failedRoms = queueData.roms.filter(rom =>
      ['failed', 'error', 'needs-rescrape'].includes(rom.status)
    );

    if (failedRoms.length === 0) {
      alert('No failed downloads to retry');
      return;
    }

    const confirmed = window.confirm(`Retry ${failedRoms.length} failed download${failedRoms.length !== 1 ? 's' : ''}?`);
    if (!confirmed) return;

    console.log(`🔄 Retrying ${failedRoms.length} failed downloads`);

    for (const rom of failedRoms) {
      try {
        await handleRetryRom(rom.name);
      } catch (error) {
        console.error(`❌ Failed to retry ${rom.name}:`, error);
      }
    }
  };

  if (loading) {
    return (
      <div className="download-queue-container">
        <div className="queue-header">
          <h2>📋 Download Queue</h2>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading queue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="download-queue-container">
        <div className="queue-header">
          <h2>📋 Download Queue</h2>
        </div>
        <div className="error-state">
          <p>❌ Error: {error}</p>
          <button onClick={() => fetchQueueData(true)} className="retry-button">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  if (!queueData || queueData.totalRoms === 0) {
    return (
      <div className="download-queue-container">
        <div className="queue-header">
          <h2>📋 Download Queue</h2>
          <p className="queue-subtitle">No downloads in queue</p>
        </div>
        <div className="empty-queue">
          <p>🎮 Start by browsing and selecting ROMs to download</p>
        </div>

        {/* Always show completed downloads section */}
        {completedDownloads.length > 0 && (
          <>
            <div className="completed-downloads-section">
              <h3>📁 Completed Downloads ({completedDownloads.length})</h3>
              <div className="completed-downloads-list">
                {completedDownloads
                  .slice() // Create a copy to avoid mutating the original array
                  .sort((a, b) => {
                    // Sort by completion date, newest first
                    const aDate = new Date(a.completedAt || 0);
                    const bDate = new Date(b.completedAt || 0);
                    return bDate - aDate;
                  })
                  .map((download, index) => (
                    <div key={index} className="completed-download-item">
                      <div className="download-icon">📄</div>
                      <div className="download-details">
                        <div className="download-name">{download.name}</div>
                        <div className="download-info">
                          <span className="download-size">{download.size}</span>
                          <span className="download-date">{formatTime(download.completedAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="organize-section">
              <button
                onClick={handleOrganizeDownloads}
                className="organize-downloads-button"
              >
                📦 Organize {completedDownloads.length} Completed Download{completedDownloads.length !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {showOrganizer && (
          <Organizer
            completedDownloads={completedDownloads}
            onClose={() => setShowOrganizer(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="download-queue-container">
      <div className="queue-header">
        <div className="queue-title-row">
          <h2>
            📋 Download Queue
            {isRefreshing && <span className="refresh-indicator">🔄</span>}
          </h2>
          <div className="status-badges">
            <span className={`status-badge ${queueData.status || 'idle'}`}>
              {(queueData.status || 'idle').toUpperCase()}
            </span>
            <span className={`connection-badge ${socketConnected ? 'connected' : socketConnecting ? 'connecting' : 'disconnected'}`}>
              {socketConnected ? '🟢 Live' : socketConnecting ? '🟡 Connecting...' : '🔴 Offline'}
            </span>
            {/* Debug info - can be removed later */}
            {process.env.NODE_ENV === 'development' && (
              <span style={{ fontSize: '0.6rem', color: '#666', marginLeft: '0.5rem' }}>
                (ID: {socket?.id || 'none'})
              </span>
            )}
          </div>
        </div>


        {/* Session Statistics */}
        {queueData.sessionStats && (
          <div className="session-stats">
            <div className="session-stats-container">
              {/* Left half - Statistics */}

              <div className="session-stats-left">
                <h4>📊 Session Statistics</h4>
                <div className="session-stats-grid">
                  <div className="session-stat">
                    <span className="session-stat-label">Current Speed:</span>
                    <span className="session-stat-value">
                      {formatSpeed(queueData.sessionStats.currentDownloadSpeed)}
                    </span>
                  </div>
                  <div className="session-stat">
                    <span className="session-stat-label">Peak Speed:</span>
                    <span className="session-stat-value">
                      {formatSpeed(queueData.sessionStats.peakSpeed)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right half - Speed Chart */}
              <div className="session-stats-chart">
                <SpeedChart data={speedHistory} sessionStats={queueData.sessionStats} />
              </div>
            </div>
          </div>
        )}
      </div>

      {queueData.currentRom && (
        <div className="current-download-section">
          <div className="current-download">
            <div className="current-download-header">
              <span className="current-label">Currently downloading:</span>
              <span className="current-rom">📥 {queueData.currentRom}</span>
            </div>

            {(queueData.status === 'downloading' && queueData.currentRom) && (
              <div className="current-download-progress">
                <div className="file-progress-info">
                  <div className="progress-info">
                    <span className="progress-current">
                      {fileProgress ? (fileProgress.filename || fileProgress.romName) : queueData.currentRom}
                    </span>
                    <span className="progress-percentage">
                      {fileProgress && fileProgress.progress !== undefined ? `${fileProgress.progress}%` : 'Starting...'}
                    </span>
                  </div>
                  <div className="progress-bar-current file-progress-bar">
                    <div
                      className="progress-fill-current file-progress-fill"
                      style={{
                        width: fileProgress ? `${fileProgress.progress || 0}%` : '0%'
                      }}
                    ></div>
                  </div>
                  <div className="progress-status">
                    <div className="progress-size">
                      {fileProgress && fileProgress.downloadedBytes ? (
                        fileProgress.totalBytes ?
                          `${(fileProgress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(fileProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB` :
                          `Downloaded ${(fileProgress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB`
                      ) : 'Preparing download...'}
                    </div>
                    {fileProgress && fileProgress.currentSpeed && (
                      <div className="progress-speed">
                        <span className="speed-current">
                          📊 {formatSpeed(fileProgress.currentSpeed)}
                          {fileProgress.chunks && fileProgress.chunks > 1 && (
                            <span className="parallel-indicator">
                              ⚡ {fileProgress.chunks} workers
                            </span>
                          )}
                        </span>
                        {fileProgress.eta && formatETA(fileProgress.eta) && (
                          <span className="speed-eta">
                            • ETA: {formatETA(fileProgress.eta)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="queue-list">
        <div className="queue-header-with-stats">
          <h3>Queued Items</h3>
          <div className="queue-stats-badges">
            <span
              className="stat-badge total"
              title={`Total ROMs in queue: ${queueData.totalRoms || 0}`}
            >
              📊 {queueData.totalRoms || 0}
            </span>
            <span
              className="stat-badge completed"
              title={`Successfully completed downloads: ${queueData.completedRoms || 0}`}
            >
              ✅ {queueData.completedRoms || 0}
            </span>
            <span
              className="stat-badge failed"
              title={`Failed downloads: ${queueData.failedRoms || 0}`}
            >
              ❌ {queueData.failedRoms || 0}
            </span>
          </div>
        </div>

        <div className="queue-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${getOverallProgress()}%` }}
            ></div>
          </div>
          <div className="progress-text">
            {getOverallProgress()}% Complete ({(queueData.completedRoms || 0) + (queueData.failedRoms || 0)} / {queueData.totalRoms || 0})
          </div>
        </div>

        {/* Retry All Failed Button */}
        {queueData.roms && Array.isArray(queueData.roms) && queueData.roms.some(rom => ['failed', 'error', 'needs-rescrape'].includes(rom.status)) && (
          <div className="retry-all-section">
            <button
              onClick={handleRetryAllFailed}
              className="retry-all-button"
            >
              🔄 Retry All Failed Downloads ({(queueData.roms || []).filter(rom => ['failed', 'error', 'needs-rescrape'].includes(rom.status)).length})
            </button>
          </div>
        )}

        <div className="rom-list">
          {(queueData.roms || [])
            .slice() // Create a copy to avoid mutating the original array
            .sort((a, b) => {
              // Define status priority (lower number = higher priority)
              const statusPriority = {
                'downloading': 1,
                'available': 2,
                'pending': 3,
                'failed': 4,
                'error': 4,
                'needs-rescrape': 4,
                'success': 5,
                'complete': 5
              };

              // First sort by status priority
              const aPriority = statusPriority[a.status] || 6;
              const bPriority = statusPriority[b.status] || 6;

              if (aPriority !== bPriority) {
                return aPriority - bPriority;
              }

              // Within same status, show newest first (reverse order)
              // Since ROMs are added to the end of the array, higher index = newer
              const aIndex = queueData.roms.indexOf(a);
              const bIndex = queueData.roms.indexOf(b);
              return bIndex - aIndex;
            })
            .map((rom, index) => (
              <div key={index} className={`rom-item ${rom.status}`}>
                <div className="rom-icon">
                  {getStatusIcon(rom.status)}
                </div>
                <div className="rom-details">
                  <div className="rom-name">{rom.name}</div>
                  <div className="rom-size">{rom.size}</div>
                </div>
                <div className="rom-status">
                  <span
                    className="status-badge"
                    style={{
                      backgroundColor: getStatusColor(rom.status),
                      color: 'white'
                    }}
                  >
                    {rom.status}
                  </span>
                  {/* Show cancel button for downloading ROMs */}
                  {rom.status === 'downloading' && (
                    <button
                      onClick={() => handleCancelDownload(rom.name)}
                      className="cancel-download-button"
                      title="Cancel download"
                    >
                      🚫
                    </button>
                  )}

                  {/* Show retry button for failed ROMs */}
                  {(rom.status === 'failed' || rom.status === 'error' || rom.status === 'needs-rescrape' || rom.status === 'corrupted') && (
                    <button
                      onClick={() => handleRetryRom(rom.name)}
                      className="retry-rom-button"
                      title={rom.status === 'corrupted' ? 'Re-download corrupted file' : 'Retry download'}
                    >
                      {rom.status === 'corrupted' ? '💥' : '🔄'}
                    </button>
                  )}

                  {/* Only show remove button for ROMs that aren't currently downloading */}
                  {rom.status !== 'downloading' && (
                    <button
                      onClick={() => handleRemoveRom(rom.name)}
                      className="remove-rom-button"
                      title="Remove from queue"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>

        {completedDownloads.length > 0 && (
          <div className="organize-section">
            <button
              onClick={handleOrganizeDownloads}
              className="organize-downloads-button"
            >
              📦 Organize {completedDownloads.length} Completed Download{completedDownloads.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>

      {queueData.downloadHistory && queueData.downloadHistory.length > 0 && (
        <div className="download-history">
          <h3>Recent Activity</h3>
          <div className="history-list">
            {queueData.downloadHistory.slice(-5).reverse().map((item, index) => (
              <div key={index} className={`history-item ${item.status}`}>
                <div className="history-icon">
                  {item.status === 'success' ? '✅' : '❌'}
                </div>
                <div className="history-details">
                  <div className="history-name">{item.name}</div>
                  <div className="history-time">{formatTime(item.completedAt)}</div>
                  {item.error && (
                    <div className="history-error">{item.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="queue-info">
        <div className="info-item">
          <span className="info-label">Room ID:</span>
          <span className="info-value">{queueData.sessionId || 'shared-room'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Last Activity:</span>
          <span className="info-value">{formatTime(queueData.lastActivity)}</span>
        </div>
      </div>

      {showOrganizer && (
        <Organizer
          completedDownloads={completedDownloads}
          onClose={() => setShowOrganizer(false)}
        />
      )}
    </div>
  );
};

export default DownloadQueue;
