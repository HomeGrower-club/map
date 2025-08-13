import React from 'react';
import { useApp } from '../../context/AppContext';

export function StatusDisplay() {
  const { state } = useApp();

  const getBackgroundColor = () => {
    switch (state.ui.statusType) {
      case 'error':
        return '#ffebee';
      case 'success':
        return '#e8f5e9';
      default:
        return '#f0f0f0';
    }
  };

  const getTextColor = () => {
    switch (state.ui.statusType) {
      case 'error':
        return '#c62828';
      case 'success':
        return '#2e7d32';
      default:
        return '#333';
    }
  };

  return (<></>
    // <div 
    //   className="status" 
    //   id="status"
    //   style={{
    //     background: getBackgroundColor(),
    //     color: getTextColor()
    //   }}
    // >
    //   {state.ui.status}
    // </div>
  );
}