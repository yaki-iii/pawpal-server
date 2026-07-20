import { CommunityService } from '../src/services/communityService';
import { ProfileContentService } from '../src/services/profileContentService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    circle: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    circleBookmark: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    circleMember: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    postBookmark: { findMany: jest.fn() },
    momentBookmark: { findMany: jest.fn() },
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const now = new Date('2026-07-01T10:00:00Z');

const mockCircle = {
  id: 'circle-1',
  name: '柯基圈',
  type: 'BREED',
  species: 'DOG',
  coverImage: '/uploads/circle1.jpg',
  description: '柯基爱好者圈',
  ownerId: null,
  createdByUserId: null,
  isVerified: false,
  rules: '',
  visibility: 'PUBLIC',
  moderatorNote: '',
  isRecommended: false,
  operationNote: '',
  isRemoved: false,
  lastActiveAt: now,
  memberCount: 100,
  postCount: 50,
  createdAt: now,
  updatedAt: now,
};

describe('CircleBookmark', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('toggleCircleBookmark', () => {
    it('should create a circle bookmark on first toggle', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleBookmark.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleBookmark.create as jest.Mock).mockResolvedValue({
        id: 'cb-1', userId: 'user-1', circleId: 'circle-1',
      });

      const result = await CommunityService.toggleCircleBookmark('user-1', 'circle-1');

      expect(result).toEqual({ bookmarked: true });
      expect(prisma.circleBookmark.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', circleId: 'circle-1' },
      });
    });

    it('should remove a circle bookmark on second toggle', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleBookmark.findUnique as jest.Mock).mockResolvedValue({
        id: 'cb-1', userId: 'user-1', circleId: 'circle-1',
      });
      (prisma.circleBookmark.delete as jest.Mock).mockResolvedValue({ id: 'cb-1' });

      const result = await CommunityService.toggleCircleBookmark('user-1', 'circle-1');

      expect(result).toEqual({ bookmarked: false });
      expect(prisma.circleBookmark.delete).toHaveBeenCalledWith({ where: { id: 'cb-1' } });
    });

    it('should be idempotent across multiple toggles', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      // First call: not bookmarked
      (prisma.circleBookmark.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.circleBookmark.create as jest.Mock).mockResolvedValue({ id: 'cb-1' });
      // Second call: bookmarked
      (prisma.circleBookmark.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'cb-1' });
      (prisma.circleBookmark.delete as jest.Mock).mockResolvedValue({ id: 'cb-1' });

      const r1 = await CommunityService.toggleCircleBookmark('user-1', 'circle-1');
      const r2 = await CommunityService.toggleCircleBookmark('user-1', 'circle-1');

      expect(r1.bookmarked).toBe(true);
      expect(r2.bookmarked).toBe(false);
    });

    it('should throw error if circle does not exist', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        CommunityService.toggleCircleBookmark('user-1', 'nonexistent'),
      ).rejects.toThrow('圈子不存在');
    });
  });

  describe('favorites aggregation with circle type', () => {
    it('should include circle type in favorites payload', async () => {
      (prisma.postBookmark.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.momentBookmark.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.circleBookmark.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'cb-1',
          userId: 'user-1',
          circleId: 'circle-1',
          createdAt: now,
          circle: mockCircle,
        },
      ]);

      const result = await ProfileContentService.listFavorites('user-1', 'all', 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('circle');
      expect(result.items[0].title).toBe('柯基圈');
    });

    it('should correctly count circles in counts.circle', async () => {
      (prisma.postBookmark.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.momentBookmark.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.circleBookmark.findMany as jest.Mock).mockResolvedValue([
        { id: 'cb-1', userId: 'user-1', circleId: 'circle-1', createdAt: now, circle: mockCircle },
        { id: 'cb-2', userId: 'user-1', circleId: 'circle-2', createdAt: now, circle: { ...mockCircle, id: 'circle-2', name: '金毛圈' } },
      ]);

      const result = await ProfileContentService.listFavorites('user-1', 'all', 20);

      expect(result.counts.circle).toBe(2);
      expect(result.counts.all).toBe(2);
    });
  });

  describe('circle list and detail with isBookmarked', () => {
    it('should return isBookmarked in circle list for current user', async () => {
      (prisma.circle.findMany as jest.Mock).mockResolvedValue([mockCircle]);
      (prisma.circleMember.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.circleBookmark.findMany as jest.Mock).mockResolvedValue([
        { userId: 'user-1', circleId: 'circle-1' },
      ]);

      const circles = await CommunityService.listCircles({}, 'user-1');

      expect(circles).toHaveLength(1);
      expect(circles[0].id).toBe('circle-1');
      expect(circles[0].isBookmarked).toBe(true);
    });

    it('should return isBookmarked=false when user has no bookmark', async () => {
      (prisma.circle.findMany as jest.Mock).mockResolvedValue([mockCircle]);
      (prisma.circleMember.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.circleBookmark.findMany as jest.Mock).mockResolvedValue([]);

      const circles = await CommunityService.listCircles({}, 'user-1');

      expect(circles[0].isBookmarked).toBe(false);
    });

    it('should return isBookmarked=true in circle detail when bookmarked', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleBookmark.findUnique as jest.Mock).mockResolvedValue({ id: 'cb-1' });

      const circle = await CommunityService.getCircleById('circle-1', 'user-1');

      expect(circle.id).toBe('circle-1');
      expect(circle.isJoined).toBe(false);
      expect(circle.isBookmarked).toBe(true);
    });

    it('should return isBookmarked=false in circle detail when not bookmarked', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleBookmark.findUnique as jest.Mock).mockResolvedValue(null);

      const circle = await CommunityService.getCircleById('circle-1', 'user-1');

      expect(circle.isBookmarked).toBe(false);
    });
  });

  describe('join and bookmark independence', () => {
    it('joining a circle should not affect bookmark status', async () => {
      // Join a circle
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleMember.create as jest.Mock).mockResolvedValue({});
      (prisma.circle.update as jest.Mock).mockResolvedValue({});

      await CommunityService.joinCircle('circle-1', 'user-1');

      // Bookmark should not have been called during join
      expect(prisma.circleBookmark.create).not.toHaveBeenCalled();
      expect(prisma.circleBookmark.delete).not.toHaveBeenCalled();
    });

    it('bookmarking a circle should not affect join status', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleBookmark.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleBookmark.create as jest.Mock).mockResolvedValue({ id: 'cb-1' });

      await CommunityService.toggleCircleBookmark('user-1', 'circle-1');

      // Member create/delete should not have been called during bookmark
      expect(prisma.circleMember.create).not.toHaveBeenCalled();
      expect(prisma.circleMember.delete).not.toHaveBeenCalled();
    });
  });
});
