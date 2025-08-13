import * as turf from '@turf/turf';
import { LatLngBounds } from 'leaflet';
import type { FeatureCollection, Feature, Point, LineString, Polygon, Position } from '@turf/turf';
import { Config, ProcessingMode } from '../utils/constants';
import { Logger } from '../utils/logger';
import type { OSMData, OSMElement } from '../types/osm';

/**
 * Service for processing geometry using Turf.js
 */
export class GeometryProcessorService {
  /**
   * Convert OSM JSON data to GeoJSON format
   */
  osmToGeoJSON(osmData: OSMData): FeatureCollection {
    Logger.group('Converting OSM to GeoJSON');
    const features: Feature[] = [];
    const nodes: Record<number, Position> = {};
    
    // First pass: Index all nodes
    osmData.elements.forEach(el => {
      if (el.type === 'node') {
        nodes[el.id] = [el.lon, el.lat];
      }
    });
    
    Logger.log('Indexed nodes:', Object.keys(nodes).length);
    
    // Second pass: Create GeoJSON features
    osmData.elements.forEach(el => {
      // Process point features (nodes with tags)
      if (el.type === 'node' && el.tags) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [el.lon, el.lat]
          } as Point,
          properties: el.tags
        });
      } 
      // Process line/polygon features (ways)
      else if (el.type === 'way' && el.nodes) {
        // Resolve node IDs to coordinates
        const coords = el.nodes
          .map(nodeId => nodes[nodeId])
          .filter((c): c is Position => c !== undefined);
        
        if (coords.length > 0) {
          // Check if way is closed (first coord = last coord)
          const isClosed = coords[0][0] === coords[coords.length-1][0] && 
                         coords[0][1] === coords[coords.length-1][1];
          
          if (isClosed && coords.length >= 4) {
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [coords]
              } as Polygon,
              properties: el.tags || {}
            });
          } else if (coords.length >= 2) {
            features.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coords
              } as LineString,
              properties: el.tags || {}
            });
          }
        }
      }
    });
    
    Logger.log('Created features:', features.length);
    Logger.groupEnd('Converting OSM to GeoJSON');
    
    return {
      type: 'FeatureCollection',
      features: features
    };
  }
  
  /**
   * Create buffer zones around features with optimization
   */
  async createBuffersOptimized(
    geoJSON: FeatureCollection,
    bufferDistance: number,
    mode: ProcessingMode = 'balanced',
    progressCallback?: (progress: number, message: string) => void
  ): Promise<Feature | null> {
    Logger.group('Creating Optimized Buffers');
    Logger.log('Buffer distance:', bufferDistance);
    Logger.log('Mode:', mode);
    Logger.log('Total features to buffer:', geoJSON.features.length);
    
    // Get simplification tolerance based on mode
    const tolerance = Config.processing.simplifyTolerance[mode];
    const chunkSize = mode === 'fast' ? 100 : Config.processing.chunkSize;
    
    const buffers: Feature[] = [];
    const features = geoJSON.features;
    
    // Process features in chunks to avoid blocking
    for (let i = 0; i < features.length; i += chunkSize) {
      const chunk = features.slice(i, Math.min(i + chunkSize, features.length));
      Logger.log(`Processing chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(features.length/chunkSize)}`);
      
      // Create buffers for this chunk
      const chunkBuffers = chunk.map(feature => {
        try {
          let processedFeature = feature;
          
          // Simplify complex geometries in fast mode
          if (mode === 'fast' && feature.geometry.type !== 'Point') {
            processedFeature = turf.simplify(feature, {tolerance: tolerance});
          }
          
          // Create buffer using Turf.js
          return turf.buffer(processedFeature, bufferDistance, { units: 'meters' });
        } catch (e) {
          Logger.warn('Error creating buffer for feature:', e);
          return null;
        }
      }).filter((f): f is Feature => f !== null);
      
      buffers.push(...chunkBuffers);
      
      // Update progress UI
      if (progressCallback) {
        const progress = Math.min(100, Math.round((i + chunk.length) / features.length * 50));
        progressCallback(progress, `Buffering: ${i + chunk.length}/${features.length} features`);
      }
      
      // Yield to browser for UI updates
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    Logger.log('Created individual buffers:', buffers.length);
    
    if (buffers.length === 0) {
      Logger.warn('No buffers created');
      Logger.groupEnd('Creating Optimized Buffers');
      return null;
    }
    
    // Merge overlapping buffers using union operations
    Logger.log('Starting buffer union operation...');
    let merged: Feature | null = null;
    
    if (mode === 'fast') {
      // Fast mode: Union subset for speed
      Logger.log('Using fast union method');
      try {
        // Process only first 20 buffers in fast mode
        const buffersToProcess = buffers.slice(0, Math.min(buffers.length, 20));
        merged = buffersToProcess.length === 1 
          ? buffersToProcess[0] 
          : turf.union(turf.featureCollection(buffersToProcess));
        
        if (buffers.length > 20) {
          Logger.warn(`Fast mode: Only processed first 20 buffers out of ${buffers.length}`);
        }
      } catch (e) {
        Logger.error('Fast union failed', e);
        merged = buffers[0];
      }
    } else {
      // Balanced/Accurate mode: Progressive union
      Logger.log('Using progressive union method');
      merged = buffers[0];
      
      for (let i = 1; i < buffers.length; i++) {
        try {
          // Union current merged shape with next buffer
          const unionResult = turf.union(turf.featureCollection([merged, buffers[i]]));
          if (unionResult) {
            merged = unionResult;
          }
          
          // Progress updates every 10 unions
          if (progressCallback && i % 10 === 0) {
            const progress = 50 + Math.round(i / buffers.length * 30);
            progressCallback(progress, `Merging: ${i}/${buffers.length} buffers`);
          }
          
          // Yield periodically for UI
          if (i % 20 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        } catch (e) {
          Logger.warn(`Error merging buffer ${i}:`, e);
        }
      }
    }
    
    // Simplify final geometry for performance
    if (merged && mode !== 'accurate') {
      Logger.log('Simplifying final geometry...');
      try {
        merged = turf.simplify(merged, {tolerance: tolerance * 10});
      } catch (e) {
        Logger.warn('Could not simplify final geometry:', e);
      }
    }
    
    Logger.log('Buffer union complete');
    Logger.groupEnd('Creating Optimized Buffers');
    
    return merged;
  }
  
  /**
   * Calculate eligible zones by subtracting restricted areas from map bounds
   */
  calculateEligibleZonesOptimized(
    mapBounds: LatLngBounds,
    restrictedZones: Feature,
    mode: ProcessingMode = 'balanced',
    progressCallback?: (progress: number, message: string) => void
  ): Feature | null {
    Logger.group('Calculating Eligible Zones');
    Logger.log('Mode:', mode);
    
    // Create polygon covering entire visible map area
    const boundsPolygon = turf.bboxPolygon([
      mapBounds.getWest(),  // min longitude
      mapBounds.getSouth(), // min latitude
      mapBounds.getEast(),  // max longitude
      mapBounds.getNorth()  // max latitude
    ]);
    
    Logger.log('Map bounds polygon created');
    
    // If no restricted zones, entire area is eligible
    if (!restrictedZones) {
      Logger.log('No restricted zones, entire area is eligible');
      Logger.groupEnd('Calculating Eligible Zones');
      return boundsPolygon;
    }
    
    try {
      if (progressCallback) {
        progressCallback(85, 'Calculating eligible areas...');
      }
      
      let eligible: Feature | null = null;
      
      if (mode === 'fast') {
        // Fast approximation using bounding box
        Logger.log('Using fast approximation method');
        const bbox = turf.bbox(restrictedZones);
        const restrictedBbox = turf.bboxPolygon(bbox);
        eligible = turf.difference(turf.featureCollection([boundsPolygon, restrictedBbox]));
      } else {
        // Full boolean difference calculation
        Logger.log('Using full difference calculation');
        eligible = turf.difference(turf.featureCollection([boundsPolygon, restrictedZones]));
      }
      
      if (progressCallback) {
        progressCallback(95, 'Finalizing zones...');
      }
      
      Logger.log('Eligible zones calculated successfully');
      Logger.groupEnd('Calculating Eligible Zones');
      return eligible;
    } catch (e) {
      Logger.error('Error calculating eligible zones', e);
      Logger.groupEnd('Calculating Eligible Zones');
      // Return full bounds as fallback
      return boundsPolygon;
    }
  }
}

export const geometryProcessor = new GeometryProcessorService();