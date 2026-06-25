import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../src/config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret',
      expiresIn: '7d',
    },
    encryption: {
      key: 'test-encryption-key-32bytes-ok!!!',
    },
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

import { AuthService } from '../src/services/authService';
import { prisma } from '../src/config/database';

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password using bcrypt', async () => {
      const hash = await AuthService.hashPassword('mypassword123');
      expect(hash).not.toBe('mypassword123');
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should produce different hashes for same password (salt)', async () => {
      const hash1 = await AuthService.hashPassword('samepass');
      const hash2 = await AuthService.hashPassword('samepass');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const hash = await AuthService.hashPassword('correctpass');
      const isValid = await AuthService.verifyPassword('correctpass', hash);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const hash = await AuthService.hashPassword('correctpass');
      const isValid = await AuthService.verifyPassword('wrongpass', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('signToken', () => {
    it('should sign a JWT token with userId and email', () => {
      const token = AuthService.signToken('user-123', 'test@example.com');
      expect(token).toBeTruthy();

      const decoded = jwt.verify(token, 'test-jwt-secret') as jwt.JwtPayload;
      expect(decoded.userId).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should set expiration to 7d', () => {
      const token = AuthService.signToken('user-123', 'test@example.com');
      const decoded = jwt.verify(token, 'test-jwt-secret') as jwt.JwtPayload;
      expect(decoded.exp).toBeDefined();
      // 7d = 604800 seconds
      const expectedExp = decoded.iat! + 604800;
      expect(decoded.exp).toBe(expectedExp);
    });
  });

  describe('register', () => {
    const mockUser = {
      id: 'user-1',
      email: 'newuser@example.com',
      passwordHash: '$2a$10$hashedpassword',
      nickname: '新用户',
      avatar: '',
      bio: '',
      city: '',
      membershipLevel: 'FREE',
      deletedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    it('should register a new user successfully', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await AuthService.register('newuser@example.com', 'password123', '新用户');

      expect(result.user.email).toBe('newuser@example.com');
      expect(result.user.nickname).toBe('新用户');
      expect(result.user.id).toBe('user-1');
      expect(result.token).toBeTruthy();

      // Verify bcrypt hash was stored (not plaintext)
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'newuser@example.com',
          nickname: '新用户',
          passwordHash: expect.not.stringContaining('password123'),
        }),
      });
    });

    it('should throw error if email already registered', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        AuthService.register('newuser@example.com', 'password123', '新用户'),
      ).rejects.toThrow('该邮箱已被注册');
    });

    it('should not include passwordHash in the returned DTO', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await AuthService.register('test@example.com', 'pass', 'nick');

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('deletedAt');
    });
  });

  describe('login', () => {
    let mockUser: Record<string, unknown>;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash('correctpass', 10);
      mockUser = {
        id: 'user-1',
        email: 'user@example.com',
        passwordHash,
        nickname: '测试用户',
        avatar: '',
        bio: '',
        city: '',
        membershipLevel: 'FREE',
        deletedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
    });

    it('should login with correct credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await AuthService.login('user@example.com', 'correctpass');

      expect(result.user.email).toBe('user@example.com');
      expect(result.token).toBeTruthy();
    });

    it('should throw error for non-existent email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        AuthService.login('nonexistent@example.com', 'pass'),
      ).rejects.toThrow('邮箱或密码错误');
    });

    it('should throw error for wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        AuthService.login('user@example.com', 'wrongpass'),
      ).rejects.toThrow('邮箱或密码错误');
    });

    it('should throw error if account is soft-deleted', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date('2026-06-01') };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(deletedUser);

      await expect(
        AuthService.login('user@example.com', 'correctpass'),
      ).rejects.toThrow('该账号已被注销');
    });
  });

  describe('getUserById', () => {
    const mockUser = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'hash',
      nickname: '用户',
      avatar: '',
      bio: '',
      city: '',
      membershipLevel: 'FREE',
      deletedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    it('should return user DTO for valid ID', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const user = await AuthService.getUserById('user-1');
      expect(user.id).toBe('user-1');
      expect(user.email).toBe('user@example.com');
    });

    it('should throw error for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(AuthService.getUserById('nonexistent')).rejects.toThrow('用户不存在');
    });

    it('should throw error for soft-deleted user', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(deletedUser);

      await expect(AuthService.getUserById('user-1')).rejects.toThrow('用户不存在');
    });
  });

  describe('toDTO', () => {
    it('should convert a Prisma User to UserDTO, excluding sensitive fields', () => {
      const user = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'secret-hash',
        nickname: 'nick',
        avatar: 'avatar.png',
        bio: 'bio',
        city: '北京',
        membershipLevel: 'FREE' as const,
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      const dto = AuthService.toDTO(user);

      expect(dto.id).toBe('u1');
      expect(dto.email).toBe('a@b.com');
      expect(dto.nickname).toBe('nick');
      expect(dto.membershipLevel).toBe('FREE');
      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-01-02T00:00:00.000Z');
      // Sensitive fields should NOT be in DTO
      expect(dto).not.toHaveProperty('passwordHash');
      expect(dto).not.toHaveProperty('deletedAt');
    });
  });
});
