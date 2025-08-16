import React, { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import './DirectoryBrowser.css';

const DirectoryBrowser = ({ onRomsSelected, onBack }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [directories, setDirectories] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [directorySearchTerm, setDirectorySearchTerm] = useState('');
  const [fileSearchTerm, setFileSearchTerm] = useState('');

  // Fuzzy search configuration
  const directoryFuse = useMemo(() => {
    return new Fuse(directories, {
      keys: ['name'],
      threshold: 0.3,
      includeScore: true,
      minMatchCharLength: 1
    });
  }, [directories]);

  const fileFuse = useMemo(() => {
    return new Fuse(files, {
      keys: ['name'],
      threshold: 0.3,
      includeScore: true,
      minMatchCharLength: 1
    });
  }, [files]);

  // Filtered results based on search
  const filteredDirectories = useMemo(() => {
    if (!directorySearchTerm.trim()) return directories;
    return directoryFuse.search(directorySearchTerm).map(result => result.item);
  }, [directories, directorySearchTerm, directoryFuse]);

  const filteredFiles = useMemo(() => {
    if (!fileSearchTerm.trim()) return files;
    return fileFuse.search(fileSearchTerm).map(result => result.item);
  }, [files, fileSearchTerm, fileFuse]);

  // Start at the root directory
  useEffect(() => {
    loadDirectory('');
  }, []);

  const loadDirectory = async (path) => {
    setLoading(true);
    setError(null);
    setSelectedFiles([]);
    setDirectorySearchTerm('');
    setFileSearchTerm('');

    try {
      const response = await fetch('http://localhost:3001/api/browse-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error('Failed to load directory');
      }

      const data = await response.json();
      setCurrentPath(path);
      setDirectories(data.directories || []);
      setFiles(data.files || []);
      
      // Update breadcrumbs
      const pathParts = path ? path.split('/').filter(Boolean) : [];
      const newBreadcrumbs = [
        { name: 'Myrient', path: '' }
      ];
      
      let currentBreadcrumbPath = '';
      pathParts.forEach(part => {
        currentBreadcrumbPath += (currentBreadcrumbPath ? '/' : '') + part;
        newBreadcrumbs.push({
          name: decodeURIComponent(part),
          path: currentBreadcrumbPath
        });
      });
      
      setBreadcrumbs(newBreadcrumbs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectoryClick = (directory) => {
    const newPath = currentPath ? `${currentPath}/${directory.name}` : directory.name;
    loadDirectory(newPath);
  };

  const handleBreadcrumbClick = (breadcrumb) => {
    loadDirectory(breadcrumb.path);
  };

  const handleFileSelect = (file) => {
    setSelectedFiles(prev => {
      const isSelected = prev.some(f => f.name === file.name);
      if (isSelected) {
        return prev.filter(f => f.name !== file.name);
      } else {
        return [...prev, file];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles([...filteredFiles]);
    }
  };

  const handleDownloadSelected = () => {
    if (selectedFiles.length === 0) return;

    console.log('🎮 DirectoryBrowser: Starting download for', selectedFiles.length, 'files');

    // Convert selected files to the format expected by the download system
    const romsToDownload = selectedFiles.map(file => ({
      name: file.name,
      size: file.size,
      url: file.url
    }));

    console.log('📦 DirectoryBrowser: Converted ROMs:', romsToDownload);
    console.log('🔄 DirectoryBrowser: Calling onRomsSelected...');

    onRomsSelected(romsToDownload);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  if (loading) {
    return (
      <div className="directory-browser">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading directory...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="directory-browser">
        <div className="error-container">
          <h3>Error Loading Directory</h3>
          <p>{error}</p>
          <button onClick={() => loadDirectory(currentPath)} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="directory-browser">
      <div className="browser-header sticky-header">
        <div className="breadcrumbs">
          {breadcrumbs.map((breadcrumb, index) => (
            <span key={index} className="breadcrumb">
              {index > 0 && <span className="breadcrumb-separator">/</span>}
              <button
                onClick={() => handleBreadcrumbClick(breadcrumb)}
                className={`breadcrumb-link ${index === breadcrumbs.length - 1 ? 'current' : ''}`}
              >
                {breadcrumb.name}
              </button>
            </span>
          ))}
        </div>
      </div>

      {directories.length > 0 && (
        <div className="directories-section">
          <div className="section-header sticky-section-header">
            <h3>📁 Directories ({directories.length})</h3>
            <div className="search-container">
              <input
                type="text"
                placeholder="Search directories..."
                value={directorySearchTerm}
                onChange={(e) => setDirectorySearchTerm(e.target.value)}
                className="search-input"
              />
              {directorySearchTerm && (
                <button
                  onClick={() => setDirectorySearchTerm('')}
                  className="clear-search-button"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div className="directories-grid">
            {filteredDirectories.map((directory, index) => (
              <button
                key={index}
                onClick={() => handleDirectoryClick(directory)}
                className="directory-item"
              >
                <span className="directory-icon">📁</span>
                <span className="directory-name">{directory.name}</span>
              </button>
            ))}
          </div>
          {directorySearchTerm && filteredDirectories.length === 0 && (
            <div className="no-results">
              No directories found matching "{directorySearchTerm}"
            </div>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="files-section">
          <div className="files-header sticky-section-header">
            <div className="files-header-row">
              <div className="files-title-info">
                <h3>🎮 ROM Files</h3>
                <span className="files-count">{filteredFiles.length} of {files.length} files</span>
                {selectedFiles.length > 0 && (
                  <span className="selected-count">
                    {selectedFiles.length} selected
                  </span>
                )}
              </div>

              <div className="files-actions">
                <div className="search-container">
                  <input
                    type="text"
                    placeholder="Search ROM files..."
                    value={fileSearchTerm}
                    onChange={(e) => setFileSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  {fileSearchTerm && (
                    <button
                      onClick={() => setFileSearchTerm('')}
                      className="clear-search-button"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="control-buttons">
                  <button
                    onClick={handleSelectAll}
                    className="select-all-button"
                  >
                    {selectedFiles.length === filteredFiles.length && filteredFiles.length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedFiles.length > 0 && (
                    <button
                      onClick={handleDownloadSelected}
                      className="download-selected-button"
                    >
                      <span className="download-icon">⬇️</span>
                      Download {selectedFiles.length} ROM{selectedFiles.length !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="files-grid">
            {filteredFiles.map((file, index) => (
              <div
                key={index}
                className={`file-card ${selectedFiles.some(f => f.name === file.name) ? 'selected' : ''}`}
                onClick={() => handleFileSelect(file)}
              >
                <div className="file-card-header">
                  <div className="file-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedFiles.some(f => f.name === file.name)}
                      onChange={() => handleFileSelect(file)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="file-icon">🎮</div>
                </div>
                <div className="file-card-content">
                  <div className="file-name" title={file.name}>{file.name}</div>
                  <div className="file-meta">
                    <span className="file-size">{formatFileSize(file.size)}</span>
                    {file.date && <span className="file-date">{file.date}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {fileSearchTerm && filteredFiles.length === 0 && (
            <div className="no-results">
              <div className="no-results-icon">🔍</div>
              <h4>No ROM files found</h4>
              <p>No files match "{fileSearchTerm}"</p>
              <button onClick={() => setFileSearchTerm('')} className="clear-search-button-large">
                Clear Search
              </button>
            </div>
          )}
        </div>
      )}

      {directories.length === 0 && files.length === 0 && (
        <div className="empty-directory">
          <p>This directory is empty.</p>
        </div>
      )}
    </div>
  );
};

export default DirectoryBrowser;
