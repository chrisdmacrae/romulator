import React, { useState, useEffect } from 'react';
import Organizer from './Organizer';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fileProgress, setFileProgress] = useState(null);

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
      });

      // Handle connection status
      socket.on('connect', () => {
        console.log('🔌 DownloadQueue socket connected:', socket.id);
        setSocketConnected(true);
      });

      socket.on('disconnect', () => {
        console.log('🔌 DownloadQueue socket disconnected');
        setSocketConnected(false);
      });

      // Set initial connection status
      setSocketConnected(socket.connected);

      return () => {
        socket.off('roomUpdate');
        socket.off('downloadComplete');
        socket.off('downloadProgress');
        socket.off('fileProgress');
        socket.off('connect');
        socket.off('disconnect');
      };
    }
  }, [socket]);



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
                {completedDownloads.map((download, index) => (
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
            <span className={`connection-badge ${socketConnected ? 'connected' : 'disconnected'}`}>
              {socketConnected ? '🟢 Live' : '🔴 Offline'}
            </span>
          </div>
        </div>
        <div className="queue-stats">
          <div className="stat-card total">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <span className="stat-value">{queueData.totalRoms || 0}</span>
              <span className="stat-label">Total ROMs</span>
            </div>
          </div>
          <div className="stat-card success">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <span className="stat-value">{queueData.completedRoms || 0}</span>
              <span className="stat-label">Completed</span>
            </div>
          </div>
          <div className="stat-card error">
            <div className="stat-icon">❌</div>
            <div className="stat-content">
              <span className="stat-value">{queueData.failedRoms || 0}</span>
              <span className="stat-label">Failed</span>
            </div>
          </div>
        </div>
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
                    {fileProgress && fileProgress.downloadedBytes ? (
                      fileProgress.totalBytes ?
                        `${(fileProgress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(fileProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB` :
                        `Downloaded ${(fileProgress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB`
                    ) : 'Preparing download...'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="queue-list">
        <h3>Queued Items</h3>

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
          {(queueData.roms || []).map((rom, index) => (
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
                {/* Show retry button for failed ROMs */}
                {(rom.status === 'failed' || rom.status === 'error' || rom.status === 'needs-rescrape') && (
                  <button
                    onClick={() => handleRetryRom(rom.name)}
                    className="retry-rom-button"
                    title="Retry download"
                  >
                    🔄
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
