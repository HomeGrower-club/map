import React from 'react';
import { BufferControl } from './BufferControl';
import { ModeSelector } from './ModeSelector';
import { ActionButtons } from './ActionButtons';
import { StatusDisplay } from '../Status/StatusDisplay';
import { ProgressBar } from '../Status/ProgressBar';
import { Statistics } from '../Status/Statistics';
import { MapLegend } from '../Legend/MapLegend';
import { DEBUG_MODE } from '../../utils/debugMode';

export function ControlPanel() {
  return (
    <div className="controls">
      <h3>
        Berlin Cannabis Club Map
        {DEBUG_MODE && <span style={{ fontSize: '10px', marginLeft: '8px', color: '#666' }}>[Debug Mode]</span>}
      </h3>
      
      <BufferControl />
      <ModeSelector />
      <ActionButtons />
      
      <StatusDisplay />
      <ProgressBar />
      <Statistics />
      <MapLegend />
      
      {/* Debug mode toggle hint */}
      {!DEBUG_MODE && (
        <div style={{ 
          position: 'absolute', 
          bottom: '5px', 
          right: '5px', 
          fontSize: '10px', 
          color: '#999',
          fontStyle: 'italic'
        }}>
          Add ?debug=true to URL for advanced options
        </div>
      )}
    </div>
  );
}