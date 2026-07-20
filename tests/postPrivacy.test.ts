import { CommunityService } from '../src/services/communityService';
import { ProfileContentService } from '../src/services/profileContentService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    post: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    postBookmark: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    comment: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    circle: { update: jest.fn() },
    user: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
  },
}));

jest.mock('../src/config', () => ({
  config: { encryption: { key: 'test-encryption-key-32bytes-ok!!!' } },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../src/services/notificationService', () => ({
  NotificationService: { create: jest.fn().mockResolvedValue({}) },
}));

const now = new Date('2026-07-01T10:00:00Z');

const mockUser = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'hash',
  nickname: '柯基麻麻',
  avatar: '',
  bio: '',
  city: '杭州',
  membershipLevel: 'FREE',
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};

const basePost = {
  id: 'post-1',
  userId: 'user-1',
  circleId: null,
  petId: null,
  title: '柯基减肥记',
  content: '我家柯基成功减肥3公斤...',
  images: ['/uploads/img1.jpg'],
  tags: ['柯基'],
  likeCount: 0,
  commentCount: 0,
  visibility: 'PUBLIC',
  allowComments: true,
  isPinned: false,
  isRemoved: false,
  createdAt: now,
  updatedAt: now,
};

describe('PostPrivacy', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('publishPost default privacy', () => {
    it('should return DTO with visibility=PUBLIC and allowComments=true by default', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        ...basePost,
        author: mockUser,
        pet: null,
        circle: null,
        likes: [],
      });
      (prisma.postBookmark.findUnique as jest.Mock).mockResolvedValue(null);

      const post = await CommunityService.getPostById('post-1', 'user-1');
      expect(post.visibility).toBe('PUBLIC');
      expect(post.allowComments).toBe(true);
    });
  });

  describe('publishPost with explicit privacy (Phase B)', () => {
    it('should save visibility=FOLLOWERS and allowComments=false when explicitly passed', async () => {
      (prisma.post.create as jest.Mock).mockResolvedValue({
        ...basePost,
        visibility: 'FOLLOWERS',
        allowComments: false,
        author: mockUser,
        pet: null,
        circle: null,
      });

      // Phase B: publishPost will accept visibility/allowComments
      await CommunityService.publishPost('user-1', {
        title: '柯基减肥记',
        content: '我家柯基成功减肥3公斤...',
        visibility: 'FOLLOWERS',
        allowComments: false,
      } as any);

      const createCall = (prisma.post.create as jest.Mock).mock.calls[0][0];
      // Phase B expectation: the service passes these through to Prisma
      expect(createCall.data.visibility).toBe('FOLLOWERS');
      expect(createCall.data.allowComments).toBe(false);
    });
  });

  describe('getPostById DTO fields', () => {
    it('should return visibility and allowComments in the post DTO', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        ...basePost,
        author: mockUser,
        pet: null,
        circle: null,
        likes: [],
      });
      (prisma.postBookmark.findUnique as jest.Mock).mockResolvedValue(null);

      const post = await CommunityService.getPostById('post-1', 'user-1');
      expect(post.visibility).toBe('PUBLIC');
      expect(post.allowComments).toBe(true);
    });

    it('should include isBookmarked field in post detail (Phase B)', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        ...basePost,
        author: mockUser,
        pet: null,
        circle: null,
        likes: [],
        bookmarks: [],
      });
      (prisma.postBookmark.findUnique as jest.Mock).mockResolvedValue(null);

      const post = await CommunityService.getPostById('post-1', 'user-1');
      // Phase B: DTO should include isBookmarked
      expect(post).toHaveProperty('isBookmarked');
    });
  });

  describe('post bookmark toggle response', () => {
    it('should return { bookmarked: true } when creating a bookmark', async () => {
      (prisma.post.findFirst as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.postBookmark.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.postBookmark.create as jest.Mock).mockResolvedValue({
        id: 'bm-1',
        userId: 'user-1',
        postId: 'post-1',
      });

      const result = await ProfileContentService.togglePostBookmark('user-1', 'post-1');
      expect(result).toEqual({ bookmarked: true });
    });

    it('should return { bookmarked: false } when removing a bookmark', async () => {
      (prisma.post.findFirst as jest.Mock).mockResolvedValue({ id: 'post-1' });
      (prisma.postBookmark.findUnique as jest.Mock).mockResolvedValue({
        id: 'bm-1',
        userId: 'user-1',
        postId: 'post-1',
      });
      (prisma.postBookmark.delete as jest.Mock).mockResolvedValue({ id: 'bm-1' });

      const result = await ProfileContentService.togglePostBookmark('user-1', 'post-1');
      expect(result).toEqual({ bookmarked: false });
    });
  });

  describe('updatePostPrivacy', () => {
    it('should return updated visibility and allowComments after privacy update', async () => {
      const postWithAuthor = { ...basePost, author: mockUser, pet: null, circle: null };
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(postWithAuthor);
      (prisma.post.update as jest.Mock).mockResolvedValue({
        ...basePost,
        visibility: 'FOLLOWERS',
        allowComments: false,
        author: mockUser,
        pet: null,
        circle: null,
      });

      const result = await CommunityService.updatePostPrivacy(
        'post-1', 'user-1', 'FOLLOWERS', false,
      );

      expect(result.visibility).toBe('FOLLOWERS');
      expect(result.allowComments).toBe(false);
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { visibility: 'FOLLOWERS', allowComments: false },
        include: { author: true, pet: true, circle: true },
      });
    });
  });

  describe('createComment when allowComments=false', () => {
    it('should reject comment creation when post has allowComments=false', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        ...basePost,
        allowComments: false,
      });

      await expect(
        CommunityService.createComment('post-1', 'user-2', '好棒！'),
      ).rejects.toThrow('作者已关闭评论');

      expect(prisma.comment.create).not.toHaveBeenCalled();
    });
  });
});
