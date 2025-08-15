import React, { useState, useEffect } from 'react';
import Organizer from './Organizer';
import './DownloadQueue.css';

const DownloadQueue = ({ socket, sessionId }) => {
  const [queueData, setQueueData] = useState(null);
  const [completedDownloads, setCompletedDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOrganizer, setShowOrganizer] = useState(false);

  useEffect(() => {
    // Fetch initial queue data and completed downloads
    fetchQueueData();
    fetchCompletedDownloads();

    // Listen for room updates via WebSocket
    if (socket) {
      socket.on('roomsUpdate', (updatedRooms) => {
        // Find our room in the updated rooms
        // If we have a sessionId, use it; otherwise find any room for this user
        const ourRoom = sessionId
          ? updatedRooms.find(room => room.roomId === sessionId)
          : updatedRooms.find(room => room.roomId); // Get the first room (should be user's room)

        if (ourRoom) {
          setQueueData(ourRoom);
        }

        // Refresh completed downloads when room updates
        fetchCompletedDownloads();
      });

      return () => {
        socket.off('roomsUpdate');
      };
    }
  }, [socket, sessionId]);

  const fetchQueueData = async () => {
    try {
      setLoading(true);

      // If we have a sessionId, try to find the specific room
      // Otherwise, get the user's persistent room
      const endpoint = sessionId ? '/api/rooms' : '/api/my-room';
      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error('Failed to fetch queue data');
      }

      const data = await response.json();

      if (sessionId) {
        // Find our room from all rooms
        const ourRoom = data.rooms.find(room => room.roomId === sessionId);
        setQueueData(ourRoom || null);
      } else {
        // Use the user's persistent room
        setQueueData(data.room);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      default: return '❓';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ffc107';
      case 'downloading': return '#007bff';
      case 'success': return '#28a745';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const getOverallProgress = () => {
    if (!queueData || queueData.totalRoms === 0) return 0;
    return Math.round(((queueData.completedRoms + queueData.failedRoms) / queueData.totalRoms) * 100);
  };

  const getCompletedDownloads = () => {
    return completedDownloads;
  };

  const handleOrganizeDownloads = () => {
    setShowOrganizer(true);
  };

  if (loading) {
    return (
      <div className="download-queue-container">
        <div className="queue-header">
          <h2>📋 Your Download Queue</h2>
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
          <h2>📋 Your Download Queue</h2>
        </div>
        <div className="error-state">
          <p>❌ Error: {error}</p>
          <button onClick={fetchQueueData} className="retry-button">
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
          <h2>📋 Your Download Queue</h2>
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
        <h2>📋 Your Download Queue</h2>
        <div className="queue-stats">
          <div className="stat">
            <span className="stat-value">{queueData.totalRoms}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat success">
            <span className="stat-value">{queueData.completedRoms}</span>
            <span className="stat-label">✅ Done</span>
          </div>
          <div className="stat error">
            <span className="stat-value">{queueData.failedRoms}</span>
            <span className="stat-label">❌ Failed</span>
          </div>
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
          {getOverallProgress()}% Complete ({queueData.completedRoms + queueData.failedRoms} / {queueData.totalRoms})
        </div>
      </div>

      <div className="queue-status">
        <div className="status-item">
          <span className="status-label">Status:</span>
          <span className={`status-value ${queueData.status}`}>
            {queueData.status.toUpperCase()}
          </span>
        </div>
        {queueData.currentRom && (
          <div className="current-download">
            <span className="current-label">Currently downloading:</span>
            <span className="current-rom">📥 {queueData.currentRom}</span>
          </div>
        )}
      </div>

      <div className="queue-list">
        <h3>Download Items</h3>
        <div className="rom-list">
          {queueData.roms.map((rom, index) => (
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
              </div>
            </div>
          ))}
        </div>
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
          <span className="info-value">{queueData.roomId.substring(0, 12)}...</span>
        </div>
        <div className="info-item">
          <span className="info-label">Last Activity:</span>
          <span className="info-value">{formatTime(queueData.lastActivity)}</span>
        </div>
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
