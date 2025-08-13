import React from 'react';
import { useApp } from '../../context/AppContext';

export function LoadingSpinner() {
  const { state } = useApp();

  if (!state.processing.isLoading) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '8px',
      fontSize: '14px',
      color: '#0056b3'
    }}>
      <div style={{
        width: '16px',
        height: '16px',
        border: '2px solid #e3e3e3',
        borderTop: '2px solid #0056b3',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}></div>
      <span>{state.processing.progressMessage || 'Working...'}</span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}