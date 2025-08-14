import { AppProvider } from './context/AppContext';
import { MapContainer } from './components/Map/MapContainer';
import { ControlPanel } from './components/Controls/ControlPanel';
import { FloatingLegend } from './components/Legend/FloatingLegend';
import { LegalDisclaimer } from './components/Legal/LegalDisclaimer';
import { Toaster } from './components/ui/sonner';

function App() {
  return (
    <AppProvider>
      <FloatingLegend />
      <LegalDisclaimer />
      <div className="relative h-screen w-full bg-background">
        <MapContainer />
        <ControlPanel />
        <Toaster position="top-center" />
      </div>
    </AppProvider>
  );
}

export default App
