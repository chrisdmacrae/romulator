import React, { useState } from 'react';
import './UrlInput.css';

const UrlInput = ({ onSubmit, loading, defaultUrl }) => {
  const [url, setUrl] = useState(defaultUrl || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <div className="url-input-container">
      <div className="search-box">
        <h2>Enter ROM Archive URL</h2>
        <p className="subtitle">
          Enter the URL of a ROM archive page to browse and download ROMs
        </p>
        
        <form onSubmit={handleSubmit} className="url-form">
          <div className="input-group">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://myrient.erista.me/files/No-Intro/"
              className="url-input"
              disabled={loading}
              required
            />
            <button 
              type="submit" 
              className="submit-button"
              disabled={loading || !url.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Scraping...
                </>
              ) : (
                <>
                  🔍 Browse ROMs
                </>
              )}
            </button>
          </div>
        </form>

        <div className="suggestions">
          <h3>Popular ROM Archives:</h3>
          <div className="suggestion-buttons">
            <button 
              className="suggestion-button"
              onClick={() => setUrl('https://myrient.erista.me/files/No-Intro/')}
              disabled={loading}
            >
              No-Intro Collection
            </button>
            <button 
              className="suggestion-button"
              onClick={() => setUrl('https://myrient.erista.me/files/Redump/')}
              disabled={loading}
            >
              Redump Collection
            </button>
            <button 
              className="suggestion-button"
              onClick={() => setUrl('https://myrient.erista.me/files/TOSEC/')}
              disabled={loading}
            >
              TOSEC Collection
            </button>
          </div>
        </div>

        <div className="info-box">
          <h4>ℹ️ How it works:</h4>
          <ol>
            <li>Enter a ROM archive URL (like Myrient)</li>
            <li>Browse and select ROMs from the list</li>
            <li>Download selected ROMs with progress tracking</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default UrlInput;
