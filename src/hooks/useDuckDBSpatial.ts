import { useEffect, useState, useCallback, useRef } from 'react';
import { duckdbSpatial } from '../services/duckdbSpatial';
import { Logger } from '../utils/logger';

interface UseDuckDBSpatialResult {
  isInitialized: boolean;
  isInitializing: boolean;
  error: Error | null;
  initialize: () => Promise<void>;
}

/**
 * Hook for managing DuckDB WASM initialization
 */
export function useDuckDBSpatial(): UseDuckDBSpatialResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  const initialize = useCallback(async () => {
    // If already initialized, return
    if (isInitialized) return;

    // If initialization is in progress, wait for it
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    setIsInitializing(true);
    setError(null);

    // Create and store the initialization promise
    initPromiseRef.current = (async () => {
      try {
        Logger.log('Initializing DuckDB WASM...');
        await duckdbSpatial.initialize();
        setIsInitialized(true);
        Logger.log('DuckDB WASM initialized successfully');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to initialize DuckDB');
        Logger.error('DuckDB initialization failed', error);
        setError(error);
        throw error;
      } finally {
        setIsInitializing(false);
        initPromiseRef.current = null;
      }
    })();

    await initPromiseRef.current;
  }, [isInitialized]);

  // Auto-initialize on mount
  useEffect(() => {
    initialize().catch(err => {
      Logger.error('Auto-initialization failed', err);
    });
  }, [initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInitialized) {
        duckdbSpatial.dispose().catch(err => {
          Logger.error('Failed to dispose DuckDB', err);
        });
      }
    };
  }, [isInitialized]);

  return {
    isInitialized,
    isInitializing,
    error,
    initialize
  };
}