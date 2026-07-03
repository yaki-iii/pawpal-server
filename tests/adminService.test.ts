import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.mock('../src/config/database', () => ({
  prisma: {
    adminUser: {
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    adminAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    pet: {
      count: jest.fn(),
    },
    moment: {
      count: jest.fn(),
    },
    post: {
      count: jest.fn(),
    },
  },
}));

jest.mock('../src/config', () => ({
  config: {
    admin: {
      bootstrapEmail: 'yaki_meng@163.com',
      bootstrapPassword: 'bootstrap-secret',
      bootstrapResetPassword: false,
      jwtSecret: 'test-admin-jwt-secret',
      jwtExpiresIn: '12h',
      panelOrigin: 'https://admin.example.com',
    },
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

import { AdminService } from '../src/services/adminService';
import { prisma } from '../src/config/database';
import { config } from '../src/config';

describe('AdminService', () => {
  const activeSuperAdmin = {
    id: 'admin-1',
    email: 'yaki_meng@163.com',
    passwordHash: '',
    name: 'PawPal Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: new Date('2026-07-03T00:00:00Z'),
    updatedAt: new Date('2026-07-03T00:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.admin.bootstrapResetPassword = false;
  });

  describe('bootstrapSuperAdmin', () => {
    it('creates the first super admin from environment config', async () => {
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(0);
      (prisma.adminUser.create as jest.Mock).mockImplementation(async ({ data }) => ({
        ...activeSuperAdmin,
        ...data,
        id: 'admin-1',
        createdAt: activeSuperAdmin.createdAt,
        updatedAt: activeSuperAdmin.updatedAt,
      }));

      const admin = await AdminService.bootstrapSuperAdmin();

      expect(admin?.email).toBe('yaki_meng@163.com');
      expect(admin?.role).toBe('SUPER_ADMIN');
      expect(admin).not.toHaveProperty('passwordHash');
      expect(prisma.adminUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'yaki_meng@163.com',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          passwordHash: expect.not.stringContaining('bootstrap-secret'),
        }),
      });
    });

    it('does not overwrite existing admin users', async () => {
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(1);

      const admin = await AdminService.bootstrapSuperAdmin();

      expect(admin).toBeNull();
      expect(prisma.adminUser.create).not.toHaveBeenCalled();
    });

    it('resets the bootstrap admin password only when the reset flag is enabled', async () => {
      config.admin.bootstrapResetPassword = true;
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(1);
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(activeSuperAdmin);
      (prisma.adminUser.update as jest.Mock).mockImplementation(async ({ data }) => ({
        ...activeSuperAdmin,
        ...data,
        updatedAt: new Date('2026-07-03T02:00:00Z'),
      }));

      const admin = await AdminService.bootstrapSuperAdmin();

      expect(admin?.email).toBe('yaki_meng@163.com');
      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: expect.objectContaining({
          passwordHash: expect.not.stringContaining('bootstrap-secret'),
          status: 'ACTIVE',
        }),
      });
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      activeSuperAdmin.passwordHash = await bcrypt.hash('correct-password', 10);
    });

    it('returns an admin DTO and admin JWT for valid credentials', async () => {
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(activeSuperAdmin);
      (prisma.adminUser.update as jest.Mock).mockResolvedValue({
        ...activeSuperAdmin,
        lastLoginAt: new Date('2026-07-03T01:00:00Z'),
      });
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await AdminService.login('yaki_meng@163.com', 'correct-password', {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(result.admin.email).toBe('yaki_meng@163.com');
      expect(result.admin.role).toBe('SUPER_ADMIN');
      expect(result.admin).not.toHaveProperty('passwordHash');
      const decoded = jwt.verify(result.token, 'test-admin-jwt-secret') as jwt.JwtPayload;
      expect(decoded.adminUserId).toBe('admin-1');
      expect(decoded.role).toBe('SUPER_ADMIN');
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'ADMIN_LOGIN_SUCCESS',
          targetType: 'ADMIN_AUTH',
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      });
    });

    it('rejects a disabled admin account', async () => {
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({
        ...activeSuperAdmin,
        status: 'DISABLED',
      });
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      await expect(
        AdminService.login('yaki_meng@163.com', 'correct-password', {
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      ).rejects.toThrow('管理员账号已停用');
    });

    it('rejects an incorrect password', async () => {
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(activeSuperAdmin);
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      await expect(
        AdminService.login('yaki_meng@163.com', 'wrong-password', {
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      ).rejects.toThrow('邮箱或密码错误');
    });
  });

  describe('getDashboardSummary', () => {
    it('returns basic product and moderation counts', async () => {
      (prisma.user.count as jest.Mock).mockResolvedValueOnce(12).mockResolvedValueOnce(2);
      (prisma.pet.count as jest.Mock).mockResolvedValue(9);
      (prisma.moment.count as jest.Mock).mockResolvedValue(20);
      (prisma.post.count as jest.Mock).mockResolvedValue(7);

      const summary = await AdminService.getDashboardSummary();

      expect(summary).toEqual({
        users: { total: 12, suspended: 2 },
        pets: { total: 9 },
        content: { moments: 20, posts: 7 },
        reports: { pending: 0 },
      });
    });
  });

  describe('listUsers', () => {
    it('returns paginated users using search and status filters', async () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        nickname: '用户',
        avatar: '',
        bio: '',
        city: '上海',
        membershipLevel: 'FREE',
        accountStatus: 'ACTIVE',
        suspendedUntil: null,
        suspendedReason: '',
        deletedAt: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-02T00:00:00Z'),
        _count: { pets: 1, moments: 3, posts: 2 },
      };
      (prisma.user.count as jest.Mock).mockResolvedValue(1);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([user]);

      const result = await AdminService.listUsers({
        page: 1,
        pageSize: 20,
        search: 'user@example.com',
        accountStatus: 'ACTIVE',
      });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(result.items[0]).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        nickname: '用户',
        avatar: '',
        city: '上海',
        membershipLevel: 'FREE',
        accountStatus: 'ACTIVE',
        suspendedUntil: null,
        suspendedReason: '',
        deletedAt: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
        counts: { pets: 1, moments: 3, posts: 2 },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 0,
        take: 20,
        where: expect.objectContaining({
          accountStatus: 'ACTIVE',
          OR: expect.any(Array),
        }),
      }));
    });
  });

  describe('suspendUser and unsuspendUser', () => {
    const actor = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    };

    it('suspends a user and writes an audit log', async () => {
      const before = {
        id: 'user-1',
        email: 'user@example.com',
        accountStatus: 'ACTIVE',
        suspendedUntil: null,
        suspendedReason: '',
      };
      const after = {
        ...before,
        accountStatus: 'SUSPENDED',
        suspendedUntil: new Date('2026-07-10T00:00:00Z'),
        suspendedReason: '垃圾广告',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(before);
      (prisma.user.update as jest.Mock).mockResolvedValue(after);
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await AdminService.suspendUser(actor, 'user-1', {
        reason: '垃圾广告',
        suspendedUntil: '2026-07-10T00:00:00.000Z',
      }, {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(result.accountStatus).toBe('SUSPENDED');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          accountStatus: 'SUSPENDED',
          suspendedReason: '垃圾广告',
          suspendedUntil: new Date('2026-07-10T00:00:00.000Z'),
        },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'USER_SUSPEND',
          targetType: 'USER',
          targetId: 'user-1',
          reason: '垃圾广告',
        }),
      });
    });

    it('unsuspends a user and writes an audit log', async () => {
      const before = {
        id: 'user-1',
        email: 'user@example.com',
        accountStatus: 'SUSPENDED',
        suspendedUntil: new Date('2026-07-10T00:00:00Z'),
        suspendedReason: '垃圾广告',
      };
      const after = {
        ...before,
        accountStatus: 'ACTIVE',
        suspendedUntil: null,
        suspendedReason: '',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(before);
      (prisma.user.update as jest.Mock).mockResolvedValue(after);
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await AdminService.unsuspendUser(actor, 'user-1', {
        reason: '申诉通过',
      }, {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(result.accountStatus).toBe('ACTIVE');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          accountStatus: 'ACTIVE',
          suspendedReason: '',
          suspendedUntil: null,
        },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'USER_UNSUSPEND',
          targetType: 'USER',
          targetId: 'user-1',
          reason: '申诉通过',
        }),
      });
    });
  });
});
