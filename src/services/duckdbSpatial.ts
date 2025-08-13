import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { LatLngBounds } from 'leaflet';
import { FeatureCollection } from '@turf/turf';
import { Logger } from '../utils/logger';
import { OSMData, OSMNode, OSMWay } from '../types/osm';
import { ProcessingMode } from '../utils/constants';

/**
 * DuckDB WASM Spatial Service for efficient geometry processing
 */
export class DuckDBSpatialService {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private initialized = false;
  private hasMakeValid = false;
  private spatialCapabilities: {
    hasMakeValid: boolean;
    hasReducePrecision: boolean;
    hasSimplifyPreserveTopology: boolean;
  } = {
    hasMakeValid: false,
    hasReducePrecision: false,
    hasSimplifyPreserveTopology: false,
  };

  /**
   * Initialize DuckDB with spatial extension
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    Logger.group('Initializing DuckDB WASM');
    
    try {
      // Select bundle based on browser support
      const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: duckdb_wasm,
          mainWorker: mvp_worker,
        },
        eh: {
          mainModule: duckdb_wasm_eh,
          mainWorker: eh_worker,
        },
      };

      // Select appropriate bundle
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      
      // Instantiate worker
      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      // Install and load spatial extension
      await db.open({
        path: ':memory:',
        query: {
          castBigIntToDouble: true,
        },
      });

      this.db = db;
      this.conn = await db.connect();

      // Install spatial extension
      await this.conn.query(`INSTALL spatial`);
      await this.conn.query(`LOAD spatial`);

      // Check for ST_MakeValid availability
      await this.checkSpatialCapabilities();

      // Create schema
      await this.createSchema();
      
      this.initialized = true;
      Logger.log('DuckDB initialized with spatial extension');
      Logger.groupEnd('Initializing DuckDB WASM');
    } catch (error) {
      Logger.error('Failed to initialize DuckDB', error);
      Logger.groupEnd('Initializing DuckDB WASM');
      throw error;
    }
  }

  /**
   * Check available spatial functions for geometry repair
   */
  private async checkSpatialCapabilities(): Promise<void> {
    if (!this.conn) return;

    Logger.log('Checking spatial capabilities...');

    // Test for ST_MakeValid
    try {
      await this.conn.query(`SELECT ST_MakeValid(ST_GeomFromText('POINT(0 0)')) as test`);
      this.spatialCapabilities.hasMakeValid = true;
      Logger.log('✅ ST_MakeValid is available');
    } catch {
      Logger.warn('⚠️ ST_MakeValid is not available');
    }

    // Test for ST_ReducePrecision
    try {
      await this.conn.query(`SELECT ST_ReducePrecision(ST_GeomFromText('POINT(0 0)'), 0.001) as test`);
      this.spatialCapabilities.hasReducePrecision = true;
      Logger.log('✅ ST_ReducePrecision is available');
    } catch {
      Logger.warn('⚠️ ST_ReducePrecision is not available');
    }

    // Test for ST_SimplifyPreserveTopology
    try {
      await this.conn.query(`SELECT ST_SimplifyPreserveTopology(ST_GeomFromText('LINESTRING(0 0, 1 1, 2 2)'), 0.1) as test`);
      this.spatialCapabilities.hasSimplifyPreserveTopology = true;
      Logger.log('✅ ST_SimplifyPreserveTopology is available');
    } catch {
      Logger.warn('⚠️ ST_SimplifyPreserveTopology is not available');
    }
  }

  /**
   * Repair geometry using available methods
   */
  private async repairGeometry(geometryWKT: string): Promise<string | null> {
    if (!this.conn) return null;

    try {
      // First check if geometry is valid
      const validCheck = await this.conn.query(`
        SELECT ST_IsValid(ST_GeomFromText('${geometryWKT}')) as is_valid
      `);
      const isValid = validCheck.toArray()[0].is_valid;
      
      if (isValid) {
        return geometryWKT;
      }

      Logger.warn('Invalid geometry detected, attempting repair...');

      // Try ST_MakeValid if available
      if (this.spatialCapabilities.hasMakeValid) {
        try {
          const result = await this.conn.query(`
            SELECT ST_AsText(ST_MakeValid(ST_GeomFromText('${geometryWKT}'))) as repaired
          `);
          const repaired = result.toArray()[0].repaired;
          Logger.log('Geometry repaired with ST_MakeValid');
          return repaired;
        } catch (e) {
          Logger.warn('ST_MakeValid failed:', e);
        }
      }

      // Try ST_Buffer with 0 distance (common repair technique)
      try {
        const result = await this.conn.query(`
          SELECT ST_AsText(ST_Buffer(ST_GeomFromText('${geometryWKT}'), 0)) as repaired
        `);
        const repaired = result.toArray()[0].repaired;
        Logger.log('Geometry repaired with ST_Buffer(0)');
        return repaired;
      } catch (e) {
        Logger.warn('ST_Buffer(0) failed:', e);
      }

      // Try reducing precision
      if (this.spatialCapabilities.hasReducePrecision) {
        try {
          const result = await this.conn.query(`
            SELECT ST_AsText(ST_ReducePrecision(ST_GeomFromText('${geometryWKT}'), 0.000001)) as repaired
          `);
          const repaired = result.toArray()[0].repaired;
          Logger.log('Geometry repaired with ST_ReducePrecision');
          return repaired;
        } catch (e) {
          Logger.warn('ST_ReducePrecision failed:', e);
        }
      }

      // If all repair attempts fail, return null
      Logger.error('All geometry repair attempts failed');
      return null;
    } catch (error) {
      Logger.error('Error in geometry repair:', error);
      return null;
    }
  }

  /**
   * Create database schema for spatial data
   */
  private async createSchema(): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');

    Logger.log('Creating database schema');

    // Create table for sensitive locations
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS sensitive_locations (
        id INTEGER PRIMARY KEY,
        osm_id BIGINT,
        name VARCHAR,
        type VARCHAR,
        tags JSON,
        geometry GEOMETRY
      )
    `);

    // Create spatial index
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_geometry 
      ON sensitive_locations USING RTREE (geometry)
    `);

    Logger.log('Schema created successfully');
  }

  /**
   * Load OSM data into DuckDB
   */
  async loadOSMData(osmData: OSMData, progressCallback?: (message: string) => void): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');

    Logger.group('Loading OSM data into DuckDB');
    Logger.log('Total elements:', osmData.elements.length);
    
    if (progressCallback) {
      progressCallback('Preparing data for DuckDB...');
    }

    // Clear existing data
    await this.conn.query(`DELETE FROM sensitive_locations`);

    // Create a map of nodes for way resolution
    const nodes = new Map<number, [number, number]>();
    const insertData: any[] = [];
    let id = 1;

    // First pass: collect all nodes
    for (const element of osmData.elements) {
      if (element.type === 'node') {
        nodes.set(element.id, [element.lon, element.lat]);
      }
    }

    // Second pass: create geometries (without async repair during data prep)
    for (const element of osmData.elements) {
      try {
        if (element.type === 'node' && element.tags) {
          // Point geometry
          const node = element as OSMNode;
          insertData.push({
            id: id++,
            osm_id: node.id,
            name: node.tags?.name || null,
            type: this.getLocationType(node.tags),
            tags: JSON.stringify(node.tags),
            geometry: `POINT(${node.lon} ${node.lat})`
          });
        } else if (element.type === 'way' && element.tags) {
          // Polygon or LineString geometry
          const way = element as OSMWay;
          const coords = way.nodes
            .map(nodeId => nodes.get(nodeId))
            .filter((coord): coord is [number, number] => coord !== undefined);

          if (coords.length >= 2) {
            const isClosed = coords[0][0] === coords[coords.length - 1][0] && 
                           coords[0][1] === coords[coords.length - 1][1];

            const coordString = coords.map(c => `${c[0]} ${c[1]}`).join(', ');
            
            const geometry = isClosed && coords.length >= 4
              ? `POLYGON((${coordString}))`
              : `LINESTRING(${coordString})`;

            insertData.push({
              id: id++,
              osm_id: way.id,
              name: way.tags?.name || null,
              type: this.getLocationType(way.tags),
              tags: JSON.stringify(way.tags),
              geometry: geometry
            });
          }
        }
      } catch (error) {
        Logger.warn('Error processing element:', error);
      }
    }

    // Batch insert for better performance
    if (insertData.length > 0) {
      Logger.log(`Inserting ${insertData.length} locations into database using batch insert`);
      
      const BATCH_SIZE = 5000; // Insert 500 rows at a time
      const batches = Math.ceil(insertData.length / BATCH_SIZE);
      
      for (let i = 0; i < batches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, insertData.length);
        const batch = insertData.slice(start, end);
        
        if (progressCallback) {
          const progress = Math.round(((i + 1) / batches) * 100);
          progressCallback(`Loading into DuckDB: ${progress}%`);
        }
        
        try {
          // Build a multi-row INSERT statement
          const values = batch.map(row => {
            const name = row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL';
            const tags = `'${row.tags.replace(/'/g, "''")}'`;
            const geometry = `ST_GeomFromText('${row.geometry}')`;
            
            return `(${row.id}, ${row.osm_id}, ${name}, '${row.type}', ${tags}, ${geometry})`;
          }).join(',\n');
          
          const query = `
            INSERT INTO sensitive_locations (id, osm_id, name, type, tags, geometry)
            VALUES ${values}
          `;
          
          await this.conn.query(query);
          
          Logger.log(`Batch ${i + 1}/${batches} inserted (${batch.length} rows)`);
        } catch (err) {
          Logger.error(`Failed to insert batch ${i + 1}:`, err);
          
          // Fall back to individual inserts for this batch if batch insert fails
          Logger.log('Falling back to individual inserts for failed batch...');
          for (const row of batch) {
            try {
              const query = `
                INSERT INTO sensitive_locations (id, osm_id, name, type, tags, geometry)
                VALUES (
                  ${row.id},
                  ${row.osm_id},
                  ${row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL'},
                  '${row.type}',
                  '${row.tags.replace(/'/g, "''")}',
                  ST_GeomFromText('${row.geometry}')
                )
              `;
              await this.conn.query(query);
            } catch (individualErr) {
              Logger.warn(`Failed to insert location ${row.osm_id}:`, individualErr);
            }
          }
        }
      }
    }

    // Verify data loaded
    const countResult = await this.conn.query(`SELECT COUNT(*) as count FROM sensitive_locations`);
    const count = countResult.toArray()[0].count;
    
    Logger.log('Loaded locations:', count);
    Logger.groupEnd('Loading OSM data into DuckDB');
  }

  /**
   * Get location type from OSM tags
   */
  private getLocationType(tags: Record<string, string>): string {
    if (tags.amenity === 'school') return 'school';
    if (tags.amenity === 'kindergarten') return 'kindergarten';
    if (tags.leisure === 'playground') return 'playground';
    if (tags.amenity === 'community_centre') return 'community_centre';
    if (tags.leisure === 'sports_centre') return 'sports_centre';
    return 'other';
  }

  /**
   * Calculate buffer zones and eligible areas using spatial SQL
   */
  async calculateZones(
    bufferDistance: number,
    mapBounds: LatLngBounds,
    mode: ProcessingMode = 'balanced',
    progressCallback?: (progress: number, message: string) => void
  ): Promise<{
    restrictedZones: FeatureCollection | null;
    eligibleZones: FeatureCollection | null;
    stats: { locationCount: number; processingTime: number };
    fallbackUsed?: boolean;
  }> {
    if (!this.conn) throw new Error('Database not initialized');

    Logger.group('Calculating zones with DuckDB');
    Logger.log('Buffer distance:', bufferDistance);
    Logger.log('Mode:', mode);

    const startTime = performance.now();

    try {
      // Create bounding box
      const bbox = [
        mapBounds.getWest(),
        mapBounds.getSouth(),
        mapBounds.getEast(),
        mapBounds.getNorth()
      ];

      if (progressCallback) {
        progressCallback(10, 'Creating buffer zones...');
      }

      // Get simplification factor based on mode
      const simplifyFactor = mode === 'fast' ? 0.001 : mode === 'balanced' ? 0.0001 : 0;

      // Convert buffer distance from meters to degrees (approximate)
      // At Berlin's latitude (~52.5°), 1 degree latitude ≈ 111km
      // For longitude, we need to account for latitude: 1 degree ≈ 111km * cos(latitude)
      // At 52.5°: 1 degree longitude ≈ 67.5km
      // Using latitude degrees for simplicity since buffer should be circular
      // 200m ≈ 0.0018 degrees
      const bufferInDegrees = bufferDistance / 111000; // meters to degrees at this latitude

      Logger.log(`Buffer distance: ${bufferDistance}m = ~${bufferInDegrees.toFixed(6)} degrees`);

      // Prepare geometry repair functions based on capabilities
      let geometryRepairSQL = 'geometry';
      if (this.spatialCapabilities.hasMakeValid) {
        geometryRepairSQL = 'ST_MakeValid(geometry)';
      } else if (this.spatialCapabilities.hasReducePrecision) {
        geometryRepairSQL = 'ST_ReducePrecision(geometry, 0.000001)';
      }

      // Calculate buffer zones with geometry repair and optional simplification
      // Only process locations within the current viewport for efficiency
      let bufferQuery = `
        WITH valid_locations AS (
          SELECT 
            id, osm_id, name, type, tags,
            ${geometryRepairSQL} as geometry
          FROM sensitive_locations
          WHERE ST_Intersects(
            geometry,
            ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]})
          )
        ),
        buffered_locations AS (
          SELECT ST_Buffer(geometry, ${bufferInDegrees}) as buffer_geom
          FROM valid_locations
          WHERE ST_IsValid(geometry)
        ),
        unified_buffer AS (
          SELECT ST_Union_Agg(buffer_geom) as restricted_area
          FROM buffered_locations
        )
      `;

      if (simplifyFactor > 0) {
        bufferQuery += `
          SELECT ST_AsGeoJSON(ST_Simplify(restricted_area, ${simplifyFactor})) as geojson
          FROM unified_buffer
        `;
      } else {
        bufferQuery += `
          SELECT ST_AsGeoJSON(restricted_area) as geojson
          FROM unified_buffer
        `;
      }

      if (progressCallback) {
        progressCallback(40, 'Merging buffer zones...');
      }

      const bufferResult = await this.conn.query(bufferQuery);
      const bufferData = bufferResult.toArray()[0];
      
      let restrictedZones: FeatureCollection | null = null;
      if (bufferData && bufferData.geojson) {
        const geometry = JSON.parse(bufferData.geojson);
        restrictedZones = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: geometry,
            properties: { type: 'restricted' }
          }]
        };
      }

      if (progressCallback) {
        progressCallback(70, 'Calculating eligible zones...');
      }

      // Calculate eligible zones (inverse of restricted zones)
      // This is scoped to the current viewport for efficiency
      const eligibleQuery = `
        WITH map_bounds AS (
          SELECT ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}) as bounds
        ),
        valid_locations AS (
          SELECT 
            ${geometryRepairSQL} as geometry
          FROM sensitive_locations
          WHERE ST_Intersects(
            geometry,
            (SELECT bounds FROM map_bounds)
          )
        ),
        buffered_locations AS (
          SELECT ST_Buffer(geometry, ${bufferInDegrees}) as buffer_geom
          FROM valid_locations
          WHERE ST_IsValid(geometry)
        ),
        unified_buffer AS (
          SELECT ST_Union_Agg(buffer_geom) as restricted_area
          FROM buffered_locations
        ),
        eligible_area AS (
          SELECT ST_Difference(
            (SELECT bounds FROM map_bounds),
            COALESCE(restricted_area, ST_GeomFromText('POLYGON EMPTY'))
          ) as eligible_geom
          FROM unified_buffer
        )
        SELECT ST_AsGeoJSON(eligible_geom) as geojson
        FROM eligible_area
        WHERE eligible_geom IS NOT NULL
      `;

      const eligibleResult = await this.conn.query(eligibleQuery);
      const eligibleData = eligibleResult.toArray()[0];
      
      let eligibleZones: FeatureCollection | null = null;
      if (eligibleData && eligibleData.geojson) {
        const geometry = JSON.parse(eligibleData.geojson);
        eligibleZones = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: geometry,
            properties: { type: 'eligible' }
          }]
        };
      }

      // Get statistics
      const statsResult = await this.conn.query(`
        SELECT COUNT(*) as count
        FROM sensitive_locations
        WHERE ST_Intersects(
          geometry,
          ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]})
        )
      `);
      const locationCount = statsResult.toArray()[0].count;

      const processingTime = performance.now() - startTime;

      if (progressCallback) {
        progressCallback(100, 'Complete!');
      }

      Logger.log('Zones calculated successfully');
      Logger.log('Processing time:', processingTime.toFixed(2), 'ms');
      Logger.groupEnd('Calculating zones with DuckDB');

      return {
        restrictedZones,
        eligibleZones,
        stats: {
          locationCount,
          processingTime: Math.round(processingTime)
        }
      };
    } catch (error: any) {
      Logger.error('Error calculating zones with DuckDB', error);
      
      // Check if it's a topology exception
      if (error.message && error.message.includes('TopologyException')) {
        Logger.warn('TopologyException detected - geometry repair needed');
        Logger.warn('Falling back to Turf.js for this operation');
        Logger.groupEnd('Calculating zones with DuckDB');
        
        // Return a special response indicating fallback is needed
        return {
          restrictedZones: null,
          eligibleZones: null,
          stats: {
            locationCount: 0,
            processingTime: Math.round(performance.now() - startTime)
          },
          fallbackUsed: true
        };
      }
      
      Logger.groupEnd('Calculating zones with DuckDB');
      throw error;
    }
  }

  /**
   * Search for locations by name
   */
  async searchLocations(query: string, limit = 20): Promise<Array<{
    id: number;
    osm_id: number;
    name: string;
    type: string;
    lat: number;
    lon: number;
    tags: any;
  }>> {
    if (!this.conn) throw new Error('Database not initialized');
    
    const searchQuery = query.toLowerCase().trim();
    if (!searchQuery) return [];
    
    Logger.log(`Searching for: ${searchQuery}`);
    
    try {
      // Search for locations with names containing the query
      const result = await this.conn.query(`
        SELECT 
          id,
          osm_id,
          name,
          type,
          tags,
          ST_Y(ST_Centroid(geometry)) as lat,
          ST_X(ST_Centroid(geometry)) as lon
        FROM sensitive_locations
        WHERE LOWER(name) LIKE '%${searchQuery.replace(/'/g, "''")}%'
        ORDER BY 
          CASE 
            WHEN LOWER(name) = '${searchQuery.replace(/'/g, "''")}' THEN 0
            WHEN LOWER(name) LIKE '${searchQuery.replace(/'/g, "''")}%' THEN 1
            ELSE 2
          END,
          name
        LIMIT ${limit}
      `);
      
      const results = result.toArray().map(row => ({
        id: row.id,
        osm_id: row.osm_id,
        name: row.name,
        type: row.type,
        lat: row.lat,
        lon: row.lon,
        tags: JSON.parse(row.tags || '{}')
      }));
      
      Logger.log(`Found ${results.length} results`);
      return results;
    } catch (error) {
      Logger.error('Search error:', error);
      return [];
    }
  }

  /**
   * Get statistics about loaded data
   */
  async getStatistics(): Promise<{
    totalLocations: number;
    byType: Record<string, number>;
    boundingBox: number[];
  }> {
    if (!this.conn) throw new Error('Database not initialized');

    // Total count
    const totalResult = await this.conn.query(`SELECT COUNT(*) as count FROM sensitive_locations`);
    const totalLocations = totalResult.toArray()[0].count;

    // Count by type
    const typeResult = await this.conn.query(`
      SELECT type, COUNT(*) as count 
      FROM sensitive_locations 
      GROUP BY type
    `);
    const byType: Record<string, number> = {};
    for (const row of typeResult.toArray()) {
      byType[row.type] = row.count;
    }

    // Bounding box
    const bboxResult = await this.conn.query(`
      SELECT 
        ST_XMin(ST_Union_Agg(geometry)) as min_x,
        ST_YMin(ST_Union_Agg(geometry)) as min_y,
        ST_XMax(ST_Union_Agg(geometry)) as max_x,
        ST_YMax(ST_Union_Agg(geometry)) as max_y
      FROM sensitive_locations
    `);
    const bbox = bboxResult.toArray()[0];
    const boundingBox = [bbox.min_x, bbox.min_y, bbox.max_x, bbox.max_y];

    return { totalLocations, byType, boundingBox };
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    this.initialized = false;
  }
}

export const duckdbSpatial = new DuckDBSpatialService();