import React, { useState, useMemo } from 'react';
import './RomTable.css';

const RomTable = ({ roms, selectedRoms, onSelectionChange, onStartDownload, onReset, loading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectAll, setSelectAll] = useState(false);

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

  return (
    <div className="rom-table-container">
      <div className="table-header">
        <div className="header-top">
          <h2>📋 ROM Collection ({filteredAndSortedRoms.length} ROMs)</h2>
          <div className="header-actions">
            <button onClick={onReset} className="reset-button">
              ← Back to URL
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
            <button
              onClick={handleSelectAll}
              className="select-all-button"
              disabled={filteredAndSortedRoms.length === 0}
            >
              {selectAll ? 'Deselect All' : 'Select All'}
            </button>
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

      <div className="download-section">
        <button
          onClick={onStartDownload}
          disabled={selectedRoms.length === 0 || loading}
          className="download-button"
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Starting Download...
            </>
          ) : (
            <>
              ⬇️ Download {selectedRoms.length} ROM{selectedRoms.length !== 1 ? 's' : ''}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default RomTable;
