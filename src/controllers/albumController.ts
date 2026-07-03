import type { Request, Response } from 'express';
import { AlbumService } from '../services/albumService';
import { sendSuccess, sendError } from '../middleware/error';

export class AlbumController {
  static async getPetAlbum(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }

      const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
      const album = await AlbumService.getPetAlbum(req.params.petId, req.userId, sort);
      sendSuccess(res, album);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else if (message.includes('无权')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 500, message || '获取相册失败');
      }
    }
  }

  static async deleteManualAlbumItems(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }

      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      const result = await AlbumService.deleteManualAlbumItems(req.params.petId, req.userId, ids);
      sendSuccess(res, result, '删除成功');
    } catch (error) {
      AlbumController.sendAlbumError(res, error, '删除相册记录失败');
    }
  }

  static async setAlbumCover(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }

      await AlbumService.setAlbumCover(req.params.petId, req.userId, String(req.body?.imageUrl || ''));
      sendSuccess(res, null, '封面已更新');
    } catch (error) {
      AlbumController.sendAlbumError(res, error, '更新相册封面失败');
    }
  }

  private static sendAlbumError(res: Response, error: unknown, fallback: string): void {
    const message = (error as Error).message;
    if (message.includes('不存在')) {
      sendError(res, 404, message, undefined, 404);
    } else if (message.includes('无权')) {
      sendError(res, 403, message, undefined, 403);
    } else {
      sendError(res, 400, message || fallback);
    }
  }
}
