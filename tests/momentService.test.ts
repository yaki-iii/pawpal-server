import { MomentService } from '../src/services/momentService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    pet: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    moment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    momentLike: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    follow: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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

const mockPet = {
  id: 'pet-1',
  userId: 'user-1',
  name: '煤球',
  species: 'DOG',
  breed: '柯基',
  gender: 'MALE',
  birthday: new Date('2023-06-15'),
  weight: 12.5,
  photo: '',
  neutered: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockUser = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'hash',
  nickname: '煤球麻麻',
  avatar: '',
  bio: '',
  city: '杭州',
  membershipLevel: 'FREE',
  deletedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockMoment = {
  id: 'moment-1',
  userId: 'user-1',
  petId: 'pet-1',
  content: '煤球今天又拆家了',
  images: ['/uploads/1.jpg'],
  mood: '无奈',
  location: '杭州',
  likeCount: 3,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
};

describe('MomentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMoment', () => {
    it('should create a moment for owned pet', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);
      (prisma.moment.create as jest.Mock).mockResolvedValue({
        ...mockMoment,
        user: mockUser,
        pet: mockPet,
      });

      const moment = await MomentService.createMoment('user-1', 'pet-1', {
        content: '煤球今天又拆家了',
        images: ['/uploads/1.jpg'],
        mood: '无奈',
        location: '杭州',
      });

      expect(moment.content).toBe('煤球今天又拆家了');
      expect(moment.mood).toBe('无奈');
      expect(prisma.moment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            petId: 'pet-1',
            content: '煤球今天又拆家了',
            mood: '无奈',
            location: '杭州',
            images: ['/uploads/1.jpg'],
          }),
          include: { user: true, pet: true },
        }),
      );
    });

    it('should throw error if pet does not exist', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        MomentService.createMoment('user-1', 'no-pet', { content: 'x' }),
      ).rejects.toThrow('宠物不存在');
    });

    it('should throw error if user does not own the pet', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue({
        ...mockPet,
        userId: 'other-user',
      });

      await expect(
        MomentService.createMoment('user-1', 'pet-1', { content: 'x' }),
      ).rejects.toThrow('无权为该宠物发布碎片');
    });

    it('should default images, mood, location when not provided', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);
      (prisma.moment.create as jest.Mock).mockResolvedValue({
        ...mockMoment,
        images: [],
        mood: '',
        location: '',
        user: mockUser,
        pet: mockPet,
      });

      await MomentService.createMoment('user-1', 'pet-1', { content: 'x' });

      const createData = (prisma.moment.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.images).toEqual([]);
      expect(createData.mood).toBe('');
      expect(createData.location).toBe('');
    });
  });

  describe('listByPet', () => {
    it('should list moments for a pet, newest first', async () => {
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([mockMoment]);

      const result = await MomentService.listByPet('pet-1', undefined, 10);

      expect(result.items).toHaveLength(1);
      expect(prisma.moment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { petId: 'pet-1' },
          orderBy: { createdAt: 'desc' },
          take: 11, // limit + 1
        }),
      );
    });

    it('should apply cursor pagination', async () => {
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([]);

      await MomentService.listByPet('pet-1', '2026-06-01T00:00:00.000Z', 10);

      const where = (prisma.moment.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.createdAt).toEqual({ lt: new Date('2026-06-01T00:00:00.000Z') });
    });

    it('should set nextCursor when there are more items', async () => {
      const moments = Array.from({ length: 11 }, (_, i) => ({
        ...mockMoment,
        id: `m-${i}`,
        createdAt: new Date(`2026-06-${String(i + 1).padStart(2, '0')}`),
      }));
      (prisma.moment.findMany as jest.Mock).mockResolvedValue(moments);

      const result = await MomentService.listByPet('pet-1', undefined, 10);

      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should return null nextCursor when no more items', async () => {
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([mockMoment]);

      const result = await MomentService.listByPet('pet-1', undefined, 10);

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('should add isLiked status when userId is provided', async () => {
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([mockMoment]);
      (prisma.momentLike.findMany as jest.Mock).mockResolvedValue([{ momentId: 'moment-1' }]);

      const result = await MomentService.listByPet('pet-1', undefined, 10, 'user-1');

      expect(result.items[0].isLiked).toBe(true);
    });
  });

  describe('getFeed', () => {
    it('should include moments from own pets + followed users pets', async () => {
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([
        { followeeId: 'user-2' },
      ]);
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([
        { id: 'pet-1' },
        { id: 'pet-2' },
      ]);
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([mockMoment]);
      (prisma.momentLike.findMany as jest.Mock).mockResolvedValue([]);

      const result = await MomentService.getFeed('user-1', undefined, 10);

      expect(result.items).toHaveLength(1);
      // Verify petIds filter was applied
      const where = (prisma.moment.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.petId).toEqual({ in: ['pet-1', 'pet-2'] });
    });

    it('should return empty when user has no pets and follows no one with pets', async () => {
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([]);

      const result = await MomentService.getFeed('user-1', undefined, 10);

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(prisma.moment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteMoment', () => {
    it('should delete moment when user is the author', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(mockMoment);
      (prisma.moment.delete as jest.Mock).mockResolvedValue({});

      await MomentService.deleteMoment('moment-1', 'user-1');

      expect(prisma.moment.delete).toHaveBeenCalledWith({ where: { id: 'moment-1' } });
    });

    it('should throw error if moment does not exist', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(MomentService.deleteMoment('nonexistent', 'user-1')).rejects.toThrow(
        '碎片不存在',
      );
    });

    it('should throw error if user is not the author', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(mockMoment);

      await expect(MomentService.deleteMoment('moment-1', 'other-user')).rejects.toThrow(
        '无权删除该碎片',
      );
    });
  });

  describe('toggleLike', () => {
    it('should like a moment (create like + increment count)', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(mockMoment);
      (prisma.momentLike.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.momentLike.create as jest.Mock).mockResolvedValue({});
      (prisma.moment.update as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await MomentService.toggleLike('moment-1', 'user-2');

      expect(result.liked).toBe(true);
      expect(prisma.momentLike.create).toHaveBeenCalledWith({
        data: { userId: 'user-2', momentId: 'moment-1' },
      });
      expect(prisma.moment.update).toHaveBeenCalledWith({
        where: { id: 'moment-1' },
        data: { likeCount: { increment: 1 } },
      });
    });

    it('should unlike a moment (delete like + decrement count)', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(mockMoment);
      (prisma.momentLike.findUnique as jest.Mock).mockResolvedValue({
        id: 'like-1',
        userId: 'user-1',
        momentId: 'moment-1',
      });
      (prisma.momentLike.delete as jest.Mock).mockResolvedValue({});
      (prisma.moment.update as jest.Mock).mockResolvedValue({});

      const result = await MomentService.toggleLike('moment-1', 'user-1');

      expect(result.liked).toBe(false);
      expect(prisma.momentLike.delete).toHaveBeenCalled();
      expect(prisma.moment.update).toHaveBeenCalledWith({
        where: { id: 'moment-1' },
        data: { likeCount: { decrement: 1 } },
      });
    });

    it('should throw error if moment does not exist', async () => {
      (prisma.moment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(MomentService.toggleLike('nonexistent', 'user-1')).rejects.toThrow(
        '碎片不存在',
      );
    });
  });

  describe('toDTO', () => {
    it('should convert to DTO with ISO date strings', () => {
      const dto = MomentService.toDTO(mockMoment);
      expect(dto.id).toBe('moment-1');
      expect(dto.content).toBe('煤球今天又拆家了');
      expect(dto.likeCount).toBe(3);
      expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });
});
