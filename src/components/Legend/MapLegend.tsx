import React from 'react';

export function MapLegend() {
  return (
    <div className="legend">
      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Legend</h4>
      <div className="legend-item">
        <div 
          className="legend-color" 
          style={{ background: 'rgba(255, 0, 0, 0.3)' }}
        />
        <span>Restricted Areas (Buffer Zones)</span>
      </div>
      <div className="legend-item">
        <div 
          className="legend-color" 
          style={{ background: 'rgba(0, 255, 0, 0.3)' }}
        />
        <span>Eligible Areas</span>
      </div>
      <div className="legend-item">
        <div 
          className="legend-color" 
          style={{ background: '#3388ff' }}
        />
        <span>Sensitive Locations</span>
      </div>
    </div>
  );
}