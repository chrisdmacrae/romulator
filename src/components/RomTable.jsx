import React, { useState, useMemo, useEffect } from 'react';
import './RomTable.css';

const RomTable = ({ roms, selectedRoms, onSelectionChange, onStartDownload, onReset, loading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectAll, setSelectAll] = useState(false);
  const [selectedRuleset, setSelectedRuleset] = useState('');
  const [availableRulesets, setAvailableRulesets] = useState([]);
  const [showRulesetPopup, setShowRulesetPopup] = useState(false);

  // Fetch available rulesets on component mount
  useEffect(() => {
    const fetchRulesets = async () => {
      try {
        const response = await fetch('/api/rulesets');
        if (response.ok) {
          const data = await response.json();
          setAvailableRulesets(data.rulesets || []);
        }
      } catch (error) {
        console.error('Failed to fetch rulesets:', error);
      }
    };

    fetchRulesets();
  }, []);

  // Filter and sort ROMs
  const filteredAndSortedRoms = useMemo(() => {
    let filtered = roms;

    // Apply search filter
    if (searchTerm) {
      filtered = roms.filter(rom =>
        rom.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      // Handle size sorting (convert to bytes for proper comparison)
      if (sortField === 'size') {
        aValue = parseSizeToBytes(a.size);
        bValue = parseSizeToBytes(b.size);
      }

      // Handle date sorting
      if (sortField === 'date') {
        aValue = new Date(a.date);
        bValue = new Date(b.date);
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [roms, searchTerm, sortField, sortDirection]);

  const parseSizeToBytes = (sizeStr) => {
    const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
    const match = sizeStr.match(/^([\d.]+)\s*([A-Z]+)$/);
    if (!match) return 0;
    return parseFloat(match[1]) * (units[match[2]] || 1);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRomToggle = (rom) => {
    const isSelected = selectedRoms.some(selected => selected.name === rom.name);
    let newSelection;

    if (isSelected) {
      newSelection = selectedRoms.filter(selected => selected.name !== rom.name);
    } else {
      newSelection = [...selectedRoms, rom];
    }

    onSelectionChange(newSelection);
    setSelectAll(newSelection.length === filteredAndSortedRoms.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      onSelectionChange([]);
      setSelectAll(false);
    } else {
      onSelectionChange([...filteredAndSortedRoms]);
      setSelectAll(true);
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleDownloadClick = () => {
    setShowRulesetPopup(true);
  };

  const handleConfirmDownload = () => {
    onStartDownload(selectedRuleset);
    setShowRulesetPopup(false);
  };

  const handleCancelDownload = () => {
    setShowRulesetPopup(false);
  };

  return (
    <div className="rom-table-container">
      <div className="table-header">
        <div className="header-top">
          <h2>📋 ROM Collection ({filteredAndSortedRoms.length} ROMs)</h2>
          <div className="header-actions">
            <button onClick={onReset} className="reset-button">
              ← Back to Browse
            </button>
          </div>
        </div>

        <div className="table-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="🔍 Search ROMs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="selection-info">
            <span className="selected-count">
              {selectedRoms.length} selected
            </span>
            <div className="selection-actions">
              <button
                onClick={handleSelectAll}
                className="select-all-button"
                disabled={filteredAndSortedRoms.length === 0}
              >
                {selectAll ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleDownloadClick}
                disabled={selectedRoms.length === 0 || loading}
                className="download-button-inline"
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Starting...
                  </>
                ) : (
                  <>
                    ⬇️ Download ROMs
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="rom-table">
          <thead>
            <tr>
              <th className="checkbox-column">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  disabled={filteredAndSortedRoms.length === 0}
                />
              </th>
              <th 
                className="sortable-header"
                onClick={() => handleSort('name')}
              >
                ROM Name {getSortIcon('name')}
              </th>
              <th 
                className="sortable-header size-column"
                onClick={() => handleSort('size')}
              >
                Size {getSortIcon('size')}
              </th>
              <th 
                className="sortable-header date-column"
                onClick={() => handleSort('date')}
              >
                Date {getSortIcon('date')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRoms.map((rom, index) => {
              const isSelected = selectedRoms.some(selected => selected.name === rom.name);
              return (
                <tr 
                  key={index} 
                  className={isSelected ? 'selected' : ''}
                  onClick={() => handleRomToggle(rom)}
                >
                  <td className="checkbox-column">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleRomToggle(rom)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="rom-name">{rom.name}</td>
                  <td className="rom-size">{rom.size}</td>
                  <td className="rom-date">{rom.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredAndSortedRoms.length === 0 && (
          <div className="empty-state">
            {searchTerm ? (
              <p>No ROMs found matching "{searchTerm}"</p>
            ) : (
              <p>No ROMs available</p>
            )}
          </div>
        )}
      </div>

      {/* Ruleset Selection Popup */}
      {showRulesetPopup && (
        <div className="popup-overlay" onClick={handleCancelDownload}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>📦 Download Options</h3>
              <button className="popup-close" onClick={handleCancelDownload}>×</button>
            </div>

            <div className="popup-body">
              <p>You're about to download <strong>{selectedRoms.length} ROM{selectedRoms.length !== 1 ? 's' : ''}</strong></p>

              <div className="ruleset-selection">
                <label htmlFor="ruleset-select">
                  Apply Ruleset (Optional):
                </label>
                <select
                  id="ruleset-select"
                  value={selectedRuleset}
                  onChange={(e) => setSelectedRuleset(e.target.value)}
                  className="ruleset-select"
                >
                  <option value="">No ruleset - download only</option>
                  {availableRulesets.map((ruleset) => (
                    <option key={ruleset.name} value={ruleset.name}>
                      {ruleset.name} - {ruleset.extract ? 'Extract & ' : ''}Move to {ruleset.move}
                    </option>
                  ))}
                </select>
                {selectedRuleset && (
                  <p className="ruleset-description">
                    This will {availableRulesets.find(r => r.name === selectedRuleset)?.extract ? 'extract and ' : ''}
                    move files to: <strong>{availableRulesets.find(r => r.name === selectedRuleset)?.move}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="popup-footer">
              <button onClick={handleCancelDownload} className="cancel-button">
                Cancel
              </button>
              <button onClick={handleConfirmDownload} className="confirm-button" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Starting Download...
                  </>
                ) : (
                  <>
                    ⬇️ Start Download
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RomTable;
