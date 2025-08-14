#!/usr/bin/env node

/**
 * Script to download OSM data and generate a Parquet file for faster loading
 * This runs at build time to pre-process the data
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import duckdb from 'duckdb';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const BERLIN_BOUNDS = {
  north: 52.6755,
  south: 52.3382,
  east: 13.7612,
  west: 13.0892
};

const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  node["amenity"="school"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  way["amenity"="school"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  relation["amenity"="school"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  
  node["amenity"="kindergarten"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  way["amenity"="kindergarten"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});

  node["leisure"="fitness_centre"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  way["leisure"="fitness_centre"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  
  node["leisure"="playground"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  way["leisure"="playground"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  
  node["amenity"="community_centre"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  way["amenity"="community_centre"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  
  node["leisure"="sports_centre"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
  way["leisure"="sports_centre"](${BERLIN_BOUNDS.south},${BERLIN_BOUNDS.west},${BERLIN_BOUNDS.north},${BERLIN_BOUNDS.east});
);
out body;
>;
out skel qt;
`.trim();

/**
 * Download data from Overpass API
 */
async function downloadOSMData() {
  console.log('📥 Downloading OSM data from Overpass API...');
  
  return new Promise((resolve, reject) => {
    const postData = `data=${encodeURIComponent(OVERPASS_QUERY)}`;
    
    const options = {
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    let responseData = '';
    
    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          console.log(`✅ Downloaded ${data.elements.length} elements`);
          resolve(data);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Get location type from OSM tags
 */
function getLocationType(tags) {
  if (!tags) return 'other';
  if (tags.amenity === 'school') return 'school';
  if (tags.amenity === 'kindergarten') return 'kindergarten';
  if (tags.leisure === 'playground') return 'playground';
  if (tags.amenity === 'community_centre') return 'community_centre';
  if (tags.leisure === 'sports_centre') return 'sports_centre';
  return 'other';
}

/**
 * Process OSM data and create Parquet file
 */
async function createParquetFile(osmData) {
  console.log('🗄️ Processing data with DuckDB...');
  
  const db = new duckdb.Database(':memory:');
  const conn = db.connect();
  
  try {
    // Install and load spatial extension
    conn.exec('INSTALL spatial');
    conn.exec('LOAD spatial');
    
    // Create table with all optimization columns
    conn.exec(`
      CREATE TABLE sensitive_locations (
        id INTEGER PRIMARY KEY,
        osm_id BIGINT,
        name VARCHAR,
        type VARCHAR,
        tags JSON,
        geometry GEOMETRY,
        geometry_simple GEOMETRY,
        bbox_minx DOUBLE,
        bbox_miny DOUBLE,
        bbox_maxx DOUBLE,
        bbox_maxy DOUBLE,
        grid_x INTEGER,
        grid_y INTEGER
      )
    `);
    
    // Process OSM data
    const nodes = new Map();
    const rows = [];
    let id = 1;
    
    // First pass: collect nodes
    for (const element of osmData.elements) {
      if (element.type === 'node') {
        nodes.set(element.id, [element.lon, element.lat]);
      }
    }
    
    // Second pass: create rows
    for (const element of osmData.elements) {
      if (element.type === 'node' && element.tags) {
        rows.push({
          id: id++,
          osm_id: element.id,
          name: element.tags?.name || null,
          type: getLocationType(element.tags),
          tags: JSON.stringify(element.tags),
          geometry: `POINT(${element.lon} ${element.lat})`
        });
      } else if (element.type === 'way' && element.tags) {
        const coords = element.nodes
          .map(nodeId => nodes.get(nodeId))
          .filter(coord => coord !== undefined);
        
        if (coords.length >= 2) {
          const isClosed = coords[0][0] === coords[coords.length - 1][0] && 
                          coords[0][1] === coords[coords.length - 1][1];
          
          const coordString = coords.map(c => `${c[0]} ${c[1]}`).join(', ');
          const geometry = isClosed && coords.length >= 4
            ? `POLYGON((${coordString}))`
            : `LINESTRING(${coordString})`;
          
          rows.push({
            id: id++,
            osm_id: element.id,
            name: element.tags?.name || null,
            type: getLocationType(element.tags),
            tags: JSON.stringify(element.tags),
            geometry: geometry
          });
        }
      }
    }
    
    console.log(`📊 Inserting ${rows.length} locations into DuckDB...`);
    
    // Insert data in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, Math.min(i + BATCH_SIZE, rows.length));
      
      for (const row of batch) {
        const name = row.name ? `'${row.name.replace(/'/g, "''")}'` : 'NULL';
        const tags = `'${row.tags.replace(/'/g, "''")}'::JSON`;
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
            ${name},
            '${row.type}',
            ${tags},
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
        
        try {
          conn.exec(query);
        } catch (error) {
          console.warn(`Failed to insert location ${row.osm_id}: ${error.message}`);
        }
      }
      
      const progress = Math.round(((i + batch.length) / rows.length) * 100);
      console.log(`Progress: ${progress}%`);
    }
    
    // Create indexes
    console.log('📇 Creating indexes...');
    conn.exec('CREATE INDEX idx_geometry ON sensitive_locations USING RTREE (geometry)');
    conn.exec('CREATE INDEX idx_geometry_simple ON sensitive_locations USING RTREE (geometry_simple)');
    conn.exec('CREATE INDEX idx_bbox ON sensitive_locations (bbox_minx, bbox_miny, bbox_maxx, bbox_maxy)');
    conn.exec('CREATE INDEX idx_grid ON sensitive_locations (grid_x, grid_y)');
    conn.exec('CREATE INDEX idx_type ON sensitive_locations (type)');
    conn.exec('CREATE INDEX idx_name ON sensitive_locations (name)');
    
    // Ensure public directory exists
    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Export to Parquet (using proper COPY syntax)
    const outputPath = path.join(publicDir, 'berlin-locations.parquet');
    console.log(`💾 Exporting to Parquet: ${outputPath}`);
    
    // Use COPY with SELECT to be explicit
    conn.exec(`
      COPY (SELECT * FROM sensitive_locations) 
      TO '${outputPath}' 
      (FORMAT PARQUET, COMPRESSION ZSTD)
    `);
    
    // Get statistics using exec and callback
    const getStats = () => new Promise((resolve, reject) => {
      conn.all('SELECT COUNT(*) as count FROM sensitive_locations', (err, result) => {
        if (err) reject(err);
        else resolve(result[0]);
      });
    });
    
    const getTypeStats = () => new Promise((resolve, reject) => {
      conn.all('SELECT type, COUNT(*) as count FROM sensitive_locations GROUP BY type', (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    const stats = await getStats();
    const typeStats = await getTypeStats();
    
    console.log('\n📊 Statistics:');
    console.log(`Total locations: ${stats.count}`);
    console.log('By type:');
    for (const stat of typeStats) {
      console.log(`  ${stat.type}: ${stat.count}`);
    }
    
    // We don't need a separate metadata file - all stats are queryable from DuckDB directly
    console.log('📊 All metadata is embedded in the Parquet file');
    
  } finally {
    conn.close();
    db.close();
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Parquet generation process...');
  console.log(`📍 Berlin bounds: ${JSON.stringify(BERLIN_BOUNDS)}`);
  
  try {
    // Check if we should use cached data for development
    const cacheFile = path.join(__dirname, 'osm-data-cache.json');
    let osmData;
    
    if (process.argv.includes('--use-cache') && fs.existsSync(cacheFile)) {
      console.log('📂 Using cached OSM data...');
      osmData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
      // Download fresh data
      osmData = await downloadOSMData();
      
      // Save to cache for development
      fs.writeFileSync(cacheFile, JSON.stringify(osmData, null, 2));
      console.log('💾 Cached OSM data for future use');
    }
    
    // Create Parquet file
    await createParquetFile(osmData);
    
    console.log('\n✅ Parquet file generated successfully!');
    console.log('📦 The file will be served with your application');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
main();