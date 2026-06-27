import { SearchService } from '../src/services/searchService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    post: { findMany: jest.fn() },
    circle: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    pet: { findMany: jest.fn() },
    moment: { findMany: jest.fn() },
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
  bio: '布偶新手',
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

describe('SearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchAll', () => {
    it('should return grouped global results for posts, circles, users, pets and moments', async () => {
      (prisma.post.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'post-1',
          userId: 'user-1',
          circleId: null,
          petId: 'pet-1',
          title: '布偶换粮记录',
          content: '软便后逐步换粮',
          images: [],
          tags: [],
          likeCount: 2,
          commentCount: 1,
          createdAt: now,
          updatedAt: now,
          author: user,
          pet,
          circle: null,
        },
      ]);
      (prisma.circle.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'circle-1',
          name: '布偶猫小组',
          type: 'BREED',
          species: 'CAT',
          coverImage: '',
          description: '布偶猫交流',
          ownerId: null,
          createdByUserId: null,
          isVerified: false,
          rules: '',
          visibility: 'PUBLIC',
          moderatorNote: '',
          lastActiveAt: now,
          memberCount: 10,
          postCount: 3,
          createdAt: now,
        },
      ]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([user]);
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([pet]);
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'moment-1',
          userId: 'user-1',
          petId: 'pet-1',
          content: '布偶今天精神很好',
          images: [],
          mood: 'happy',
          location: '佛山',
          likeCount: 0,
          createdAt: now,
          updatedAt: now,
          user,
          pet,
        },
      ]);

      const result = await SearchService.searchAll('布偶', 5, 'user-1');

      expect(result.posts).toHaveLength(1);
      expect(result.circles).toHaveLength(1);
      expect(result.users).toHaveLength(1);
      expect(result.pets).toHaveLength(1);
      expect(result.moments).toHaveLength(1);
      expect(result.posts[0].title).toBe('布偶换粮记录');
      expect(result.circles[0].name).toBe('布偶猫小组');
      expect(result.users[0].nickname).toBe('北滘猫友');
      expect(result.pets[0].name).toBe('奶盖');
      expect(result.moments[0].content).toBe('布偶今天精神很好');
      expect(prisma.pet.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }));
    });
  });
});
