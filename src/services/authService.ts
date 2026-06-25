import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { User, Prisma } from '@prisma/client';
import type { UserDTO } from '../types';

/**
 * AuthService — JWT token management and password hashing.
 */
export class AuthService {
  private static SALT_ROUNDS = 10;

  /**
   * Hash a plain-text password using bcrypt.
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AuthService.SALT_ROUNDS);
  }

  /**
   * Verify a password against a bcrypt hash.
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Sign a JWT token for a user.
   */
  static signToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  }

  /**
   * Register a new user.
   * @throws Error if email is already registered.
   */
  static async register(email: string, password: string, nickname: string): Promise<{ user: UserDTO; token: string }> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error('该邮箱已被注册');
    }

    const passwordHash = await AuthService.hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        nickname,
      },
    });

    const token = AuthService.signToken(user.id, user.email);
    logger.info(`User registered: ${email}`);

    return { user: AuthService.toDTO(user), token };
  }

  /**
   * Login with email and password.
   * @throws Error if credentials are invalid.
   */
  static async login(email: string, password: string): Promise<{ user: UserDTO; token: string }> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('邮箱或密码错误');
    }

    if (user.deletedAt) {
      throw new Error('该账号已被注销');
    }

    const valid = await AuthService.verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new Error('邮箱或密码错误');
    }

    const token = AuthService.signToken(user.id, user.email);
    logger.info(`User logged in: ${email}`);

    return { user: AuthService.toDTO(user), token };
  }

  /**
   * Get user by ID (for /auth/me endpoint).
   */
  static async getUserById(userId: string): Promise<UserDTO> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new Error('用户不存在');
    }
    return AuthService.toDTO(user);
  }

  /**
   * Convert a Prisma User to a UserDTO (excludes sensitive fields).
   */
  static toDTO(user: User): UserDTO {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio,
      city: user.city,
      membershipLevel: user.membershipLevel,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
