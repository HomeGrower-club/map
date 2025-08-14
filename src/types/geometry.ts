// Standard GeoJSON types
export interface Geometry {
  type: string;
  coordinates: number[] | number[][] | number[][][];
}

export interface Feature {
  type: 'Feature';
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export interface ProcessingStats {
  features: number;
  time: number;
  mode: string;
}