import { Config } from '../utils/constants';
import { Logger } from '../utils/logger';
import * as m from '../paraglide/messages';

export interface GeocodingResult {
  place_id: number;
  osm_id: number;
  osm_type: string;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance: number;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  boundingbox?: [string, string, string, string];
}

/**
 * Service for geocoding addresses using Nominatim API
 */
export class GeocodingService {
  private readonly nominatimUrl = 'https://nominatim.openstreetmap.org/search';
  private searchCache = new Map<string, GeocodingResult[]>();
  private lastRequestTime = 0;
  private readonly minRequestInterval = 1000; // Rate limit: 1 request per second

  /**
   * Search for addresses and places using Nominatim
   */
  async searchAddress(
    query: string,
    options: {
      limit?: number;
      bounded?: boolean;
    } = {}
  ): Promise<GeocodingResult[]> {
    const { limit = 10, bounded = true } = options;
    
    // Check cache first
    const cacheKey = `${query}-${limit}-${bounded}`;
    if (this.searchCache.has(cacheKey)) {
      Logger.log('Using cached geocoding results');
      return this.searchCache.get(cacheKey)!;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: limit.toString(),
        addressdetails: '1',
        extratags: '1',
        namedetails: '1',
        'accept-language': 'en'
      });

      // Restrict to Berlin bounding box if bounded
      if (bounded) {
        params.append('viewbox', `${Config.map.berlinBounds.west},${Config.map.berlinBounds.south},${Config.map.berlinBounds.east},${Config.map.berlinBounds.north}`);
        params.append('bounded', '1');
      }

      // Add Berlin to query if not already present (helps with accuracy)
      if (!query.toLowerCase().includes('berlin')) {
        params.set('q', `${query}, Berlin, Germany`);
      }

      const response = await fetch(`${this.nominatimUrl}?${params}`, {
        headers: {
          'User-Agent': m.app_title()
        }
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const results: GeocodingResult[] = await response.json();
      
      // Cache the results
      this.searchCache.set(cacheKey, results);
      
      // Clear old cache entries if too many
      if (this.searchCache.size > 100) {
        const firstKey = this.searchCache.keys().next().value;
        if (firstKey) {
          this.searchCache.delete(firstKey);
        }
      }

      Logger.log(`Geocoding found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      Logger.error('Geocoding error:', error);
      return [];
    }
  }

  /**
   * Reverse geocode coordinates to get address
   */
  async reverseGeocode(lat: number, lon: number): Promise<GeocodingResult | null> {
    const cacheKey = `reverse-${lat.toFixed(6)}-${lon.toFixed(6)}`;
    
    if (this.searchCache.has(cacheKey)) {
      const cached = this.searchCache.get(cacheKey);
      return cached && cached[0] ? cached[0] : null;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
        format: 'json',
        addressdetails: '1',
        namedetails: '1',
        'accept-language': 'en'
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params}`,
        {
          headers: {
            'User-Agent': m.app_title()
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Reverse geocoding failed: ${response.status}`);
      }

      const result: GeocodingResult = await response.json();
      
      // Cache the result
      this.searchCache.set(cacheKey, [result]);
      
      Logger.log(`Reverse geocoded: ${result.display_name}`);
      return result;
    } catch (error) {
      Logger.error('Reverse geocoding error:', error);
      return null;
    }
  }

  /**
   * Clear the geocoding cache
   */
  clearCache(): void {
    this.searchCache.clear();
    Logger.log('Geocoding cache cleared');
  }
}

export const geocodingService = new GeocodingService();