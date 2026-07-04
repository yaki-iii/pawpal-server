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
  accountStatus: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
  registeredFrom: z.string().datetime().optional(),
  registeredTo: z.string().datetime().optional(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const dashboardQuerySchema = z.object({
  range: z.enum(['today', '7d', '30d']).optional(),
});

const adminUserIdParamsSchema = z.object({
  id: z.string().min(1, '缺少管理员 ID'),
});

const adminRoleSchema = z.enum(['SUPER_ADMIN', 'OPS_ADMIN', 'CONTENT_MODERATOR', 'SUPPORT', 'READONLY']);
const adminStatusSchema = z.enum(['ACTIVE', 'DISABLED']);

const createAdminUserSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少8位').max(100, '密码最多100位'),
  name: z.string().max(50, '名称最多50字').optional(),
  role: adminRoleSchema,
  status: adminStatusSchema.optional(),
});

const updateAdminUserSchema = z.object({
  password: z.string().min(8, '密码至少8位').max(100, '密码最多100位').optional(),
  name: z.string().max(50, '名称最多50字').optional(),
  role: adminRoleSchema.optional(),
  status: adminStatusSchema.optional(),
});

const auditLogsQuerySchema = paginationQuerySchema.extend({
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  adminUserId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

const listContentQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['POST', 'MOMENT', 'COMMENT', 'MOMENT_COMMENT', 'CIRCLE']).optional(),
  status: z.enum(['ACTIVE', 'REMOVED']).optional(),
  search: z.string().optional(),
});

const contentParamsSchema = z.object({
  type: z.enum(['POST', 'MOMENT', 'COMMENT', 'MOMENT_COMMENT', 'CIRCLE']),
  id: z.string().min(1, '缺少内容 ID'),
});

const contentModerationSchema = z.object({
  reason: z.string().min(1, '请输入处理原因').max(200, '处理原因最多200字'),
});

const circleOperationsSchema = z.object({
  isRecommended: z.boolean().optional(),
  operationNote: z.string().max(500, '运营备注最多500字').optional(),
}).refine((value) => value.isRecommended !== undefined || value.operationNote !== undefined, {
  message: '至少需要更新一个圈子运营字段',
});

const listReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED']).optional(),
  targetType: z.enum(['POST', 'MOMENT', 'COMMENT', 'MOMENT_COMMENT', 'USER', 'CIRCLE']).optional(),
});

const reportIdParamsSchema = z.object({
  id: z.string().min(1, '缺少举报 ID'),
});

const handleReportSchema = z.object({
  status: z.enum(['REVIEWING', 'RESOLVED', 'REJECTED']),
  action: z.enum(['NO_ACTION', 'HIDE_CONTENT', 'RESTORE_CONTENT', 'WARN_USER', 'SUSPEND_USER']),
  note: z.string().min(1, '请输入处理说明').max(500, '处理说明最多500字'),
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
router.post('/auth/logout', requireAdmin, AdminController.logout);

router.get('/dashboard/summary', requireAdmin, validateQuery(dashboardQuerySchema), AdminController.getDashboardSummary);
router.get('/dashboard/alerts', requireAdmin, AdminController.getDashboardAlerts);
router.get('/ai/metrics', requireAdmin, AdminController.getAIMetrics);
router.get('/sos/metrics', requireAdmin, AdminController.getSOSMetrics);
router.get('/system/status', requireAdmin, AdminController.getSystemStatus);
router.get('/admin-users', requireAdmin, AdminController.listAdminUsers);
router.post(
  '/admin-users',
  requireAdmin,
  requireAdminRole(['SUPER_ADMIN']),
  validateBody(createAdminUserSchema),
  AdminController.createAdminUser,
);
router.patch(
  '/admin-users/:id',
  requireAdmin,
  requireAdminRole(['SUPER_ADMIN']),
  validateParams(adminUserIdParamsSchema),
  validateBody(updateAdminUserSchema),
  AdminController.updateAdminUser,
);

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

router.get('/content', requireAdmin, validateQuery(listContentQuerySchema), AdminController.listContent);
router.get(
  '/content/:type/:id',
  requireAdmin,
  validateParams(contentParamsSchema),
  AdminController.getContentDetail,
);
router.post(
  '/content/:type/:id/remove',
  requireAdmin,
  requireAdminRole(['OPS_ADMIN', 'CONTENT_MODERATOR']),
  validateParams(contentParamsSchema),
  validateBody(contentModerationSchema),
  AdminController.removeContent,
);
router.post(
  '/content/:type/:id/restore',
  requireAdmin,
  requireAdminRole(['OPS_ADMIN', 'CONTENT_MODERATOR']),
  validateParams(contentParamsSchema),
  validateBody(contentModerationSchema),
  AdminController.restoreContent,
);
router.patch(
  '/circles/:id/operations',
  requireAdmin,
  requireAdminRole(['OPS_ADMIN', 'CONTENT_MODERATOR']),
  validateParams(userIdParamsSchema),
  validateBody(circleOperationsSchema),
  AdminController.updateCircleOperations,
);

router.get('/reports', requireAdmin, validateQuery(listReportsQuerySchema), AdminController.listReports);
router.get('/reports/:id', requireAdmin, validateParams(reportIdParamsSchema), AdminController.getReportDetail);
router.post(
  '/reports/:id/handle',
  requireAdmin,
  requireAdminRole(['OPS_ADMIN', 'CONTENT_MODERATOR']),
  validateParams(reportIdParamsSchema),
  validateBody(handleReportSchema),
  AdminController.handleReport,
);

router.get(
  '/audit-logs',
  requireAdmin,
  requireAdminRole(['SUPER_ADMIN']),
  validateQuery(auditLogsQuerySchema),
  AdminController.listAuditLogs,
);

export default router;
