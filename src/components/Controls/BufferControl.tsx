import React from 'react';
import { useApp } from '../../context/AppContext';

export function BufferControl() {
  const { state, dispatch } = useApp();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 50 && value <= 500) {
      dispatch({ type: 'SET_BUFFER_DISTANCE', payload: value });
    }
  };

  return (
    <div className="control-group">
      <label htmlFor="buffer-distance">Buffer Distance (meters):</label>
      <input
        type="number"
        id="buffer-distance"
        value={state.processing.bufferDistance}
        onChange={handleChange}
        min="50"
        max="500"
        step="50"
        disabled={state.processing.isLoading}
      />
    </div>
  );
}