import type { Request, Response } from 'express';
import path from 'path';
import { sendSuccess, sendError } from '../middleware/error';

export class UploadController {
  static async uploadImages(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const urls = UploadController.uploadedImageUrls(files);
      sendSuccess(res, { urls }, '上传成功', 201);
    } catch (error) {
      sendError(res, 500, (error as Error).message || '上传失败');
    }
  }

  static async uploadMedia(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const media = UploadController.uploadedMediaUrls(files);
      sendSuccess(res, media, '上传成功', 201);
    } catch (error) {
      sendError(res, 500, (error as Error).message || '上传失败');
    }
  }

  static uploadedImageUrls(files: Express.Multer.File[] | undefined): string[] {
    if (!files || files.length === 0) {
      return [];
    }

    return files
      .map((file) => {
        if (file.path?.startsWith('http') || file.path?.startsWith('/api/v1/uploads/')) {
          return file.path;
        }

        if (file.filename && file.destination) {
          const dateDir = path.basename(file.destination);
          return `/api/v1/uploads/${dateDir}/${file.filename}`;
        }

        return null;
      })
      .filter((url): url is string => Boolean(url));
  }

  static uploadedMediaUrls(files: Express.Multer.File[] | undefined): { images: string[]; videos: string[] } {
    const images: string[] = [];
    const videos: string[] = [];

    for (const file of files || []) {
      const [url] = UploadController.uploadedImageUrls([file]);
      if (!url) continue;
      if (file.mimetype?.startsWith('video/')) {
        videos.push(url);
      } else {
        images.push(url);
      }
    }

    return { images, videos };
  }
}
