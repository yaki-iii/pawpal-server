import { FeedService } from '../src/services/feedService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    post: {
      findMany: jest.fn(),
    },
    follow: {
      findMany: jest.fn(),
    },
    like: {
      findMany: jest.fn(),
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

const createMockPost = (id: string, daysAgo: number, likeCount = 0, commentCount = 0) => ({
  id,
  userId: 'user-1',
  circleId: null,
  petId: null,
  title: `Post ${id}`,
  content: `Content for ${id}`,
  images: [],
  tags: [],
  likeCount,
  commentCount,
  createdAt: new Date(Date.now() - daysAgo * 86400000),
  updatedAt: new Date(),
  author: {
    id: 'user-1',
    email: 'a@b.com',
    passwordHash: 'hash',
    nickname: 'Author',
    avatar: '',
    bio: '',
    city: '',
    membershipLevel: 'FREE',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  pet: null,
  circle: null,
});

describe('FeedService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: no likes by any user
    (prisma.like.findMany as jest.Mock).mockResolvedValue([]);
  });

  describe('getFeed - LATEST', () => {
    it('should return posts sorted by createdAt desc', async () => {
      const posts = [
        createMockPost('p1', 0),
        createMockPost('p2', 1),
      ];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await FeedService.getFeed('LATEST', undefined, 10, 'user-1');

      expect(result.items).toHaveLength(2);
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 11, // limit + 1
        }),
      );
    });

    it('should return nextCursor when there are more items', async () => {
      // Return 11 items (limit=10, take=11)
      const posts = Array.from({ length: 11 }, (_, i) => createMockPost(`p${i}`, i));
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await FeedService.getFeed('LATEST', undefined, 10, 'user-1');

      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should return null nextCursor when no more items', async () => {
      const posts = [createMockPost('p1', 0)];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await FeedService.getFeed('LATEST', undefined, 10, 'user-1');

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('should apply cursor pagination filter', async () => {
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);

      await FeedService.getFeed('LATEST', '2026-06-01T00:00:00.000Z', 10, 'user-1');

      const where = (prisma.post.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.createdAt).toEqual({ lt: new Date('2026-06-01T00:00:00.000Z') });
    });
  });

  describe('getFeed - RECOMMEND', () => {
    it('should sort by likeCount, commentCount, then createdAt', async () => {
      const posts = [createMockPost('p1', 1, 100, 50), createMockPost('p2', 0, 10, 5)];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await FeedService.getFeed('RECOMMEND', undefined, 10, 'user-1');

      expect(result.items).toHaveLength(2);
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });
  });

  describe('getFeed - FOLLOWING', () => {
    it('should filter posts by followed users', async () => {
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([
        { followeeId: 'user-2' },
        { followeeId: 'user-3' },
      ]);
      const posts = [createMockPost('p1', 0)];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await FeedService.getFeed('FOLLOWING', undefined, 10, 'user-1');

      expect(result.items).toHaveLength(1);
      const where = (prisma.post.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.userId).toEqual({ in: ['user-2', 'user-3'] });
    });

    it('should return empty when user follows no one', async () => {
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);

      const result = await FeedService.getFeed('FOLLOWING', undefined, 10, 'user-1');

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
      // Should NOT query posts at all
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFeed - like status', () => {
    it('should add isLiked status when user is authenticated', async () => {
      const posts = [createMockPost('p1', 0)];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([{ postId: 'p1' }]);

      const result = await FeedService.getFeed('LATEST', undefined, 10, 'user-1');

      expect(result.items[0].isLiked).toBe(true);
    });

    it('should set isLiked=false when user has not liked', async () => {
      const posts = [createMockPost('p1', 0)];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([]);

      const result = await FeedService.getFeed('LATEST', undefined, 10, 'user-1');

      expect(result.items[0].isLiked).toBe(false);
    });
  });

  describe('getCircleFeed', () => {
    it('should return posts filtered by circleId', async () => {
      const posts = [createMockPost('p1', 0)];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await FeedService.getCircleFeed('circle-1', undefined, 10, 'user-1');

      expect(result.items).toHaveLength(1);
      const where = (prisma.post.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.circleId).toBe('circle-1');
    });

    it('should apply cursor pagination', async () => {
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);

      await FeedService.getCircleFeed('circle-1', '2026-06-01T00:00:00.000Z', 10);

      const where = (prisma.post.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.createdAt).toEqual({ lt: new Date('2026-06-01T00:00:00.000Z') });
    });
  });
});
