import React from 'react';
import { useApp } from '../../context/AppContext';

export function UserInfoSection() {
  const { state } = useApp();
  
  return (
    <div className="user-info-section">
      {/* Current Settings Display */}
      <div className="current-settings" style={{
        background: '#f8f9fa',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '15px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#495057' }}>
          Safety Requirements
        </div>
        <div style={{ fontSize: '13px', color: '#6c757d' }}>
          Required Distance: <strong>{state.processing.bufferDistance} meters from restricted areas</strong>
        </div>
      </div>

      {/* Information About POIs */}
      <div className="poi-info" style={{
        background: '#e7f3ff',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '15px',
        border: '1px solid #b3d9ff'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#0056b3' }}>
          🏢 Where Cannabis Clubs Cannot Be Located
        </div>
        <div style={{ fontSize: '13px', color: '#0056b3', lineHeight: '1.4' }}>
          Cannabis clubs must keep a safe distance from:
        </div>
        <ul style={{ 
          fontSize: '12px', 
          color: '#0056b3', 
          margin: '6px 0 0 0', 
          paddingLeft: '16px',
          lineHeight: '1.3'
        }}>
          <li>🏫 Schools & Kindergartens</li>
          <li>🎮 Playgrounds</li>
          <li>🏛️ Community Centers</li>
          <li>⚽ Sports Centers</li>
        </ul>
      </div>

      {/* Instructions */}
      <div className="instructions" style={{
        background: '#fff3cd',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '15px',
        border: '1px solid #ffeaa7'
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#856404' }}>
          📋 How to Find Suitable Locations
        </div>
        <div style={{ fontSize: '13px', color: '#856404', lineHeight: '1.4' }}>
          1. Zoom in close to your area of interest<br/>
          2. Suitable locations will automatically appear<br/>
          3. <span style={{ color: '#28a745' }}>■</span> Green areas are where clubs can be located<br/>
          4. <span style={{ color: '#dc3545' }}>■</span> Red areas are too close to restricted locations
        </div>
      </div>
    </div>
  );
}