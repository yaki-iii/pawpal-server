import { DataPrivacyService } from '../src/services/dataPrivacyService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    pet: {
      findMany: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
    comment: {
      findMany: jest.fn(),
    },
    like: {
      findMany: jest.fn(),
    },
    aIAssistantSession: {
      findMany: jest.fn(),
    },
    notification: {
      findMany: jest.fn(),
    },
    follow: {
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

import { encryptField, decryptField } from '../src/utils/crypto';

describe('DataPrivacyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt a value using AES-256-GCM', () => {
      const plaintext = '13800138000';
      const encrypted = DataPrivacyService.encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:data
    });

    it('should decrypt an encrypted value back to original', () => {
      const plaintext = 'user@example.com';
      const encrypted = DataPrivacyService.encrypt(plaintext);
      const decrypted = DataPrivacyService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle round-trip for various data types', () => {
      const testCases = [
        'simple',
        '中文测试',
        'with-special-chars!@#$%^&*()',
        'a'.repeat(500),
      ];

      testCases.forEach((tc) => {
        const encrypted = DataPrivacyService.encrypt(tc);
        const decrypted = DataPrivacyService.decrypt(encrypted);
        expect(decrypted).toBe(tc);
      });
    });

    it('should return empty string when decrypting empty input', () => {
      expect(DataPrivacyService.decrypt('')).toBe('');
    });

    it('should return empty string when decryption fails (graceful degradation)', () => {
      // Pass invalid encrypted data
      const result = DataPrivacyService.decrypt('invalid:encrypted:data');
      expect(result).toBe('');
    });
  });

  describe('exportUserData', () => {
    const mockUser = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: '$2a$10$hash',
      nickname: '测试用户',
      avatar: '',
      bio: 'bio',
      city: '杭州',
      membershipLevel: 'FREE',
      deletedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    const mockPets = [
      {
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
        healthRecords: [
          {
            id: 'hr-1',
            petId: 'pet-1',
            type: 'VACCINE',
            date: new Date('2026-06-01'),
            itemName: '狂犬疫苗',
            notes: '',
            images: [],
            createdAt: new Date('2026-06-01'),
          },
        ],
        weightRecords: [
          {
            id: 'wr-1',
            petId: 'pet-1',
            weight: 12.5,
            date: new Date('2026-06-01'),
            createdAt: new Date('2026-06-01'),
          },
        ],
        reminders: [
          {
            id: 'r-1',
            petId: 'pet-1',
            type: 'VACCINE',
            nextDate: new Date('2027-06-01'),
            cycleDays: 365,
            status: 'PENDING',
            createdAt: new Date('2026-06-01'),
            updatedAt: new Date('2026-06-01'),
          },
        ],
      },
    ];

    const mockPosts = [
      {
        id: 'post-1',
        userId: 'user-1',
        circleId: null,
        petId: null,
        title: 'Test Post',
        content: 'Content',
        images: [],
        tags: [],
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date('2026-06-01'),
        updatedAt: new Date('2026-06-01'),
      },
    ];

    it('should export all user data as JSON-serializable object', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.pet.findMany as jest.Mock).mockResolvedValue(mockPets);
      (prisma.post.findMany as jest.Mock).mockResolvedValue(mockPosts);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);

      const data = await DataPrivacyService.exportUserData('user-1');

      expect(data.exportedAt).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.pets).toBeDefined();
      expect(data.posts).toBeDefined();
      expect(data.comments).toBeDefined();
      expect(data.likes).toBeDefined();
      expect(data.aiSessions).toBeDefined();
      expect(data.notifications).toBeDefined();
      expect(data.following).toBeDefined();
      expect(data.followers).toBeDefined();
    });

    it('should strip passwordHash and deletedAt from user data', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);

      const data = await DataPrivacyService.exportUserData('user-1');

      expect(data.user).not.toHaveProperty('passwordHash');
      expect(data.user).not.toHaveProperty('deletedAt');
    });

    it('should include pet health records, weight records, and reminders', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.pet.findMany as jest.Mock).mockResolvedValue(mockPets);
      (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);

      const data = await DataPrivacyService.exportUserData('user-1');

      const pets = data.pets as unknown[];
      expect(pets).toHaveLength(1);
      const pet = pets[0] as Record<string, unknown>;
      expect(pet.healthRecords).toHaveLength(1);
      expect(pet.weightRecords).toHaveLength(1);
      expect(pet.reminders).toHaveLength(1);
    });

    it('should convert all dates to ISO strings', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.pet.findMany as jest.Mock).mockResolvedValue(mockPets);
      (prisma.post.findMany as jest.Mock).mockResolvedValue(mockPosts);
      (prisma.comment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.like.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.follow.findMany as jest.Mock).mockResolvedValue([]);

      const data = await DataPrivacyService.exportUserData('user-1');

      // User dates
      const user = data.user as Record<string, unknown>;
      expect(typeof user.createdAt).toBe('string');

      // Pet dates
      const pets = data.pets as Record<string, unknown>[];
      expect(typeof pets[0].createdAt).toBe('string');
      expect(typeof pets[0].birthday).toBe('string');

      // Post dates
      const posts = data.posts as Record<string, unknown>[];
      expect(typeof posts[0].createdAt).toBe('string');
    });

    it('should throw error if user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(DataPrivacyService.exportUserData('nonexistent')).rejects.toThrow('用户不存在');
    });
  });

  describe('softDeleteAccount', () => {
    it('should set deletedAt timestamp on user', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await DataPrivacyService.softDeleteAccount('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should use current timestamp for deletedAt', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      const beforeTime = new Date();

      await DataPrivacyService.softDeleteAccount('user-1');

      const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
      const deletedAt = updateCall.data.deletedAt as Date;
      expect(deletedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000);
    });
  });

  describe('Encryption integration with crypto utils', () => {
    it('should be consistent with encryptField/decryptField', () => {
      const value = 'sensitive-data-12345';
      const encrypted = DataPrivacyService.encrypt(value);
      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe(value);
    });

    it('should produce different ciphertexts each time (random IV)', () => {
      const value = 'test-value';
      const enc1 = DataPrivacyService.encrypt(value);
      const enc2 = DataPrivacyService.encrypt(value);
      expect(enc1).not.toBe(enc2);
      expect(DataPrivacyService.decrypt(enc1)).toBe(value);
      expect(DataPrivacyService.decrypt(enc2)).toBe(value);
    });
  });
});
