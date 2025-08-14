import { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { overpassApi } from '../../services/overpassApi';
import { duckdbSpatial } from '../../services/duckdbSpatial';
import { cacheService } from '../../services/cacheService';
import { useDuckDBSpatial } from '../../hooks/useDuckDBSpatial';
import { Logger } from '../../utils/logger';
import { DEBUG_MODE } from '../../utils/debugMode';
import { osmDataToGeoJSON } from '../../utils/osmToGeoJSON';
import { ConfirmDialog } from '../Dialogs/ConfirmDialog';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Loader2, 
  Download, 
  RefreshCw, 
  Calculator, 
  RotateCcw, 
  Database,
  Settings,
  Trash2
} from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

export function ActionButtons() {
  const { state, dispatch } = useApp();
  
  // Debug component mounting and cleanup
  useEffect(() => {
    Logger.log('🔧 ActionButtons component mounted');
    return () => {
      Logger.log('🗑️ ActionButtons component unmounting');
      // Cancel any ongoing calculations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear any pending timers
      if (recalculateTimerRef.current) {
        clearTimeout(recalculateTimerRef.current);
      }
    };
  }, []);
  const [canCalculate, setCanCalculate] = useState(false);
  const [showCacheOptions, setShowCacheOptions] = useState(false);
  const [cacheStats, setCacheStats] = useState<ReturnType<typeof cacheService.getCacheStats> | null>(null);
  const [autoRecalculate, setAutoRecalculate] = useState(true);
  const [hasCalculatedOnce, setHasCalculatedOnce] = useState(false);
  const [showFreshDataDialog, setShowFreshDataDialog] = useState(false);
  const [isLoadedFromParquet, setIsLoadedFromParquet] = useState(false);
  const [hasTriggeredAutoCalculate, setHasTriggeredAutoCalculate] = useState(false);
  const [hasTriggeredAutoLoad, setHasTriggeredAutoLoad] = useState(false);
  const { isInitialized: isDuckDBReady, isInitializing: isDuckDBInitializing } = useDuckDBSpatial();
  const previousBoundsRef = useRef<string | null>(null);
  const recalculateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCalculatingRef = useRef(false);
  const lastManualCalculationRef = useRef<number>(0); // Timestamp of last manual calculation
  const abortControllerRef = useRef<AbortController | null>(null); // For cancelling queries
  const latestStateRef = useRef(state); // Keep a ref to the latest state
  const dataLoadedRef = useRef(false); // Track when data is actually loaded and ready
  const previousZoomRef = useRef<number>(13); // Track zoom level changes, initialized with starting zoom
  
  // Update the ref whenever state changes
  latestStateRef.current = state;
  
  // Helper function to check if map movement is significant enough to recalculate
  const isSignificantMovement = useCallback((newBoundsString: string, previousBoundsString: string | null, currentZoom: number): boolean => {
    // Always recalculate on zoom level change
    if (currentZoom !== previousZoomRef.current) {
      Logger.log(`🔍 Zoom changed from ${previousZoomRef.current} to ${currentZoom} - significant movement`);
      previousZoomRef.current = currentZoom;
      return true;
    }
    
    if (!previousBoundsString) return true;
    
    // Parse bounds strings to calculate change percentage
    const [prevS, prevW, prevN, prevE] = previousBoundsString.split(',').map(Number);
    const [newS, newW, newN, newE] = newBoundsString.split(',').map(Number);
    
    // Calculate the current viewport size
    const prevWidth = prevE - prevW;
    const prevHeight = prevN - prevS;
    const newWidth = newE - newW;
    const newHeight = newN - newS;
    
    // Calculate center movement as percentage of viewport
    const prevCenterLat = (prevN + prevS) / 2;
    const prevCenterLng = (prevE + prevW) / 2;
    const newCenterLat = (newN + newS) / 2;
    const newCenterLng = (newE + newW) / 2;
    
    const centerMovementLat = Math.abs(newCenterLat - prevCenterLat) / prevHeight;
    const centerMovementLng = Math.abs(newCenterLng - prevCenterLng) / prevWidth;
    
    // Calculate viewport size change
    const sizeChangeLat = Math.abs(newHeight - prevHeight) / prevHeight;
    const sizeChangeLng = Math.abs(newWidth - prevWidth) / prevWidth;
    
    const maxCenterMovement = Math.max(centerMovementLat, centerMovementLng);
    const maxSizeChange = Math.max(sizeChangeLat, sizeChangeLng);
    
    // Thresholds: 5% center movement or 10% size change
    const significantCenterMovement = maxCenterMovement > 0.05;
    const significantSizeChange = maxSizeChange > 0.10;
    
    const isSignificant = significantCenterMovement || significantSizeChange;
    
    if (!isSignificant) {
      Logger.log(`📍 Movement too small: center ${(maxCenterMovement * 100).toFixed(1)}%, size ${(maxSizeChange * 100).toFixed(1)}% - skipping recalculation`);
    } else {
      Logger.log(`📍 Significant movement: center ${(maxCenterMovement * 100).toFixed(1)}%, size ${(maxSizeChange * 100).toFixed(1)}% - will recalculate`);
    }
    
    return isSignificant;
  }, []);

  // Auto-load data when app starts (defined after handleFetchData)

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
    // No more status messages - only show loading spinner
    // dispatch({ 
    //   type: 'SET_STATUS', 
    //   payload: { message: 'Loading restricted locations...', type: 'info' } 
    // });
    dispatch({ 
      type: 'SET_PROGRESS', 
      payload: { progress: 0, message: 'Loading...' } 
    });

    const startTime = performance.now();

    try {
      // If not forcing refresh, try to load from Parquet first
      if (isDuckDBReady && !forceRefresh) {
        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 0, message: 'Loading...' } 
        });

        const parquetResult = await duckdbSpatial.loadFromParquet(() => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress: 0, message: 'Loading...' } 
          });
        });

        if (parquetResult.success) {
          // Successfully loaded from Parquet
          const elapsed = (performance.now() - startTime).toFixed(0);
          const locationCount = parquetResult.count || 0;
          
          // No more success messages
          // dispatch({ 
          //   type: 'SET_STATUS', 
          //   payload: { 
          //     message: `Found ${locationCount} schools, playgrounds and community centers`, 
          //     type: 'success' 
          //   } 
          // });

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
          const geoJSON = await duckdbSpatial.getLocationPointsAsGeoJSON();
          if (geoJSON) {
            dispatch({ type: 'SET_GEOJSON', payload: geoJSON });
            Logger.log('✅ GeoJSON data set for map display');
          }

          setCanCalculate(true);
          Logger.log('✅ About to setIsLoadedFromParquet(true) - Parquet load successful');
          setIsLoadedFromParquet(true);
          dataLoadedRef.current = true; // Mark data as loaded and ready
          Logger.log('✅ setIsLoadedFromParquet(true) called - data ready for calculations');

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
        payload: { progress: 0, message: 'Loading...' } 
      });

      const osmData = await overpassApi.fetchRestrictedLocations(state.map.bounds, forceRefresh);
      dispatch({ type: 'SET_RESTRICTED_LOCATIONS', payload: osmData });

      // Convert OSM data to GeoJSON for map display
      const geoJSON = osmDataToGeoJSON(osmData);
      dispatch({ type: 'SET_GEOJSON', payload: geoJSON });

      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 0, message: 'Loading...' } 
      });

      // Load data into DuckDB for spatial processing
      if (isDuckDBReady) {
        // If we forced refresh, eject the Parquet data first
        if (forceRefresh && duckdbSpatial.isLoadedFromParquet()) {
          await duckdbSpatial.ejectParquetData();
        }

        await duckdbSpatial.loadOSMData(osmData, () => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress: 0, message: 'Loading...' } 
          });
        });
        Logger.log('Data loaded into DuckDB for spatial processing');
      }

      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 0, message: 'Loading...' } 
      });

      const elapsed = (performance.now() - startTime).toFixed(0);

      dispatch({ 
        type: 'SET_STATUS', 
        payload: { 
          message: `Found ${osmData.elements.length} schools, playgrounds and community centers`, 
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
        payload: { progress: 0, message: '' } 
      });

      setCanCalculate(true);
      dataLoadedRef.current = true; // Mark data as loaded and ready

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
    // Use latest state to avoid stale closure issues
    const currentState = latestStateRef.current;
    
    // Debug: Log current state (using fresh values)
    Logger.log(`Calculate zones called - hasRestrictedLocations: ${!!currentState.data.restrictedLocations}, isLoadedFromParquet: ${isLoadedFromParquet}, hasBounds: ${!!currentState.map.bounds}, zoom: ${currentState.map.zoom}`);
    if (currentState.map.bounds) {
      const bounds = currentState.map.bounds;
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
    const hasData = currentState.data.restrictedLocations || isLoadedFromParquet || hasDuckDBData;
    if (!hasData || !currentState.map.bounds) {
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { message: 'Please load restricted locations first', type: 'error' } 
      });
      return;
    }

    // Check minimum zoom level to prevent timeouts on large areas
    const minZoomForCalculation = 15; // Requires 2 zoom-ins from default level 13 (13 + 2)
    if (currentState.map.zoom < minZoomForCalculation) {
      const zoomsNeeded = minZoomForCalculation - currentState.map.zoom;
      const zoomText = zoomsNeeded === 1 ? 'one more time' : `${zoomsNeeded} more times`;
      dispatch({ 
        type: 'SET_STATUS', 
        payload: { 
          message: `Please zoom in ${zoomText} to see available locations`, 
          type: 'info' 
        } 
      });
      return;
    }

    // Cancel any existing calculation
    if (abortControllerRef.current) {
      Logger.log('Cancelling previous calculation...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Prevent multiple simultaneous calculations
    if (isCalculatingRef.current) {
      Logger.log('Calculation already in progress, skipping...');
      return;
    }

    // Create new abort controller for this calculation
    abortControllerRef.current = new AbortController();
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
      payload: { progress: 0, message: 'Calculating...' } 
    });

    const startTime = performance.now();

    try {
      // DuckDB-only spatial processing
      Logger.log('Using DuckDB for spatial processing');
      
      const result = await duckdbSpatial.calculateZones(
        currentState.processing.bufferDistance,
        currentState.map.bounds,
        currentState.processing.mode,
        (progress, message) => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress, message } 
          });
        },
        abortControllerRef.current?.signal // Pass abort signal
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
            message: 'Found suitable locations for cannabis clubs', 
            type: 'success' 
          } 
        });

        dispatch({ 
          type: 'SET_STATS', 
          payload: {
            features: featureCount,
            time: parseInt(elapsed),
            mode: 'Safe locations found'
          } 
        });

        dispatch({ 
          type: 'SET_PROGRESS', 
          payload: { progress: 0, message: '' } 
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
      // Check if calculation was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        Logger.log('Calculation was cancelled');
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { message: 'Calculation cancelled', type: 'info' } 
        });
      } else {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { message: 'Error calculating zones', type: 'error' } 
        });
        Logger.error('Calculation error', error);
      }
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 0, message: '' } 
      });
    } finally {
      isCalculatingRef.current = false; // Reset the calculation flag
      abortControllerRef.current = null; // Clear abort controller
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.processing.bufferDistance, state.processing.mode, dispatch, isDuckDBReady]);

  const handleClearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
    setCanCalculate(false);
    setHasCalculatedOnce(false);
    setHasTriggeredAutoCalculate(false);
    setHasTriggeredAutoLoad(false);
    setIsLoadedFromParquet(false);
    // Reset all refs
    previousBoundsRef.current = null;
    dataLoadedRef.current = false;
    previousZoomRef.current = 13; // Reset to starting zoom level
    lastManualCalculationRef.current = 0;
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

  // Auto-load data when app starts (now after all callbacks are defined)
  useEffect(() => {
    if (!hasTriggeredAutoLoad && isDuckDBReady && !state.processing.isLoading) {
      Logger.log('🚀 App started - attempting to auto-load data');
      setHasTriggeredAutoLoad(true);
      handleFetchData(false); // Try to load from Parquet first
    }
  }, [isDuckDBReady, hasTriggeredAutoLoad, state.processing.isLoading, handleFetchData]);

  // Auto-calculate when user reaches minimum zoom level for the first time (now after all callbacks are defined)
  useEffect(() => {
    const minZoomForCalculation = 15;
    
    // Only proceed if data is actually loaded and ready
    if (!dataLoadedRef.current) {
      return;
    }
    
    // Check if we should trigger auto-calculation
    if (
      !hasTriggeredAutoCalculate &&           // Haven't auto-calculated before
      !hasCalculatedOnce &&                   // User hasn't manually calculated
      !state.processing.isLoading &&          // Not currently loading
      !isCalculatingRef.current &&            // Not currently calculating
      state.map.zoom >= minZoomForCalculation && // Zoom level is sufficient
      state.map.bounds                         // Map bounds are set
    ) {
      Logger.log(`🎯 Auto-triggering calculation at zoom level ${state.map.zoom} (data confirmed loaded)`);
      setHasTriggeredAutoCalculate(true);
      handleCalculateZones(true); // Trigger as auto-calculation
    }
  }, [
    state.map.zoom, 
    state.processing.isLoading, 
    state.map.bounds,
    hasTriggeredAutoCalculate,
    hasCalculatedOnce,
    handleCalculateZones,
    isLoadedFromParquet  // Keep this to trigger when Parquet data becomes available
  ]);

  // Update cache stats when component mounts or cache options are shown
  useEffect(() => {
    if (showCacheOptions) {
      setCacheStats(cacheService.getCacheStats());
    }
  }, [showCacheOptions]);

  // Auto-recalculate zones when map bounds change
  useEffect(() => {
    // Skip if auto-recalculate is disabled or we haven't calculated once yet
    if (!autoRecalculate || !hasCalculatedOnce || !dataLoadedRef.current) {
      return;
    }

    // Skip if currently loading or calculating
    if (state.processing.isLoading || isCalculatingRef.current) {
      return;
    }

    // Skip if a manual calculation happened recently (within 3 seconds)
    const timeSinceManualCalculation = Date.now() - lastManualCalculationRef.current;
    if (timeSinceManualCalculation < 3000) {
      Logger.log(`⏳ Skipping auto-recalculate - manual calculation happened ${timeSinceManualCalculation}ms ago (cooling down)`);
      return;
    }

    // Check if bounds have actually changed and movement is significant
    if (state.map.bounds) {
      // Round to 4 decimal places to avoid floating point precision issues
      const currentBounds = `${state.map.bounds.getSouth().toFixed(4)},${state.map.bounds.getWest().toFixed(4)},${state.map.bounds.getNorth().toFixed(4)},${state.map.bounds.getEast().toFixed(4)}`;
      
      // Skip if bounds haven't changed
      if (previousBoundsRef.current === currentBounds) {
        return;
      }
      
      // Check if movement is significant enough to recalculate
      if (!isSignificantMovement(currentBounds, previousBoundsRef.current, state.map.zoom)) {
        // Update bounds but don't recalculate
        previousBoundsRef.current = currentBounds;
        return;
      }
      
      Logger.log(`🗺️ Bounds changed significantly from: ${previousBoundsRef.current} to: ${currentBounds}`);
      
      // Update the previous bounds
      previousBoundsRef.current = currentBounds;
      
      // Clear any existing timer
      if (recalculateTimerRef.current) {
        Logger.log('⏳ Cancelling previous auto-recalculate timer');
        clearTimeout(recalculateTimerRef.current);
      }
      
      // Set a new timer for recalculation with longer debounce
      recalculateTimerRef.current = setTimeout(() => {
        Logger.log(`🔄 Auto-recalculating zones after significant bounds change`);
        handleCalculateZones(true); // Pass true for auto-recalculate
      }, 1000); // Longer debounce: 1 second instead of 750ms
    }
    
    // Cleanup function
    return () => {
      if (recalculateTimerRef.current) {
        clearTimeout(recalculateTimerRef.current);
      }
    };
  }, [state.map.bounds, state.map.zoom, autoRecalculate, hasCalculatedOnce, state.processing.isLoading, handleCalculateZones, isSignificantMovement]);

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
      
      {/* Manual control buttons - only in debug mode */}
      {DEBUG_MODE && (
        <div className="space-y-2">
          <Button
            onClick={() => handleFetchData(false)}
            disabled={state.processing.isLoading}
            className="w-full"
            variant="outline"
          >
            <Download className="w-4 h-4 mr-2" />
            Load Restricted Locations
          </Button>
        </div>
      )}
      
      {/* User-friendly status for non-debug mode */}
      {!DEBUG_MODE && (
        <div className="text-center p-3 bg-muted/50 rounded-lg border border-border mt-2 mb-2">
          {!isDuckDBReady ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Getting things ready...</span>
            </div>
          ) : !dataLoadedRef.current ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Download className="w-4 h-4" />
              <span>Finding schools, playgrounds and community centers...</span>
            </div>
          ) : state.map.zoom < 15 ? (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground p-2 bg-muted/30 rounded-md">
              <Database className="w-3 h-3" />
              <span>Zoom in closer to see locations</span>
            </div>
          ) : state.processing.isLoading ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Calculator className="w-4 h-4" />
              <span>Finding suitable locations for cannabis clubs...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-green-600">
              <Badge variant="default" className="bg-green-500">
                Ready!
              </Badge>
              <span>Move around the map to explore different areas.</span>
            </div>
          )}
        </div>
      )}
      
      {/* Fresh data button - only in debug mode when loaded from Parquet */}
      {DEBUG_MODE && isLoadedFromParquet && (
        <Button
          onClick={handleFreshDataClick}
          disabled={state.processing.isLoading}
          variant="outline"
          className="w-full bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200"
          size="sm"
          title="Load fresh data from OpenStreetMap (current session only)"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Load Fresh Data (Session Only)
        </Button>
      )}
      
      {/* Force refresh button - only in debug mode */}
      {DEBUG_MODE && (
        <Button
          onClick={() => handleFetchData(true)}
          disabled={state.processing.isLoading}
          variant="secondary"
          size="sm"
          className="w-full"
          title="Force refresh from Overpass API (ignores cache)"
        >
          <RefreshCw className="w-3 h-3 mr-2" />
          Force Refresh from API
        </Button>
      )}
      
      {/* Manual calculate button - only in debug mode */}
      {DEBUG_MODE && (
        <Button
          onClick={() => handleCalculateZones()}
          disabled={state.processing.isLoading || !canCalculate || state.map.zoom < 15}
          className="w-full"
          title={
            state.map.zoom < 15 
              ? `Please zoom in ${15 - state.map.zoom === 1 ? 'one more time' : `${15 - state.map.zoom} more times`} to see detailed results`
              : !canCalculate
              ? 'Please wait while we find schools and playgrounds'
              : 'Find suitable locations for cannabis clubs'
          }
        >
          <Calculator className="w-4 h-4 mr-2" />
          Calculate Eligible Zones
        </Button>
      )}
      
      {/* Auto-recalculate toggle - only in debug mode */}
      {DEBUG_MODE && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-recalculate"
                checked={autoRecalculate}
                onCheckedChange={(checked) => setAutoRecalculate(checked === true)}
                disabled={!hasCalculatedOnce}
              />
              <Label 
                htmlFor="auto-recalculate" 
                className="text-sm font-normal cursor-pointer"
              >
                Auto-recalculate on map movement
              </Label>
            </div>
            {!hasCalculatedOnce && (
              <div className="text-xs text-muted-foreground mt-2">
                (Calculate zones once to enable)
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Clear All - show compact version for users, full version for debug */}
      <Button
        onClick={handleClearAll}
        disabled={state.processing.isLoading}
        variant={DEBUG_MODE ? "destructive" : "ghost"}
        size="sm"
        className={DEBUG_MODE ? "w-full" : "w-full text-xs h-8"}
      >
        <RotateCcw className="w-3 h-3 mr-1.5" />
        {DEBUG_MODE ? 'Clear All' : 'Reset'}
      </Button>
      
      {/* Cache Management Section - only in debug mode */}
      {DEBUG_MODE && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <Button
              onClick={() => setShowCacheOptions(!showCacheOptions)}
              variant="outline"
              size="sm"
              className="w-full mb-4"
            >
              <Database className="w-4 h-4 mr-2" />
              Cache Management {showCacheOptions ? '▼' : '▶'}
            </Button>
            
            {showCacheOptions && (
              <div className="space-y-4">
                {cacheStats && (
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <div className="text-xs space-y-1 text-muted-foreground">
                        <div className="font-medium text-foreground mb-2 flex items-center gap-1">
                          <Settings className="w-3 h-3" />
                          Cache Statistics
                        </div>
                        <div>• Entries: {cacheStats.totalEntries}</div>
                        <div>• Size: {(cacheStats.totalSize / 1024).toFixed(1)} KB</div>
                        {cacheStats.oldestEntry && (
                          <div>• Oldest: {cacheStats.oldestEntry.toLocaleDateString()}</div>
                        )}
                        {cacheStats.newestEntry && (
                          <div>• Newest: {cacheStats.newestEntry.toLocaleDateString()}</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                <Button
                  onClick={handleClearCache}
                  variant="destructive"
                  size="sm"
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Cache
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
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