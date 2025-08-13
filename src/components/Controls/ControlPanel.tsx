import React from 'react';
import { BufferControl } from './BufferControl';
import { ModeSelector } from './ModeSelector';
import { ActionButtons } from './ActionButtons';
import { StatusDisplay } from '../Status/StatusDisplay';
import { ProgressBar } from '../Status/ProgressBar';
import { Statistics } from '../Status/Statistics';
import { MapLegend } from '../Legend/MapLegend';

export function ControlPanel() {
  return (
    <div className="controls">
      <h3>Cannabis Club Zone Calculator</h3>
      
      <BufferControl />
      <ModeSelector />
      <ActionButtons />
      
      <StatusDisplay />
      <ProgressBar />
      <Statistics />
      <MapLegend />
    </div>
  );
}