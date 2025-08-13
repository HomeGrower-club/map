import React from 'react';
import { AppProvider } from './context/AppContext';
import { MapContainer } from './components/Map/MapContainer';
import { ControlPanel } from './components/Controls/ControlPanel';
import './App.css';

function App() {
  return (
    <AppProvider>
      <div className="app">
        <MapContainer />
        <ControlPanel />
      </div>
    </AppProvider>
  );
}

export default App
