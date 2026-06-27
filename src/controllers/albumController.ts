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

      const album = await AlbumService.getPetAlbum(req.params.petId, req.userId);
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
}
