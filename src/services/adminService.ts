import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';

type AdminRoleName = 'SUPER_ADMIN' | 'OPS_ADMIN' | 'CONTENT_MODERATOR' | 'SUPPORT' | 'READONLY';
type AdminStatusName = 'ACTIVE' | 'DISABLED';
type UserAccountStatusName = 'ACTIVE' | 'SUSPENDED';
type AdminContentType = 'POST' | 'MOMENT' | 'COMMENT' | 'MOMENT_COMMENT' | 'CIRCLE';
type AdminContentStatus = 'ACTIVE' | 'REMOVED';
type ReportStatusName = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'REJECTED';
type ReportResolutionActionName = 'NO_ACTION' | 'HIDE_CONTENT' | 'RESTORE_CONTENT' | 'WARN_USER' | 'SUSPEND_USER';
type DashboardRange = 'today' | '7d' | '30d';

export interface AdminDTO {
  id: string;
  email: string;
  name: string;
  role: AdminRoleName;
  status: AdminStatusName;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminActor {
  id: string;
  email: string;
  name: string;
  role: AdminRoleName;
  status: AdminStatusName;
}

interface ListUsersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  accountStatus?: UserAccountStatusName;
}

interface DashboardSummaryQuery {
  range?: DashboardRange;
}

interface SuspendUserInput {
  reason: string;
  suspendedUntil?: string | null;
}

interface UnsuspendUserInput {
  reason: string;
}

interface ListContentQuery {
  page?: number;
  pageSize?: number;
  type?: AdminContentType;
  status?: AdminContentStatus;
  search?: string;
}

interface ContentModerationInput {
  reason: string;
}

interface ListReportsQuery {
  page?: number;
  pageSize?: number;
  status?: ReportStatusName;
  targetType?: string;
}

interface HandleReportInput {
  status: ReportStatusName;
  action: ReportResolutionActionName;
  note: string;
}

interface ListAuditLogsQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  targetType?: string;
  adminUserId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * AdminService owns the first management-backend slice: bootstrap, login,
 * dashboard counts, user account actions, and audit logging.
 */
export class AdminService {
  private static SALT_ROUNDS = 10;

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AdminService.SALT_ROUNDS);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static signToken(admin: AdminActor): string {
    return jwt.sign(
      {
        adminUserId: admin.id,
        email: admin.email,
        role: admin.role,
      },
      config.admin.jwtSecret,
      { expiresIn: config.admin.jwtExpiresIn },
    );
  }

  static async bootstrapSuperAdmin(): Promise<AdminDTO | null> {
    if (!config.admin.bootstrapEmail || !config.admin.bootstrapPassword) {
      logger.warn('Admin bootstrap skipped: ADMIN_BOOTSTRAP_EMAIL or ADMIN_BOOTSTRAP_PASSWORD is missing.');
      return null;
    }

    const existingCount = await prisma.adminUser.count();
    if (existingCount > 0) {
      if (!config.admin.bootstrapResetPassword) {
        return null;
      }

      const existingAdmin = await prisma.adminUser.findUnique({
        where: { email: config.admin.bootstrapEmail },
      });
      if (!existingAdmin) {
        logger.warn('Admin password reset skipped: bootstrap email does not match an existing admin.');
        return null;
      }

      const passwordHash = await AdminService.hashPassword(config.admin.bootstrapPassword);
      const admin = await prisma.adminUser.update({
        where: { id: existingAdmin.id },
        data: {
          passwordHash,
          status: 'ACTIVE',
        },
      });

      logger.warn(`Bootstrap admin password reset for: ${admin.email}`);
      return AdminService.toDTO(admin);
    }

    if (config.admin.bootstrapResetPassword) {
      logger.warn('Admin password reset flag ignored during first bootstrap because no admin exists yet.');
    }

    const passwordHash = await AdminService.hashPassword(config.admin.bootstrapPassword);
    const admin = await prisma.adminUser.create({
      data: {
        email: config.admin.bootstrapEmail,
        passwordHash,
        name: 'PawPal Admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    logger.info(`Bootstrapped first admin user: ${admin.email}`);
    return AdminService.toDTO(admin);
  }

  static async login(
    email: string,
    password: string,
    context: AdminRequestContext = {},
  ): Promise<{ admin: AdminDTO; token: string }> {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) {
      await AdminService.writeAuditLog({
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'ADMIN_AUTH',
        targetId: email,
        reason: 'admin not found',
        context,
      });
      throw new Error('邮箱或密码错误');
    }

    if (admin.status === 'DISABLED') {
      await AdminService.writeAuditLog({
        adminUserId: admin.id,
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'ADMIN_AUTH',
        targetId: admin.id,
        reason: 'admin disabled',
        context,
      });
      throw new Error('管理员账号已停用');
    }

    const valid = await AdminService.verifyPassword(password, admin.passwordHash);
    if (!valid) {
      await AdminService.writeAuditLog({
        adminUserId: admin.id,
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'ADMIN_AUTH',
        targetId: admin.id,
        reason: 'wrong password',
        context,
      });
      throw new Error('邮箱或密码错误');
    }

    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    const dto = AdminService.toDTO(updated);
    await AdminService.writeAuditLog({
      adminUserId: admin.id,
      action: 'ADMIN_LOGIN_SUCCESS',
      targetType: 'ADMIN_AUTH',
      targetId: admin.id,
      context,
    });

    return {
      admin: dto,
      token: AdminService.signToken(dto),
    };
  }

  static async getAdminById(adminUserId: string): Promise<AdminDTO> {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
    if (!admin || admin.status !== 'ACTIVE') {
      throw new Error('管理员不存在或已停用');
    }
    return AdminService.toDTO(admin);
  }

  static async listAdminUsers(): Promise<AdminDTO[]> {
    const admins = await prisma.adminUser.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return admins.map(AdminService.toDTO);
  }

  static async getDashboardSummary(query: DashboardSummaryQuery = {}): Promise<{
    users: { total: number; suspended: number };
    pets: { total: number };
    content: { moments: number; posts: number };
    reports: { pending: number };
    period?: {
      range: DashboardRange;
      users: number;
      pets: number;
      moments: number;
      posts: number;
      reports: number;
    };
  }> {
    const [totalUsers, suspendedUsers, totalPets, moments, posts, pendingReports] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { accountStatus: 'SUSPENDED' } }),
      prisma.pet.count(),
      prisma.moment.count(),
      prisma.post.count(),
      prisma.contentReport.count({ where: { status: 'PENDING' } }),
    ]);

    const summary = {
      users: { total: totalUsers, suspended: suspendedUsers },
      pets: { total: totalPets },
      content: { moments, posts },
      reports: { pending: pendingReports },
    };

    if (!query.range) return summary;

    const since = AdminService.startForDashboardRange(query.range);
    const periodWhere = { createdAt: { gte: since } };
    const [periodUsers, periodPets, periodMoments, periodPosts, periodReports] = await Promise.all([
      prisma.user.count({ where: periodWhere }),
      prisma.pet.count({ where: periodWhere }),
      prisma.moment.count({ where: periodWhere }),
      prisma.post.count({ where: periodWhere }),
      prisma.contentReport.count({ where: periodWhere }),
    ]);

    return {
      ...summary,
      period: {
        range: query.range,
        users: periodUsers,
        pets: periodPets,
        moments: periodMoments,
        posts: periodPosts,
        reports: periodReports,
      },
    };
  }

  static async getDashboardAlerts(): Promise<Array<{
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    count?: number;
  }>> {
    const [pendingReports, aiFallbacks, localVetClinics] = await Promise.all([
      prisma.contentReport.count({ where: { status: 'PENDING' } }),
      prisma.aiAssistantSession.count({
        where: {
          OR: [
            { summary: { contains: 'fallback', mode: 'insensitive' } },
            { summary: { contains: '暂时无法', mode: 'insensitive' } },
            { summary: { contains: '无法识别图片', mode: 'insensitive' } },
          ],
        },
      }),
      prisma.vetClinic.count(),
    ]);

    const alerts: Array<{
      type: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      message: string;
      count?: number;
    }> = [];

    if (pendingReports > 0) {
      alerts.push({
        type: 'REPORTS_PENDING',
        severity: 'warning',
        title: '待处理举报',
        message: `有 ${pendingReports} 条举报等待处理`,
        count: pendingReports,
      });
    }

    if (aiFallbacks > 0) {
      alerts.push({
        type: 'AI_IMAGE_FALLBACK',
        severity: 'warning',
        title: 'AI 图片识别 fallback',
        message: `发现 ${aiFallbacks} 条 AI 图片识别 fallback 记录`,
        count: aiFallbacks,
      });
    }

    if (!AdminService.hasConfiguredSecret(config.amap.webServiceKey)) {
      alerts.push({
        type: 'SOS_AMAP_NOT_CONFIGURED',
        severity: 'critical',
        title: '高德服务未配置',
        message: '附近动物医院搜索可能无法返回真实数据',
      });
    }

    if (localVetClinics === 0) {
      alerts.push({
        type: 'SOS_LOCAL_VETS_EMPTY',
        severity: 'warning',
        title: '本地动物医院兜底为空',
        message: '高德失败时没有本地动物医院数据可兜底',
        count: 0,
      });
    }

    return alerts;
  }

  static async getAIMetrics(): Promise<Record<string, unknown>> {
    const today = AdminService.startOfToday();
    const [totalSessions, todaySessions, imageSessions, fallbackSessions] = await Promise.all([
      prisma.aiAssistantSession.count(),
      prisma.aiAssistantSession.count({ where: { createdAt: { gte: today } } }),
      prisma.aiAssistantSession.count({ where: { imageUrls: { isEmpty: false } } }),
      prisma.aiAssistantSession.count({
        where: {
          OR: [
            { summary: { contains: 'fallback', mode: 'insensitive' } },
            { summary: { contains: '暂时无法', mode: 'insensitive' } },
            { summary: { contains: '无法识别图片', mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      totalSessions,
      todaySessions,
      imageSessions,
      fallbackSessions,
      deepSeekConfigured: AdminService.hasConfiguredSecret(config.llm.apiKey, ['your-deepseek-api-key-here']),
      arkConfigured: AdminService.hasConfiguredSecret(config.ark.apiKey, ['your-ark-api-key-here']),
      model: config.llm.model,
      visionModel: config.ark.visionModel,
    };
  }

  static async getSOSMetrics(): Promise<Record<string, unknown>> {
    const today = AdminService.startOfToday();
    const [totalHelpRequests, activeHelpRequests, todayHelpRequests, localVetClinics] = await Promise.all([
      prisma.emergencyHelp.count(),
      prisma.emergencyHelp.count({ where: { status: 'ACTIVE' } }),
      prisma.emergencyHelp.count({ where: { createdAt: { gte: today } } }),
      prisma.vetClinic.count(),
    ]);

    return {
      totalHelpRequests,
      activeHelpRequests,
      todayHelpRequests,
      localVetClinics,
      amapConfigured: AdminService.hasConfiguredSecret(config.amap.webServiceKey),
    };
  }

  static getSystemStatus(buildId: string): Record<string, unknown> {
    return {
      buildId,
      environment: config.nodeEnv,
      configStatus: {
        database: AdminService.hasConfiguredSecret(config.database.url),
        jwt: AdminService.hasConfiguredSecret(config.jwt.secret, ['fallback-secret-key']),
        adminJwt: AdminService.hasConfiguredSecret(config.admin.jwtSecret, ['admin-fallback-secret-change-me']),
        deepSeek: AdminService.hasConfiguredSecret(config.llm.apiKey, ['your-deepseek-api-key-here']),
        ark: AdminService.hasConfiguredSecret(config.ark.apiKey, ['your-ark-api-key-here']),
        amap: AdminService.hasConfiguredSecret(config.amap.webServiceKey),
        encryption: AdminService.hasConfiguredSecret(config.encryption.key, ['pawpal-encryption-key-32bytes-changeme!!']),
        upload: AdminService.hasConfiguredSecret(config.upload.dir),
      },
    };
  }

  static async listUsers(query: ListUsersQuery = {}): Promise<{
    items: Array<Record<string, unknown>>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const where: Record<string, unknown> = {};

    if (query.accountStatus) {
      where.accountStatus = query.accountStatus;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { nickname: { contains: search, mode: 'insensitive' } },
        { id: search },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { pets: true, moments: true, posts: true },
          },
        },
      }),
    ]);

    return {
      items: users.map(AdminService.toAdminUserListItem),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  static async getUserDetail(userId: string): Promise<Record<string, unknown>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            pets: true,
            moments: true,
            posts: true,
            comments: true,
            followers: true,
            followings: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    const [pets, moments, posts, comments, momentComments] = await Promise.all([
      prisma.pet.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, species: true, breed: true, photo: true, createdAt: true },
      }),
      prisma.moment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          pet: { select: { id: true, name: true, photo: true } },
        },
      }),
      prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          pet: { select: { id: true, name: true, photo: true } },
          circle: { select: { id: true, name: true } },
        },
      }),
      prisma.comment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          post: { select: { id: true, title: true } },
        },
      }),
      prisma.momentComment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          moment: { select: { id: true, content: true } },
        },
      }),
    ]);

    return {
      ...AdminService.toAdminUserListItem(user),
      recent: {
        pets: pets.map(AdminService.toAdminPetSummary),
        moments: moments.map(AdminService.toAdminMomentListItem),
        posts: posts.map(AdminService.toAdminPostListItem),
        comments: comments.map((comment) => AdminService.toAdminCommentListItem(comment, 'COMMENT')),
        momentComments: momentComments.map((comment) => AdminService.toAdminCommentListItem(comment, 'MOMENT_COMMENT')),
      },
    };
  }

  static async suspendUser(
    actor: AdminActor,
    userId: string,
    input: SuspendUserInput,
    context: AdminRequestContext = {},
  ): Promise<Record<string, unknown>> {
    const before = await prisma.user.findUnique({ where: { id: userId } });
    if (!before) {
      throw new Error('用户不存在');
    }

    const after = await prisma.user.update({
      where: { id: userId },
      data: {
        accountStatus: 'SUSPENDED',
        suspendedReason: input.reason,
        suspendedUntil: input.suspendedUntil ? new Date(input.suspendedUntil) : null,
      },
    });

    await AdminService.writeAuditLog({
      adminUserId: actor.id,
      action: 'USER_SUSPEND',
      targetType: 'USER',
      targetId: userId,
      reason: input.reason,
      beforeSnapshot: before,
      afterSnapshot: after,
      context,
    });

    return after as Record<string, unknown>;
  }

  static async unsuspendUser(
    actor: AdminActor,
    userId: string,
    input: UnsuspendUserInput,
    context: AdminRequestContext = {},
  ): Promise<Record<string, unknown>> {
    const before = await prisma.user.findUnique({ where: { id: userId } });
    if (!before) {
      throw new Error('用户不存在');
    }

    const after = await prisma.user.update({
      where: { id: userId },
      data: {
        accountStatus: 'ACTIVE',
        suspendedReason: '',
        suspendedUntil: null,
      },
    });

    await AdminService.writeAuditLog({
      adminUserId: actor.id,
      action: 'USER_UNSUSPEND',
      targetType: 'USER',
      targetId: userId,
      reason: input.reason,
      beforeSnapshot: before,
      afterSnapshot: after,
      context,
    });

    return after as Record<string, unknown>;
  }

  static async listAuditLogs(query: ListAuditLogsQuery = {}): Promise<{
    items: unknown[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const where: Record<string, unknown> = {};
    if (query.action?.trim()) where.action = query.action.trim();
    if (query.targetType?.trim()) where.targetType = query.targetType.trim();
    if (query.adminUserId?.trim()) where.adminUserId = query.adminUserId.trim();
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    const [total, items] = await Promise.all([
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  static async listContent(query: ListContentQuery = {}): Promise<{
    items: Array<Record<string, unknown>>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const statusWhere = query.status === 'REMOVED'
      ? { isRemoved: true }
      : query.status === 'ACTIVE'
        ? { isRemoved: false }
        : {};
    const search = query.search?.trim();

    if (query.type === 'COMMENT') {
      return AdminService.listCommentsForModeration(page, pageSize, statusWhere, search);
    }
    if (query.type === 'MOMENT_COMMENT') {
      return AdminService.listMomentCommentsForModeration(page, pageSize, statusWhere, search);
    }
    if (query.type === 'CIRCLE') {
      return AdminService.listCirclesForModeration(page, pageSize, statusWhere, search);
    }

    const windowSize = page * pageSize;

    const [postTotal, momentTotal, posts, moments] = await Promise.all([
      query.type === 'MOMENT' ? Promise.resolve(0) : prisma.post.count({
        where: {
          ...statusWhere,
          ...(search ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
            ],
          } : {}),
        },
      }),
      query.type === 'POST' ? Promise.resolve(0) : prisma.moment.count({
        where: {
          ...statusWhere,
          ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
        },
      }),
      query.type === 'MOMENT' ? Promise.resolve([]) : prisma.post.findMany({
        where: {
          ...statusWhere,
          ...(search ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
            ],
          } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: windowSize,
        include: {
          author: { select: { id: true, email: true, nickname: true, avatar: true } },
          pet: { select: { id: true, name: true, photo: true } },
          circle: { select: { id: true, name: true } },
        },
      }),
      query.type === 'POST' ? Promise.resolve([]) : prisma.moment.findMany({
        where: {
          ...statusWhere,
          ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: windowSize,
        include: {
          user: { select: { id: true, email: true, nickname: true, avatar: true } },
          pet: { select: { id: true, name: true, photo: true } },
        },
      }),
    ]);

    const items = [
      ...posts.map(AdminService.toAdminPostListItem),
      ...moments.map(AdminService.toAdminMomentListItem),
    ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const total = postTotal + momentTotal;
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  static async getContentDetail(type: AdminContentType, id: string): Promise<Record<string, unknown>> {
    if (type === 'POST') {
      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, email: true, nickname: true, avatar: true } },
          pet: { select: { id: true, name: true, photo: true } },
          circle: { select: { id: true, name: true } },
        },
      });
      if (!post) throw new Error('动态不存在');
      return AdminService.toAdminPostListItem(post);
    }

    if (type === 'MOMENT') {
      const moment = await prisma.moment.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, nickname: true, avatar: true } },
          pet: { select: { id: true, name: true, photo: true } },
        },
      });
      if (!moment) throw new Error('日常不存在');
      return AdminService.toAdminMomentListItem(moment);
    }

    if (type === 'COMMENT') {
      const comment = await prisma.comment.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, email: true, nickname: true, avatar: true } },
          post: { select: { id: true, title: true } },
        },
      });
      if (!comment) throw new Error('评论不存在');
      return AdminService.toAdminCommentListItem(comment, 'COMMENT');
    }

    if (type === 'MOMENT_COMMENT') {
      const comment = await prisma.momentComment.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, email: true, nickname: true, avatar: true } },
          moment: { select: { id: true, content: true } },
        },
      });
      if (!comment) throw new Error('日常评论不存在');
      return AdminService.toAdminCommentListItem(comment, 'MOMENT_COMMENT');
    }

    const circle = await prisma.circle.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true, nickname: true, avatar: true } },
      },
    });
    if (!circle) throw new Error('圈子不存在');
    return AdminService.toAdminCircleListItem(circle);
  }

  private static async listCommentsForModeration(
    page: number,
    pageSize: number,
    statusWhere: Record<string, unknown>,
    search?: string,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const where = {
      ...statusWhere,
      ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [total, comments] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: { select: { id: true, email: true, nickname: true, avatar: true } },
          post: { select: { id: true, title: true } },
        },
      }),
    ]);

    return AdminService.paginatedResult(
      comments.map((comment) => AdminService.toAdminCommentListItem(comment, 'COMMENT')),
      page,
      pageSize,
      total,
    );
  }

  private static async listMomentCommentsForModeration(
    page: number,
    pageSize: number,
    statusWhere: Record<string, unknown>,
    search?: string,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const where = {
      ...statusWhere,
      ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [total, comments] = await Promise.all([
      prisma.momentComment.count({ where }),
      prisma.momentComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: { select: { id: true, email: true, nickname: true, avatar: true } },
          moment: { select: { id: true, content: true } },
        },
      }),
    ]);

    return AdminService.paginatedResult(
      comments.map((comment) => AdminService.toAdminCommentListItem(comment, 'MOMENT_COMMENT')),
      page,
      pageSize,
      total,
    );
  }

  private static async listCirclesForModeration(
    page: number,
    pageSize: number,
    statusWhere: Record<string, unknown>,
    search?: string,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const where = {
      ...statusWhere,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [total, circles] = await Promise.all([
      prisma.circle.count({ where }),
      prisma.circle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          owner: { select: { id: true, email: true, nickname: true, avatar: true } },
        },
      }),
    ]);

    return AdminService.paginatedResult(
      circles.map(AdminService.toAdminCircleListItem),
      page,
      pageSize,
      total,
    );
  }

  private static paginatedResult(
    items: Array<Record<string, unknown>>,
    page: number,
    pageSize: number,
    total: number,
  ): {
    items: Array<Record<string, unknown>>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  } {
    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  static async removeContent(
    actor: AdminActor,
    type: AdminContentType,
    id: string,
    input: ContentModerationInput,
    context: AdminRequestContext = {},
  ): Promise<Record<string, unknown>> {
    return AdminService.setContentRemoved(actor, type, id, true, input.reason, context);
  }

  static async restoreContent(
    actor: AdminActor,
    type: AdminContentType,
    id: string,
    input: ContentModerationInput,
    context: AdminRequestContext = {},
  ): Promise<Record<string, unknown>> {
    return AdminService.setContentRemoved(actor, type, id, false, input.reason, context);
  }

  static async listReports(query: ListReportsQuery = {}): Promise<{
    items: Array<Record<string, unknown>>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;

    const [total, reports] = await Promise.all([
      prisma.contentReport.count({ where }),
      prisma.contentReport.findMany({
        where,
        orderBy: { lastReportedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: reports.map(AdminService.toAdminReportListItem),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  static async getReportDetail(reportId: string): Promise<Record<string, unknown>> {
    const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new Error('举报不存在');

    const relatedUserIds = Array.from(new Set([
      report.reporterId,
      report.targetOwnerId,
    ].filter(Boolean)));
    const users = relatedUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: relatedUserIds } },
          select: { id: true, email: true, nickname: true, avatar: true },
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      ...AdminService.toAdminReportListItem(report),
      reporter: report.reporterId ? AdminService.toAdminAuthor(usersById.get(report.reporterId) || {}) : null,
      targetOwner: report.targetOwnerId ? AdminService.toAdminAuthor(usersById.get(report.targetOwnerId) || {}) : null,
    };
  }

  static async handleReport(
    actor: AdminActor,
    reportId: string,
    input: HandleReportInput,
    context: AdminRequestContext = {},
  ): Promise<Record<string, unknown>> {
    const before = await prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!before) throw new Error('举报不存在');

    await AdminService.applyReportAction(actor, before as Record<string, any>, input, context);

    const after = await prisma.contentReport.update({
      where: { id: reportId },
      data: {
        status: input.status,
        resolutionAction: input.action,
        resolutionNote: input.note,
        handledByAdminId: actor.id,
        handledAt: new Date(),
      },
    });

    await AdminService.writeAuditLog({
      adminUserId: actor.id,
      action: input.status === 'REJECTED' ? 'REPORT_REJECT' : 'REPORT_RESOLVE',
      targetType: 'REPORT',
      targetId: reportId,
      reason: input.note,
      beforeSnapshot: before,
      afterSnapshot: after,
      context,
    });

    return AdminService.toAdminReportListItem(after);
  }

  private static async applyReportAction(
    actor: AdminActor,
    report: Record<string, any>,
    input: HandleReportInput,
    context: AdminRequestContext,
  ): Promise<void> {
    if (input.action === 'NO_ACTION' || input.action === 'WARN_USER') return;

    if (input.action === 'SUSPEND_USER') {
      const userId = report.targetOwnerId || (report.targetType === 'USER' ? report.targetId : '');
      if (!userId) throw new Error('无法识别需冻结的用户');
      await AdminService.suspendUser(actor, userId, { reason: input.note }, context);
      return;
    }

    if (report.targetType === 'POST') {
      await AdminService.setContentRemoved(actor, 'POST', report.targetId, input.action === 'HIDE_CONTENT', input.note, context);
      return;
    }

    if (report.targetType === 'MOMENT') {
      await AdminService.setContentRemoved(actor, 'MOMENT', report.targetId, input.action === 'HIDE_CONTENT', input.note, context);
      return;
    }

    if (report.targetType === 'COMMENT') {
      await AdminService.setContentRemoved(actor, 'COMMENT', report.targetId, input.action === 'HIDE_CONTENT', input.note, context);
      return;
    }

    if (report.targetType === 'MOMENT_COMMENT') {
      await AdminService.setContentRemoved(actor, 'MOMENT_COMMENT', report.targetId, input.action === 'HIDE_CONTENT', input.note, context);
      return;
    }

    if (report.targetType === 'CIRCLE') {
      await AdminService.setContentRemoved(actor, 'CIRCLE', report.targetId, input.action === 'HIDE_CONTENT', input.note, context);
    }
  }

  private static async setContentRemoved(
    actor: AdminActor,
    type: AdminContentType,
    id: string,
    isRemoved: boolean,
    reason: string,
    context: AdminRequestContext,
  ): Promise<Record<string, unknown>> {
    if (type === 'POST') {
      const before = await prisma.post.findUnique({ where: { id } });
      if (!before) throw new Error('动态不存在');

      const after = await prisma.post.update({ where: { id }, data: { isRemoved } });
      await AdminService.writeAuditLog({
        adminUserId: actor.id,
        action: isRemoved ? 'POST_REMOVE' : 'POST_RESTORE',
        targetType: 'POST',
        targetId: id,
        reason,
        beforeSnapshot: before,
        afterSnapshot: after,
        context,
      });
      return AdminService.toAdminPostListItem(after);
    }

    if (type === 'COMMENT') {
      const before = await prisma.comment.findUnique({ where: { id } });
      if (!before) throw new Error('评论不存在');

      const after = await prisma.comment.update({ where: { id }, data: { isRemoved } });
      await AdminService.writeAuditLog({
        adminUserId: actor.id,
        action: isRemoved ? 'COMMENT_REMOVE' : 'COMMENT_RESTORE',
        targetType: 'COMMENT',
        targetId: id,
        reason,
        beforeSnapshot: before,
        afterSnapshot: after,
        context,
      });
      return AdminService.toAdminCommentListItem(after, 'COMMENT');
    }

    if (type === 'MOMENT_COMMENT') {
      const before = await prisma.momentComment.findUnique({ where: { id } });
      if (!before) throw new Error('日常评论不存在');

      const after = await prisma.momentComment.update({ where: { id }, data: { isRemoved } });
      await AdminService.writeAuditLog({
        adminUserId: actor.id,
        action: isRemoved ? 'MOMENT_COMMENT_REMOVE' : 'MOMENT_COMMENT_RESTORE',
        targetType: 'MOMENT_COMMENT',
        targetId: id,
        reason,
        beforeSnapshot: before,
        afterSnapshot: after,
        context,
      });
      return AdminService.toAdminCommentListItem(after, 'MOMENT_COMMENT');
    }

    if (type === 'CIRCLE') {
      const before = await prisma.circle.findUnique({ where: { id } });
      if (!before) throw new Error('圈子不存在');

      const after = await prisma.circle.update({ where: { id }, data: { isRemoved } });
      await AdminService.writeAuditLog({
        adminUserId: actor.id,
        action: isRemoved ? 'CIRCLE_REMOVE' : 'CIRCLE_RESTORE',
        targetType: 'CIRCLE',
        targetId: id,
        reason,
        beforeSnapshot: before,
        afterSnapshot: after,
        context,
      });
      return AdminService.toAdminCircleListItem(after);
    }

    const before = await prisma.moment.findUnique({ where: { id } });
    if (!before) throw new Error('日常不存在');

    const after = await prisma.moment.update({ where: { id }, data: { isRemoved } });
    await AdminService.writeAuditLog({
      adminUserId: actor.id,
      action: isRemoved ? 'MOMENT_REMOVE' : 'MOMENT_RESTORE',
      targetType: 'MOMENT',
      targetId: id,
      reason,
      beforeSnapshot: before,
      afterSnapshot: after,
      context,
    });
    return AdminService.toAdminMomentListItem(after);
  }

  private static startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private static startForDashboardRange(range: DashboardRange): Date {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (range === '7d') start.setDate(start.getDate() - 6);
    if (range === '30d') start.setDate(start.getDate() - 29);
    return start;
  }

  private static hasConfiguredSecret(value: string | undefined, placeholders: string[] = []): boolean {
    const normalized = (value || '').trim();
    return normalized.length > 0 && !placeholders.includes(normalized);
  }

  static async writeAuditLog(input: {
    adminUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string;
    reason?: string;
    beforeSnapshot?: unknown;
    afterSnapshot?: unknown;
    context?: AdminRequestContext;
  }): Promise<void> {
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: input.adminUserId || null,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId || '',
          reason: input.reason || '',
          beforeSnapshot: input.beforeSnapshot === undefined ? undefined : input.beforeSnapshot,
          afterSnapshot: input.afterSnapshot === undefined ? undefined : input.afterSnapshot,
          ipAddress: input.context?.ipAddress || '',
          userAgent: input.context?.userAgent || '',
        },
      });
    } catch (error) {
      logger.warn(`Admin audit log write failed: ${(error as Error).message}`);
    }
  }

  static toDTO(admin: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AdminDTO {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role as AdminRoleName,
      status: admin.status as AdminStatusName,
      lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
      createdAt: admin.createdAt.toISOString(),
      updatedAt: admin.updatedAt.toISOString(),
    };
  }

  private static toAdminUserListItem(user: Record<string, any>): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      city: user.city,
      membershipLevel: user.membershipLevel,
      accountStatus: user.accountStatus,
      suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
      suspendedReason: user.suspendedReason || '',
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      counts: user._count
        ? {
            pets: user._count.pets || 0,
            moments: user._count.moments || 0,
            posts: user._count.posts || 0,
          }
        : undefined,
    };
  }

  private static toAdminPostListItem(post: Record<string, any>): Record<string, unknown> {
    return {
      id: post.id,
      type: 'POST',
      title: post.title,
      content: post.content,
      images: post.images || [],
      status: post.isRemoved ? 'REMOVED' : 'ACTIVE',
      likeCount: post.likeCount || 0,
      commentCount: post.commentCount || 0,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      author: post.author ? AdminService.toAdminAuthor(post.author) : undefined,
      pet: post.pet ? AdminService.toAdminPet(post.pet) : undefined,
      circle: post.circle ? { id: post.circle.id, name: post.circle.name } : undefined,
    };
  }

  private static toAdminMomentListItem(moment: Record<string, any>): Record<string, unknown> {
    return {
      id: moment.id,
      type: 'MOMENT',
      title: '日常',
      content: moment.content,
      images: moment.images || [],
      videos: moment.videos || [],
      status: moment.isRemoved ? 'REMOVED' : 'ACTIVE',
      visibility: moment.visibility || 'PUBLIC',
      likeCount: moment.likeCount || 0,
      commentCount: moment.commentCount || 0,
      createdAt: moment.createdAt.toISOString(),
      updatedAt: moment.updatedAt.toISOString(),
      author: moment.user ? AdminService.toAdminAuthor(moment.user) : undefined,
      pet: moment.pet ? AdminService.toAdminPet(moment.pet) : undefined,
    };
  }

  private static toAdminCommentListItem(comment: Record<string, any>, type: 'COMMENT' | 'MOMENT_COMMENT'): Record<string, unknown> {
    const sourceTitle = type === 'COMMENT'
      ? comment.post?.title
      : comment.moment?.content;
    return {
      id: comment.id,
      type,
      title: type === 'COMMENT' ? '帖子评论' : '日常评论',
      content: comment.content,
      images: [],
      videos: [],
      status: comment.isRemoved ? 'REMOVED' : 'ACTIVE',
      likeCount: 0,
      commentCount: 0,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt ? comment.updatedAt.toISOString() : comment.createdAt.toISOString(),
      author: comment.author ? AdminService.toAdminAuthor(comment.author) : undefined,
      circle: sourceTitle
        ? {
            id: type === 'COMMENT' ? comment.postId : comment.momentId,
            name: String(sourceTitle).slice(0, 30),
          }
        : undefined,
    };
  }

  private static toAdminCircleListItem(circle: Record<string, any>): Record<string, unknown> {
    return {
      id: circle.id,
      type: 'CIRCLE',
      title: circle.name,
      content: circle.description || '',
      images: circle.coverImage ? [circle.coverImage] : [],
      videos: [],
      status: circle.isRemoved ? 'REMOVED' : 'ACTIVE',
      likeCount: circle.memberCount || 0,
      commentCount: circle.postCount || 0,
      createdAt: circle.createdAt.toISOString(),
      updatedAt: circle.updatedAt ? circle.updatedAt.toISOString() : circle.createdAt.toISOString(),
      author: circle.owner ? AdminService.toAdminAuthor(circle.owner) : undefined,
    };
  }

  private static toAdminReportListItem(report: Record<string, any>): Record<string, unknown> {
    return {
      id: report.id,
      reporterId: report.reporterId,
      targetType: report.targetType,
      targetId: report.targetId,
      targetOwnerId: report.targetOwnerId || '',
      reason: report.reason,
      note: report.note || '',
      status: report.status,
      duplicateCount: report.duplicateCount || 1,
      resolutionAction: report.resolutionAction || null,
      resolutionNote: report.resolutionNote || '',
      handledByAdminId: report.handledByAdminId || null,
      handledAt: report.handledAt ? report.handledAt.toISOString() : null,
      lastReportedAt: report.lastReportedAt ? report.lastReportedAt.toISOString() : null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private static toAdminAuthor(user: Record<string, any>): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
    };
  }

  private static toAdminPet(pet: Record<string, any>): Record<string, unknown> {
    return {
      id: pet.id,
      name: pet.name,
      avatar: pet.photo || '',
    };
  }

  private static toAdminPetSummary(pet: Record<string, any>): Record<string, unknown> {
    return {
      id: pet.id,
      type: 'PET',
      name: pet.name,
      species: pet.species,
      breed: pet.breed || '',
      avatar: pet.photo || '',
      createdAt: pet.createdAt.toISOString(),
    };
  }
}
