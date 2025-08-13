/**
 * Feature flags for toggling between implementations
 */

export const FeatureFlags = {
  /**
   * Use DuckDB WASM for spatial processing instead of Turf.js
   * Default: true (use DuckDB for better performance)
   */
  USE_DUCKDB_SPATIAL: true,

  /**
   * Show performance comparison when both implementations are available
   */
  SHOW_PERFORMANCE_COMPARISON: true,

  /**
   * Enable debug logging for spatial operations
   */
  DEBUG_SPATIAL_OPS: true,
};

// Allow runtime configuration via URL params
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  
  if (params.has('useDuckDB')) {
    FeatureFlags.USE_DUCKDB_SPATIAL = params.get('useDuckDB') === 'true';
  }
  
  if (params.has('showComparison')) {
    FeatureFlags.SHOW_PERFORMANCE_COMPARISON = params.get('showComparison') === 'true';
  }
  
  if (params.has('debugSpatial')) {
    FeatureFlags.DEBUG_SPATIAL_OPS = params.get('debugSpatial') === 'true';
  }
}