import { LatLngBounds } from 'leaflet';
import type { FeatureCollection, Feature } from './geometry';
import type { OSMData } from './osm';
import type { ProcessingMode } from '../utils/constants';

export interface AppState {
  map: {
    center: [number, number];
    zoom: number;
    bounds: LatLngBounds | null;
  };
  data: {
    restrictedLocations: OSMData | null;
    geoJSON: FeatureCollection | null;
    bufferZones: Feature | null;
    eligibleZones: Feature | null;
    dataLoaded: boolean;
    dataLoadError: string | null;
  };
  processing: {
    isLoading: boolean;
    progress: number;
    progressMessage: string;
    mode: ProcessingMode;
    bufferDistance: number;
  };
  ui: {
    status: string;
    statusType: 'info' | 'error' | 'success';
    stats: {
      features: number;
      time: number;
      mode: string;
    } | null;
  };
}

export type AppAction = 
  | { type: 'SET_MAP_BOUNDS'; payload: LatLngBounds }
  | { type: 'SET_MAP_ZOOM'; payload: number }
  | { type: 'SET_RESTRICTED_LOCATIONS'; payload: OSMData }
  | { type: 'SET_GEOJSON'; payload: FeatureCollection }
  | { type: 'SET_BUFFER_ZONES'; payload: Feature }
  | { type: 'SET_ELIGIBLE_ZONES'; payload: Feature }
  | { type: 'SET_DATA_LOADED'; payload: boolean }
  | { type: 'SET_DATA_LOAD_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PROGRESS'; payload: { progress: number; message: string } }
  | { type: 'SET_PROCESSING_MODE'; payload: ProcessingMode }
  | { type: 'SET_BUFFER_DISTANCE'; payload: number }
  | { type: 'SET_STATUS'; payload: { message: string; type: 'info' | 'error' | 'success' } }
  | { type: 'SET_STATS'; payload: AppState['ui']['stats'] }
  | { type: 'CLEAR_ALL' };