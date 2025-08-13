import React from 'react';
import { useApp } from '../../context/AppContext';

export function ProgressBar() {
  const { state } = useApp();

  if (state.processing.progress === 0) {
    return null;
  }

  return (
    <div className="progress-bar" id="progress-bar">
      <div 
        className="progress-fill" 
        id="progress-fill"
        style={{ width: `${state.processing.progress}%` }}
      >
        {state.processing.progressMessage || `${state.processing.progress}%`}
      </div>
    </div>
  );
}