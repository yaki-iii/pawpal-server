import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { config } from '../config';
import { logger } from '../utils/logger';
import { uploadFile } from '../services/storageService';

/**
 * Multer storage configuration.
 *
 * In production (RENDER=true or SUPABASE_URL set), uses memoryStorage so the
 * post-write middleware can upload to Supabase Storage.
 * In development, falls back to diskStorage (local server/uploads/...).
 */
const USE_CLOUD = process.env.RENDER === 'true' || !!process.env.SUPABASE_URL;

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const uploadPath = path.resolve(process.cwd(), config.upload.dir, dateStr);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const isHeic = isHeicFile(file);
    const ext = isHeic ? '.jpg' : path.extname(file.originalname);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    cb(null, `${timestamp}-${random}${ext}`);
  },
});

const storage = USE_CLOUD ? multer.memoryStorage() : diskStorage;

/**
 * Detect HEIC/HEIF files by mimetype or extension.
 */
function isHeicFile(file: Express.Multer.File): boolean {
  const m = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  return (
    m === 'image/heic' ||
    m === 'image/heif' ||
    ext === '.heic' ||
    ext === '.heif'
  );
}

/**
 * File filter — allow image (including HEIC/HEIF) and video formats.
 */
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件格式，仅支持 jpg/jpeg/png/webp/heic 图片和 mp4/webm/quicktime 视频'));
  }
};

/**
 * Multer upload instance.
 * Max file size and max files per request are configurable.
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 9,
  },
});

/**
 * Post-write middleware: handles HEIC conversion + cloud upload.
 *
 * For memory storage (cloud mode):
 *   1. Convert HEIC buffers to JPEG via sharp
 *   2. Upload each file buffer to Supabase Storage
 *   3. Replace file.path with the public URL so downstream code works unchanged
 *
 * For disk storage (dev mode):
 *   1. Convert HEIC files in-place (same as before)
 *   2. File URLs remain local /api/v1/uploads/... paths
 */
export async function convertHeicIfNeeded(
  req: Express.Request,
  _res: Express.Response,
  next: () => void,
): Promise<void> {
  const files = requestFiles(req);
  if (!files || files.length === 0) {
    next();
    return;
  }

  try {
    for (const file of files) {
      let buffer = file.buffer;
      let mimetype = file.mimetype;

      // --- HEIC conversion ---
      if (isHeicFile(file)) {
        if (buffer) {
          // Memory mode: convert buffer directly
          try {
            buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
            mimetype = 'image/jpeg';
            file.originalname = file.originalname.replace(/\.(heic|heif)$/i, '.jpg');
            file.mimetype = 'image/jpeg';
            logger.info(`HEIC converted to JPEG (memory): ${file.originalname}`);
          } catch (err) {
            logger.warn(`HEIC conversion failed for ${file.originalname}: ${(err as Error).message}`);
          }
        } else {
          // Disk mode: convert in-place (original logic)
          const targetPath = file.path;
          const tempPath = `${file.path}.heic.tmp`;
          if (fs.existsSync(targetPath)) {
            fs.renameSync(targetPath, tempPath);
            try {
              await sharp(tempPath).jpeg({ quality: 90 }).toFile(targetPath);
              fs.unlinkSync(tempPath);
              file.mimetype = 'image/jpeg';
              file.originalname = file.originalname.replace(/\.(heic|heif)$/i, '.jpg');
              logger.info(`HEIC converted to JPEG (disk): ${file.originalname} -> ${path.basename(targetPath)}`);
            } catch (err) {
              if (fs.existsSync(tempPath)) fs.renameSync(tempPath, targetPath);
              logger.warn(`HEIC conversion failed for ${file.originalname}: ${(err as Error).message}`);
            }
          }
        }
      }

      // --- Cloud upload (memory mode only) ---
      if (USE_CLOUD && buffer) {
        try {
          const userId = (req as any).userId;
          const publicUrl = await uploadFile(buffer, file.originalname, mimetype, userId);
          // Replace file.path so all downstream code works unchanged
          file.path = publicUrl;
          logger.info(`File uploaded to cloud: ${publicUrl}`);
        } catch (err) {
          logger.error(`Cloud upload failed for ${file.originalname}: ${(err as Error).message}`);
          return next(new Error('文件上传失败，请稍后重试'));
        }
      }
    }
  } catch (err) {
    logger.error(`Upload middleware error: ${(err as Error).message}`);
  }

  next();
}

function requestFiles(req: Express.Request): Express.Multer.File[] | null {
  if (req.file) return [req.file];
  if (!req.files) return null;
  if (Array.isArray(req.files)) return req.files;
  return Object.values(req.files).flat();
}

/**
 * Middleware for single image upload (field name: "image").
 */
export const uploadSingle = [upload.single('image'), convertHeicIfNeeded];

/**
 * Middleware for multiple image uploads (field name: "images", max 9).
 */
export const uploadMultiple = [upload.array('images', 9), convertHeicIfNeeded];

/**
 * Middleware for mixed media uploads (images + videos, field name: "media", max 9).
 */
export const uploadMedia = [upload.array('media', 9), convertHeicIfNeeded];

/**
 * Middleware for moment uploads (images + videos in separate field names).
 */
export const momentImageUploadMaxCount = 9;

export const uploadMomentMedia = [
  upload.fields([
    { name: 'images', maxCount: momentImageUploadMaxCount },
    { name: 'videos', maxCount: 1 },
  ]),
  convertHeicIfNeeded,
];

/**
 * Helper to construct the public URL for an uploaded file.
 * For cloud-stored files, file.path already contains the full public URL.
 */
export function getFileUrl(filename: string, dateStr: string): string {
  // If filename already starts with http, it's a cloud URL
  if (filename.startsWith('http')) {
    return filename;
  }
  return `/api/v1/uploads/${dateStr}/${filename}`;
}
