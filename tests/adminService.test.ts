import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.mock('../src/config/database', () => ({
  prisma: {
    adminUser: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    adminAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    contentReport: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    aiAssistantSession: {
      count: jest.fn(),
    },
    emergencyHelp: {
      count: jest.fn(),
    },
    sosSearchLog: {
      count: jest.fn(),
    },
    vetClinic: {
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
      findMany: jest.fn(),
    },
    moment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    post: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    comment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    momentComment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    circle: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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
    nodeEnv: 'test',
    database: { url: 'postgresql://test' },
    jwt: { secret: 'fallback-secret-key' },
    llm: { apiKey: '', model: 'deepseek-chat' },
    ark: { apiKey: '', visionModel: 'doubao-seed-2-1-pro-260628' },
    amap: { webServiceKey: '' },
    encryption: { key: 'pawpal-encryption-key-32bytes-changeme!!' },
    upload: { dir: 'uploads' },
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
      (prisma.contentReport.count as jest.Mock).mockResolvedValue(3);

      const summary = await AdminService.getDashboardSummary();

      expect(summary).toEqual({
        users: { total: 12, suspended: 2 },
        pets: { total: 9 },
        content: { moments: 20, posts: 7 },
        reports: { pending: 3 },
      });
    });

    it('applies a dashboard range to period counts', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-04T12:00:00Z'));
      (prisma.user.count as jest.Mock).mockResolvedValueOnce(12).mockResolvedValueOnce(2).mockResolvedValueOnce(4);
      (prisma.pet.count as jest.Mock).mockResolvedValueOnce(9).mockResolvedValueOnce(3);
      (prisma.moment.count as jest.Mock).mockResolvedValueOnce(20).mockResolvedValueOnce(6);
      (prisma.post.count as jest.Mock).mockResolvedValueOnce(7).mockResolvedValueOnce(2);
      (prisma.contentReport.count as jest.Mock).mockResolvedValueOnce(3).mockResolvedValueOnce(1);

      const summary = await AdminService.getDashboardSummary({ range: '7d' });

      const since = new Date('2026-06-28T00:00:00.000Z');
      expect(prisma.user.count).toHaveBeenNthCalledWith(3, { where: { createdAt: { gte: since } } });
      expect(prisma.pet.count).toHaveBeenNthCalledWith(2, { where: { createdAt: { gte: since } } });
      expect(prisma.moment.count).toHaveBeenNthCalledWith(2, { where: { createdAt: { gte: since } } });
      expect(prisma.post.count).toHaveBeenNthCalledWith(2, { where: { createdAt: { gte: since } } });
      expect(prisma.contentReport.count).toHaveBeenNthCalledWith(2, { where: { createdAt: { gte: since } } });
      expect(summary.period).toEqual({
        range: '7d',
        users: 4,
        pets: 3,
        moments: 6,
        posts: 2,
        reports: 1,
      });
      jest.useRealTimers();
    });
  });

  describe('getDashboardAlerts', () => {
    it('returns actionable dashboard alerts for reports and configuration gaps', async () => {
      (prisma.contentReport.count as jest.Mock).mockResolvedValueOnce(4);
      (prisma.aiAssistantSession.count as jest.Mock).mockResolvedValueOnce(2);
      (prisma.vetClinic.count as jest.Mock).mockResolvedValueOnce(0);

      const alerts = await AdminService.getDashboardAlerts();

      expect(prisma.contentReport.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
      expect(alerts).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'REPORTS_PENDING', severity: 'warning', count: 4 }),
        expect.objectContaining({ type: 'AI_IMAGE_FALLBACK', severity: 'warning', count: 2 }),
        expect.objectContaining({ type: 'SOS_AMAP_NOT_CONFIGURED', severity: 'critical' }),
        expect.objectContaining({ type: 'SOS_LOCAL_VETS_EMPTY', severity: 'warning', count: 0 }),
      ]));
    });
  });

  describe('admin monitoring', () => {
    it('lists admin users without password hashes', async () => {
      (prisma.adminUser.findMany as jest.Mock).mockResolvedValue([
        {
          ...activeSuperAdmin,
          passwordHash: 'hashed-password',
          lastLoginAt: new Date('2026-07-03T08:30:00Z'),
        },
        {
          id: 'admin-2',
          email: 'ops@example.com',
          passwordHash: 'another-hash',
          name: 'Ops',
          role: 'OPS_ADMIN',
          status: 'DISABLED',
          lastLoginAt: null,
          createdAt: new Date('2026-07-02T00:00:00Z'),
          updatedAt: new Date('2026-07-02T00:00:00Z'),
        },
      ]);

      const admins = await AdminService.listAdminUsers();

      expect(prisma.adminUser.findMany).toHaveBeenCalledWith({
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      });
      expect(admins).toEqual([
        {
          id: 'admin-1',
          email: 'yaki_meng@163.com',
          name: 'PawPal Admin',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          lastLoginAt: '2026-07-03T08:30:00.000Z',
          createdAt: '2026-07-03T00:00:00.000Z',
          updatedAt: '2026-07-03T00:00:00.000Z',
        },
        {
          id: 'admin-2',
          email: 'ops@example.com',
          name: 'Ops',
          role: 'OPS_ADMIN',
          status: 'DISABLED',
          lastLoginAt: null,
          createdAt: '2026-07-02T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ]);
      expect(JSON.stringify(admins)).not.toContain('passwordHash');
      expect(JSON.stringify(admins)).not.toContain('hashed-password');
    });

    it('returns AI, SOS, and system read-only metrics without secrets', async () => {
      (prisma.aiAssistantSession.count as jest.Mock)
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(6);
      (prisma.emergencyHelp.count as jest.Mock)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(6);
      (prisma.sosSearchLog.count as jest.Mock)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(11)
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(13);
      (prisma.vetClinic.count as jest.Mock).mockResolvedValue(8);

      const ai = await AdminService.getAIMetrics();
      const sos = await AdminService.getSOSMetrics();
      const system = await AdminService.getSystemStatus('pawpal-test-build');

      expect(ai).toEqual(expect.objectContaining({
        totalSessions: 12,
        todaySessions: 3,
        imageSessions: 4,
        fallbackSessions: 2,
        failureSessions: 1,
        highRiskConsultations: {
          emergency: 2,
          medication: 3,
          diet: 4,
          behavior: 5,
          vaccine: 6,
        },
        deepSeekConfigured: false,
        arkConfigured: false,
      }));
      expect(sos).toEqual(expect.objectContaining({
        totalHelpRequests: 5,
        activeHelpRequests: 1,
        todayHelpRequests: 2,
        totalVetSearches: 7,
        systemLocationSearches: 8,
        manualLocationSearches: 9,
        amapSuccessSearches: 10,
        noResultSearches: 11,
        amapFailedFallbackSearches: 12,
        dbFallbackSearches: 13,
        criticalHelpRequests: 6,
        localVetClinics: 8,
        amapConfigured: false,
        diagnostics: {
          amapConfigured: false,
          localFallbackAvailable: true,
          locationTracking: 'SOS_SEARCH_LOGS',
        },
      }));
      expect(system).toEqual(expect.objectContaining({
        buildId: 'pawpal-test-build',
        environment: 'test',
      }));
      expect(JSON.stringify(system)).not.toContain('secret');
      expect(JSON.stringify(system)).not.toContain('key');
    });
  });

  describe('admin user management', () => {
    it('creates an admin user with hashed password and audit log', async () => {
      const createdAt = new Date('2026-07-04T04:00:00Z');
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.adminUser.create as jest.Mock).mockImplementation(async ({ data }) => ({
        id: 'admin-new',
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: data.role,
        status: data.status,
        lastLoginAt: null,
        createdAt,
        updatedAt: createdAt,
      }));
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const admin = await AdminService.createAdminUser(activeSuperAdmin, {
        email: 'ops@example.com',
        password: 'new-password',
        name: '运营',
        role: 'OPS_ADMIN',
        status: 'ACTIVE',
      }, { ipAddress: '127.0.0.1', userAgent: 'jest' });

      expect(admin).toMatchObject({ email: 'ops@example.com', role: 'OPS_ADMIN', status: 'ACTIVE' });
      expect(prisma.adminUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'ops@example.com',
          passwordHash: expect.not.stringContaining('new-password'),
          name: '运营',
          role: 'OPS_ADMIN',
          status: 'ACTIVE',
        }),
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'ADMIN_USER_CREATE',
          targetType: 'ADMIN_USER',
          targetId: 'admin-new',
        }),
      });
    });

    it('does not disable the last active super admin', async () => {
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(activeSuperAdmin);
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(1);

      await expect(AdminService.updateAdminUser(activeSuperAdmin, 'admin-1', {
        status: 'DISABLED',
      })).rejects.toThrow('不能停用最后一个超级管理员');
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
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

  describe('getUserDetail', () => {
    it('includes pets and recent user content summaries', async () => {
      const createdAt = new Date('2026-07-03T08:00:00Z');
      const updatedAt = new Date('2026-07-03T09:00:00Z');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        nickname: '猫猫家长',
        avatar: '',
        city: '佛山',
        membershipLevel: 'FREE',
        accountStatus: 'ACTIVE',
        suspendedUntil: null,
        suspendedReason: '',
        deletedAt: null,
        createdAt,
        updatedAt,
        _count: { pets: 1, moments: 1, posts: 1, comments: 1, followers: 2, followings: 3 },
      });
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([
        { id: 'pet-1', name: '团团', species: 'CAT', breed: '狸花猫', photo: '', createdAt },
      ]);
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([
        { id: 'moment-1', content: '晒猫', images: [], videos: [], isRemoved: false, likeCount: 3, commentCount: 1, createdAt, updatedAt, pet: { id: 'pet-1', name: '团团', photo: '' } },
      ]);
      (prisma.post.findMany as jest.Mock).mockResolvedValue([
        { id: 'post-1', title: '领养故事', content: '今天带猫去公园。', images: [], isRemoved: false, likeCount: 8, commentCount: 2, createdAt, updatedAt, pet: null, circle: { id: 'circle-1', name: '新手养猫' } },
      ]);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([
        { id: 'comment-1', content: '很有帮助', isRemoved: false, createdAt, postId: 'post-1', post: { id: 'post-1', title: '领养故事' } },
      ]);
      (prisma.momentComment.findMany as jest.Mock).mockResolvedValue([
        { id: 'moment-comment-1', content: '好可爱', isRemoved: false, createdAt, momentId: 'moment-1', moment: { id: 'moment-1', content: '晒猫' } },
      ]);

      const detail = await AdminService.getUserDetail('user-1');

      expect(prisma.pet.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, species: true, breed: true, photo: true, createdAt: true },
      });
      expect(prisma.moment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1' },
        take: 5,
      }));
      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1' },
        take: 5,
      }));
      expect(detail).toMatchObject({
        id: 'user-1',
        recent: {
          pets: [{ id: 'pet-1', name: '团团', type: 'PET' }],
          moments: [{ id: 'moment-1', type: 'MOMENT', content: '晒猫' }],
          posts: [{ id: 'post-1', type: 'POST', title: '领养故事' }],
          comments: [{ id: 'comment-1', type: 'COMMENT', content: '很有帮助' }],
          momentComments: [{ id: 'moment-comment-1', type: 'MOMENT_COMMENT', content: '好可爱' }],
        },
      });
    });
  });

  describe('listAuditLogs', () => {
    it('applies action, target, admin and date filters', async () => {
      const createdAt = new Date('2026-07-03T08:00:00Z');
      (prisma.adminAuditLog.count as jest.Mock).mockResolvedValue(1);
      (prisma.adminAuditLog.findMany as jest.Mock).mockResolvedValue([{
        id: 'audit-1',
        adminUserId: 'admin-1',
        action: 'USER_SUSPEND',
        targetType: 'USER',
        targetId: 'user-1',
        reason: '违规',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        createdAt,
      }]);

      const result = await AdminService.listAuditLogs({
        page: 1,
        pageSize: 20,
        action: 'USER_SUSPEND',
        targetType: 'USER',
        adminUserId: 'admin-1',
        dateFrom: '2026-07-03T00:00:00.000Z',
        dateTo: '2026-07-04T00:00:00.000Z',
      });

      const where = {
        action: 'USER_SUSPEND',
        targetType: 'USER',
        adminUserId: 'admin-1',
        createdAt: {
          gte: new Date('2026-07-03T00:00:00.000Z'),
          lte: new Date('2026-07-04T00:00:00.000Z'),
        },
      };
      expect(result.meta.total).toBe(1);
      expect(prisma.adminAuditLog.count).toHaveBeenCalledWith({ where });
      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
        where,
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });
  });

  describe('getContentDetail', () => {
    it('returns a post detail with author, pet and circle context', async () => {
      const createdAt = new Date('2026-07-03T08:00:00Z');
      const updatedAt = new Date('2026-07-03T09:00:00Z');
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'post-1',
        title: '领养故事',
        content: '今天带猫去公园。',
        images: ['https://cdn.example.com/post.jpg'],
        isRemoved: false,
        likeCount: 8,
        commentCount: 2,
        createdAt,
        updatedAt,
        author: {
          id: 'user-1',
          email: 'owner@example.com',
          nickname: '猫猫家长',
          avatar: '',
        },
        pet: { id: 'pet-1', name: '团团', photo: 'https://cdn.example.com/pet.jpg' },
        circle: { id: 'circle-1', name: '新手养猫' },
      });

      const detail = await AdminService.getContentDetail('POST', 'post-1');

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        include: {
          author: { select: { id: true, email: true, nickname: true, avatar: true } },
          pet: { select: { id: true, name: true, photo: true } },
          circle: { select: { id: true, name: true } },
        },
      });
      expect(detail).toMatchObject({
        id: 'post-1',
        type: 'POST',
        title: '领养故事',
        content: '今天带猫去公园。',
        images: ['https://cdn.example.com/post.jpg'],
        status: 'ACTIVE',
        likeCount: 8,
        commentCount: 2,
        author: { id: 'user-1', email: 'owner@example.com', nickname: '猫猫家长' },
        pet: { id: 'pet-1', name: '团团' },
        circle: { id: 'circle-1', name: '新手养猫' },
      });
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

  describe('content moderation', () => {
    const actor = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'CONTENT_MODERATOR',
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    };

    it('returns a mixed paginated content list', async () => {
      const createdAt = new Date('2026-07-03T01:00:00Z');
      (prisma.post.count as jest.Mock).mockResolvedValue(1);
      (prisma.moment.count as jest.Mock).mockResolvedValue(1);
      (prisma.post.findMany as jest.Mock).mockResolvedValue([{
        id: 'post-1',
        title: '动态标题',
        content: '动态内容',
        images: [],
        isRemoved: false,
        likeCount: 2,
        commentCount: 1,
        createdAt,
        updatedAt: createdAt,
        author: { id: 'user-1', email: 'u@example.com', nickname: '用户', avatar: '' },
        pet: null,
        circle: { id: 'circle-1', name: '猫咪圈' },
      }]);
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([{
        id: 'moment-1',
        content: '日常内容',
        images: ['image.jpg'],
        videos: [],
        isRemoved: false,
        visibility: 'PUBLIC',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date('2026-07-03T02:00:00Z'),
        updatedAt: new Date('2026-07-03T02:00:00Z'),
        user: { id: 'user-2', email: 'm@example.com', nickname: '日常用户', avatar: '' },
        pet: { id: 'pet-1', name: '小白', photo: 'pet.jpg' },
      }]);

      const result = await AdminService.listContent({ page: 1, pageSize: 20, status: 'ACTIVE' });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
      expect(result.items.map((item) => item.type)).toEqual(['MOMENT', 'POST']);
      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ isRemoved: false }),
        include: expect.objectContaining({
          pet: { select: { id: true, name: true, photo: true } },
        }),
      }));
      expect(prisma.moment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ isRemoved: false }),
        include: expect.objectContaining({
          pet: { select: { id: true, name: true, photo: true } },
        }),
      }));
      expect(result.items[0].pet).toEqual({ id: 'pet-1', name: '小白', avatar: 'pet.jpg' });
    });

    it('lists comments, moment comments, and circles for moderation', async () => {
      const createdAt = new Date('2026-07-03T00:00:00Z');
      (prisma.comment.count as jest.Mock).mockResolvedValue(1);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([{
        id: 'comment-1',
        postId: 'post-1',
        userId: 'user-1',
        content: '评论内容',
        isRemoved: false,
        createdAt,
        author: { id: 'user-1', email: 'u@example.com', nickname: '用户', avatar: '' },
        post: { id: 'post-1', title: '帖子标题' },
      }]);

      const comments = await AdminService.listContent({ type: 'COMMENT' });

      expect(comments.items[0]).toEqual(expect.objectContaining({
        id: 'comment-1',
        type: 'COMMENT',
        title: '帖子评论',
        status: 'ACTIVE',
      }));

      (prisma.momentComment.count as jest.Mock).mockResolvedValue(1);
      (prisma.momentComment.findMany as jest.Mock).mockResolvedValue([{
        id: 'moment-comment-1',
        momentId: 'moment-1',
        userId: 'user-2',
        content: '日常评论',
        isRemoved: true,
        createdAt,
        author: { id: 'user-2', email: 'm@example.com', nickname: '用户2', avatar: '' },
        moment: { id: 'moment-1', content: '日常正文' },
      }]);

      const momentComments = await AdminService.listContent({ type: 'MOMENT_COMMENT', status: 'REMOVED' });

      expect(momentComments.items[0]).toEqual(expect.objectContaining({
        id: 'moment-comment-1',
        type: 'MOMENT_COMMENT',
        title: '日常评论',
        status: 'REMOVED',
      }));

      (prisma.circle.count as jest.Mock).mockResolvedValue(1);
      (prisma.circle.findMany as jest.Mock).mockResolvedValue([{
        id: 'circle-1',
        name: '猫咪圈',
        description: '猫咪交流',
        coverImage: '',
        isRemoved: false,
        memberCount: 10,
        postCount: 2,
        createdAt,
        owner: { id: 'owner-1', email: 'owner@example.com', nickname: '圈主', avatar: '' },
      }]);

      const circles = await AdminService.listContent({ type: 'CIRCLE' });

      expect(circles.items[0]).toEqual(expect.objectContaining({
        id: 'circle-1',
        type: 'CIRCLE',
        title: '猫咪圈',
        status: 'ACTIVE',
      }));
    });

    it('removes a post and writes an audit log', async () => {
      const before = {
        id: 'post-1',
        title: '动态标题',
        content: '动态内容',
        images: [],
        isRemoved: false,
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date('2026-07-03T00:00:00Z'),
        updatedAt: new Date('2026-07-03T00:00:00Z'),
      };
      const after = { ...before, isRemoved: true };
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(before);
      (prisma.post.update as jest.Mock).mockResolvedValue(after);
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await AdminService.removeContent(actor, 'POST', 'post-1', {
        reason: '违规内容',
      });

      expect(result.status).toBe('REMOVED');
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { isRemoved: true },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'POST_REMOVE',
          targetType: 'POST',
          targetId: 'post-1',
          reason: '违规内容',
        }),
      });
    });

    it('restores a moment and writes an audit log', async () => {
      const before = {
        id: 'moment-1',
        content: '日常内容',
        images: [],
        videos: [],
        isRemoved: true,
        visibility: 'PUBLIC',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date('2026-07-03T00:00:00Z'),
        updatedAt: new Date('2026-07-03T00:00:00Z'),
      };
      const after = { ...before, isRemoved: false };
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(before);
      (prisma.moment.update as jest.Mock).mockResolvedValue(after);
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await AdminService.restoreContent(actor, 'MOMENT', 'moment-1', {
        reason: '复核通过',
      });

      expect(result.status).toBe('ACTIVE');
      expect(prisma.moment.update).toHaveBeenCalledWith({
        where: { id: 'moment-1' },
        data: { isRemoved: false },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'MOMENT_RESTORE',
          targetType: 'MOMENT',
          targetId: 'moment-1',
          reason: '复核通过',
        }),
      });
    });

    it('removes a comment and writes an audit log', async () => {
      const before = {
        id: 'comment-1',
        content: '评论内容',
        isRemoved: false,
        createdAt: new Date('2026-07-03T00:00:00Z'),
      };
      const after = { ...before, isRemoved: true };
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(before);
      (prisma.comment.update as jest.Mock).mockResolvedValue(after);
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await AdminService.removeContent(actor, 'COMMENT', 'comment-1', {
        reason: '违规评论',
      });

      expect(result.status).toBe('REMOVED');
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: { isRemoved: true },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'COMMENT_REMOVE',
          targetType: 'COMMENT',
          targetId: 'comment-1',
          reason: '违规评论',
        }),
      });
    });
  });

  describe('report moderation', () => {
    const actor = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'CONTENT_MODERATOR',
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    };

    it('lists pending reports', async () => {
      const createdAt = new Date('2026-07-03T00:00:00Z');
      (prisma.contentReport.count as jest.Mock).mockResolvedValue(1);
      (prisma.contentReport.findMany as jest.Mock).mockResolvedValue([{
        id: 'report-1',
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
        targetOwnerId: 'author-1',
        reason: 'FALSE_MEDICAL',
        note: '危险建议',
        status: 'PENDING',
        duplicateCount: 1,
        resolutionAction: null,
        resolutionNote: '',
        handledByAdminId: null,
        handledAt: null,
        createdAt,
        updatedAt: createdAt,
        lastReportedAt: createdAt,
      }]);

      const result = await AdminService.listReports({ status: 'PENDING' });

      expect(result.meta.total).toBe(1);
      expect(result.items[0]).toEqual(expect.objectContaining({
        id: 'report-1',
        targetType: 'POST',
        status: 'PENDING',
        reason: 'FALSE_MEDICAL',
      }));
      expect(prisma.contentReport.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { status: 'PENDING' },
      }));
    });

    it('returns a report detail with reporter and target owner summaries', async () => {
      const createdAt = new Date('2026-07-03T00:00:00Z');
      (prisma.contentReport.findUnique as jest.Mock).mockResolvedValue({
        id: 'report-1',
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
        targetOwnerId: 'author-1',
        reason: 'FALSE_MEDICAL',
        note: '危险建议',
        status: 'PENDING',
        duplicateCount: 2,
        resolutionAction: null,
        resolutionNote: '',
        handledByAdminId: null,
        handledAt: null,
        createdAt,
        updatedAt: createdAt,
        lastReportedAt: createdAt,
      });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'reporter-1',
          email: 'reporter@example.com',
          nickname: '举报人',
          avatar: '',
        },
        {
          id: 'author-1',
          email: 'author@example.com',
          nickname: '作者',
          avatar: '',
        },
      ]);

      const detail = await AdminService.getReportDetail('report-1');

      expect(prisma.contentReport.findUnique).toHaveBeenCalledWith({
        where: { id: 'report-1' },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['reporter-1', 'author-1'] } },
        select: { id: true, email: true, nickname: true, avatar: true },
      });
      expect(detail).toEqual(expect.objectContaining({
        id: 'report-1',
        duplicateCount: 2,
        reporter: expect.objectContaining({ email: 'reporter@example.com' }),
        targetOwner: expect.objectContaining({ email: 'author@example.com' }),
      }));
    });

    it('resolves a report by hiding the reported post and writing an audit log', async () => {
      const createdAt = new Date('2026-07-03T00:00:00Z');
      const report = {
        id: 'report-1',
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
        targetOwnerId: 'author-1',
        reason: 'FALSE_MEDICAL',
        note: '危险建议',
        status: 'PENDING',
        duplicateCount: 1,
        resolutionAction: null,
        resolutionNote: '',
        handledByAdminId: null,
        handledAt: null,
        createdAt,
        updatedAt: createdAt,
        lastReportedAt: createdAt,
      };
      (prisma.contentReport.findUnique as jest.Mock).mockResolvedValue(report);
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'post-1',
        isRemoved: false,
        title: '错误医疗建议',
        content: '危险内容',
        images: [],
        likeCount: 0,
        commentCount: 0,
        createdAt,
        updatedAt: createdAt,
      });
      (prisma.post.update as jest.Mock).mockResolvedValue({
        id: 'post-1',
        isRemoved: true,
        title: '错误医疗建议',
        content: '危险内容',
        images: [],
        likeCount: 0,
        commentCount: 0,
        createdAt,
        updatedAt: createdAt,
      });
      (prisma.contentReport.update as jest.Mock).mockResolvedValue({
        ...report,
        status: 'RESOLVED',
        resolutionAction: 'HIDE_CONTENT',
        resolutionNote: '已隐藏',
        handledByAdminId: 'admin-1',
        handledAt: new Date('2026-07-03T01:00:00Z'),
      });
      (prisma.adminAuditLog.create as jest.Mock).mockResolvedValue({});

      const result = await AdminService.handleReport(actor, 'report-1', {
        status: 'RESOLVED',
        action: 'HIDE_CONTENT',
        note: '已隐藏',
      });

      expect(result.status).toBe('RESOLVED');
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { isRemoved: true },
      });
      expect(prisma.contentReport.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolutionAction: 'HIDE_CONTENT',
          resolutionNote: '已隐藏',
          handledByAdminId: 'admin-1',
        }),
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'REPORT_RESOLVE',
          targetType: 'REPORT',
          targetId: 'report-1',
          reason: '已隐藏',
        }),
      });
    });
  });
});
