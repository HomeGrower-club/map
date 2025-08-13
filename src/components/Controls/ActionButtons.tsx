import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { overpassApi } from '../../services/overpassApi';
import { duckdbSpatial } from '../../services/duckdbSpatial';
import { cacheService } from '../../services/cacheService';
import { useDuckDBSpatial } from '../../hooks/useDuckDBSpatial';
import { Logger } from '../../utils/logger';
import { DEBUG_MODE } from '../../utils/debugMode';
import { ConfirmDialog } from '../Dialogs/ConfirmDialog';

export function ActionButtons() {
  const { state, dispatch } = useApp();
  
  // Debug component mounting
  useEffect(() => {
    Logger.log('🔧 ActionButtons component mounted');
    return () => {
      Logger.log('🗑️ ActionButtons component unmounting');
    };
  }, []);
  const [canCalculate, setCanCalculate] = useState(false);
  const [showCacheOptions, setShowCacheOptions] = useState(false);
  const [cacheStats, setCacheStats] = useState<ReturnType<typeof cacheService.getCacheStats> | null>(null);
  const [autoRecalculate, setAutoRecalculate] = useState(true);
  const [hasCalculatedOnce, setHasCalculatedOnce] = useState(false);
  const [showFreshDataDialog, setShowFreshDataDialog] = useState(false);
  const [isLoadedFromParquet, setIsLoadedFromParquet] = useState(false);
  const { isInitialized: isDuckDBReady, isInitializing: isDuckDBInitializing } = useDuckDBSpatial();
  const previousBoundsRef = useRef<string | null>(null);
  const recalculateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCalculatingRef = useRef(false);
  const lastManualCalculationRef = useRef<number>(0); // Timestamp of last manual calculation
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
    Logger.log(`🚀 handleFetchData called - forceRefresh: ${forceRefresh}, isDuckDBReady: ${isDuckDBReady}`);
    dispatch({ 
      type: 'SET_STATUS', 
      payload: { message: 'Loading restricted locations...', type: 'info' } 
    });
    dispatch({ 
      type: 'SET_PROGRESS', 
      payload: { progress: 0, message: 'Initializing...' } 
    });

    const startTime = performance.now();

    try {
      // If not forcing refresh, try to load from Parquet first
      if (isDuckDBReady && !forceRefresh) {
        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 10, message: 'Checking for optimized database...' } 
        });

        const parquetResult = await duckdbSpatial.loadFromParquet((message) => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress: 50, message } 
          });
        });

        if (parquetResult.success) {
          // Successfully loaded from Parquet
          const elapsed = (performance.now() - startTime).toFixed(0);
          const locationCount = parquetResult.count || 0;
          
          dispatch({ 
            type: 'SET_STATUS', 
            payload: { 
              message: `Loaded ${locationCount} locations from optimized database`, 
              type: 'success' 
            } 
          });

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
            payload: { progress: 100, message: 'Complete!' } 
          });

          setCanCalculate(true);
          Logger.log('✅ About to setIsLoadedFromParquet(true) - Parquet load successful');
          setIsLoadedFromParquet(true);
          Logger.log('✅ setIsLoadedFromParquet(true) called');

          setTimeout(() => {
            dispatch({ 
              type: 'SET_PROGRESS', 
              payload: { progress: 0, message: '' } 
            });
          }, 1000);

          return; // Exit early, we're done!
        }
      }

      // If forced refresh or Parquet not available, load from OSM API
      setIsLoadedFromParquet(false);
      Logger.log('❌ setIsLoadedFromParquet(false) - Loading from OSM API');
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 30, message: forceRefresh ? 'Force refreshing from OpenStreetMap...' : 'Querying OpenStreetMap...' } 
      });

      const osmData = await overpassApi.fetchRestrictedLocations(state.map.bounds, forceRefresh);
      dispatch({ type: 'SET_RESTRICTED_LOCATIONS', payload: osmData });

      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 60, message: 'Processing data...' } 
      });

      // Load data into DuckDB for spatial processing
      if (isDuckDBReady) {
        // If we forced refresh, eject the Parquet data first
        if (forceRefresh && duckdbSpatial.isLoadedFromParquet()) {
          await duckdbSpatial.ejectParquetData();
        }

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
          message: `Loaded ${osmData.elements.length} restricted locations from OpenStreetMap`, 
          type: 'success' 
        } 
      });

      dispatch({ 
        type: 'SET_STATS', 
        payload: {
          features: osmData.elements.length,
          time: parseInt(elapsed),
          mode: forceRefresh ? 'Fresh Fetch' : 'OSM API'
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
  }, [state.map.bounds, dispatch, isDuckDBReady]);

  const handleCalculateZones = useCallback(async (isAutoRecalculate = false) => {
    // Debug: Log current state
    Logger.log(`Calculate zones called - hasRestrictedLocations: ${!!state.data.restrictedLocations}, isLoadedFromParquet: ${isLoadedFromParquet}, hasBounds: ${!!state.map.bounds}, zoom: ${state.map.zoom}`);
    if (state.map.bounds) {
      const bounds = state.map.bounds;
      Logger.log(`Current bounds: N=${bounds.getNorth().toFixed(6)}, S=${bounds.getSouth().toFixed(6)}, E=${bounds.getEast().toFixed(6)}, W=${bounds.getWest().toFixed(6)}`);
    }
    
    // Check if DuckDB has data (more reliable than state flags)
    let hasDuckDBData = false;
    if (isDuckDBReady) {
      try {
        const stats = await duckdbSpatial.getStatistics();
        hasDuckDBData = stats.totalLocations > 0;
        Logger.log(`DuckDB check: ${stats.totalLocations} locations available`);
      } catch (error) {
        Logger.warn('Failed to check DuckDB data:', error);
      }
    }
    
    // Check if data is loaded (OSM API, Parquet state, or DuckDB directly)
    const hasData = state.data.restrictedLocations || isLoadedFromParquet || hasDuckDBData;
    if (!hasData || !state.map.bounds) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { message: 'Please load restricted locations first', type: 'error' } 
      });
      return;
    }

    // Check minimum zoom level to prevent timeouts on large areas
    const minZoomForCalculation = 13; // 3 levels above minimum zoom (10 + 3)
    if (state.map.zoom < minZoomForCalculation) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { 
          message: `Please zoom in further (minimum zoom level ${minZoomForCalculation} required for calculations)`, 
          type: 'warning' 
        } 
      });
      return;
    }

    // Prevent multiple simultaneous calculations
    if (isCalculatingRef.current) {
      Logger.log('Calculation already in progress, skipping...');
      return;
    }

    isCalculatingRef.current = true;
    
    // Only record timestamp for manual calculations (button clicks)
    if (!isAutoRecalculate) {
      lastManualCalculationRef.current = Date.now();
      Logger.log('Manual calculation triggered - setting cooldown for auto-recalculate');
    } else {
      Logger.log('Auto-recalculation triggered');
    }
    
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
      // DuckDB-only spatial processing
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

      // Process DuckDB results
      let bufferZones = null;
      let eligibleZones = null;
      
      if (result.restrictedZones) {
        bufferZones = result.restrictedZones.features[0];
        dispatch({ type: 'SET_BUFFER_ZONES', payload: bufferZones });
      }

      if (result.eligibleZones) {
        eligibleZones = result.eligibleZones.features[0];
        dispatch({ type: 'SET_ELIGIBLE_ZONES', payload: eligibleZones });
      }

      const featureCount = result.stats.locationCount;

      const elapsed = (performance.now() - startTime).toFixed(0);

      if (bufferZones || eligibleZones) {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { 
            message: `Zones calculated with ${state.processing.bufferDistance}m buffer (DuckDB)`, 
            type: 'success' 
          } 
        });

        dispatch({ 
          type: 'SET_STATS', 
          payload: {
            features: featureCount,
            time: parseInt(elapsed),
            mode: `${state.processing.mode} (DuckDB)`
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
  }, [state.data.restrictedLocations, state.map.bounds, state.map.zoom, state.processing.bufferDistance, state.processing.mode, dispatch, isDuckDBReady]);

  // Auto-recalculate zones when map bounds change
  useEffect(() => {
    // Skip if auto-recalculate is disabled or we haven't calculated once yet
    if (!autoRecalculate || !hasCalculatedOnce || (!state.data.restrictedLocations && !isLoadedFromParquet)) {
      return;
    }

    // Skip if currently loading or calculating
    if (state.processing.isLoading || isCalculatingRef.current) {
      return;
    }

    // Skip if a manual calculation happened recently (within 2 seconds)
    const timeSinceManualCalculation = Date.now() - lastManualCalculationRef.current;
    if (timeSinceManualCalculation < 2000) {
      Logger.log(`Skipping auto-recalculate - manual calculation happened ${timeSinceManualCalculation}ms ago`);
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
        handleCalculateZones(true); // Pass true for auto-recalculate
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

  const handleFreshDataClick = useCallback(() => {
    setShowFreshDataDialog(true);
  }, []);

  const handleFreshDataConfirm = useCallback(async () => {
    setShowFreshDataDialog(false);
    await handleFetchData(true); // Force refresh
  }, [handleFetchData]);

  return (
    <>
      {/* Show DuckDB status - only in debug mode */}
      {DEBUG_MODE && (
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
      
      {/* Fresh data button - show when loaded from Parquet */}
      {isLoadedFromParquet && (
        <div className="control-group">
          <button
            onClick={handleFreshDataClick}
            disabled={state.processing.isLoading}
            style={{ 
              background: '#ffc107',
              color: '#000',
              fontSize: '13px',
              padding: '8px'
            }}
            title="Load fresh data from OpenStreetMap (current session only)"
          >
            🔄 Load Fresh Data (Session Only)
          </button>
        </div>
      )}
      
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
          disabled={state.processing.isLoading || !canCalculate || state.map.zoom < 13}
          title={
            state.map.zoom < 13 
              ? `Please zoom in further (minimum zoom level 13 required, current: ${state.map.zoom})`
              : !canCalculate
              ? 'Please load restricted locations first'
              : 'Calculate zones for cannabis clubs'
          }
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
      
      {/* Fresh Data Warning Dialog */}
      <ConfirmDialog
        isOpen={showFreshDataDialog}
        title="Load Fresh Data?"
        message="This will bypass the optimized database and fetch fresh data directly from OpenStreetMap. This is slower and will only apply to your current browser session. The next time you load the app, it will use the optimized database again. Do you want to continue?"
        confirmText="Yes, Load Fresh Data"
        cancelText="Cancel"
        onConfirm={handleFreshDataConfirm}
        onCancel={() => setShowFreshDataDialog(false)}
        variant="warning"
      />
    </>
  );
}