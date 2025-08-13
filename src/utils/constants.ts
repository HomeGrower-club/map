/**
 * Configuration constants for the Berlin Cannabis Club Map application
 * Centralized configuration for all application parameters
 */

export const Config = {
  /**
   * Map configuration
   */
  map: {
    center: [52.520, 13.405] as [number, number], // Berlin center coordinates
    zoom: 11,                  // City-wide view
    minZoom: 10,               // Prevent zooming out too far
    maxZoom: 18,               // Maximum detail level
    // Fixed Berlin bounds for consistent data loading (covers entire city)
    berlinBounds: {
      north: 52.6755,  // Northern edge of Berlin
      south: 52.3382,  // Southern edge of Berlin
      east: 13.7612,   // Eastern edge of Berlin
      west: 13.0892    // Western edge of Berlin
    }
  },
  
  /**
   * Overpass API configuration
   */
  overpass: {
    url: 'https://overpass-api.de/api/interpreter',
    timeout: 30 // Seconds before query timeout
  },
  
  /**
   * Processing configuration for performance optimization
   */
  processing: {
    chunkSize: 50,  // Features per processing batch
    simplifyTolerance: {
      fast: 0.001,      // ~100m accuracy
      balanced: 0.0001, // ~10m accuracy
      accurate: 0.00001 // ~1m accuracy
    }
  },
  
  /**
   * Visual styles for map layers
   */
  styles: {
    restrictedZone: {
      color: '#ff0000',
      fillColor: '#ff0000',
      fillOpacity: 0.3,
      weight: 1
    },
    eligibleZone: {
      color: '#00ff00',
      fillColor: '#00ff00',
      fillOpacity: 0.3,
      weight: 2
    },
    sensitiveLocation: {
      color: '#3388ff',
      fillColor: '#3388ff',
      fillOpacity: 0.5,
      radius: 5
    }
  }
};

export type ProcessingMode = 'fast' | 'balanced' | 'accurate';