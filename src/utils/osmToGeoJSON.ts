import type { OSMData, OSMNode } from '../types/osm';
import type { FeatureCollection } from '../types/geometry';

/**
 * Convert OSM data to GeoJSON FeatureCollection
 * Only converts point nodes (schools, playgrounds, etc.)
 */
export function osmDataToGeoJSON(osmData: OSMData): FeatureCollection {
  const features = osmData.elements
    .filter((element): element is OSMNode => element.type === 'node')
    .map(node => ({
      type: 'Feature' as const,
      properties: {
        osm_id: node.id,
        name: node.tags?.name || null,
        amenity: node.tags?.amenity || node.tags?.leisure || 'unknown',
        tags: node.tags || {}
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [node.lon, node.lat]
      }
    }));

  return {
    type: 'FeatureCollection' as const,
    features
  };
}