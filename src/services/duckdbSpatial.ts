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
  private loadedFromParquet = false;
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

      // Configure DuckDB for optimal spatial performance
      await this.configureDuckDB();

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
   * Configure DuckDB for optimal spatial performance
   */
  private async configureDuckDB(): Promise<void> {
    if (!this.conn) return;

    Logger.log('Configuring DuckDB for optimal performance...');

    try {
      // Set memory limit (use more memory for better performance)
      await this.conn.query(`SET memory_limit = '1GB'`);
      
      // Note: Threading is not available in WASM, so we skip thread configuration
      // await this.conn.query(`SET threads = 4`);
      
      // Enable progress bar for long-running queries
      await this.conn.query(`SET enable_progress_bar = true`);
      
      // Optimize for spatial queries
      await this.conn.query(`SET enable_object_cache = true`);
      
      Logger.log('DuckDB configuration optimized');
    } catch (error) {
      Logger.warn('Some DuckDB configuration options may not be available:', error);
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
   * Create database schema for spatial data with optimizations
   */
  private async createSchema(): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');

    Logger.log('Creating database schema with optimizations');

    // Create main table for sensitive locations
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS sensitive_locations (
        id INTEGER PRIMARY KEY,
        osm_id BIGINT,
        name VARCHAR,
        type VARCHAR,
        tags JSON,
        geometry GEOMETRY,
        -- Simplified geometry for faster operations
        geometry_simple GEOMETRY,
        -- Bounding box columns for efficient filtering
        bbox_minx DOUBLE,
        bbox_miny DOUBLE,
        bbox_maxx DOUBLE,
        bbox_maxy DOUBLE,
        -- Grid cell indexes for spatial partitioning
        grid_x INTEGER,
        grid_y INTEGER
      )
    `);

    // Create R-tree spatial index on main geometry
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_geometry 
      ON sensitive_locations USING RTREE (geometry)
    `);

    // Create R-tree index on simplified geometry
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_geometry_simple
      ON sensitive_locations USING RTREE (geometry_simple)
    `);

    // Create composite index on bounding box columns
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_bbox
      ON sensitive_locations (bbox_minx, bbox_miny, bbox_maxx, bbox_maxy)
    `);

    // Create index on grid cells for spatial partitioning
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_grid
      ON sensitive_locations (grid_x, grid_y)
    `);

    // Create index on type for filtered queries
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_type
      ON sensitive_locations (type)
    `);

    // Create index on name for search queries
    await this.conn.query(`
      CREATE INDEX IF NOT EXISTS idx_sensitive_name
      ON sensitive_locations (name)
    `);

    Logger.log('Schema and indexes created successfully');
  }

  /**
   * Check if Parquet file is available
   */
  async checkParquetAvailable(): Promise<boolean> {
    try {
      const response = await fetch('/berlin-locations.parquet', { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Load data from pre-built Parquet file
   * Returns an object with success status and location count
   */
  async loadFromParquet(progressCallback?: (message: string) => void): Promise<{ success: boolean; count?: number }> {
    if (!this.conn || !this.db) throw new Error('Database not initialized');

    try {
      Logger.group('Loading from Parquet file');
      
      if (progressCallback) {
        progressCallback('Checking for pre-built database...');
      }

      // Check if Parquet file exists
      const parquetAvailable = await this.checkParquetAvailable();
      if (!parquetAvailable) {
        Logger.log('Parquet file not found');
        Logger.groupEnd('Loading from Parquet file');
        return { success: false };
      }

      if (progressCallback) {
        progressCallback('Loading optimized database...');
      }

      // Drop existing table if it exists
      await this.conn.query(`DROP TABLE IF EXISTS sensitive_locations`);

      // Register the Parquet file with DuckDB WASM
      // This is necessary for the browser to access the file via HTTP
      await this.db.registerFileURL(
        'berlin-locations.parquet',  // Internal name for DuckDB
        '/berlin-locations.parquet',  // URL path to fetch from
        duckdb.DuckDBDataProtocol.HTTP,  // Use HTTP protocol
        false  // Don't cache the file registration
      );

      // Now load the Parquet file into a table
      await this.conn.query(`
        CREATE TABLE sensitive_locations AS 
        SELECT * FROM read_parquet('berlin-locations.parquet')
      `);

      // Recreate indexes (they're not stored in Parquet)
      if (progressCallback) {
        progressCallback('Creating spatial indexes...');
      }

      await this.conn.query(`
        CREATE INDEX IF NOT EXISTS idx_sensitive_geometry 
        ON sensitive_locations USING RTREE (geometry)
      `);

      await this.conn.query(`
        CREATE INDEX IF NOT EXISTS idx_sensitive_geometry_simple
        ON sensitive_locations USING RTREE (geometry_simple)
      `);

      await this.conn.query(`
        CREATE INDEX IF NOT EXISTS idx_sensitive_bbox
        ON sensitive_locations (bbox_minx, bbox_miny, bbox_maxx, bbox_maxy)
      `);

      await this.conn.query(`
        CREATE INDEX IF NOT EXISTS idx_sensitive_grid
        ON sensitive_locations (grid_x, grid_y)
      `);

      await this.conn.query(`
        CREATE INDEX IF NOT EXISTS idx_sensitive_type
        ON sensitive_locations (type)
      `);

      await this.conn.query(`
        CREATE INDEX IF NOT EXISTS idx_sensitive_name
        ON sensitive_locations (name)
      `);

      // Update statistics
      await this.conn.query(`ANALYZE sensitive_locations`);

      // Verify data loaded and get count
      const countResult = await this.conn.query(`SELECT COUNT(*) as count FROM sensitive_locations`);
      const count = Number(countResult.toArray()[0].count); // Convert BigInt to Number

      this.loadedFromParquet = true;
      Logger.log(`Loaded ${count} locations from Parquet`);
      Logger.groupEnd('Loading from Parquet file');

      if (progressCallback) {
        progressCallback(`Loaded ${count} locations from optimized database`);
      }

      return { success: true, count };
    } catch (error) {
      Logger.error('Failed to load from Parquet:', error);
      Logger.groupEnd('Loading from Parquet file');
      return { success: false };
    }
  }

  /**
   * Check if data is loaded from Parquet
   */
  isLoadedFromParquet(): boolean {
    return this.loadedFromParquet;
  }

  /**
   * Force reload from OSM API (eject Parquet)
   */
  async ejectParquetData(): Promise<void> {
    if (!this.conn) throw new Error('Database not initialized');

    Logger.log('Ejecting Parquet data, preparing for fresh load...');
    
    // Drop the existing table
    await this.conn.query(`DROP TABLE IF EXISTS sensitive_locations`);
    
    // Recreate the schema
    await this.createSchema();
    
    this.loadedFromParquet = false;
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
    const insertData: Array<{
      id: number;
      osm_id: number;
      name: string | null;
      type: string;
      tags: string;
      geometry: string;
    }> = [];
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
            type: this.getLocationType(node.tags || {}),
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
              type: this.getLocationType(way.tags || {}),
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
      
      const BATCH_SIZE = 5000; // Insert 5000 rows at a time
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
          // Build a multi-row INSERT statement with computed columns
          const values = batch.map(row => {
            const name = row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL';
            const tags = `'${row.tags.replace(/'/g, "''")}'`;
            const geometry = `ST_GeomFromText('${row.geometry}')`;
            
            // All computed values are done in SQL for efficiency
            return `(${row.id}, ${row.osm_id}, ${name}, '${row.type}', ${tags}, ${geometry},
              ST_Simplify(${geometry}, 0.0001), -- simplified geometry
              ST_XMin(${geometry}), -- bbox_minx
              ST_YMin(${geometry}), -- bbox_miny
              ST_XMax(${geometry}), -- bbox_maxx
              ST_YMax(${geometry}), -- bbox_maxy
              CAST(FLOOR(ST_X(ST_Centroid(${geometry})) / 0.01) AS INTEGER), -- grid_x (0.01 degree cells)
              CAST(FLOOR(ST_Y(ST_Centroid(${geometry})) / 0.01) AS INTEGER)  -- grid_y
            )`;
          }).join(',\n');
          
          const query = `
            INSERT INTO sensitive_locations (
              id, osm_id, name, type, tags, geometry,
              geometry_simple, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
              grid_x, grid_y
            )
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
              const geom = `ST_GeomFromText('${row.geometry}')`;
              const query = `
                INSERT INTO sensitive_locations (
                  id, osm_id, name, type, tags, geometry,
                  geometry_simple, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
                  grid_x, grid_y
                )
                VALUES (
                  ${row.id},
                  ${row.osm_id},
                  ${row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL'},
                  '${row.type}',
                  '${row.tags.replace(/'/g, "''")}',
                  ${geom},
                  ST_Simplify(${geom}, 0.0001),
                  ST_XMin(${geom}),
                  ST_YMin(${geom}),
                  ST_XMax(${geom}),
                  ST_YMax(${geom}),
                  CAST(FLOOR(ST_X(ST_Centroid(${geom})) / 0.01) AS INTEGER),
                  CAST(FLOOR(ST_Y(ST_Centroid(${geom})) / 0.01) AS INTEGER)
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

    // After loading, update statistics for query optimization
    await this.conn.query(`ANALYZE sensitive_locations`);

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
   * Calculate buffer zones and eligible areas using optimized spatial SQL
   * All calculations done in a single efficient query
   */
  async calculateZones(
    bufferDistance: number,
    mapBounds: LatLngBounds,
    mode: ProcessingMode = 'balanced',
    progressCallback?: (progress: number, message: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{
    restrictedZones: FeatureCollection | null;
    eligibleZones: FeatureCollection | null;
    stats: { locationCount: number; processingTime: number };
  }> {
    if (!this.conn) throw new Error('Database not initialized');

    Logger.group('Calculating zones with DuckDB (Optimized)');
    Logger.log('Buffer distance:', bufferDistance);
    Logger.log('Mode:', mode);

    const startTime = performance.now();

    // Check if operation was aborted before starting
    if (abortSignal?.aborted) {
      const error = new Error('Operation was aborted');
      error.name = 'AbortError';
      throw error;
    }

    try {
      // Create bounding box
      const bbox = {
        west: mapBounds.getWest(),
        south: mapBounds.getSouth(),
        east: mapBounds.getEast(),
        north: mapBounds.getNorth()
      };

      if (progressCallback) {
        progressCallback(10, 'Preparing optimized spatial query...');
      }

      // Get simplification factor and choose geometry column based on mode
      const useSimplified = mode === 'fast' || mode === 'balanced';
      const geometryColumn = useSimplified ? 'geometry_simple' : 'geometry';
      const simplifyFactor = mode === 'fast' ? 0.001 : mode === 'balanced' ? 0.0001 : 0;

      // Convert buffer distance from meters to degrees
      const bufferInDegrees = bufferDistance / 111000;
      Logger.log(`Buffer: ${bufferDistance}m = ~${bufferInDegrees.toFixed(6)}°`);

      // Calculate grid cells that intersect with viewport for efficient filtering
      const gridMinX = Math.floor(bbox.west / 0.01);
      const gridMaxX = Math.ceil(bbox.east / 0.01);
      const gridMinY = Math.floor(bbox.south / 0.01);
      const gridMaxY = Math.ceil(bbox.north / 0.01);
      
      // Debug information about bounds and grid cells
      Logger.log(`Map bounds: N=${bbox.north.toFixed(6)}, S=${bbox.south.toFixed(6)}, E=${bbox.east.toFixed(6)}, W=${bbox.west.toFixed(6)}`);
      Logger.log(`Grid cells: X=[${gridMinX}, ${gridMaxX}] (${gridMaxX - gridMinX + 1} cells), Y=[${gridMinY}, ${gridMaxY}] (${gridMaxY - gridMinY + 1} cells)`);
      const totalGridCells = (gridMaxX - gridMinX + 1) * (gridMaxY - gridMinY + 1);
      Logger.log(`Total grid cells to check: ${totalGridCells}`);
      
      // Warn if the grid search area is too large (might indicate world-wide bounds)
      if (totalGridCells > 10000) {
        Logger.warn(`Very large search area detected (${totalGridCells} grid cells). This might indicate improper map bounds.`);
      }

      if (progressCallback) {
        progressCallback(20, 'Executing optimized zone calculation...');
      }

      // Check if operation was aborted before expensive query
      if (abortSignal?.aborted) {
        const error = new Error('Operation was aborted');
        error.name = 'AbortError';
        throw error;
      }

      // Single optimized query that calculates both restricted and eligible zones
      // Uses all our optimization techniques:
      // 1. Grid cell pre-filtering
      // 2. Bounding box pre-filtering (uses indexes)
      // 3. Simplified geometry for fast mode
      // 4. Single pass calculation
      const optimizedQuery = `
        WITH 
        -- Define the map viewport
        viewport AS (
          SELECT ST_MakeEnvelope(${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}) as bounds
        ),
        -- Pre-filter locations using grid cells and bounding box
        filtered_locations AS (
          SELECT ${geometryColumn} as geom
          FROM sensitive_locations
          WHERE 
            -- Grid cell filtering (uses index)
            grid_x >= ${gridMinX} AND grid_x <= ${gridMaxX}
            AND grid_y >= ${gridMinY} AND grid_y <= ${gridMaxY}
            -- Bounding box pre-filtering using indexed columns
            AND bbox_minx <= ${bbox.east}
            AND bbox_maxx >= ${bbox.west}
            AND bbox_miny <= ${bbox.north}
            AND bbox_maxy >= ${bbox.south}
            -- Final exact intersection check (uses R-tree index)
            AND ST_Intersects(${geometryColumn}, (SELECT bounds FROM viewport))
        ),
        -- Create buffers for filtered locations
        buffers AS (
          SELECT ST_Buffer(geom, ${bufferInDegrees}) as buffer_geom
          FROM filtered_locations
        ),
        -- Union all buffers into restricted area
        restricted AS (
          SELECT 
            COALESCE(ST_Union_Agg(buffer_geom), ST_GeomFromText('POLYGON EMPTY')) as area,
            COUNT(*) as location_count
          FROM buffers
        ),
        -- Calculate eligible area (viewport minus restricted)
        eligible AS (
          SELECT 
            ST_Difference(
              (SELECT bounds FROM viewport),
              (SELECT area FROM restricted)
            ) as area
        ),
        -- Apply optional simplification for performance
        final_zones AS (
          SELECT 
            ${simplifyFactor > 0 ? 
              `ST_Simplify((SELECT area FROM restricted), ${simplifyFactor})` : 
              '(SELECT area FROM restricted)'} as restricted_area,
            ${simplifyFactor > 0 ? 
              `ST_Simplify((SELECT area FROM eligible), ${simplifyFactor})` : 
              '(SELECT area FROM eligible)'} as eligible_area,
            (SELECT location_count FROM restricted) as count
        )
        -- Return both zones as GeoJSON
        SELECT 
          ST_AsGeoJSON(restricted_area) as restricted_json,
          ST_AsGeoJSON(eligible_area) as eligible_json,
          count as location_count
        FROM final_zones
      `;

      // Execute the optimized query
      const result = await this.conn.query(optimizedQuery);
      
      // Check if operation was aborted after query
      if (abortSignal?.aborted) {
        const error = new Error('Operation was aborted');
        error.name = 'AbortError';
        throw error;
      }
      
      const data = result.toArray()[0];
      
      // Debug: Check how many locations were found
      Logger.log(`Locations found in viewport: ${data?.location_count || 0}`);

      if (progressCallback) {
        progressCallback(80, 'Processing results...');
      }

      // Parse results into FeatureCollections
      let restrictedZones: FeatureCollection | null = null;
      if (data && data.restricted_json) {
        const geometry = JSON.parse(data.restricted_json);
        restrictedZones = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: geometry,
            properties: { type: 'restricted' }
          }]
        };
      }

      let eligibleZones: FeatureCollection | null = null;
      if (data && data.eligible_json) {
        const geometry = JSON.parse(data.eligible_json);
        eligibleZones = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: geometry,
            properties: { type: 'eligible' }
          }]
        };
      }

      const processingTime = performance.now() - startTime;

      if (progressCallback) {
        progressCallback(100, 'Complete!');
      }

      Logger.log('Zones calculated successfully');
      Logger.log(`Processing time: ${processingTime.toFixed(2)}ms`);
      Logger.log(`Locations processed: ${data?.location_count || 0}`);
      Logger.groupEnd('Calculating zones with DuckDB (Optimized)');

      return {
        restrictedZones,
        eligibleZones,
        stats: {
          locationCount: data?.location_count || 0,
          processingTime: Math.round(processingTime)
        }
      };
    } catch (error) {
      Logger.error('Error calculating zones with DuckDB', error);
      Logger.groupEnd('Calculating zones with DuckDB (Optimized)');
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
    tags: Record<string, string>;
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
    indexStats?: Array<Record<string, unknown>>;
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

    // Bounding box - use pre-computed bbox columns for instant results
    // This avoids expensive ST_Union_Agg operation on all geometries
    const bboxResult = await this.conn.query(`
      SELECT 
        MIN(bbox_minx) as min_x,
        MIN(bbox_miny) as min_y,
        MAX(bbox_maxx) as max_x,
        MAX(bbox_maxy) as max_y
      FROM sensitive_locations
    `);
    const bbox = bboxResult.toArray()[0];
    const boundingBox = [bbox.min_x, bbox.min_y, bbox.max_x, bbox.max_y];

    // Get index statistics if available
    let indexStats;
    try {
      const indexResult = await this.conn.query(`
        SELECT * FROM duckdb_indexes() 
        WHERE table_name = 'sensitive_locations'
      `);
      indexStats = indexResult.toArray();
    } catch {
      Logger.log('Index statistics not available');
    }

    return { totalLocations, byType, boundingBox, indexStats };
  }

  /**
   * Analyze query performance (for debugging)
   */
  async analyzeQueryPerformance(query: string): Promise<string> {
    if (!this.conn) throw new Error('Database not initialized');
    
    try {
      const result = await this.conn.query(`EXPLAIN ANALYZE ${query}`);
      return result.toString();
    } catch (error) {
      Logger.error('Query analysis failed:', error);
      return 'Analysis failed';
    }
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