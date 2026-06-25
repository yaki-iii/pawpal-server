import type { Request, Response } from 'express';
import { MomentService } from '../services/momentService';
import { sendSuccess, sendError } from '../middleware/error';

/**
 * MomentController — handles daily moment (日常碎片) CRUD.
 *
 * Routes:
 *  - POST /pets/:petId/moments
 *  - GET  /pets/:petId/moments
 *  - GET  /feed/moments
 *  - DELETE /moments/:id
 *  - POST /moments/:id/like
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
      const { content, images, mood, location } = req.body;
      const moment = await MomentService.createMoment(req.userId, req.params.petId, {
        content,
        images,
        mood,
        location,
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
      const { cursor, limit = '20' } = req.query;
      const result = await MomentService.getFeed(
        req.userId,
        cursor as string | undefined,
        parseInt(limit as string, 10),
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
}
