import { CommunityService } from '../src/services/communityService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    post: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    circle: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    circleMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    like: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    comment: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    follow: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    notification: {
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

const mockPost = {
  id: 'post-1',
  userId: 'user-1',
  circleId: null,
  petId: null,
  title: '柯基减肥记',
  content: '我家柯基成功减肥3公斤...',
  images: ['/uploads/img1.jpg'],
  tags: ['柯基', '减肥'],
  likeCount: 5,
  commentCount: 2,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
};

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
  lastActiveAt: new Date('2026-01-01'),
  memberCount: 100,
  postCount: 50,
  createdAt: new Date('2026-01-01'),
};

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
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('CommunityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Posts ----

  describe('publishPost', () => {
    it('should publish a new post', async () => {
      (prisma.post.create as jest.Mock).mockResolvedValue(mockPost);

      const post = await CommunityService.publishPost('user-1', {
        title: '柯基减肥记',
        content: '我家柯基成功减肥3公斤...',
        images: ['/uploads/img1.jpg'],
        tags: ['柯基', '减肥'],
      });

      expect(post.title).toBe('柯基减肥记');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            title: '柯基减肥记',
            content: '我家柯基成功减肥3公斤...',
            images: ['/uploads/img1.jpg'],
            tags: ['柯基', '减肥'],
          }),
          include: expect.objectContaining({
            author: true,
            pet: true,
            circle: true,
          }),
        }),
      );
    });

    it('should increment circle postCount when circleId is provided', async () => {
      (prisma.post.create as jest.Mock).mockResolvedValue({ ...mockPost, circleId: 'circle-1' });

      await CommunityService.publishPost('user-1', {
        title: '柯基减肥记',
        content: 'content',
        circleId: 'circle-1',
      });

      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'circle-1' },
        data: { postCount: { increment: 1 }, lastActiveAt: expect.any(Date) },
      });
    });

    it('should NOT increment circle postCount when no circleId', async () => {
      (prisma.post.create as jest.Mock).mockResolvedValue(mockPost);

      await CommunityService.publishPost('user-1', {
        title: '柯基减肥记',
        content: 'content',
      });

      expect(prisma.circle.update).not.toHaveBeenCalled();
    });

    it('should default images and tags to empty arrays', async () => {
      (prisma.post.create as jest.Mock).mockResolvedValue({
        ...mockPost,
        images: [],
        tags: [],
      });

      await CommunityService.publishPost('user-1', {
        title: 'test',
        content: 'content',
      });

      const createData = (prisma.post.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.images).toEqual([]);
      expect(createData.tags).toEqual([]);
    });

    it('should derive a display title when title is blank', async () => {
      (prisma.post.create as jest.Mock).mockResolvedValue({
        ...mockPost,
        title: '今天记录一下毛孩子',
        content: '今天记录一下毛孩子，状态不错。',
      });

      await CommunityService.publishPost('user-1', {
        title: '',
        content: '今天记录一下毛孩子，状态不错。',
      });

      const createData = (prisma.post.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.title).toBe('今天记录一下毛孩子');
    });
  });

  describe('getPostById', () => {
    it('should return post with author info', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        ...mockPost,
        author: mockUser,
        pet: null,
        circle: null,
        likes: false,
      });

      const post = await CommunityService.getPostById('post-1', 'user-1');

      expect(post.title).toBe('柯基减肥记');
      expect(post.author).toBeDefined();
      expect(post.author?.nickname).toBe('柯基麻麻');
    });

    it('should throw error if post does not exist', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(CommunityService.getPostById('nonexistent')).rejects.toThrow('动态不存在');
    });

    it('should set isLiked when user has liked the post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        ...mockPost,
        author: mockUser,
        pet: null,
        circle: null,
        likes: [{ id: 'like-1', userId: 'user-1', postId: 'post-1' }],
      });

      const post = await CommunityService.getPostById('post-1', 'user-1');
      expect(post.isLiked).toBe(true);
    });

    it('should set isLiked=false when user has not liked', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({
        ...mockPost,
        author: mockUser,
        pet: null,
        circle: null,
        likes: [],
      });

      const post = await CommunityService.getPostById('post-1', 'user-1');
      expect(post.isLiked).toBe(false);
    });
  });

  describe('deletePost', () => {
    it('should delete post when user is the author', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);
      (prisma.post.delete as jest.Mock).mockResolvedValue({});

      await CommunityService.deletePost('post-1', 'user-1');

      expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
    });

    it('should decrement circle postCount when post has circleId', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ ...mockPost, circleId: 'circle-1' });
      (prisma.post.delete as jest.Mock).mockResolvedValue({});

      await CommunityService.deletePost('post-1', 'user-1');

      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'circle-1' },
        data: { postCount: { decrement: 1 } },
      });
    });

    it('should throw error if post does not exist', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(CommunityService.deletePost('nonexistent', 'user-1')).rejects.toThrow('动态不存在');
    });

    it('should throw error if user is not the author', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);

      await expect(CommunityService.deletePost('post-1', 'other-user')).rejects.toThrow('无权删除该动态');
    });
  });

  describe('toggleLike', () => {
    it('should like a post (create like + increment count)', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);
      (prisma.like.findUnique as jest.Mock).mockResolvedValue(null); // Not liked yet
      (prisma.like.create as jest.Mock).mockResolvedValue({});
      (prisma.post.update as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await CommunityService.toggleLike('post-1', 'user-2');

      expect(result.liked).toBe(true);
      expect(prisma.like.create).toHaveBeenCalled();
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { likeCount: { increment: 1 } },
      });
    });

    it('should unlike a post (delete like + decrement count)', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);
      (prisma.like.findUnique as jest.Mock).mockResolvedValue({ id: 'like-1', userId: 'user-1', postId: 'post-1' });
      (prisma.like.delete as jest.Mock).mockResolvedValue({});
      (prisma.post.update as jest.Mock).mockResolvedValue({});

      const result = await CommunityService.toggleLike('post-1', 'user-1');

      expect(result.liked).toBe(false);
      expect(prisma.like.delete).toHaveBeenCalled();
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { likeCount: { decrement: 1 } },
      });
    });

    it('should throw error if post does not exist', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(CommunityService.toggleLike('nonexistent', 'user-1')).rejects.toThrow('动态不存在');
    });

    it('should NOT send notification when self-liking', async () => {
      const selfPost = { ...mockPost, userId: 'user-1' };
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(selfPost);
      (prisma.like.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.like.create as jest.Mock).mockResolvedValue({});
      (prisma.post.update as jest.Mock).mockResolvedValue({});

      await CommunityService.toggleLike('post-1', 'user-1');

      // NotificationService.create should not be called for self-like
      const { NotificationService } = require('../src/services/notificationService');
      expect(NotificationService.create).not.toHaveBeenCalled();
    });
  });

  describe('createComment', () => {
    it('should create a comment and increment commentCount', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);
      (prisma.comment.create as jest.Mock).mockResolvedValue({
        id: 'comment-1',
        postId: 'post-1',
        userId: 'user-2',
        parentId: null,
        content: '好厉害！',
        createdAt: new Date('2026-06-02'),
        author: mockUser,
      });
      (prisma.post.update as jest.Mock).mockResolvedValue({});

      const comment = await CommunityService.createComment('post-1', 'user-2', '好厉害！');

      expect(comment.content).toBe('好厉害！');
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { commentCount: { increment: 1 } },
      });
    });

    it('should support reply (with parentId)', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
        id: 'comment-1',
        postId: 'post-1',
        userId: 'user-2',
        parentId: null,
        content: '好厉害！',
      });
      (prisma.comment.create as jest.Mock).mockResolvedValue({
        id: 'comment-2',
        postId: 'post-1',
        userId: 'user-1',
        parentId: 'comment-1',
        content: '谢谢！',
        createdAt: new Date('2026-06-02'),
        author: mockUser,
      });
      (prisma.post.update as jest.Mock).mockResolvedValue({});

      const comment = await CommunityService.createComment('post-1', 'user-1', '谢谢！', 'comment-1');

      expect(comment.parentId).toBe('comment-1');
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentId: 'comment-1',
          content: '谢谢！',
        }),
        include: { author: true },
      });
    });

    it('should reject reply when parent comment does not exist', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(CommunityService.createComment('post-1', 'user-1', '谢谢！', 'missing-comment')).rejects.toThrow('父评论不存在');
      expect(prisma.comment.create).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('should reject reply when parent comment belongs to another post', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(mockPost);
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
        id: 'comment-1',
        postId: 'other-post',
        userId: 'user-2',
        parentId: null,
        content: '另一篇动态的评论',
      });

      await expect(CommunityService.createComment('post-1', 'user-1', '谢谢！', 'comment-1')).rejects.toThrow('父评论不存在');
      expect(prisma.comment.create).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('should throw error if post does not exist', async () => {
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(CommunityService.createComment('nonexistent', 'user-1', 'test')).rejects.toThrow('动态不存在');
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment that belongs to the post', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
        id: 'comment-1',
        postId: 'post-1',
        userId: 'user-1',
        parentId: null,
        content: '好厉害！',
      });
      (prisma.comment.delete as jest.Mock).mockResolvedValue({});
      (prisma.post.update as jest.Mock).mockResolvedValue({});

      await CommunityService.deleteComment('post-1', 'comment-1', 'user-1');

      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { commentCount: { decrement: 1 } },
      });
    });

    it('should reject deleting a comment from another post', async () => {
      (prisma.comment.findUnique as jest.Mock).mockResolvedValue({
        id: 'comment-1',
        postId: 'other-post',
        userId: 'user-1',
        parentId: null,
        content: '另一篇动态的评论',
      });

      await expect(CommunityService.deleteComment('post-1', 'comment-1', 'user-1')).rejects.toThrow('评论不存在');
      expect(prisma.comment.delete).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });
  });

  // ---- Circles ----

  describe('joinCircle', () => {
    it('should join a circle (create membership + increment memberCount)', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.circleMember.create as jest.Mock).mockResolvedValue({});
      (prisma.circle.update as jest.Mock).mockResolvedValue({});

      await CommunityService.joinCircle('circle-1', 'user-1');

      expect(prisma.circleMember.create).toHaveBeenCalledWith({ data: { circleId: 'circle-1', userId: 'user-1', role: 'MEMBER' } });
      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'circle-1' },
        data: { memberCount: { increment: 1 } },
      });
    });

    it('should be idempotent (no error if already joined)', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(mockCircle);
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue({ id: 'm-1' });

      await CommunityService.joinCircle('circle-1', 'user-1');

      // Should NOT create another membership or increment
      expect(prisma.circleMember.create).not.toHaveBeenCalled();
      expect(prisma.circle.update).not.toHaveBeenCalled();
    });

    it('should throw error if circle does not exist', async () => {
      (prisma.circle.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(CommunityService.joinCircle('nonexistent', 'user-1')).rejects.toThrow('圈子不存在');
    });
  });

  describe('leaveCircle', () => {
    it('should leave a circle (delete membership + decrement memberCount)', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue({ id: 'm-1' });
      (prisma.circleMember.delete as jest.Mock).mockResolvedValue({});
      (prisma.circle.update as jest.Mock).mockResolvedValue({});

      await CommunityService.leaveCircle('circle-1', 'user-1');

      expect(prisma.circleMember.delete).toHaveBeenCalled();
      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: 'circle-1' },
        data: { memberCount: { decrement: 1 } },
      });
    });

    it('should be idempotent (no error if not a member)', async () => {
      (prisma.circleMember.findUnique as jest.Mock).mockResolvedValue(null);

      await CommunityService.leaveCircle('circle-1', 'user-1');

      expect(prisma.circleMember.delete).not.toHaveBeenCalled();
      expect(prisma.circle.update).not.toHaveBeenCalled();
    });
  });

  // ---- Follows ----

  describe('toggleFollow', () => {
    it('should follow a user (create follow)', async () => {
      (prisma.follow.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.follow.create as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await CommunityService.toggleFollow('user-1', 'user-2');

      expect(result.following).toBe(true);
      expect(prisma.follow.create).toHaveBeenCalledWith({ data: { followerId: 'user-1', followeeId: 'user-2' } });
    });

    it('should unfollow a user (delete follow)', async () => {
      (prisma.follow.findUnique as jest.Mock).mockResolvedValue({ id: 'f-1' });
      (prisma.follow.delete as jest.Mock).mockResolvedValue({});

      const result = await CommunityService.toggleFollow('user-1', 'user-2');

      expect(result.following).toBe(false);
      expect(prisma.follow.delete).toHaveBeenCalled();
    });

    it('should throw error when trying to follow self', async () => {
      await expect(CommunityService.toggleFollow('user-1', 'user-1')).rejects.toThrow('不能关注自己');
    });
  });

  describe('getUserProfile', () => {
    it('should return profile with follower/following/post counts', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.follow.count as jest.Mock).mockResolvedValue(10);
      (prisma.post.count as jest.Mock).mockResolvedValue(5);

      const profile = await CommunityService.getUserProfile('user-1');

      expect(profile.followerCount).toBe(10);
      expect(profile.followingCount).toBe(10);
      expect(profile.postCount).toBe(5);
    });

    it('should throw error if user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(CommunityService.getUserProfile('nonexistent')).rejects.toThrow('用户不存在');
    });

    it('should throw error if user is soft-deleted', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, deletedAt: new Date() });

      await expect(CommunityService.getUserProfile('user-1')).rejects.toThrow('用户不存在');
    });
  });

  describe('getPostsByUser', () => {
    it('should return paginated posts by user', async () => {
      const posts = [mockPost, { ...mockPost, id: 'post-2', createdAt: new Date('2026-05-01') }];
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await CommunityService.getPostsByUser('user-1', undefined, 10);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('should return nextCursor when more items exist', async () => {
      // Return limit+1 items to signal "has more"
      const posts = Array.from({ length: 11 }, (_, i) => ({
        ...mockPost,
        id: `post-${i}`,
        createdAt: new Date(`2026-06-${String(i + 1).padStart(2, '0')}`),
      }));
      (prisma.post.findMany as jest.Mock).mockResolvedValue(posts);

      const result = await CommunityService.getPostsByUser('user-1', undefined, 10);

      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).not.toBeNull();
    });
  });

  // ---- DTO Converters ----

  describe('toPostDTO', () => {
    it('should convert to PostDTO', () => {
      const dto = CommunityService.toPostDTO(mockPost);
      expect(dto.id).toBe('post-1');
      expect(dto.title).toBe('柯基减肥记');
      expect(dto.likeCount).toBe(5);
      expect(dto.tags).toEqual(['柯基', '减肥']);
      expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  describe('toCircleDTO', () => {
    it('should convert to CircleDTO', () => {
      const dto = CommunityService.toCircleDTO(mockCircle);
      expect(dto.id).toBe('circle-1');
      expect(dto.name).toBe('柯基圈');
      expect(dto.memberCount).toBe(100);
      expect(dto.postCount).toBe(50);
    });
  });
});
