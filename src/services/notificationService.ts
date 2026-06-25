import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { NotificationDTO } from '../types';
import { NotificationType } from '@prisma/client';

/**
 * NotificationService — creates and manages in-app notifications.
 * Used by: reminder scheduling, like/comment/follow events.
 */
export class NotificationService {
  /**
   * Create a new notification for a user.
   */
  static async create(data: {
    userId: string;
    type: NotificationType | string;
    content: string;
    linkUrl?: string;
  }): Promise<NotificationDTO> {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type as NotificationType,
        content: data.content,
        linkUrl: data.linkUrl || '',
      },
    });

    return NotificationService.toDTO(notification);
  }

  /**
   * List all notifications for a user.
   * Unread notifications are returned first.
   */
  static async listByUser(userId: string): Promise<NotificationDTO[]> {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
    return notifications.map(NotificationService.toDTO);
  }

  /**
   * Get unread notification count for a user.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Mark a single notification as read.
   */
  static async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read for a user.
   */
  static async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    logger.info(`All notifications marked as read for user ${userId}`);
  }

  /**
   * Convert a Prisma Notification to a NotificationDTO.
   */
  static toDTO(notification: {
    id: string;
    userId: string;
    type: string;
    content: string;
    linkUrl: string;
    isRead: boolean;
    createdAt: Date;
  }): NotificationDTO {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      content: notification.content,
      linkUrl: notification.linkUrl,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
