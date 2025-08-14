import { useEffect } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, useMap } from 'react-leaflet';
import { useApp } from '../../context/AppContext';
import { Config } from '../../utils/constants';
import { MapLayers } from './MapLayers';
import { SearchBox } from '../Search/SearchBox';
import 'leaflet/dist/leaflet.css';

/**
 * Component to track map bounds changes
 */
function MapBoundsTracker() {
  const map = useMap();
  const { dispatch } = useApp();

  useEffect(() => {
    const updateBounds = () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      dispatch({ type: 'SET_MAP_BOUNDS', payload: bounds });
      dispatch({ type: 'SET_MAP_ZOOM', payload: zoom });
    };

    // Set initial bounds and zoom
    updateBounds();

    // Update bounds and zoom on map move/zoom
    map.on('moveend', updateBounds);
    map.on('zoomend', updateBounds);

    return () => {
      map.off('moveend', updateBounds);
      map.off('zoomend', updateBounds);
    };
  }, [map, dispatch]);

  return null;
}

/**
 * Map components that need access to the map instance
 */
function MapContent() {
  return (
    <>
      <MapBoundsTracker />
      <MapLayers />
      <SearchBox />
    </>
  );
}

export function MapContainer() {
  const { state } = useApp();

  return (
    <LeafletMapContainer
      center={state.map.center}
      zoom={state.map.zoom}
      style={{ height: '100vh', width: '100%' }}
      minZoom={Config.map.minZoom}
      maxZoom={Config.map.maxZoom}
    >
      <TileLayer
        attribution='© OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapContent />
    </LeafletMapContainer>
  );
}