import type { Request, Response } from 'express';
import { SearchService } from '../services/searchService';
import { sendError, sendSuccess } from '../middleware/error';

export class SearchController {
  static async globalSearch(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }

      const keyword = String(req.query.q || '').trim();
      if (keyword.length < 1) {
        sendError(res, 400, '请输入搜索关键词');
        return;
      }

      const rawLimit = Number(req.query.limit || 5);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 20) : 5;
      const result = await SearchService.searchAll(keyword, limit, req.userId);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message || '搜索失败');
    }
  }
}
