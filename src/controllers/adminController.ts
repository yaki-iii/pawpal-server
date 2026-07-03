import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../middleware/error';
import { logger } from '../utils/logger';
import { AdminService } from '../services/adminService';

function requestContext(req: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || '',
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
  };
}

/**
 * AdminController handles management-backend auth and core operations.
 */
export class AdminController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await AdminService.login(email, password, requestContext(req));
      sendSuccess(res, result, '登录成功');
    } catch (error) {
      logger.warn(`Admin login failed: ${(error as Error).message}`);
      sendError(res, 401, (error as Error).message || '登录失败', undefined, 401);
    }
  }

  static async getMe(req: Request, res: Response): Promise<void> {
    if (!req.admin) {
      sendError(res, 401, '未授权', undefined, 401);
      return;
    }

    sendSuccess(res, req.admin);
  }

  static async getDashboardSummary(_req: Request, res: Response): Promise<void> {
    try {
      const summary = await AdminService.getDashboardSummary();
      sendSuccess(res, summary);
    } catch (error) {
      sendError(res, 500, (error as Error).message || '获取后台统计失败', undefined, 500);
    }
  }

  static async listUsers(req: Request, res: Response): Promise<void> {
    try {
      const result = await AdminService.listUsers({
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        accountStatus: req.query.accountStatus as 'ACTIVE' | 'SUSPENDED' | undefined,
      });
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message || '获取用户列表失败', undefined, 500);
    }
  }

  static async getUserDetail(req: Request, res: Response): Promise<void> {
    try {
      const user = await AdminService.getUserDetail(req.params.id);
      sendSuccess(res, user);
    } catch (error) {
      sendError(res, 404, (error as Error).message || '用户不存在', undefined, 404);
    }
  }

  static async suspendUser(req: Request, res: Response): Promise<void> {
    if (!req.admin) {
      sendError(res, 401, '未授权', undefined, 401);
      return;
    }

    try {
      const user = await AdminService.suspendUser(req.admin, req.params.id, req.body, requestContext(req));
      sendSuccess(res, user, '账号已冻结');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '冻结账号失败');
    }
  }

  static async unsuspendUser(req: Request, res: Response): Promise<void> {
    if (!req.admin) {
      sendError(res, 401, '未授权', undefined, 401);
      return;
    }

    try {
      const user = await AdminService.unsuspendUser(req.admin, req.params.id, req.body, requestContext(req));
      sendSuccess(res, user, '账号已解冻');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '解冻账号失败');
    }
  }

  static async listAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const result = await AdminService.listAuditLogs({
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
      });
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message || '获取审计日志失败', undefined, 500);
    }
  }

  static async listContent(req: Request, res: Response): Promise<void> {
    try {
      const result = await AdminService.listContent({
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
        type: req.query.type as 'POST' | 'MOMENT' | undefined,
        status: req.query.status as 'ACTIVE' | 'REMOVED' | undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      });
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message || '获取内容列表失败', undefined, 500);
    }
  }

  static async removeContent(req: Request, res: Response): Promise<void> {
    if (!req.admin) {
      sendError(res, 401, '未授权', undefined, 401);
      return;
    }

    try {
      const content = await AdminService.removeContent(
        req.admin,
        req.params.type as 'POST' | 'MOMENT',
        req.params.id,
        req.body,
        requestContext(req),
      );
      sendSuccess(res, content, '内容已隐藏');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '隐藏内容失败');
    }
  }

  static async restoreContent(req: Request, res: Response): Promise<void> {
    if (!req.admin) {
      sendError(res, 401, '未授权', undefined, 401);
      return;
    }

    try {
      const content = await AdminService.restoreContent(
        req.admin,
        req.params.type as 'POST' | 'MOMENT',
        req.params.id,
        req.body,
        requestContext(req),
      );
      sendSuccess(res, content, '内容已恢复');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '恢复内容失败');
    }
  }
}
