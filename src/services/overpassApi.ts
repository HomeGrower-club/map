import L, { LatLngBounds } from 'leaflet';
import { Config } from '../utils/constants';
import { Logger } from '../utils/logger';
import type { OSMData } from '../types/osm';
import { cacheService } from './cacheService';

/**
 * Service for fetching data from Overpass API
 */
export class OverpassApiService {
  /**
   * Build Overpass QL query for sensitive locations
   * Always uses fixed Berlin bounds for consistent caching
   */
  private buildOverpassQuery(): string {
    // Use fixed Berlin bounds for consistent data loading
    const bbox = `${Config.map.berlinBounds.south},${Config.map.berlinBounds.west},${Config.map.berlinBounds.north},${Config.map.berlinBounds.east}`;
    
    Logger.log('Building Overpass query for Berlin bbox:', bbox);
    
    // Overpass QL query
    return `
      [out:json][timeout:${Config.overpass.timeout}];
      (
        // Educational facilities
        way["amenity"="school"](${bbox});
        node["amenity"="school"](${bbox});
        relation["amenity"="school"](${bbox});
        
        // Childcare facilities
        way["amenity"="kindergarten"](${bbox});
        node["amenity"="kindergarten"](${bbox});
        
        // Recreational areas for children
        way["leisure"="playground"](${bbox});
        node["leisure"="playground"](${bbox});
        
        // Youth-specific community centers
        way["amenity"="community_centre"]["community_centre:for"~"youth|juvenile"](${bbox});
        node["amenity"="community_centre"]["community_centre:for"~"youth|juvenile"](${bbox});
        
        // Sports facilities (often used by youth teams)
        way["leisure"="sports_centre"](${bbox});
        node["leisure"="sports_centre"](${bbox});
      );
      out body;  // Return full element data
      >;          // Recurse down to get nodes for ways
      out skel qt; // Output in compact format
    `;
  }

  /**
   * Execute Overpass API query with caching
   * Always fetches data for all of Berlin, ignores bounds parameter for consistency
   */
  async fetchRestrictedLocations(_bounds: LatLngBounds, forceRefresh = false): Promise<OSMData> {
    Logger.group('Fetching Restricted Locations');
    
    // Always use Berlin bounds for cache consistency
    const berlinBounds = L.latLngBounds(
      [Config.map.berlinBounds.south, Config.map.berlinBounds.west],
      [Config.map.berlinBounds.north, Config.map.berlinBounds.east]
    );
    
    // Check cache first unless force refresh is requested
    if (!forceRefresh) {
      const cachedData = cacheService.getCachedOSMData(berlinBounds);
      if (cachedData) {
        Logger.log('Using cached data');
        Logger.log('Cached elements:', cachedData.elements.length);
        Logger.groupEnd('Fetching Restricted Locations');
        return cachedData;
      }
    }
    
    const query = this.buildOverpassQuery();
    Logger.log('Query length:', query.length);
    Logger.log('Fetching fresh data from Overpass API...');
    
    try {
      // POST request to Overpass API
      const response = await fetch(Config.overpass.url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: OSMData = await response.json();
      Logger.log('Fetched elements:', data.elements.length);
      
      // Cache the successful response with Berlin bounds
      cacheService.cacheOSMData(berlinBounds, data);
      
      Logger.groupEnd('Fetching Restricted Locations');
      
      return data;
    } catch (error) {
      Logger.error('Error fetching data', error);
      Logger.groupEnd('Fetching Restricted Locations');
      throw error;
    }
  }
}

export const overpassApi = new OverpassApiService();