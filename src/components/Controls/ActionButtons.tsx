import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { overpassApi } from '../../services/overpassApi';
import { geometryProcessor } from '../../services/geometryProcessor';
import { duckdbSpatial } from '../../services/duckdbSpatial';
import { cacheService } from '../../services/cacheService';
import { useDuckDBSpatial } from '../../hooks/useDuckDBSpatial';
import { FeatureFlags } from '../../utils/featureFlags';
import { Logger } from '../../utils/logger';
import { DEBUG_MODE } from '../../utils/debugMode';

export function ActionButtons() {
  const { state, dispatch } = useApp();
  const [canCalculate, setCanCalculate] = useState(false);
  const [showCacheOptions, setShowCacheOptions] = useState(false);
  const [cacheStats, setCacheStats] = useState<ReturnType<typeof cacheService.getCacheStats> | null>(null);
  const [autoRecalculate, setAutoRecalculate] = useState(true);
  const [hasCalculatedOnce, setHasCalculatedOnce] = useState(false);
  const { isInitialized: isDuckDBReady, isInitializing: isDuckDBInitializing } = useDuckDBSpatial();
  const useDuckDB = FeatureFlags.USE_DUCKDB_SPATIAL;
  const previousBoundsRef = useRef<string | null>(null);
  const recalculateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCalculatingRef = useRef(false);
  const latestStateRef = useRef(state); // Keep a ref to the latest state
  
  // Update the ref whenever state changes
  latestStateRef.current = state;

  // Update cache stats when component mounts or cache options are shown
  useEffect(() => {
    if (showCacheOptions) {
      setCacheStats(cacheService.getCacheStats());
    }
  }, [showCacheOptions]);

  const handleFetchData = useCallback(async (forceRefresh = false) => {
    if (!state.map.bounds) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { message: 'Map bounds not available', type: 'error' } 
      });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ 
      type: 'SET_STATUS', 
      payload: { message: 'Loading restricted locations...', type: 'info' } 
    });
    dispatch({ 
      type: 'SET_PROGRESS', 
      payload: { progress: 0, message: 'Fetching data...' } 
    });

    const startTime = performance.now();

    try {
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 30, message: forceRefresh ? 'Force refreshing from OpenStreetMap...' : 'Querying OpenStreetMap...' } 
      });

      const osmData = await overpassApi.fetchRestrictedLocations(state.map.bounds, forceRefresh);
      dispatch({ type: 'SET_RESTRICTED_LOCATIONS', payload: osmData });

      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 60, message: 'Converting data...' } 
      });

      // Convert to GeoJSON for display
      const geoJSON = geometryProcessor.osmToGeoJSON(osmData);
      dispatch({ type: 'SET_GEOJSON', payload: geoJSON });

      // If using DuckDB, also load data there for later processing
      if (useDuckDB && isDuckDBReady) {
        await duckdbSpatial.loadOSMData(osmData, (message) => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress: 70, message } 
          });
        });
        Logger.log('Data loaded into DuckDB for spatial processing');
      }

      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 90, message: 'Rendering on map...' } 
      });

      const elapsed = (performance.now() - startTime).toFixed(0);

      dispatch({ 
        type: 'SET_STATUS', 
        payload: { 
          message: `Loaded ${geoJSON.features.length} restricted locations`, 
          type: 'success' 
        } 
      });

      dispatch({ 
        type: 'SET_STATS', 
        payload: {
          features: geoJSON.features.length,
          time: parseInt(elapsed),
          mode: 'Fetch'
        } 
      });

      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 100, message: 'Complete!' } 
      });

      setCanCalculate(true);

      setTimeout(() => {
        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 0, message: '' } 
        });
      }, 1000);

    } catch (error) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { message: 'Error loading data. Please try again.', type: 'error' } 
      });
      Logger.error('Fetch error', error);
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 0, message: '' } 
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.map.bounds, dispatch, useDuckDB, isDuckDBReady]);

  const handleCalculateZones = useCallback(async () => {
    if (!state.data.restrictedLocations || !state.map.bounds) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { message: 'Please load restricted locations first', type: 'error' } 
      });
      return;
    }

    // Prevent multiple simultaneous calculations
    if (isCalculatingRef.current) {
      Logger.log('Calculation already in progress, skipping...');
      return;
    }

    isCalculatingRef.current = true;
    setHasCalculatedOnce(true);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ 
      type: 'SET_STATUS', 
      payload: { message: 'Calculating zones...', type: 'info' } 
    });
    dispatch({ 
      type: 'SET_PROGRESS', 
      payload: { progress: 0, message: 'Starting calculation...' } 
    });

    const startTime = performance.now();

    try {
      let bufferZones = null;
      let eligibleZones = null;
      let featureCount = 0;
      let fallbackUsed = false;

      if (useDuckDB && isDuckDBReady) {
        // Use DuckDB for spatial processing
        Logger.log('Using DuckDB for spatial processing');
        
        const result = await duckdbSpatial.calculateZones(
          state.processing.bufferDistance,
          state.map.bounds,
          state.processing.mode,
          (progress, message) => {
            dispatch({ 
              type: 'SET_PROGRESS', 
              payload: { progress, message } 
            });
          }
        );

        // Check if DuckDB failed and we need to fallback
        if (result.fallbackUsed) {
          fallbackUsed = true;
          Logger.warn('DuckDB encountered topology issues, falling back to Turf.js');
          dispatch({ 
            type: 'SET_STATUS', 
            payload: { 
              message: 'Using Turf.js due to geometry complexity...', 
              type: 'info' 
            } 
          });
          
          // Fall back to Turf.js implementation
          const geoJSON = geometryProcessor.osmToGeoJSON(state.data.restrictedLocations);
          featureCount = geoJSON.features.length;

          bufferZones = await geometryProcessor.createBuffersOptimized(
            geoJSON,
            state.processing.bufferDistance,
            state.processing.mode,
            (progress, message) => {
              dispatch({ 
                type: 'SET_PROGRESS', 
                payload: { progress, message } 
              });
            }
          );

          if (bufferZones) {
            dispatch({ type: 'SET_BUFFER_ZONES', payload: bufferZones });

            dispatch({ 
              type: 'SET_PROGRESS', 
              payload: { progress: 80, message: 'Rendering restricted zones...' } 
            });

            eligibleZones = geometryProcessor.calculateEligibleZonesOptimized(
              state.map.bounds,
              bufferZones,
              state.processing.mode,
              (progress, message) => {
                dispatch({ 
                  type: 'SET_PROGRESS', 
                  payload: { progress, message } 
                });
              }
            );

            if (eligibleZones) {
              dispatch({ type: 'SET_ELIGIBLE_ZONES', payload: eligibleZones });
            }
          }
        } else {
          // DuckDB succeeded
          if (result.restrictedZones) {
            // Convert DuckDB result to format expected by the app
            bufferZones = result.restrictedZones.features[0];
            dispatch({ type: 'SET_BUFFER_ZONES', payload: bufferZones });
          }

          if (result.eligibleZones) {
            eligibleZones = result.eligibleZones.features[0];
            dispatch({ type: 'SET_ELIGIBLE_ZONES', payload: eligibleZones });
          }

          featureCount = result.stats.locationCount;

          // Show performance comparison if enabled
          if (FeatureFlags.SHOW_PERFORMANCE_COMPARISON) {
            Logger.log(`DuckDB processing time: ${result.stats.processingTime}ms`);
          }
        }
      } else {
        // Use Turf.js for spatial processing (original implementation)
        Logger.log('Using Turf.js for spatial processing');
        
        const geoJSON = geometryProcessor.osmToGeoJSON(state.data.restrictedLocations);
        featureCount = geoJSON.features.length;

        bufferZones = await geometryProcessor.createBuffersOptimized(
          geoJSON,
          state.processing.bufferDistance,
          state.processing.mode,
          (progress, message) => {
            dispatch({ 
              type: 'SET_PROGRESS', 
              payload: { progress, message } 
            });
          }
        );

        if (bufferZones) {
          dispatch({ type: 'SET_BUFFER_ZONES', payload: bufferZones });

          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress: 80, message: 'Rendering restricted zones...' } 
          });

          eligibleZones = geometryProcessor.calculateEligibleZonesOptimized(
            state.map.bounds,
            bufferZones,
            state.processing.mode,
            (progress, message) => {
              dispatch({ 
                type: 'SET_PROGRESS', 
                payload: { progress, message } 
              });
            }
          );

          if (eligibleZones) {
            dispatch({ type: 'SET_ELIGIBLE_ZONES', payload: eligibleZones });
          }
        }
      }

      const elapsed = (performance.now() - startTime).toFixed(0);
      let processingEngine = ' (Turf.js)';
      
      if (useDuckDB && isDuckDBReady) {
        // Check if fallback was used
        if (fallbackUsed) {
          processingEngine = ' (Turf.js - fallback)';
        } else {
          processingEngine = ' (DuckDB)';
        }
      }

      if (bufferZones || eligibleZones) {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { 
            message: `Zones calculated with ${state.processing.bufferDistance}m buffer${processingEngine}`, 
            type: 'success' 
          } 
        });

        dispatch({ 
          type: 'SET_STATS', 
          payload: {
            features: featureCount,
            time: parseInt(elapsed),
            mode: `${state.processing.mode}${processingEngine}`
          } 
        });

        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 100, message: 'Complete!' } 
        });

        setTimeout(() => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress: 0, message: '' } 
          });
        }, 1000);

      } else {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { message: 'No restricted zones found in this area', type: 'info' } 
        });
        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 0, message: '' } 
        });
      }
    } catch (error) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { message: 'Error calculating zones', type: 'error' } 
      });
      Logger.error('Calculation error', error);
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 0, message: '' } 
      });
    } finally {
      isCalculatingRef.current = false; // Reset the calculation flag
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.data.restrictedLocations, state.map.bounds, state.processing.bufferDistance, state.processing.mode, dispatch, useDuckDB, isDuckDBReady]);

  // Auto-recalculate zones when map bounds change
  useEffect(() => {
    // Skip if auto-recalculate is disabled or we haven't calculated once yet
    if (!autoRecalculate || !hasCalculatedOnce || !state.data.restrictedLocations) {
      return;
    }

    // Skip if currently loading or calculating
    if (state.processing.isLoading || isCalculatingRef.current) {
      return;
    }

    // Check if bounds have actually changed
    if (state.map.bounds) {
      // Round to 4 decimal places to avoid floating point precision issues
      const currentBounds = `${state.map.bounds.getSouth().toFixed(4)},${state.map.bounds.getWest().toFixed(4)},${state.map.bounds.getNorth().toFixed(4)},${state.map.bounds.getEast().toFixed(4)}`;
      
      // Skip if bounds haven't changed meaningfully
      if (previousBoundsRef.current === currentBounds) {
        return;
      }
      
      Logger.log(`Bounds changed from: ${previousBoundsRef.current} to: ${currentBounds}`);
      
      // Update the previous bounds
      previousBoundsRef.current = currentBounds;
      
      // Clear any existing timer
      if (recalculateTimerRef.current) {
        clearTimeout(recalculateTimerRef.current);
      }
      
      // Set a new timer for recalculation
      recalculateTimerRef.current = setTimeout(() => {
        Logger.log(`Auto-recalculating zones for new bounds: ${currentBounds}`);
        handleCalculateZones();
      }, 750); // Slightly longer debounce for better UX
    }
    
    // Cleanup function
    return () => {
      if (recalculateTimerRef.current) {
        clearTimeout(recalculateTimerRef.current);
      }
    };
  }, [state.map.bounds, autoRecalculate, hasCalculatedOnce, state.data.restrictedLocations, state.processing.isLoading, handleCalculateZones]);

  const handleClearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
    setCanCalculate(false);
    setHasCalculatedOnce(false);
    previousBoundsRef.current = null; // Reset the bounds tracking
  }, [dispatch]);

  const handleClearCache = useCallback(() => {
    cacheService.clearAllCaches();
    setCacheStats(cacheService.getCacheStats());
    dispatch({ 
      type: 'SET_STATUS', 
      payload: { message: 'Cache cleared successfully', type: 'success' } 
    });
  }, [dispatch]);

  return (
    <>
      {/* Show DuckDB status - only in debug mode */}
      {DEBUG_MODE && useDuckDB && (
        <div className="control-group" style={{ fontSize: '12px', color: '#666' }}>
          <div>
            Processing Engine: {isDuckDBReady ? '✅ DuckDB Spatial' : isDuckDBInitializing ? '⏳ Initializing DuckDB...' : '⚠️ DuckDB (not ready)'}
          </div>
        </div>
      )}
      
      <div className="control-group">
        <button
          id="fetch-data"
          onClick={() => handleFetchData(false)}
          disabled={state.processing.isLoading}
        >
          Load Restricted Locations
        </button>
      </div>
      
      {/* Force refresh button - only in debug mode */}
      {DEBUG_MODE && (
        <div className="control-group">
          <button
            id="force-refresh"
            onClick={() => handleFetchData(true)}
            disabled={state.processing.isLoading}
            style={{ 
              background: '#6c757d', 
              fontSize: '12px',
              padding: '6px'
            }}
            title="Force refresh from Overpass API (ignores cache)"
          >
            🔄 Force Refresh from API
          </button>
        </div>
      )}
      
      <div className="control-group">
        <button
          id="calculate-zones"
          onClick={handleCalculateZones}
          disabled={state.processing.isLoading || !canCalculate}
        >
          Calculate Eligible Zones
        </button>
      </div>
      
      {/* Auto-recalculate toggle - only in debug mode */}
      {DEBUG_MODE && (
        <div className="control-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={autoRecalculate}
              onChange={(e) => setAutoRecalculate(e.target.checked)}
              disabled={!hasCalculatedOnce}
            />
            <span>Auto-recalculate on map movement</span>
          </label>
          {!hasCalculatedOnce && (
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              (Calculate zones once to enable)
            </div>
          )}
        </div>
      )}
      
      <div className="control-group">
        <button
          id="clear-all"
          onClick={handleClearAll}
          disabled={state.processing.isLoading}
        >
          Clear All
        </button>
      </div>
      
      {/* Cache Management Section - only in debug mode */}
      {DEBUG_MODE && (
        <>
          <div className="control-group" style={{ marginTop: '15px', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
            <button
              onClick={() => setShowCacheOptions(!showCacheOptions)}
              style={{ 
                background: '#17a2b8',
                fontSize: '13px',
                padding: '6px'
              }}
            >
              📦 Cache Management {showCacheOptions ? '▼' : '▶'}
            </button>
          </div>
          
          {showCacheOptions && (
        <>
          {cacheStats && (
            <div style={{ 
              fontSize: '11px', 
              color: '#666', 
              padding: '8px',
              background: '#f8f9fa',
              borderRadius: '4px',
              marginBottom: '8px'
            }}>
              <div>📊 Cache Statistics:</div>
              <div>• Entries: {cacheStats.totalEntries}</div>
              <div>• Size: {(cacheStats.totalSize / 1024).toFixed(1)} KB</div>
              {cacheStats.oldestEntry && (
                <div>• Oldest: {cacheStats.oldestEntry.toLocaleDateString()}</div>
              )}
              {cacheStats.newestEntry && (
                <div>• Newest: {cacheStats.newestEntry.toLocaleDateString()}</div>
              )}
            </div>
          )}
          
          <div className="control-group">
            <button
              onClick={handleClearCache}
              style={{ 
                background: '#dc3545',
                fontSize: '12px',
                padding: '6px'
              }}
            >
              🗑️ Clear All Cache
            </button>
          </div>
            </>
          )}
        </>
      )}
    </>
  );
}