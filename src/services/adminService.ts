import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';

type AdminRoleName = 'SUPER_ADMIN' | 'OPS_ADMIN' | 'CONTENT_MODERATOR' | 'SUPPORT' | 'READONLY';
type AdminStatusName = 'ACTIVE' | 'DISABLED';
type UserAccountStatusName = 'ACTIVE' | 'SUSPENDED';
type AdminContentType = 'POST' | 'MOMENT';
type AdminContentStatus = 'ACTIVE' | 'REMOVED';

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

  static async getDashboardSummary(): Promise<{
    users: { total: number; suspended: number };
    pets: { total: number };
    content: { moments: number; posts: number };
    reports: { pending: number };
  }> {
    const [totalUsers, suspendedUsers, totalPets, moments, posts] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { accountStatus: 'SUSPENDED' } }),
      prisma.pet.count(),
      prisma.moment.count(),
      prisma.post.count(),
    ]);

    return {
      users: { total: totalUsers, suspended: suspendedUsers },
      pets: { total: totalPets },
      content: { moments, posts },
      reports: { pending: 0 },
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

    return AdminService.toAdminUserListItem(user);
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

  static async listAuditLogs(query: { page?: number; pageSize?: number } = {}): Promise<{
    items: unknown[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const [total, items] = await Promise.all([
      prisma.adminAuditLog.count(),
      prisma.adminAuditLog.findMany({
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
          pet: { select: { id: true, name: true, avatar: true } },
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
          pet: { select: { id: true, name: true, avatar: true } },
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
      avatar: pet.avatar,
    };
  }
}
