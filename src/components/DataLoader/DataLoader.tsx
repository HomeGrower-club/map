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
      if (!isDuckDBReady || hasTriggeredAutoLoad || state.processing.isLoading || dataLoadedRef.current) {
        return;
      }

      if (!state.map.bounds) {
        Logger.log('Waiting for map bounds before loading data');
        return;
      }

      Logger.log('🚀 DataLoader: Auto-loading data from parquet');
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
          const geoJSON = await duckdbSpatial.getLocationsAsGeoJSON();
          dispatch({ type: 'SET_GEOJSON', payload: geoJSON });

          // Mark data as loaded
          dataLoadedRef.current = true;
          
          Logger.log(`✅ Data loaded successfully: ${locationCount} locations in ${elapsed}ms`);
          
          // Clear status message after a moment
          setTimeout(() => {
            dispatch({ 
              type: 'SET_PROGRESS', 
              payload: { progress: 0, message: '' } 
            });
          }, 1000);
        } else {
          // Parquet not available - show error
          dispatch({ 
            type: 'SET_STATUS', 
            payload: { 
              message: m.error_loading_data(), 
              type: 'error' 
            } 
          });
          Logger.error('Parquet file not available', new Error('Failed to load parquet'));
        }
      } catch (error) {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { 
            message: m.error_loading_data(), 
            type: 'error' 
          } 
        });
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
    hasBounds,
    dispatch
  ]);

  // This component doesn't render anything
  return null;
}