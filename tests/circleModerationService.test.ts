import { CircleModerationService } from '../src/services/circleModerationService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    circle: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    circleMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    circleBan: {
      upsert: jest.fn(),
    },
    circleJoinRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    postRemoval: {
      create: jest.fn(),
    },
    userWarning: {
      create: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../src/config', () => ({
  config: {
    encryption: { key: 'test-encryption-key-32bytes-ok!!!' },
  },
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock NotificationService
jest.mock('../src/services/notificationService', () => ({
  NotificationService: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

const mockCircle = {
  id: 'circle-1',
  name: '柯基圈',
  type: 'BREED',
  species: 'DOG',
  coverImage: '',
  description: '柯基爱好者圈',
  ownerId: 'owner-1',
  createdByUserId: 'owner-1',
  isVerified: true,
  rules: '友善交流',
  visibility: 'PUBLIC',
  moderatorNote: '',
  lastActiveAt: new Date('2026-06-01'),
  memberCount: 100,
  postCount: 50,
  createdAt: new Date('2026-01-01'),
};

const mockOwner = { id: 'owner-1', role: 'OWNER', status: 'ACTIVE' };
const mockModerator = { id: 'mod-1', role: 'MODERATOR', status: 'ACTIVE' };
const mockMember = { id: 'mem-1', role: 'MEMBER', status: 'ACTIVE', warningCount: 0 };

describe('CircleModerationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Circle CRUD ----

  describe('editCircle', () => {
    it('should update circle info when user is OWNER', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circle.update as jest.Mock).mockResolvedValue({
        ...mockCircle,
        description: 'new desc',
      });

      const result = await CircleModerationService.editCircle('circle-1', 'owner-1', {
        description: 'new desc',
      });

      expect(result.description).toBe('new desc');
      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'circle-1' },
        data: { description: 'new desc' },
      });
    });

    it('should check name uniqueness when name is being changed', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValueOnce(mockCircle);
      // Name uniqueness check returns an existing different circle
      (prisma.circle.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'other-circle',
        name: '新名字',
      });

      await expect(
        CircleModerationService.editCircle('circle-1', 'owner-1', { name: '新名字' }),
      ).rejects.toThrow('圈子名称已存在');
    });

    it('should throw error if user is not the OWNER', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);

      await expect(
        CircleModerationService.editCircle('circle-1', 'other-user', { description: 'x' }),
      ).rejects.toThrow('只有圈主才能编辑圈子信息');
    });

    it('should throw error if circle does not exist', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        CircleModerationService.editCircle('nonexistent', 'owner-1', { description: 'x' }),
      ).rejects.toThrow('圈子不存在');
    });
  });

  describe('deleteCircle', () => {
    it('should delete circle when user is OWNER', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circle.delete as jest.Mock).mockResolvedValue({});

      await CircleModerationService.deleteCircle('circle-1', 'owner-1');

      expect(prisma.circle.delete).toHaveBeenCalledWith({ where: { id: 'circle-1' } });
    });

    it('should throw error if user is not the OWNER', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);

      await expect(
        CircleModerationService.deleteCircle('circle-1', 'other-user'),
      ).rejects.toThrow('只有圈主才能解散圈子');
    });
  });

  describe('setVisibility', () => {
    it('should set visibility when user is OWNER', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circle.update as jest.Mock).mockResolvedValue({
        ...mockCircle,
        visibility: 'PRIVATE',
      });

      const result = await CircleModerationService.setVisibility(
        'circle-1',
        'owner-1',
        'PRIVATE',
      );

      expect(result.visibility).toBe('PRIVATE');
      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'circle-1' },
        data: { visibility: 'PRIVATE' },
      });
    });

    it('should throw error if user is not the OWNER', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);

      await expect(
        CircleModerationService.setVisibility('circle-1', 'other-user', 'PRIVATE'),
      ).rejects.toThrow('只有圈主才能修改圈子可见性');
    });
  });

  // ---- Join Requests ----

  describe('submitJoinRequest', () => {
    it('should submit a join request for RESTRICTED circle', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue({
        ...mockCircle,
        visibility: 'RESTRICTED',
      });
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleJoinRequest.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.circleJoinRequest.create as jest.Mock).mockResolvedValue({
        id: 'req-1',
        circleId: 'circle-1',
        userId: 'user-1',
        message: '请让我加入',
        status: 'PENDING',
        createdAt: new Date('2026-06-01'),
        reviewedAt: null,
        reviewedBy: null,
      });

      const result = await CircleModerationService.submitJoinRequest(
        'circle-1',
        'user-1',
        '请让我加入',
      );

      expect(result.status).toBe('PENDING');
      expect(prisma.circleJoinRequest.create).toHaveBeenCalled();
    });

    it('should reject join request for PUBLIC circle (use joinCircle instead)', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle); // PUBLIC

      await expect(
        CircleModerationService.submitJoinRequest('circle-1', 'user-1', ''),
      ).rejects.toThrow('公开圈子无需申请');
    });

    it('should reject if user is already a member', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue({
        ...mockCircle,
        visibility: 'RESTRICTED',
      });
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockOwner);

      await expect(
        CircleModerationService.submitJoinRequest('circle-1', 'owner-1', ''),
      ).rejects.toThrow('您已经是该圈子成员');
    });

    it('should reject if a pending request already exists', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue({
        ...mockCircle,
        visibility: 'RESTRICTED',
      });
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleJoinRequest.findFirst as jest.Mock).mockResolvedValue({
        id: 'old-req',
        status: 'PENDING',
      });

      await expect(
        CircleModerationService.submitJoinRequest('circle-1', 'user-1', ''),
      ).rejects.toThrow('您已提交过申请');
    });
  });

  describe('approveJoinRequest', () => {
    it('should approve request and add user as MEMBER (moderator action)', async () => {
      // Mock moderator check
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      // Mock request lookup
      (prisma.circleJoinRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'req-1',
        circleId: 'circle-1',
        userId: 'new-user',
        status: 'PENDING',
      });
      // Mock existing membership check (none — new member)
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.circleMember.create as jest.Mock).mockResolvedValue({});
      (prisma.circle.update as jest.Mock).mockResolvedValue({});
      (prisma.circleJoinRequest.update as jest.Mock).mockResolvedValue({});

      await CircleModerationService.approveJoinRequest(
        'circle-1',
        'req-1',
        'mod-1',
      );

      expect(prisma.circleMember.create).toHaveBeenCalledWith({
        data: { circleId: 'circle-1', userId: 'new-user', role: 'MEMBER' },
      });
      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'circle-1' },
        data: { memberCount: { increment: 1 } },
      });
    });

    it('should throw error if requester is not a moderator', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockMember);

      await expect(
        CircleModerationService.approveJoinRequest('circle-1', 'req-1', 'mem-1'),
      ).rejects.toThrow('需要圈主或管理员权限');
    });

    it('should throw error if request is already processed', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockModerator);
      (prisma.circleJoinRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'req-1',
        circleId: 'circle-1',
        userId: 'new-user',
        status: 'APPROVED',
      });

      await expect(
        CircleModerationService.approveJoinRequest('circle-1', 'req-1', 'mod-1'),
      ).rejects.toThrow('该申请已处理');
    });
  });

  // ---- Member Management ----

  describe('banMember', () => {
    it('should ban a regular member (moderator action)', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockMember);
      (prisma.circleMember.update as jest.Mock).mockResolvedValue({});
      (prisma.circleBan.upsert as jest.Mock).mockResolvedValue({});

      await CircleModerationService.banMember('circle-1', 'mem-1', 'mod-1', {
        reason: '违反规则',
      });

      expect(prisma.circleMember.update).toHaveBeenCalledWith({
        where: { id: 'mem-1' },
        data: { status: 'BANNED', bannedUntil: null },
      });
    });

    it('should set bannedUntil when provided', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockMember);
      (prisma.circleMember.update as jest.Mock).mockResolvedValue({});
      (prisma.circleBan.upsert as jest.Mock).mockResolvedValue({});

      const futureDate = '2026-12-31T00:00:00.000Z';
      await CircleModerationService.banMember('circle-1', 'mem-1', 'mod-1', {
        reason: '违反规则',
        bannedUntil: futureDate,
      });

      const updateCall = (prisma.circleMember.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.bannedUntil).toEqual(new Date(futureDate));
    });

    it('should NOT ban the OWNER', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockOwner);

      await expect(
        CircleModerationService.banMember('circle-1', 'owner-1', 'mod-1', { reason: 'test' }),
      ).rejects.toThrow('不能禁言圈主');
    });

    it('should throw error if target is not a member', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        CircleModerationService.banMember('circle-1', 'nonexistent', 'mod-1', { reason: 'test' }),
      ).rejects.toThrow('该用户不是圈子成员');
    });
  });

  describe('warnMember', () => {
    it('should increment warning count for first warning', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockMember,
        warningCount: 0,
      });
      (prisma.userWarning.create as jest.Mock).mockResolvedValue({});
      (prisma.circleMember.update as jest.Mock).mockResolvedValue({});

      const result = await CircleModerationService.warnMember(
        'circle-1',
        'mem-1',
        'mod-1',
        '违规发言',
      );

      expect(result.warningCount).toBe(1);
      expect(result.autoBanned).toBe(false);
    });

    it('should auto-ban after 3 warnings', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce({
        ...mockMember,
        warningCount: 2,
      });
      (prisma.userWarning.create as jest.Mock).mockResolvedValue({});
      (prisma.circleMember.update as jest.Mock).mockResolvedValue({});
      (prisma.circleBan.upsert as jest.Mock).mockResolvedValue({});

      const result = await CircleModerationService.warnMember(
        'circle-1',
        'mem-1',
        'mod-1',
        '第三次违规',
      );

      expect(result.warningCount).toBe(3);
      expect(result.autoBanned).toBe(true);
      // Verify bannedUntil is set (~7 days in the future)
      const updateCall = (prisma.circleMember.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.status).toBe('BANNED');
      expect(updateCall.data.bannedUntil).toBeInstanceOf(Date);
    });
  });

  describe('promoteMember', () => {
    it('should promote a MEMBER to MODERATOR (OWNER only)', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockMember);
      (prisma.circleMember.update as jest.Mock).mockResolvedValue({});

      await CircleModerationService.promoteMember('circle-1', 'mem-1', 'owner-1');

      expect(prisma.circleMember.update).toHaveBeenCalledWith({
        where: { id: 'mem-1' },
        data: { role: 'MODERATOR' },
      });
    });

    it('should throw error if requester is not OWNER', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);

      await expect(
        CircleModerationService.promoteMember('circle-1', 'mem-1', 'mod-1'),
      ).rejects.toThrow('只有圈主才能提升管理员');
    });

    it('should throw error when promoting an existing moderator', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockModerator);

      await expect(
        CircleModerationService.promoteMember('circle-1', 'mod-1', 'owner-1'),
      ).rejects.toThrow('该用户已是管理员');
    });
  });

  // ---- Post Moderation ----

  describe('removePost', () => {
    it('should mark post as removed and record the removal', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'post-1',
        userId: 'mem-1',
        circleId: 'circle-1',
        title: '违规帖',
        isRemoved: false,
      });
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      (prisma.postRemoval.create as jest.Mock).mockResolvedValue({});

      await CircleModerationService.removePost(
        'circle-1',
        'post-1',
        'mod-1',
        '广告帖',
      );

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { isRemoved: true },
      });
      expect(prisma.postRemoval.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', circleId: 'circle-1', removedBy: 'mod-1', reason: '广告帖' },
      });
    });

    it('should throw error if post does not belong to circle', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'post-1',
        userId: 'mem-1',
        circleId: 'other-circle',
        isRemoved: false,
      });

      await expect(
        CircleModerationService.removePost('circle-1', 'post-1', 'mod-1', 'test'),
      ).rejects.toThrow('帖子不属于该圈子');
    });
  });

  describe('togglePinPost', () => {
    it('should pin an unpinned post', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'post-1',
        circleId: 'circle-1',
        isPinned: false,
      });
      (prisma.post.update as jest.Mock).mockResolvedValue({});

      const result = await CircleModerationService.togglePinPost(
        'circle-1',
        'post-1',
        'mod-1',
      );

      expect(result.isPinned).toBe(true);
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { isPinned: true },
      });
    });

    it('should unpin a pinned post', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValueOnce(mockModerator);
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        id: 'post-1',
        circleId: 'circle-1',
        isPinned: true,
      });
      (prisma.post.update as jest.Mock).mockResolvedValue({});

      const result = await CircleModerationService.togglePinPost(
        'circle-1',
        'post-1',
        'mod-1',
      );

      expect(result.isPinned).toBe(false);
    });
  });

  // ---- Queries ----

  describe('listCreatedCircles', () => {
    it('should list circles created by the user', async () => {
      (prisma.circle.findMany as jest.Mock).mockResolvedValue([mockCircle]);

      const result = await CircleModerationService.listCreatedCircles('owner-1');

      expect(result).toHaveLength(1);
      expect(prisma.circle.findMany).toHaveBeenCalledWith({
        where: { createdByUserId: 'owner-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ---- Helpers ----

  describe('assertModerator', () => {
    it('should pass for OWNER', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockOwner);
      await expect(
        CircleModerationService.assertModerator('circle-1', 'owner-1'),
      ).resolves.toBeUndefined();
    });

    it('should pass for MODERATOR', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockModerator);
      await expect(
        CircleModerationService.assertModerator('circle-1', 'mod-1'),
      ).resolves.toBeUndefined();
    });

    it('should throw for regular MEMBER', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(mockMember);
      await expect(
        CircleModerationService.assertModerator('circle-1', 'mem-1'),
      ).rejects.toThrow('需要圈主或管理员权限');
    });

    it('should throw for non-member', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        CircleModerationService.assertModerator('circle-1', 'non-member'),
      ).rejects.toThrow('您不是该圈子成员');
    });
  });
});
