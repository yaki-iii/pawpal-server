import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../middleware/error';
import { ReportService } from '../services/reportService';

export class ReportController {
  static async listMyReports(req: Request, res: Response): Promise<void> {
    if (!req.userId) { sendError(res, 401, '未授权'); return; }
    try { sendSuccess(res, await ReportService.listByReporter(req.userId)); }
    catch (error) { sendError(res, 500, (error as Error).message || '举报记录加载失败'); }
  }

  static async createReport(req: Request, res: Response): Promise<void> {
    if (!req.userId) {
      sendError(res, 401, '未授权', undefined, 401);
      return;
    }

    try {
      const report = await ReportService.createReport(req.userId, req.body);
      sendSuccess(res, report, '举报已提交', 201);
    } catch (error) {
      const message = (error as Error).message || '举报失败';
      const status = message.includes('不存在') ? 404 : 400;
      sendError(res, status, message, undefined, status);
    }
  }
}
