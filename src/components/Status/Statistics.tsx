import React from 'react';
import { useApp } from '../../context/AppContext';
import { DEBUG_MODE } from '../../utils/debugMode';

export function Statistics() {
  const { state } = useApp();

  // Only show statistics in debug mode
  if (!DEBUG_MODE || !state.ui.stats) {
    return null;
  }

  return (
    <div className="stats" id="stats">
      <strong>Statistics:</strong><br />
      Features processed: {state.ui.stats.features}<br />
      Processing time: {state.ui.stats.time}ms<br />
      Mode: {state.ui.stats.mode}
    </div>
  );
}