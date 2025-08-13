/**
 * Feature flags for toggling between implementations
 */

export const FeatureFlags = {
  /**
   * Show performance metrics for DuckDB operations
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
  
  if (params.has('showComparison')) {
    FeatureFlags.SHOW_PERFORMANCE_COMPARISON = params.get('showComparison') === 'true';
  }
  
  if (params.has('debugSpatial')) {
    FeatureFlags.DEBUG_SPATIAL_OPS = params.get('debugSpatial') === 'true';
  }
}