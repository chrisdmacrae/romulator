import React from 'react';
import './DownloadProgress.css';

const DownloadProgress = ({ progress, results, selectedRoms, onReset }) => {
  const { current, total, currentRom, status } = progress;
  const progressPercentage = total > 0 ? (current / total) * 100 : 0;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'downloading': return '⬇️';
      default: return '⏳';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'downloading':
        return `Downloading ${currentRom}...`;
      case 'complete':
        return 'Download complete!';
      default:
        return 'Preparing download...';
    }
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="download-progress-container">
      <div className="progress-header">
        <h2>📥 Download Progress</h2>
        <div className="progress-stats">
          <span className="stat">
            <span className="stat-value">{current}</span>
            <span className="stat-label">/ {total}</span>
          </span>
          <span className="stat success">
            <span className="stat-value">{successCount}</span>
            <span className="stat-label">✅ Success</span>
          </span>
          <span className="stat error">
            <span className="stat-value">{errorCount}</span>
            <span className="stat-label">❌ Failed</span>
          </span>
        </div>
      </div>

      <div className="progress-section">
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className="progress-text">
            {Math.round(progressPercentage)}% - {getStatusText()}
          </div>
        </div>
      </div>

      <div className="download-results">
        <h3>Download Results</h3>
        <div className="results-list">
          {selectedRoms.map((rom, index) => {
            const result = results.find(r => r.rom === rom.name);
            const isCurrentlyDownloading = currentRom === rom.name && status === 'downloading';
            const isCompleted = result !== undefined;
            const isPending = !isCompleted && !isCurrentlyDownloading;

            return (
              <div 
                key={index} 
                className={`result-item ${isCompleted ? result.status : isPending ? 'pending' : 'downloading'}`}
              >
                <div className="result-icon">
                  {isCurrentlyDownloading ? (
                    <span className="spinner-small"></span>
                  ) : isCompleted ? (
                    getStatusIcon(result.status)
                  ) : (
                    '⏳'
                  )}
                </div>
                <div className="result-content">
                  <div className="result-name">{rom.name}</div>
                  {result && result.status === 'error' && (
                    <div className="result-error">{result.error}</div>
                  )}
                  {isCurrentlyDownloading && (
                    <div className="result-status">Downloading...</div>
                  )}
                  {isPending && (
                    <div className="result-status">Waiting...</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {status === 'complete' && (
        <div className="completion-section">
          <div className="completion-message">
            <h3>🎉 Download Complete!</h3>
            <p>
              Successfully downloaded {successCount} out of {total} ROMs
              {errorCount > 0 && ` (${errorCount} failed)`}
            </p>
          </div>
          <div className="completion-actions">
            <button onClick={onReset} className="new-download-button">
              🔄 Start New Download
            </button>
          </div>
        </div>
      )}

      {status !== 'complete' && (
        <div className="download-actions">
          <button onClick={onReset} className="cancel-button">
            ❌ Cancel Download
          </button>
        </div>
      )}
    </div>
  );
};

export default DownloadProgress;
