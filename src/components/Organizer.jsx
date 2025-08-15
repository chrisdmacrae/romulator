import React, { useState, useEffect } from 'react';
import './Organizer.css';

const Organizer = ({ completedDownloads, onClose }) => {
  const [rulesets, setRulesets] = useState([]);
  const [selectedRuleset, setSelectedRuleset] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRulesets();
  }, []);

  const fetchRulesets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/rulesets');
      if (!response.ok) {
        throw new Error('Failed to fetch rulesets');
      }
      const data = await response.json();
      setRulesets(data.rulesets);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileToggle = (filePath) => {
    setSelectedFiles(prev => {
      if (prev.includes(filePath)) {
        return prev.filter(f => f !== filePath);
      } else {
        return [...prev, filePath];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === completedDownloads.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(completedDownloads.map(d => d.filePath));
    }
  };

  const handleOrganize = async () => {
    if (!selectedRuleset || selectedFiles.length === 0) {
      setError('Please select a ruleset and at least one file');
      return;
    }

    try {
      setOrganizing(true);
      setError(null);
      
      const response = await fetch('/api/organize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rulesetName: selectedRuleset,
          filePaths: selectedFiles
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to organize files');
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setOrganizing(false);
    }
  };

  const getFileSize = (filePath) => {
    const download = completedDownloads.find(d => d.filePath === filePath);
    return download ? download.size : 'Unknown';
  };

  const getFileName = (filePath) => {
    return filePath.split('/').pop() || filePath;
  };

  if (loading) {
    return (
      <div className="organizer-overlay">
        <div className="organizer-modal">
          <div className="organizer-header">
            <h3>📦 Organize Downloads</h3>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading rulesets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (results) {
    return (
      <div className="organizer-overlay">
        <div className="organizer-modal">
          <div className="organizer-header">
            <h3>📦 Organization Results</h3>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="results-content">
            <div className="results-summary">
              <h4>Organization Complete!</h4>
              <p>Processed {results.length} file(s) with ruleset "{selectedRuleset}"</p>
            </div>

            <div className="results-list">
              {results.map((result, index) => (
                <div key={index} className={`result-item ${result.errors.length > 0 ? 'error' : 'success'}`}>
                  <div className="result-header">
                    <span className="result-icon">
                      {result.errors.length > 0 ? '❌' : '✅'}
                    </span>
                    <span className="result-file">{getFileName(result.originalFile)}</span>
                  </div>
                  
                  {result.errors.length > 0 ? (
                    <div className="result-errors">
                      {result.errors.map((error, i) => (
                        <div key={i} className="error-message">{error}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="result-details">
                      {result.extractedFiles.length > 0 && (
                        <div className="result-section">
                          <strong>Extracted:</strong> {result.extractedFiles.length} file(s)
                        </div>
                      )}
                      {result.movedFiles.length > 0 && (
                        <div className="result-section">
                          <strong>Moved:</strong>
                          {result.movedFiles.map((file, i) => (
                            <div key={i} className="moved-file">{file}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="results-actions">
              <button onClick={onClose} className="close-results-button">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="organizer-overlay">
      <div className="organizer-modal">
        <div className="organizer-header">
          <h3>📦 Organize Downloads</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="error-message">
            <span>❌ {error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="organizer-content">
          <div className="ruleset-selection">
            <h4>Select Organization Ruleset</h4>
            {rulesets.length === 0 ? (
              <div className="no-rulesets">
                <p>No rulesets available. Create rulesets in Settings first.</p>
              </div>
            ) : (
              <select 
                value={selectedRuleset} 
                onChange={(e) => setSelectedRuleset(e.target.value)}
                className="ruleset-select"
              >
                <option value="">Choose a ruleset...</option>
                {rulesets.map((ruleset) => (
                  <option key={ruleset.name} value={ruleset.name}>
                    {ruleset.name} - {ruleset.extract ? 'Extract' : 'No extract'}
                    {ruleset.move && ` → ${ruleset.move}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="file-selection">
            <div className="file-selection-header">
              <h4>Select Files to Organize</h4>
              <button 
                onClick={handleSelectAll}
                className="select-all-button"
                disabled={completedDownloads.length === 0}
              >
                {selectedFiles.length === completedDownloads.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {completedDownloads.length === 0 ? (
              <div className="no-files">
                <p>No completed downloads available to organize.</p>
              </div>
            ) : (
              <div className="files-list">
                {completedDownloads.map((download, index) => (
                  <div 
                    key={index} 
                    className={`file-item ${selectedFiles.includes(download.filePath) ? 'selected' : ''}`}
                    onClick={() => handleFileToggle(download.filePath)}
                  >
                    <div className="file-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(download.filePath)}
                        onChange={() => handleFileToggle(download.filePath)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="file-details">
                      <div className="file-name">{getFileName(download.filePath)}</div>
                      <div className="file-info">
                        <span className="file-size">{download.size}</span>
                        <span className="file-path">{download.filePath}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="organizer-actions">
            <button onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button 
              onClick={handleOrganize}
              disabled={!selectedRuleset || selectedFiles.length === 0 || organizing}
              className="organize-button"
            >
              {organizing ? (
                <>
                  <span className="spinner-small"></span>
                  Organizing...
                </>
              ) : (
                <>
                  📦 Organize {selectedFiles.length} File{selectedFiles.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Organizer;
