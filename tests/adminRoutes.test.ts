import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../src/config', () => ({
  config: {
    admin: {
      jwtSecret: 'test-admin-jwt-secret',
      jwtExpiresIn: '12h',
    },
  },
}));

jest.mock('../src/services/adminService', () => ({
  AdminService: {
    login: jest.fn(),
    getAdminById: jest.fn(),
    getDashboardSummary: jest.fn(),
    getAIMetrics: jest.fn(),
    getSOSMetrics: jest.fn(),
    getSystemStatus: jest.fn(),
    listAdminUsers: jest.fn(),
    listUsers: jest.fn(),
    getUserDetail: jest.fn(),
    suspendUser: jest.fn(),
    unsuspendUser: jest.fn(),
    listAuditLogs: jest.fn(),
    listContent: jest.fn(),
    removeContent: jest.fn(),
    restoreContent: jest.fn(),
    listReports: jest.fn(),
    handleReport: jest.fn(),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { requireAdmin, requireAdminRole } from '../src/middleware/adminAuth';
import { AdminController } from '../src/controllers/adminController';
import { AdminService } from '../src/services/adminService';

function mockResponse(): Response & { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('admin HTTP layer', () => {
  const activeAdmin = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-07-03T00:00:00.000Z',
    updatedAt: '2026-07-03T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireAdmin', () => {
    it('returns 401 when no admin token is provided', async () => {
      const req = { headers: {} } as Request;
      const res = mockResponse();
      const next = jest.fn() as NextFunction;

      await requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        code: 401,
        data: null,
        message: '未授权：缺少管理员认证令牌',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('attaches active admin info for a valid admin token', async () => {
      const token = jwt.sign(
        { adminUserId: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
        'test-admin-jwt-secret',
      );
      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as Request;
      const res = mockResponse();
      const next = jest.fn() as NextFunction;
      (AdminService.getAdminById as jest.Mock).mockResolvedValue(activeAdmin);

      await requireAdmin(req, res, next);

      expect(req.adminUserId).toBe('admin-1');
      expect(req.admin).toEqual(activeAdmin);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireAdminRole', () => {
    it('returns 403 when the admin role is not allowed', () => {
      const req = {
        admin: { ...activeAdmin, role: 'READONLY' },
      } as unknown as Request;
      const res = mockResponse();
      const next = jest.fn() as NextFunction;

      requireAdminRole(['OPS_ADMIN'])(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        code: 403,
        data: null,
        message: '权限不足',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('allows SUPER_ADMIN for every admin-only operation', () => {
      const req = {
        admin: activeAdmin,
      } as unknown as Request;
      const res = mockResponse();
      const next = jest.fn() as NextFunction;

      requireAdminRole(['OPS_ADMIN'])(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('AdminController', () => {
    it('logs in an admin and returns a token', async () => {
      (AdminService.login as jest.Mock).mockResolvedValue({
        admin: activeAdmin,
        token: 'admin-token',
      });
      const req = {
        body: { email: 'admin@example.com', password: 'secret' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as unknown as Request;
      const res = mockResponse();

      await AdminController.login(req, res);

      expect(AdminService.login).toHaveBeenCalledWith('admin@example.com', 'secret', {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        code: 0,
        data: { admin: activeAdmin, token: 'admin-token' },
        message: '登录成功',
      });
    });

    it('rejects user suspension when admin auth is missing', async () => {
      const req = {
        params: { id: 'user-1' },
        body: { reason: '垃圾广告' },
      } as unknown as Request;
      const res = mockResponse();

      await AdminController.suspendUser(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(AdminService.suspendUser).not.toHaveBeenCalled();
    });

    it('returns admin content list data', async () => {
      (AdminService.listContent as jest.Mock).mockResolvedValue({
        items: [{ id: 'post-1', type: 'POST', status: 'ACTIVE' }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      const req = {
        query: { page: '1', pageSize: '20', type: 'POST', status: 'ACTIVE' },
      } as unknown as Request;
      const res = mockResponse();

      await AdminController.listContent(req, res);

      expect(AdminService.listContent).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        type: 'POST',
        status: 'ACTIVE',
        search: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns admin monitoring metrics', async () => {
      (AdminService.getAIMetrics as jest.Mock).mockResolvedValue({ totalSessions: 1 });
      (AdminService.getSOSMetrics as jest.Mock).mockResolvedValue({ totalHelpRequests: 2 });
      (AdminService.getSystemStatus as jest.Mock).mockReturnValue({ buildId: 'build-1' });
      const req = {} as Request;
      const res = mockResponse();

      await AdminController.getAIMetrics(req, res);
      await AdminController.getSOSMetrics(req, res);
      await AdminController.getSystemStatus(req, res);

      expect(AdminService.getAIMetrics).toHaveBeenCalled();
      expect(AdminService.getSOSMetrics).toHaveBeenCalled();
      expect(AdminService.getSystemStatus).toHaveBeenCalledWith(expect.any(String));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns admin user list data', async () => {
      (AdminService.listAdminUsers as jest.Mock).mockResolvedValue([activeAdmin]);
      const req = {} as Request;
      const res = mockResponse();

      await AdminController.listAdminUsers(req, res);

      expect(AdminService.listAdminUsers).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        code: 0,
        data: [activeAdmin],
        message: 'success',
      });
    });

    it('passes expanded content types to admin content service', async () => {
      (AdminService.listContent as jest.Mock).mockResolvedValue({
        items: [{ id: 'comment-1', type: 'COMMENT', status: 'ACTIVE' }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      const req = {
        query: { type: 'COMMENT', search: '评论' },
      } as unknown as Request;
      const res = mockResponse();

      await AdminController.listContent(req, res);

      expect(AdminService.listContent).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        type: 'COMMENT',
        status: undefined,
        search: '评论',
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('removes content with admin actor and request context', async () => {
      (AdminService.removeContent as jest.Mock).mockResolvedValue({
        id: 'post-1',
        type: 'POST',
        status: 'REMOVED',
      });
      const req = {
        admin: activeAdmin,
        params: { type: 'POST', id: 'post-1' },
        body: { reason: '违规内容' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as unknown as Request;
      const res = mockResponse();

      await AdminController.removeContent(req, res);

      expect(AdminService.removeContent).toHaveBeenCalledWith(
        activeAdmin,
        'POST',
        'post-1',
        { reason: '违规内容' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: '内容已隐藏',
      }));
    });

    it('handles a report with admin actor and request context', async () => {
      (AdminService.handleReport as jest.Mock).mockResolvedValue({
        id: 'report-1',
        status: 'RESOLVED',
        resolutionAction: 'HIDE_CONTENT',
      });
      const req = {
        admin: activeAdmin,
        params: { id: 'report-1' },
        body: { status: 'RESOLVED', action: 'HIDE_CONTENT', note: '已隐藏' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as unknown as Request;
      const res = mockResponse();

      await AdminController.handleReport(req, res);

      expect(AdminService.handleReport).toHaveBeenCalledWith(
        activeAdmin,
        'report-1',
        { status: 'RESOLVED', action: 'HIDE_CONTENT', note: '已隐藏' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: '举报已处理',
      }));
    });
  });
});
