import React from 'react';
import { useApp } from '../../context/AppContext';
import type { ProcessingMode } from '../../utils/constants';
import { DEBUG_MODE } from '../../utils/debugMode';

export function ModeSelector() {
  const { state, dispatch } = useApp();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({ 
      type: 'SET_PROCESSING_MODE', 
      payload: e.target.value as ProcessingMode 
    });
  };

  // Only show in debug mode
  if (!DEBUG_MODE) {
    return null;
  }

  return (
    <div className="control-group">
      <label htmlFor="calculation-mode">Calculation Mode:</label>
      <select
        id="calculation-mode"
        value={state.processing.mode}
        onChange={handleChange}
        disabled={state.processing.isLoading}
      >
        <option value="fast">Fast (Less Accurate)</option>
        <option value="balanced">Balanced</option>
        <option value="accurate">Accurate (Slower)</option>
      </select>
    </div>
  );
}