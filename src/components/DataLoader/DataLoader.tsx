import { useEffect, useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useDuckDBSpatial } from '../../hooks/useDuckDBSpatial';
import { duckdbSpatial } from '../../services/duckdbSpatial';
import { Logger } from '../../utils/logger';
import * as m from '../../paraglide/messages';

/**
 * DataLoader component that automatically loads parquet data when the app starts
 * This component is always mounted, regardless of control panel state
 */
export function DataLoader() {
  const { state, dispatch } = useApp();
  const { isInitialized: isDuckDBReady } = useDuckDBSpatial();
  const [hasTriggeredAutoLoad, setHasTriggeredAutoLoad] = useState(false);
  const dataLoadedRef = useRef(false);
  
  // Create a stable reference for bounds check
  const hasBounds = !!state.map.bounds;

  // Auto-load data when DuckDB is ready
  useEffect(() => {
    const loadData = async () => {
      // Check if already loaded or loading
      if (!isDuckDBReady || hasTriggeredAutoLoad || state.processing.isLoading || state.data.dataLoaded || dataLoadedRef.current) {
        return;
      }

      if (!state.map.bounds) {
        Logger.log('Waiting for map bounds before loading data');
        return;
      }

      Logger.log('DataLoader: Loading data from parquet');
      setHasTriggeredAutoLoad(true);
      
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const startTime = performance.now();
        
        // Always load from Parquet
        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 0, message: m.loading_optimized_db() } 
        });

        const progressCallback = (message: string, progress?: number) => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { 
              progress: progress || 0, 
              message 
            } 
          });
        };

        // Try to load from Parquet
        const parquetResult = await duckdbSpatial.loadFromParquet(progressCallback);
        
        if (parquetResult.success) {
          // Successfully loaded from Parquet
          const elapsed = (performance.now() - startTime).toFixed(0);
          const locationCount = parquetResult.count || 0;
          
          dispatch({ 
            type: 'SET_STATS', 
            payload: {
              features: locationCount,
              time: parseInt(elapsed),
              mode: 'Parquet (Optimized)'
            } 
          });

          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress: 0, message: '' } 
          });

          // Get location points as GeoJSON for map display
          try {
            const geoJSON = await duckdbSpatial.getLocationsAsGeoJSON();
            Logger.info(`DataLoader: GeoJSON loaded with ${geoJSON.features.length} features`);
            dispatch({ type: 'SET_GEOJSON', payload: geoJSON });

            // Mark data as loaded in global state
            dispatch({ type: 'SET_DATA_LOADED', payload: true });
            dataLoadedRef.current = true;
            
            Logger.info(`Data loaded: ${locationCount} locations in ${elapsed}ms`);
          } catch (geoJsonError) {
            Logger.error('Failed to get GeoJSON data', geoJsonError);
            dispatch({ 
              type: 'SET_STATUS', 
              payload: { 
                message: 'Failed to load location data for display', 
                type: 'error' 
              } 
            });
            // Don't mark as loaded if GeoJSON failed
            dispatch({ type: 'SET_DATA_LOADED', payload: false });
          }
          
          // Clear status message after a moment
          setTimeout(() => {
            dispatch({ 
              type: 'SET_PROGRESS', 
              payload: { progress: 0, message: '' } 
            });
          }, 1000);
        } else {
          // Parquet not available - show error
          const errorMessage = parquetResult.error || 'Failed to load parquet';
          dispatch({ 
            type: 'SET_STATUS', 
            payload: { 
              message: m.error_loading_data(), 
              type: 'error' 
            } 
          });
          dispatch({ type: 'SET_DATA_LOAD_ERROR', payload: errorMessage });
          Logger.error('Parquet file not available:', errorMessage);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error loading data';
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { 
            message: m.error_loading_data(), 
            type: 'error' 
          } 
        });
        dispatch({ type: 'SET_DATA_LOAD_ERROR', payload: errorMessage });
        Logger.error('Error loading data', error);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 0, message: '' } 
        });
      }
    };

    loadData();
  }, [
    isDuckDBReady, 
    hasTriggeredAutoLoad, 
    state.processing.isLoading,
    state.data.dataLoaded,
    hasBounds,
    dispatch
  ]);

  // This component doesn't render anything
  return null;
}