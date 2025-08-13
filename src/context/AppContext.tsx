import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, AppAction } from '../types/app';
import { Config } from '../utils/constants';

const initialState: AppState = {
  map: {
    center: Config.map.center,
    zoom: Config.map.zoom,
    bounds: null
  },
  data: {
    restrictedLocations: null,
    geoJSON: null,
    bufferZones: null,
    eligibleZones: null
  },
  processing: {
    isLoading: false,
    progress: 0,
    progressMessage: '',
    mode: 'balanced',
    bufferDistance: 200
  },
  ui: {
    status: 'Ready to load data',
    statusType: 'info',
    stats: null
  }
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MAP_BOUNDS':
      return {
        ...state,
        map: { ...state.map, bounds: action.payload }
      };
    
    case 'SET_MAP_ZOOM':
      return {
        ...state,
        map: { ...state.map, zoom: action.payload }
      };
    
    case 'SET_RESTRICTED_LOCATIONS':
      return {
        ...state,
        data: { ...state.data, restrictedLocations: action.payload }
      };
    
    case 'SET_GEOJSON':
      return {
        ...state,
        data: { ...state.data, geoJSON: action.payload }
      };
    
    case 'SET_BUFFER_ZONES':
      return {
        ...state,
        data: { ...state.data, bufferZones: action.payload }
      };
    
    case 'SET_ELIGIBLE_ZONES':
      return {
        ...state,
        data: { ...state.data, eligibleZones: action.payload }
      };
    
    case 'SET_LOADING':
      return {
        ...state,
        processing: { ...state.processing, isLoading: action.payload }
      };
    
    case 'SET_PROGRESS':
      return {
        ...state,
        processing: {
          ...state.processing,
          progress: action.payload.progress,
          progressMessage: action.payload.message
        }
      };
    
    case 'SET_PROCESSING_MODE':
      return {
        ...state,
        processing: { ...state.processing, mode: action.payload }
      };
    
    case 'SET_BUFFER_DISTANCE':
      return {
        ...state,
        processing: { ...state.processing, bufferDistance: action.payload }
      };
    
    case 'SET_STATUS':
      return {
        ...state,
        ui: {
          ...state.ui,
          status: action.payload.message,
          statusType: action.payload.type
        }
      };
    
    case 'SET_STATS':
      return {
        ...state,
        ui: { ...state.ui, stats: action.payload }
      };
    
    case 'CLEAR_ALL':
      return {
        ...state,
        data: {
          restrictedLocations: null,
          geoJSON: null,
          bufferZones: null,
          eligibleZones: null
        },
        processing: {
          ...state.processing,
          isLoading: false,
          progress: 0,
          progressMessage: ''
        },
        ui: {
          status: 'All data cleared',
          statusType: 'info',
          stats: null
        }
      };
    
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}