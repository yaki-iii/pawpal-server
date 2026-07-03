import { Router } from 'express';
import { z } from 'zod';
import { AdminController } from '../controllers/adminController';
import { requireAdmin, requireAdminRole } from '../middleware/adminAuth';
import { authRateLimiter } from '../middleware/rateLimit';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
});

const userIdParamsSchema = z.object({
  id: z.string().min(1, '缺少用户 ID'),
});

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  accountStatus: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const suspendUserSchema = z.object({
  reason: z.string().min(1, '请输入冻结原因').max(200, '冻结原因最多200字'),
  suspendedUntil: z.string().datetime().nullable().optional(),
});

const unsuspendUserSchema = z.object({
  reason: z.string().min(1, '请输入解冻原因').max(200, '解冻原因最多200字'),
});

router.post('/auth/login', authRateLimiter, validateBody(loginSchema), AdminController.login);
router.get('/auth/me', requireAdmin, AdminController.getMe);

router.get('/dashboard/summary', requireAdmin, AdminController.getDashboardSummary);

router.get('/users', requireAdmin, validateQuery(listUsersQuerySchema), AdminController.listUsers);
router.get('/users/:id', requireAdmin, validateParams(userIdParamsSchema), AdminController.getUserDetail);
router.post(
  '/users/:id/suspend',
  requireAdmin,
  requireAdminRole(['OPS_ADMIN']),
  validateParams(userIdParamsSchema),
  validateBody(suspendUserSchema),
  AdminController.suspendUser,
);
router.post(
  '/users/:id/unsuspend',
  requireAdmin,
  requireAdminRole(['OPS_ADMIN']),
  validateParams(userIdParamsSchema),
  validateBody(unsuspendUserSchema),
  AdminController.unsuspendUser,
);

router.get(
  '/audit-logs',
  requireAdmin,
  requireAdminRole(['SUPER_ADMIN']),
  validateQuery(paginationQuerySchema),
  AdminController.listAuditLogs,
);

export default router;
