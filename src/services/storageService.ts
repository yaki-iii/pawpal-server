import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Storage service abstraction.
 * In production (RENDER=true), uploads to Supabase Storage.
 * In development, writes to local disk (legacy behaviour).
 */

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for cloud storage');
    }
    supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
const USE_CLOUD = process.env.RENDER === 'true' || process.env.SUPABASE_URL != null;

/**
 * Ensure the Supabase Storage bucket exists (idempotent).
 */
async function ensureBucket(): Promise<void> {
  if (!USE_CLOUD) return;
  try {
    const client = getSupabase();
    const { data: buckets } = await client.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === BUCKET_NAME);
    if (!exists) {
      const { error } = await client.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: config.upload.maxFileSize,
      });
      if (error && !error.message.includes('already exists')) {
        logger.warn(`Failed to create Supabase bucket "${BUCKET_NAME}": ${error.message}`);
      } else {
        logger.info(`Supabase storage bucket "${BUCKET_NAME}" created/confirmed`);
      }
    }
  } catch (err) {
    logger.warn(`Could not verify/create Supabase bucket: ${(err as Error).message}`);
  }
}

/**
 * Upload a file buffer to storage (cloud or local disk).
 *
 * @returns The public URL for the uploaded file.
 */
export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
  userId?: string,
): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = path.extname(originalName) || '.jpg';
  const filename = `${timestamp}-${random}${ext}`;

  if (USE_CLOUD) {
    // Supabase Storage path: {date}/{filename}
    const cloudPath = `${dateStr}/${filename}`;
    try {
      await ensureBucket();
      const client = getSupabase();
      const { error } = await client.storage
        .from(BUCKET_NAME)
        .upload(cloudPath, buffer, {
          contentType: mimetype,
          upsert: false,
        });

      if (error) {
        throw new Error(`Supabase upload failed: ${error.message}`);
      }

      const { data: urlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(cloudPath);

      logger.info(`File uploaded to Supabase: ${cloudPath}`);
      return urlData.publicUrl;
    } catch (err) {
      logger.error(`Supabase upload error: ${(err as Error).message}`);
      throw err;
    }
  }

  // Local disk fallback (development)
  const uploadDir = path.resolve(process.cwd(), config.upload.dir, dateStr);
  fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);
  logger.info(`File saved locally: ${filePath}`);
  return `/api/v1/uploads/${dateStr}/${filename}`;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(fileUrl: string): Promise<void> {
  if (!fileUrl) return;

  if (USE_CLOUD) {
    // Extract path from Supabase public URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/uploads/2026-06-25/xxx.jpg
    try {
      const url = new URL(fileUrl);
      const pathParts = url.pathname.split('/');
      const publicIndex = pathParts.indexOf('public');
      if (publicIndex !== -1 && pathParts.length > publicIndex + 2) {
        const objectPath = pathParts.slice(publicIndex + 2).join('/');
        const client = getSupabase();
        const { error } = await client.storage.from(BUCKET_NAME).remove([objectPath]);
        if (error) {
          logger.warn(`Failed to delete Supabase file ${objectPath}: ${error.message}`);
        } else {
          logger.info(`Deleted Supabase file: ${objectPath}`);
        }
      }
    } catch (err) {
      logger.warn(`Could not parse Supabase URL for deletion: ${fileUrl}`);
    }
    return;
  }

  // Local disk
  try {
    const localPath = path.resolve(process.cwd(), fileUrl.replace(/^\/api\/v1\/uploads\//, config.upload.dir + '/'));
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      logger.info(`Deleted local file: ${localPath}`);
    }
  } catch (err) {
    logger.warn(`Failed to delete local file: ${(err as Error).message}`);
  }
}
