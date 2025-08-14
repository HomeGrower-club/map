import { AppProvider } from './context/AppContext';
import { MapContainer } from './components/Map/MapContainer';
import { ControlPanel } from './components/Controls/ControlPanel';
import { FloatingLegend } from './components/Legend/FloatingLegend';
import { LegalDisclaimer } from './components/Legal/LegalDisclaimer';
import { Toaster } from './components/ui/sonner';
import './App.css';

function App() {
  return (
    <AppProvider>
      <div className="relative h-screen w-full bg-background">
        <MapContainer />
        <ControlPanel />
        <FloatingLegend />
        <LegalDisclaimer />
        <Toaster position="bottom-left" />
      </div>
    </AppProvider>
  );
}

export default App
