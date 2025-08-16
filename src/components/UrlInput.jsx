import React, { useState } from 'react';
import './UrlInput.css';

const UrlInput = ({ onSubmit, loading }) => {
  const [expandedArchive, setExpandedArchive] = useState(null);
  const [archiveCategories, setArchiveCategories] = useState({});
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryFilters, setCategoryFilters] = useState({});

  // Archive configurations
  const archives = [
    {
      id: 'no-intro',
      name: 'No-Intro Collection',
      baseUrl: 'https://myrient.erista.me/files/No-Intro/',
      description: 'Verified ROM dumps with accurate checksums'
    },
    {
      id: 'redump',
      name: 'Redump Collection',
      baseUrl: 'https://myrient.erista.me/files/Redump/',
      description: 'Disc-based games and systems'
    },
    {
      id: 'tosec',
      name: 'TOSEC Collection',
      baseUrl: 'https://myrient.erista.me/files/TOSEC/',
      description: 'The Old School Emulation Center'
    }
  ];

  const fetchArchiveCategories = async (archive) => {
    if (archiveCategories[archive.id]) {
      return; // Already fetched
    }

    setLoadingCategories(true);
    try {
      const response = await fetch('/api/scrape-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: archive.baseUrl }),
      });

      if (response.ok) {
        const data = await response.json();
        setArchiveCategories(prev => ({
          ...prev,
          [archive.id]: data.categories || []
        }));
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleArchiveToggle = (archive) => {
    if (expandedArchive === archive.id) {
      setExpandedArchive(null);
    } else {
      setExpandedArchive(archive.id);
      fetchArchiveCategories(archive);
    }
  };

  const handleCategoryClick = (categoryUrl) => {
    onSubmit(categoryUrl);
  };

  const handleFilterChange = (archiveId, filterValue) => {
    setCategoryFilters(prev => ({
      ...prev,
      [archiveId]: filterValue
    }));
  };

  const getFilteredCategories = (archiveId) => {
    const categories = archiveCategories[archiveId] || [];
    const filter = categoryFilters[archiveId] || '';

    if (!filter.trim()) {
      return categories;
    }

    return categories.filter(category =>
      category.name.toLowerCase().includes(filter.toLowerCase())
    );
  };

  return (
    <div className="url-input-container">
      <div className="browse-header">
        <h2>📁 Browse ROM Archives</h2>
        <p className="browse-subtitle">
          Choose a ROM archive and category to browse and download ROMs
        </p>
      </div>

      <div className="search-box">
        


        <div className="suggestions">
          <h3>Popular ROM Archives:</h3>
          <div className="archive-list">
            {archives.map((archive) => (
              <div key={archive.id} className="archive-item">
                <div className="archive-header">
                  <button
                    className="archive-button"
                    onClick={() => handleArchiveToggle(archive)}
                    disabled={loading || loadingCategories}
                  >
                    <span className="archive-name">{archive.name}</span>
                    <span className="expand-icon">
                      {expandedArchive === archive.id ? '▼' : '▶'}
                    </span>
                  </button>
                </div>
                <p className="archive-description">{archive.description}</p>

                {expandedArchive === archive.id && (
                  <div className="categories-section">
                    {loadingCategories ? (
                      <div className="loading-categories">
                        <span className="spinner"></span>
                        Loading categories...
                      </div>
                    ) : archiveCategories[archive.id] ? (
                      <>
                        <div className="filter-section">
                          <input
                            type="text"
                            placeholder={`Filter ${archive.name} categories...`}
                            value={categoryFilters[archive.id] || ''}
                            onChange={(e) => handleFilterChange(archive.id, e.target.value)}
                            className="category-filter"
                            disabled={loading}
                          />
                        </div>
                        <div className="categories-grid">
                          {getFilteredCategories(archive.id).map((category, index) => (
                            <button
                              key={index}
                              className="category-button"
                              onClick={() => handleCategoryClick(category.url)}
                              disabled={loading}
                              title={category.name}
                            >
                              {category.name}
                            </button>
                          ))}
                        </div>
                        <div className="filter-info">
                          {(() => {
                            const filtered = getFilteredCategories(archive.id);
                            const total = archiveCategories[archive.id].length;
                            return `Showing ${filtered.length} of ${total} categories`;
                          })()}
                        </div>
                        {getFilteredCategories(archive.id).length === 0 && categoryFilters[archive.id] && (
                          <div className="no-results">
                            No categories found matching "{categoryFilters[archive.id]}"
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="categories-error">
                        Failed to load categories. Try again.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UrlInput;
