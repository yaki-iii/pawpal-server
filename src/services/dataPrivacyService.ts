import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { encryptField, decryptField } from '../utils/crypto';

/**
 * DataPrivacyService — GDPR/个人信息保护法 compliance.
 * Provides: field encryption, user data export (JSON), soft delete + hard delete.
 */
export class DataPrivacyService {
  /**
   * Encrypt a sensitive field (e.g., phone number) before storing.
   */
  static encrypt(value: string): string {
    return encryptField(value);
  }

  /**
   * Decrypt a sensitive field after retrieval.
   */
  static decrypt(encrypted: string): string {
    try {
      return decryptField(encrypted);
    } catch {
      logger.warn('Failed to decrypt field, returning empty string');
      return '';
    }
  }

  /**
   * Export all user data as a JSON-serializable object.
   * Includes: profile, pets, health records, weight records, reminders,
   * posts, comments, likes, AI sessions, notifications, follows.
   */
  static async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const [user, pets, posts, comments, likes, aiSessions, notifications, followings, followers] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.pet.findMany({ where: { userId }, include: { healthRecords: true, weightRecords: true, reminders: true } }),
      prisma.post.findMany({ where: { userId } }),
      prisma.comment.findMany({ where: { userId } }),
      prisma.like.findMany({ where: { userId } }),
      prisma.aIAssistantSession.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
      prisma.follow.findMany({ where: { followerId: userId }, include: { followee: { select: { id: true, nickname: true, email: true } } } }),
      prisma.follow.findMany({ where: { followeeId: userId }, include: { follower: { select: { id: true, nickname: true, email: true } } } }),
    ]);

    if (!user) {
      throw new Error('用户不存在');
    }

    // Strip sensitive fields and convert dates to ISO strings
    const { passwordHash, deletedAt, ...userSafe } = user;
    userSafe.createdAt = user.createdAt.toISOString();
    userSafe.updatedAt = user.updatedAt.toISOString();

    return {
      exportedAt: new Date().toISOString(),
      user: userSafe,
      pets: pets.map((p) => ({
        ...p,
        birthday: p.birthday?.toISOString() || null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        healthRecords: p.healthRecords.map((r) => ({
          ...r,
          date: r.date.toISOString(),
          createdAt: r.createdAt.toISOString(),
        })),
        weightRecords: p.weightRecords.map((r) => ({
          ...r,
          date: r.date.toISOString(),
          createdAt: r.createdAt.toISOString(),
        })),
        reminders: p.reminders.map((r) => ({
          ...r,
          nextDate: r.nextDate.toISOString(),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      })),
      posts: posts.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      comments: comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
      likes: likes.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      aiSessions: aiSessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      notifications: notifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
      })),
      following: followings.map((f) => ({
        followedAt: f.createdAt.toISOString(),
        user: f.followee,
      })),
      followers: followers.map((f) => ({
        followedAt: f.createdAt.toISOString(),
        user: f.follower,
      })),
    };
  }

  /**
   * Soft-delete a user account.
   * Sets deletedAt timestamp. Account is inaccessible but data is retained for 30 days
   * before hard deletion by the cron scheduler.
   */
  static async softDeleteAccount(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    logger.info(`User account soft-deleted: ${userId}`);
  }
}
