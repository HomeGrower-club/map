#!/usr/bin/env node

/**
 * Upload Parquet file to Cloudflare R2 storage
 * This script is run during CI/CD to upload the generated parquet file to CDN
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

// Validate environment variables
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('❌ Missing required environment variables:');
  if (!R2_ACCOUNT_ID) console.error('  - R2_ACCOUNT_ID');
  if (!R2_ACCESS_KEY_ID) console.error('  - R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) console.error('  - R2_SECRET_ACCESS_KEY');
  if (!R2_BUCKET) console.error('  - R2_BUCKET');
  process.exit(1);
}

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function uploadParquet() {
  try {
    console.log('📤 Starting upload to Cloudflare R2...');
    
    // Read the parquet file
    const parquetPath = join(__dirname, '..', 'public', 'berlin-locations.parquet');
    const fileContent = readFileSync(parquetPath);
    
    console.log(`📁 File size: ${(fileContent.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Upload to R2 with specific path
    const key = 'map/data/berlin-locations.parquet';
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: fileContent,
      ContentType: 'application/octet-stream',
      CacheControl: 'public, max-age=3600', // Cache for 1 hour
    });
    
    console.log(`📤 Uploading to: ${R2_BUCKET}/${key}`);
    const response = await s3Client.send(command);
    
    console.log('✅ Upload successful!');
    console.log(`📍 File will be available at: https://static.homegrower.club/${key}`);
    console.log(`📊 ETag: ${response.ETag}`);
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    process.exit(1);
  }
}

// Run the upload
uploadParquet();