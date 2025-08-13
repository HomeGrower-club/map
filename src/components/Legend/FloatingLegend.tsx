import React from 'react';

export function FloatingLegend() {
  return (
    <div 
      className="floating-legend"
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(5px)',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        fontSize: '12px',
        zIndex: 1000,
        minWidth: '180px'
      }}
    >
      <div style={{ 
        fontSize: '13px', 
        fontWeight: '600', 
        marginBottom: '8px', 
        color: '#333',
        borderBottom: '1px solid #eee',
        paddingBottom: '6px'
      }}>
        Legend
      </div>
      
      <div className="legend-item" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '6px' 
      }}>
        <div 
          className="legend-color" 
          style={{ 
            width: '16px',
            height: '16px',
            background: 'rgba(220, 53, 69, 0.4)',
            border: '1px solid rgba(220, 53, 69, 0.6)',
            borderRadius: '3px',
            marginRight: '8px'
          }}
        />
        <span style={{ color: '#333', fontSize: '12px' }}>Restricted Areas</span>
      </div>
      
      <div className="legend-item" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '6px' 
      }}>
        <div 
          className="legend-color" 
          style={{ 
            width: '16px',
            height: '16px',
            background: 'rgba(40, 167, 69, 0.4)',
            border: '1px solid rgba(40, 167, 69, 0.6)',
            borderRadius: '3px',
            marginRight: '8px'
          }}
        />
        <span style={{ color: '#333', fontSize: '12px' }}>Eligible Areas</span>
      </div>
      
      <div className="legend-item" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '0' 
      }}>
        <div 
          className="legend-color" 
          style={{ 
            width: '16px',
            height: '16px',
            background: '#3388ff',
            borderRadius: '50%',
            marginRight: '8px'
          }}
        />
        <span style={{ color: '#333', fontSize: '12px' }}>Sensitive Locations</span>
      </div>
    </div>
  );
}