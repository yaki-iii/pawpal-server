import type { Request, Response } from 'express';
import { CommunityService } from '../services/communityService';
import { NotificationService } from '../services/notificationService';
import { DataPrivacyService } from '../services/dataPrivacyService';
import { prisma } from '../config/database';
import { sendSuccess, sendError } from '../middleware/error';
import { logger } from '../utils/logger';

/**
 * UserController — handles user profile, follow, notifications, data privacy.
 */
export class UserController {
  /**
   * GET /users/:userId — get user profile
   */
  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const profile = await CommunityService.getUserProfile(req.params.userId, req.userId);
      sendSuccess(res, profile);
    } catch (error) {
      sendError(res, 404, (error as Error).message, undefined, 404);
    }
  }

  /**
   * PUT /users — update current user's profile
   */
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { nickname, avatar, bio, city } = req.body;
      const updateData: Record<string, unknown> = {};
      if (nickname !== undefined) updateData.nickname = nickname;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (bio !== undefined) updateData.bio = bio;
      if (city !== undefined) updateData.city = city;

      const user = await prisma.user.update({
        where: { id: req.userId },
        data: updateData,
      });

      // Return DTO (without password hash)
      const { passwordHash, deletedAt, ...userSafe } = user;
      sendSuccess(res, {
        ...userSafe,
        createdAt: userSafe.createdAt.toISOString(),
        updatedAt: userSafe.updatedAt.toISOString(),
      }, '更新成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '更新失败');
    }
  }

  /**
   * GET /users/:userId/posts — get posts by user
   */
  static async getUserPosts(req: Request, res: Response): Promise<void> {
    try {
      const { cursor, limit = '10' } = req.query;
      const result = await CommunityService.getPostsByUser(
        req.params.userId,
        cursor as string | undefined,
        parseInt(limit as string, 10),
      );
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * POST /users/:userId/follow — toggle follow
   */
  static async toggleFollow(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const result = await CommunityService.toggleFollow(req.userId, req.params.userId);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '操作失败');
    }
  }

  /**
   * GET /users/:userId/followers — list followers
   */
  static async listFollowers(req: Request, res: Response): Promise<void> {
    try {
      const followers = await prisma.follow.findMany({
        where: { followeeId: req.params.userId },
        include: {
          follower: { select: { id: true, nickname: true, avatar: true, bio: true, city: true } },
        },
      });
      sendSuccess(res, followers.map((f) => ({
        ...f.follower,
        followedAt: f.createdAt.toISOString(),
      })));
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /users/:userId/following — list following
   */
  static async listFollowing(req: Request, res: Response): Promise<void> {
    try {
      const following = await prisma.follow.findMany({
        where: { followerId: req.params.userId },
        include: {
          followee: { select: { id: true, nickname: true, avatar: true, bio: true, city: true } },
        },
      });
      sendSuccess(res, following.map((f) => ({
        ...f.followee,
        followedAt: f.createdAt.toISOString(),
      })));
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  // ---- Notifications ----

  /**
   * GET /users/notifications
   */
  static async listNotifications(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const notifications = await NotificationService.listByUser(req.userId);
      sendSuccess(res, notifications);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * PATCH /users/notifications/:id/read
   */
  static async markNotificationRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await NotificationService.markAsRead(req.params.id, req.userId);
      sendSuccess(res, null, '已标记为已读');
    } catch (error) {
      sendError(res, 400, (error as Error).message);
    }
  }

  /**
   * PATCH /users/notifications/read-all
   */
  static async markAllNotificationsRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await NotificationService.markAllAsRead(req.userId);
      sendSuccess(res, null, '全部已读');
    } catch (error) {
      sendError(res, 400, (error as Error).message);
    }
  }

  // ---- Data Privacy ----

  /**
   * GET /users/export — export user data as JSON
   */
  static async exportData(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const data = await DataPrivacyService.exportUserData(req.userId);
      const jsonString = JSON.stringify(data, null, 2);
      const filename = `pawpal-data-export-${new Date().toISOString().slice(0, 10)}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(jsonString);

      logger.info(`User data exported: ${req.userId}`);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * DELETE /users — soft-delete user account
   */
  static async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await DataPrivacyService.softDeleteAccount(req.userId);
      sendSuccess(res, null, '账号已注销，30天后数据将被永久删除');
    } catch (error) {
      sendError(res, 400, (error as Error).message);
    }
  }
}
