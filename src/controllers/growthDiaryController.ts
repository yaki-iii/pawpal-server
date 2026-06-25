import type { Request, Response } from 'express';
import { GrowthDiaryService } from '../services/growthDiaryService';
import { sendSuccess, sendError } from '../middleware/error';

/**
 * GrowthDiaryController — handles growth diary entry CRUD.
 * Routes mounted at /pets/:petId/entries
 */
export class GrowthDiaryController {
  /**
   * GET /pets/:petId/entries
   * List all growth diary entries for a pet.
   */
  static async listEntries(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const entries = await GrowthDiaryService.listEntries(req.params.petId, req.userId);
      sendSuccess(res, entries);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }

  /**
   * POST /pets/:petId/entries
   * Create a new growth diary entry with media uploads (multipart/form-data).
   * Form fields: title, content, mood
   * Files: media[] (images and/or videos, max 9)
   */
  static async createEntry(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { title = '', content = '', mood = '' } = req.body;
      const files = (req.files as Express.Multer.File[]) || [];

      const entry = await GrowthDiaryService.createEntry(
        req.params.petId,
        req.userId,
        { title, content, mood },
        files,
      );
      sendSuccess(res, entry, '记录成功', 201);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message || '创建失败');
      }
    }
  }

  /**
   * DELETE /pets/:petId/entries/:entryId
   * Delete a growth diary entry (verifies ownership).
   */
  static async deleteEntry(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await GrowthDiaryService.deleteEntry(req.params.petId, req.params.entryId, req.userId);
      sendSuccess(res, null, '删除成功');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }
}
