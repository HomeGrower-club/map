import { LatLngBounds } from 'leaflet';
import LZString from 'lz-string';
import { OSMData } from '../types/osm';
import { Logger } from '../utils/logger';

/**
 * Service for caching Overpass API responses in localStorage
 */
export class CacheService {
  private readonly CACHE_PREFIX = 'berlin_cannabis_map_';
  private readonly CACHE_VERSION = 'v1';
  private readonly CACHE_EXPIRY_HOURS = 24 * 7; // 1 week default

  /**
   * Generate a cache key based on the bounding box
   * Rounds to 2 decimal places (~1km precision) for more cache hits
   */
  private getCacheKey(bounds: LatLngBounds): string {
    // Round to 2 decimal places for more stable cache keys
    // This gives roughly 1km precision which is fine for this use case
    const south = Math.floor(bounds.getSouth() * 100) / 100;
    const west = Math.floor(bounds.getWest() * 100) / 100;
    const north = Math.ceil(bounds.getNorth() * 100) / 100;
    const east = Math.ceil(bounds.getEast() * 100) / 100;
    
    const bbox = `${south}_${west}_${north}_${east}`;
    const key = `${this.CACHE_PREFIX}${this.CACHE_VERSION}_osm_${bbox}`;
    
    Logger.log(`Cache key generated: ${key}`);
    return key;
  }

  /**
   * Get cached OSM data for the given bounds
   */
  getCachedOSMData(bounds: LatLngBounds): OSMData | null {
    try {
      const key = this.getCacheKey(bounds);
      Logger.log(`Checking cache with key: ${key}`);
      
      const cached = localStorage.getItem(key);
      
      if (!cached) {
        Logger.log('Cache miss - no data found for this area');
        // Log all existing cache keys for debugging
        const existingKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.CACHE_PREFIX)) {
            existingKeys.push(k);
          }
        }
        Logger.log(`Existing cache keys: ${existingKeys.length}`, existingKeys);
        return null;
      }

      // Decompress the cached data
      const decompressed = LZString.decompress(cached);
      if (!decompressed) {
        Logger.warn('Failed to decompress cached data');
        localStorage.removeItem(key);
        return null;
      }

      const data = JSON.parse(decompressed);
      
      // Check if cache is expired
      const now = Date.now();
      const expiryTime = this.CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
      
      if (now - data.timestamp > expiryTime) {
        Logger.log('Cache expired, removing old data');
        localStorage.removeItem(key);
        return null;
      }

      const age = Math.round((now - data.timestamp) / 1000 / 60); // age in minutes
      Logger.log(`Cache HIT! Using cached data from ${new Date(data.timestamp).toLocaleString()} (${age} minutes old)`);
      return data.osmData;
    } catch (error) {
      Logger.warn('Error reading from cache:', error);
      return null;
    }
  }

  /**
   * Cache OSM data for the given bounds with compression
   */
  cacheOSMData(bounds: LatLngBounds, osmData: OSMData): void {
    try {
      const key = this.getCacheKey(bounds);
      const data = {
        osmData,
        timestamp: Date.now(),
        bounds: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast()
        }
      };

      const serialized = JSON.stringify(data);
      const originalSizeKB = (serialized.length / 1024).toFixed(1);
      
      // Compress the data before storing
      const compressed = LZString.compress(serialized);
      const compressedSizeKB = (compressed.length * 2 / 1024).toFixed(1); // *2 because JS strings are UTF-16
      const compressionRatio = ((1 - compressed.length * 2 / serialized.length) * 100).toFixed(1);
      
      localStorage.setItem(key, compressed);
      Logger.log(`OSM data cached successfully!`);
      Logger.log(`Compression: ${originalSizeKB} KB → ${compressedSizeKB} KB (${compressionRatio}% reduction)`);
    } catch (error) {
      // Handle quota exceeded error
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        Logger.warn('localStorage quota exceeded, clearing ALL caches to make room');
        
        // Clear ALL our caches to make room
        this.clearAllCaches();
        
        // Try again after clearing everything
        try {
          const key = this.getCacheKey(bounds);
          const data = {
            osmData,
            timestamp: Date.now()
          };
          
          const serialized = JSON.stringify(data);
          const compressed = LZString.compress(serialized);
          
          localStorage.setItem(key, compressed);
          Logger.log('Successfully cached after clearing old data');
        } catch (retryError) {
          Logger.error('Failed to cache even after clearing all data', retryError);
          Logger.warn('Data might be too large even with compression');
        }
      } else {
        Logger.error('Error caching data:', error);
      }
    }
  }

  /**
   * Clear old cache entries
   */
  clearOldCaches(): void {
    const keysToRemove: string[] = [];
    const now = Date.now();
    const expiryTime = this.CACHE_EXPIRY_HOURS * 60 * 60 * 1000;

    // Find all our cache keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.CACHE_PREFIX)) {
        try {
          const compressed = localStorage.getItem(key);
          if (compressed) {
            const decompressed = LZString.decompress(compressed);
            if (decompressed) {
              const data = JSON.parse(decompressed);
              if (now - data.timestamp > expiryTime) {
                keysToRemove.push(key);
              }
            } else {
              // Can't decompress, remove it
              keysToRemove.push(key);
            }
          }
        } catch {
          // If we can't parse it, remove it
          keysToRemove.push(key);
        }
      }
    }

    // Remove old entries
    keysToRemove.forEach(key => localStorage.removeItem(key));
    Logger.log(`Cleared ${keysToRemove.length} old cache entries`);
  }

  /**
   * Clear all cached OSM data
   */
  clearAllCaches(): void {
    const keysToRemove: string[] = [];
    
    // Find all our cache keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    // Remove all entries
    keysToRemove.forEach(key => localStorage.removeItem(key));
    Logger.log(`Cleared ${keysToRemove.length} cache entries`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    totalSize: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    let totalEntries = 0;
    let totalSize = 0;
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.CACHE_PREFIX)) {
        totalEntries++;
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length * 2; // Compressed strings are UTF-16
          try {
            const decompressed = LZString.decompress(value);
            if (decompressed) {
              const data = JSON.parse(decompressed);
              if (data.timestamp) {
                oldestTimestamp = Math.min(oldestTimestamp, data.timestamp);
                newestTimestamp = Math.max(newestTimestamp, data.timestamp);
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    return {
      totalEntries,
      totalSize,
      oldestEntry: oldestTimestamp === Infinity ? null : new Date(oldestTimestamp),
      newestEntry: newestTimestamp === 0 ? null : new Date(newestTimestamp)
    };
  }
}

export const cacheService = new CacheService();