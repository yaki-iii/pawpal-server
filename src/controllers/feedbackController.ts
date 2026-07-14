import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../middleware/error';
import { FeedbackService } from '../services/feedbackService';

export class FeedbackController {
  static async create(req: Request, res: Response): Promise<void> {
    if (!req.userId) { sendError(res, 401, '未授权'); return; }
    try { sendSuccess(res, await FeedbackService.create(req.userId, req.body), '反馈已提交', 201); }
    catch (error) { sendError(res, 400, (error as Error).message || '反馈提交失败'); }
  }
}
