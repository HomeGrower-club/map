import { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useDuckDBSpatial } from '../../hooks/useDuckDBSpatial';
import { duckdbSpatial } from '../../services/duckdbSpatial';
import { Logger } from '../../utils/logger';
import * as m from '../../paraglide/messages';

/**
 * AutoCalculator component that automatically calculates zones when:
 * 1. User first zooms to level 15 or higher
 * 2. Map bounds change significantly after initial calculation
 * This component is always mounted, regardless of control panel state
 */
export function AutoCalculator() {
  const { state, dispatch } = useApp();
  const { isInitialized: isDuckDBReady } = useDuckDBSpatial();
  
  const [hasCalculatedOnce, setHasCalculatedOnce] = useState(false);
  const [hasTriggeredAutoCalculate, setHasTriggeredAutoCalculate] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  const previousBoundsRef = useRef<string | null>(null);
  const previousZoomRef = useRef<number>(13);
  const recalculateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCalculatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Check if data is loaded by checking GeoJSON state
  useEffect(() => {
    if (state.data.geoJSON && state.data.geoJSON.features && state.data.geoJSON.features.length > 0) {
      Logger.log('AutoCalculator: Data loaded');
      setIsDataLoaded(true);
    }
  }, [state.data.geoJSON]);
  
  // Helper function to check if map movement is significant enough to recalculate
  const isSignificantMovement = useCallback((newBoundsString: string, previousBoundsString: string | null, currentZoom: number): boolean => {
    // Always recalculate on zoom level change
    if (currentZoom !== previousZoomRef.current) {
      Logger.log(`Zoom changed: ${previousZoomRef.current} → ${currentZoom}`);
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
    
    // Calculate center movement as percentage of viewport
    const prevCenterLat = (prevN + prevS) / 2;
    const prevCenterLng = (prevE + prevW) / 2;
    const newCenterLat = (newN + newS) / 2;
    const newCenterLng = (newE + newW) / 2;
    
    const centerMovementLat = Math.abs(newCenterLat - prevCenterLat) / prevHeight;
    const centerMovementLng = Math.abs(newCenterLng - prevCenterLng) / prevWidth;
    
    // Calculate viewport size change
    const newWidth = newE - newW;
    const newHeight = newN - newS;
    const sizeChangeLat = Math.abs(newHeight - prevHeight) / prevHeight;
    const sizeChangeLng = Math.abs(newWidth - prevWidth) / prevWidth;
    
    const maxCenterMovement = Math.max(centerMovementLat, centerMovementLng);
    const maxSizeChange = Math.max(sizeChangeLat, sizeChangeLng);
    
    // Thresholds: 5% center movement or 10% size change
    const significantCenterMovement = maxCenterMovement > 0.05;
    const significantSizeChange = maxSizeChange > 0.10;
    
    const isSignificant = significantCenterMovement || significantSizeChange;
    
    if (!isSignificant) {
      // Movement too small - skipping recalculation
    } else {
      Logger.log(`Map moved ${(maxCenterMovement * 100).toFixed(0)}% - recalculating`);
    }
    
    return isSignificant;
  }, []);
  
  // Calculate zones function
  const handleCalculateZones = useCallback(async (isAutoRecalculate = false) => {
    const minZoomForCalculation = 15;
    
    // Check minimum zoom level
    if (state.map.zoom < minZoomForCalculation) {
      // Zoom level too low for calculation
      return;
    }
    
    // Check if DuckDB has data
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
    
    // Check if data is loaded
    if (!hasDuckDBData || !state.map.bounds) {
      // Waiting for data and bounds
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
    
    Logger.log(`Calculating zones at zoom ${state.map.zoom}`);
    
    setHasCalculatedOnce(true);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ 
      type: 'SET_STATUS', 
      payload: { message: m.calculating_zones(), type: 'info' } 
    });
    dispatch({ 
      type: 'SET_PROGRESS', 
      payload: { progress: 0, message: m.status_processing() } 
    });
    
    const startTime = performance.now();
    
    try {
      // DuckDB-only spatial processing
      const result = await duckdbSpatial.calculateZones(
        state.processing.bufferDistance,
        state.map.bounds,
        state.processing.mode,
        (progress, message) => {
          dispatch({ 
            type: 'SET_PROGRESS', 
            payload: { progress, message } 
          });
        },
        abortControllerRef.current?.signal
      );
      
      // Process DuckDB results
      if (result.restrictedZones) {
        const bufferZones = result.restrictedZones.features[0];
        dispatch({ type: 'SET_BUFFER_ZONES', payload: bufferZones });
      }
      
      if (result.eligibleZones) {
        const eligibleZones = result.eligibleZones.features[0];
        dispatch({ type: 'SET_ELIGIBLE_ZONES', payload: eligibleZones });
      }
      
      const featureCount = result.stats.locationCount;
      const elapsed = (performance.now() - startTime).toFixed(0);
      
      if (result.restrictedZones || result.eligibleZones) {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { 
            message: m.found_suitable_locations(), 
            type: 'success' 
          } 
        });
        
        dispatch({ 
          type: 'SET_STATS', 
          payload: {
            features: featureCount,
            time: parseInt(elapsed),
            mode: m.safe_locations_found()
          } 
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
          payload: { message: m.no_restricted_zones(), type: 'info' } 
        });
      }
    } catch (error) {
      // Check if calculation was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        Logger.log('Calculation was cancelled');
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { message: m.calculation_cancelled(), type: 'info' } 
        });
      } else {
        dispatch({ 
          type: 'SET_STATUS', 
          payload: { message: m.error_calculating_zones(), type: 'error' } 
        });
        Logger.error('Calculation error', error);
      }
    } finally {
      isCalculatingRef.current = false;
      abortControllerRef.current = null;
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ 
        type: 'SET_PROGRESS', 
        payload: { progress: 0, message: '' } 
      });
    }
  }, [state.map.bounds, state.map.zoom, state.processing.bufferDistance, state.processing.mode, dispatch, isDuckDBReady]);
  
  // Auto-calculate when user reaches minimum zoom level for the first time
  useEffect(() => {
    const minZoomForCalculation = 15;
    
    // Only proceed if data is actually loaded and ready
    if (!isDataLoaded) {
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
      Logger.log(`Auto-calculating at zoom ${state.map.zoom}`);
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
    isDataLoaded
  ]);
  
  // Auto-recalculate zones when map bounds change
  useEffect(() => {
    // Skip if we haven't calculated once yet or data isn't loaded
    if (!hasCalculatedOnce || !isDataLoaded) {
      return;
    }
    
    // Skip if currently loading or calculating
    if (state.processing.isLoading || isCalculatingRef.current) {
      return;
    }
    
    // Check if bounds have actually changed and movement is significant
    if (state.map.bounds && state.map.zoom >= 15) {
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
      
      // Bounds changed significantly
      
      // Update the previous bounds
      previousBoundsRef.current = currentBounds;
      
      // Clear any existing timer
      if (recalculateTimerRef.current) {
        // Cancelling previous timer
        clearTimeout(recalculateTimerRef.current);
      }
      
      // Set a new timer for recalculation with debounce
      recalculateTimerRef.current = setTimeout(() => {
        Logger.log('Auto-recalculating zones');
        handleCalculateZones(true); // Pass true for auto-recalculate
      }, 1000); // 1 second debounce
    }
    
    // Cleanup function
    return () => {
      if (recalculateTimerRef.current) {
        clearTimeout(recalculateTimerRef.current);
      }
    };
  }, [state.map.bounds, state.map.zoom, hasCalculatedOnce, state.processing.isLoading, handleCalculateZones, isSignificantMovement, isDataLoaded]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (recalculateTimerRef.current) {
        clearTimeout(recalculateTimerRef.current);
      }
    };
  }, []);
  
  // This component doesn't render anything
  return null;
}