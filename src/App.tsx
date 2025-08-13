import React from 'react';
import { AppProvider } from './context/AppContext';
import { MapContainer } from './components/Map/MapContainer';
import { ControlPanel } from './components/Controls/ControlPanel';
import { FloatingLegend } from './components/Legend/FloatingLegend';
import './App.css';

function App() {
  return (
    <AppProvider>
      <div className="app">
        <MapContainer />
        <ControlPanel />
        <FloatingLegend />
      </div>
    </AppProvider>
  );
}

export default App
