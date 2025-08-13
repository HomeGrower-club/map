import { FeatureCollection, Feature, Geometry } from '@turf/turf';

export type { FeatureCollection, Feature, Geometry };

export interface ProcessingStats {
  features: number;
  time: number;
  mode: string;
}