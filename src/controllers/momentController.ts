import type { Request, Response } from 'express';
import { MomentService } from '../services/momentService';
import { sendSuccess, sendError } from '../middleware/error';
import { UploadController } from './uploadController';

/**
 * MomentController — handles daily moment (日常碎片) CRUD.
 *
 * Routes:
 *  - POST /pets/:petId/moments
 *  - GET  /pets/:petId/moments
 *  - GET  /feed/moments
 *  - DELETE /moments/:id
 *  - POST /moments/:id/like
 *  - POST /moments/:id/share
 *  - GET  /moments/:id/comments
 *  - POST /moments/:id/comments
 */
export class MomentController {
  /**
   * POST /pets/:petId/moments
   */
  static async createMoment(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { content, images, videos, mood, location, visibility } = req.body;
      const bodyImages = Array.isArray(images) ? images : images ? [images] : [];
      const bodyVideos = Array.isArray(videos) ? videos : videos ? [videos] : [];
      const uploadedMedia = UploadController.uploadedMediaUrls(MomentController.uploadedFiles(req.files));
      const imageUrls = [...bodyImages, ...uploadedMedia.images];
      const videoUrls = [...bodyVideos, ...uploadedMedia.videos];
      if (!String(content || '').trim() && imageUrls.length === 0 && videoUrls.length === 0) {
        sendError(res, 400, '请填写内容或上传至少一张图片/视频');
        return;
      }
      const moment = await MomentService.createMoment(req.userId, req.params.petId, {
        content: String(content || ''),
        images: imageUrls,
        videos: videoUrls,
        mood,
        location,
        visibility,
      });
      sendSuccess(res, moment, '发布成功', 201);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else if (message.includes('无权')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 400, message || '发布失败');
      }
    }
  }

  /**
   * GET /pets/:petId/moments
   */
  static async listMoments(req: Request, res: Response): Promise<void> {
    try {
      const { cursor, limit = '20' } = req.query;
      const result = await MomentService.listByPet(
        req.params.petId,
        cursor as string | undefined,
        parseInt(limit as string, 10),
        req.userId,
      );
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /feed/moments
   */
  static async getMomentsFeed(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { cursor, limit = '20', followingOnly } = req.query;
      const result = await MomentService.getFeed(
        req.userId,
        cursor as string | undefined,
        parseInt(limit as string, 10),
        followingOnly === 'true',
      );
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * DELETE /moments/:id
   */
  static async deleteMoment(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await MomentService.deleteMoment(req.params.id, req.userId);
      sendSuccess(res, null, '删除成功');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else if (message.includes('无权')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 400, message || '删除失败');
      }
    }
  }

  /**
   * POST /moments/:id/like
   */
  static async toggleLike(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const result = await MomentService.toggleLike(req.params.id, req.userId);
      sendSuccess(res, result);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message || '操作失败');
      }
    }
  }

  /**
   * POST /moments/:id/share
   */
  static async recordShare(req: Request, res: Response): Promise<void> {
    try {
      const result = await MomentService.recordShare(req.params.id);
      sendSuccess(res, result);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message || '操作失败');
      }
    }
  }

  /**
   * POST /moments/:id/promote-to-diary
   */
  static async promoteToDiary(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const entry = await MomentService.promoteToDiary(req.params.id, req.userId);
      sendSuccess(res, entry, '已升级为正式日记', 201);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else if (message.includes('无权')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 400, message || '升级失败');
      }
    }
  }

  /**
   * GET /moments/:id/comments
   */
  static async listComments(req: Request, res: Response): Promise<void> {
    try {
      const comments = await MomentService.listComments(req.params.id);
      sendSuccess(res, comments);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * POST /moments/:id/comments
   */
  static async createComment(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }

      const content = String(req.body.content || '').trim();
      if (!content) {
        sendError(res, 400, '评论不能为空');
        return;
      }

      const comment = await MomentService.createComment(
        req.params.id,
        req.userId,
        content,
        req.body.parentId,
      );
      sendSuccess(res, comment, '评论成功', 201);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message || '评论失败');
      }
    }
  }

  private static uploadedFiles(files: Request['files']): Express.Multer.File[] | undefined {
    if (!files) return undefined;
    if (Array.isArray(files)) return files;
    return Object.values(files).flat();
  }
}
