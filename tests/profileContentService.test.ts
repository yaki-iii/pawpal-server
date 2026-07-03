import { ProfileContentService } from '../src/services/profileContentService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    moment: { findMany: jest.fn() },
    momentLike: { findMany: jest.fn() },
    like: { findMany: jest.fn() },
    follow: { findMany: jest.fn() },
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

const now = new Date('2026-06-27T10:00:00Z');

const user = {
  id: 'user-1',
  email: 'owner@example.com',
  nickname: '北滘猫友',
  avatar: '',
  bio: '',
  city: '佛山',
  membershipLevel: 'FREE',
  createdAt: now,
  updatedAt: now,
};

const pet = {
  id: 'pet-1',
  userId: 'user-1',
  name: '奶盖',
  species: 'CAT',
  breed: '布偶',
  gender: 'FEMALE',
  birthday: null,
  weight: 4.2,
  photo: '',
  neutered: true,
  createdAt: now,
  updatedAt: now,
};

describe('ProfileContentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list user moments newest first', async () => {
    (prisma.moment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'moment-1',
        userId: 'user-1',
        petId: 'pet-1',
        content: '今天晒太阳',
        images: [],
        videos: [],
        mood: 'happy',
        location: '',
        visibility: 'PUBLIC',
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        createdAt: now,
        updatedAt: now,
        user,
        pet,
      },
    ]);

    const result = await ProfileContentService.listUserMoments('user-1', 10);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('今天晒太阳');
    expect(prisma.moment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('should list posts liked by the user as favorites MVP', async () => {
    (prisma.like.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'like-1',
        userId: 'user-1',
        postId: 'post-1',
        createdAt: now,
        post: {
          id: 'post-1',
          userId: 'user-2',
          circleId: null,
          petId: 'pet-1',
          title: '布偶护理',
          content: '梳毛记录',
          images: [],
          tags: [],
          likeCount: 1,
          commentCount: 0,
          createdAt: now,
          updatedAt: now,
          author: user,
          pet,
          circle: null,
        },
      },
    ]);

    const result = await ProfileContentService.listLikedPosts('user-1', 10);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('布偶护理');
    expect(result[0].isLiked).toBe(true);
    expect(prisma.like.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('should aggregate favorite posts and moments with type filters', async () => {
    (prisma.like.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'like-1',
        userId: 'user-1',
        postId: 'post-1',
        createdAt: new Date('2026-06-28T10:00:00Z'),
        post: {
          id: 'post-1',
          userId: 'user-2',
          circleId: null,
          petId: 'pet-1',
          title: '布偶护理',
          content: '梳毛记录',
          images: [],
          tags: [],
          likeCount: 1,
          commentCount: 0,
          createdAt: now,
          updatedAt: now,
          author: user,
          pet,
          circle: null,
        },
      },
    ]);
    (prisma.momentLike.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'moment-like-1',
        userId: 'user-1',
        momentId: 'moment-1',
        createdAt: new Date('2026-06-29T10:00:00Z'),
        moment: {
          id: 'moment-1',
          userId: 'user-2',
          petId: 'pet-1',
          content: '今天晒太阳',
          images: [],
          videos: [],
          mood: 'happy',
          location: '',
          visibility: 'PUBLIC',
          likeCount: 1,
          commentCount: 0,
          shareCount: 0,
          createdAt: now,
          updatedAt: now,
          user,
          pet,
        },
      },
    ]);

    const all = await ProfileContentService.listFavorites('user-1', 'all', 20);
    const moments = await ProfileContentService.listFavorites('user-1', 'moment', 20);
    const knowledge = await ProfileContentService.listFavorites('user-1', 'knowledge', 20);

    expect(all.items.map((item) => item.type)).toEqual(['moment', 'post']);
    expect(all.counts).toEqual({ all: 2, post: 1, moment: 1, knowledge: 0, vet: 0 });
    expect(moments.items).toEqual([
      expect.objectContaining({ id: 'moment-1', type: 'moment' }),
    ]);
    expect(knowledge.items).toEqual([]);
  });
});
