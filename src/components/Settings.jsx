import React, { useState, useEffect } from 'react';
import './Settings.css';

const Settings = () => {
  const [rulesets, setRulesets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRuleset, setEditingRuleset] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    extract: true,
    move: '',
    rename: ''
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingRuleset 
        ? `/api/rulesets/${editingRuleset.name}`
        : '/api/rulesets';
      
      const method = editingRuleset ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save ruleset');
      }

      await fetchRulesets();
      resetForm();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (ruleset) => {
    setEditingRuleset(ruleset);
    setFormData({
      name: ruleset.name,
      extract: ruleset.extract,
      move: ruleset.move || '',
      rename: ruleset.rename || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (name) => {
    if (!confirm(`Are you sure you want to delete the ruleset "${name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/rulesets/${name}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete ruleset');
      }

      await fetchRulesets();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      extract: true,
      move: '',
      rename: ''
    });
    setEditingRuleset(null);
    setShowForm(false);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h2>⚙️ Settings</h2>
        <p className="settings-subtitle">
          Manage ROM organization rulesets
        </p>
      </div>

      {error && (
        <div className="error-message">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="settings-content">
        <div className="rulesets-section">
          <div className="section-header">
            <h3>📋 Organization Rulesets</h3>
            <button 
              className="add-button"
              onClick={() => setShowForm(true)}
            >
              ➕ Add Ruleset
            </button>
          </div>

          {rulesets.length === 0 ? (
            <div className="empty-state">
              <p>No rulesets configured</p>
              <p>Create your first ruleset to automatically organize downloaded ROMs</p>
            </div>
          ) : (
            <div className="rulesets-grid">
              {rulesets.map((ruleset) => (
                <div key={ruleset.name} className="ruleset-card">
                  <div className="ruleset-header">
                    <h4>{ruleset.name}</h4>
                    <div className="ruleset-actions">
                      <button 
                        className="edit-button"
                        onClick={() => handleEdit(ruleset)}
                      >
                        ✏️
                      </button>
                      <button 
                        className="delete-button"
                        onClick={() => handleDelete(ruleset.name)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <div className="ruleset-details">
                    <div className="detail-item">
                      <span className="detail-label">Extract:</span>
                      <span className={`detail-value ${ruleset.extract ? 'enabled' : 'disabled'}`}>
                        {ruleset.extract ? '✅ Yes' : '❌ No'}
                      </span>
                    </div>
                    
                    {ruleset.move && (
                      <div className="detail-item">
                        <span className="detail-label">Move to:</span>
                        <span className="detail-value path">{ruleset.move}</span>
                      </div>
                    )}
                    
                    {ruleset.rename && (
                      <div className="detail-item">
                        <span className="detail-label">Rename:</span>
                        <span className="detail-value template">{ruleset.rename}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <div className="form-overlay">
            <div className="form-modal">
              <div className="form-header">
                <h3>
                  {editingRuleset ? '✏️ Edit Ruleset' : '➕ Add Ruleset'}
                </h3>
                <button 
                  className="close-button"
                  onClick={resetForm}
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="ruleset-form">
                <div className="form-group">
                  <label htmlFor="name">Ruleset Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., n64, psx, gba"
                    required
                  />
                  <small>A unique name to identify this ruleset</small>
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="extract"
                      checked={formData.extract}
                      onChange={handleInputChange}
                    />
                    <span className="checkmark"></span>
                    Extract archives (ZIP files)
                  </label>
                  <small>Automatically extract ZIP files before processing</small>
                </div>

                <div className="form-group">
                  <label htmlFor="move">Move to Directory</label>
                  <input
                    type="text"
                    id="move"
                    name="move"
                    value={formData.move}
                    onChange={handleInputChange}
                    placeholder="e.g., ./organized/n64 or /path/to/roms"
                  />
                  <small>Directory where organized files will be moved (optional)</small>
                </div>

                <div className="form-group">
                  <label htmlFor="rename">Rename Template</label>
                  <input
                    type="text"
                    id="rename"
                    name="rename"
                    value={formData.rename}
                    onChange={handleInputChange}
                    placeholder="e.g., {name}.z64 or {name}.bin"
                  />
                  <small>Template for renaming files. Use {'{name}'} for the ROM name (optional)</small>
                </div>

                <div className="form-actions">
                  <button type="button" onClick={resetForm} className="cancel-button">
                    Cancel
                  </button>
                  <button type="submit" className="save-button">
                    {editingRuleset ? 'Update' : 'Create'} Ruleset
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
