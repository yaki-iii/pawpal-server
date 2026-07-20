import { MomentService } from '../src/services/momentService';
import { ProfileContentService } from '../src/services/profileContentService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    moment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    momentLike: {
      findUnique: jest.fn(),
    },
    momentBookmark: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    follow: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const now = new Date('2026-07-01T10:00:00Z');

const mockUser = {
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

const mockPet = {
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

const baseMoment = {
  id: 'moment-1',
  userId: 'user-1',
  petId: 'pet-1',
  content: '今天晒太阳了',
  images: ['/uploads/m1.jpg', '/uploads/m2.jpg'],
  videos: [],
  mood: 'happy',
  location: '阳台',
  visibility: 'PUBLIC',
  allowComments: true,
  isRemoved: false,
  likeCount: 3,
  commentCount: 1,
  shareCount: 0,
  createdAt: now,
  updatedAt: now,
};

describe('MomentDetail', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getMomentById', () => {
    it('should return moment detail with author, pet, and images', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue({
        ...baseMoment,
        user: mockUser,
        pet: mockPet,
      });
      (prisma.momentLike.findUnique as jest.Mock).mockResolvedValue(null);

      const moment = await MomentService.getMomentById('moment-1', 'user-2');

      expect(moment.id).toBe('moment-1');
      expect(moment.content).toBe('今天晒太阳了');
      expect(moment.images).toEqual(['/uploads/m1.jpg', '/uploads/m2.jpg']);
      expect(moment.author).toBeDefined();
      expect(moment.author?.nickname).toBe('北滘猫友');
      expect(moment.pet).toBeDefined();
      expect(moment.pet?.name).toBe('奶盖');
    });

    it('should throw error when moment does not exist', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        MomentService.getMomentById('nonexistent', 'user-1'),
      ).rejects.toThrow('碎片不存在');
    });

    it('should set isLiked=true when current user has liked the moment', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue({
        ...baseMoment,
        user: mockUser,
        pet: mockPet,
      });
      (prisma.momentLike.findUnique as jest.Mock).mockResolvedValue({
        id: 'ml-1',
        userId: 'user-2',
        momentId: 'moment-1',
      });

      const moment = await MomentService.getMomentById('moment-1', 'user-2');

      expect(moment.isLiked).toBe(true);
    });

    it('should set isLiked=false when current user has not liked', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue({
        ...baseMoment,
        user: mockUser,
        pet: mockPet,
      });
      (prisma.momentLike.findUnique as jest.Mock).mockResolvedValue(null);

      const moment = await MomentService.getMomentById('moment-1', 'user-2');

      expect(moment.isLiked).toBe(false);
    });

    it('should check isBookmarked for current user via momentBookmark (Phase B)', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue({
        ...baseMoment,
        user: mockUser,
        pet: mockPet,
      });
      (prisma.momentLike.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.momentBookmark.findUnique as jest.Mock).mockResolvedValue({
        id: 'mb-1',
        userId: 'user-2',
        momentId: 'moment-1',
      });

      const moment = await MomentService.getMomentById('moment-1', 'user-2');

      expect(moment.id).toBe('moment-1');
      expect(moment.isBookmarked).toBe(true);
      expect(prisma.momentBookmark.findUnique).toHaveBeenCalledWith({
        where: { userId_momentId: { userId: 'user-2', momentId: 'moment-1' } },
      });
    });

    it('should set isBookmarked=false when current user has not bookmarked', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue({
        ...baseMoment,
        user: mockUser,
        pet: mockPet,
      });
      (prisma.momentLike.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.momentBookmark.findUnique as jest.Mock).mockResolvedValue(null);

      const moment = await MomentService.getMomentById('moment-1', 'user-2');

      expect(moment.isBookmarked).toBe(false);
      expect(prisma.momentBookmark.findUnique).toHaveBeenCalledWith({
        where: { userId_momentId: { userId: 'user-2', momentId: 'moment-1' } },
      });
    });
  });

  describe('moment bookmark toggle', () => {
    it('should toggle moment bookmark and return { bookmarked: boolean }', async () => {
      (prisma.moment.findFirst as jest.Mock).mockResolvedValue({ id: 'moment-1' });
      (prisma.momentBookmark.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.momentBookmark.create as jest.Mock).mockResolvedValue({
        id: 'mb-1', userId: 'user-1', momentId: 'moment-1',
      });

      const result = await ProfileContentService.toggleMomentBookmark('user-1', 'moment-1');
      expect(result).toEqual({ bookmarked: true });
      expect(prisma.momentBookmark.findUnique).toHaveBeenCalledWith({
        where: { userId_momentId: { userId: 'user-1', momentId: 'moment-1' } },
      });
    });

    it('should reject bookmarking a non-existent moment', async () => {
      (prisma.moment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        ProfileContentService.toggleMomentBookmark('user-1', 'missing'),
      ).rejects.toThrow('日常不存在');
    });
  });
});
