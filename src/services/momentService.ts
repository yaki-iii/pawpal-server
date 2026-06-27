import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { GrowthDiaryEntry, Moment, MomentComment } from '@prisma/client';
import type { GrowthDiaryEntryDTO, MomentCommentDTO, MomentDTO, PaginatedResult } from '../types';
import { AuthService } from './authService';
import { PetService } from './petService';
import { NotificationService } from './notificationService';

/**
 * MomentService — lightweight daily moments (日常碎片).
 *
 * A moment is a short, image-rich snippet attached to a pet.
 * Distinct from a Post (which is a long-form community discussion thread):
 *  - Moments are quick-capture (mobile-first, often from the pet's profile page)
 *  - Moments belong to a pet (not optional like Post.petId)
 *  - Moments have a mood + location (more "diary-like" than discussion)
 *  - Moments feed = follow graph of pet owners
 */
export class MomentService {
  /**
   * Create a moment for a pet. Verifies pet ownership.
   */
  static async createMoment(
    userId: string,
    petId: string,
    data: {
      content: string;
      images?: string[];
      videos?: string[];
      mood?: string;
      location?: string;
    },
  ): Promise<MomentDTO> {
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new Error('宠物不存在');
    if (pet.userId !== userId) throw new Error('无权为该宠物发布碎片');

    const moment = await prisma.moment.create({
      data: {
        userId,
        petId,
        content: data.content,
        images: data.images || [],
        videos: data.videos || [],
        mood: data.mood || '',
        location: data.location || '',
      },
      include: { user: true, pet: true },
    });

    logger.info(`Moment created: ${moment.id} for pet ${petId} by user ${userId}`);

    const dto = MomentService.toDTO(moment);
    if (moment.user) dto.author = AuthService.toDTO(moment.user);
    if (moment.pet) dto.pet = PetService.toDTO(moment.pet);
    return dto;
  }

  /**
   * List moments for a specific pet (anyone can view a pet's moments).
   */
  static async listByPet(
    petId: string,
    cursor?: string,
    limit: number = 20,
    userId?: string,
  ): Promise<PaginatedResult<MomentDTO>> {
    const where: Record<string, unknown> = { petId };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const moments = await prisma.moment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { user: true, pet: true },
    });

    const hasMore = moments.length > limit;
    const items = moments.slice(0, limit).map((m) => {
      const dto = MomentService.toDTO(m);
      if (m.user) dto.author = AuthService.toDTO(m.user);
      if (m.pet) dto.pet = PetService.toDTO(m.pet);
      return dto;
    });

    if (userId && items.length > 0) {
      const likes = await prisma.momentLike.findMany({
        where: { userId, momentId: { in: items.map((m) => m.id) } },
        select: { momentId: true },
      });
      const likedIds = new Set(likes.map((l) => l.momentId));
      items.forEach((m) => {
        m.isLiked = likedIds.has(m.id);
      });
    }

    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt : null,
    };
  }

  /**
   * Get the moments feed for a user — moments from pets owned by the user
   * and pets owned by users the user follows.
   */
  static async getFeed(
    userId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<PaginatedResult<MomentDTO>> {
    // Get the user's pets + followed users' pets
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followeeId: true },
    });
    const ownerIds = [userId, ...following.map((f) => f.followeeId)];

    const pets = await prisma.pet.findMany({
      where: { userId: { in: ownerIds } },
      select: { id: true },
    });
    const petIds = pets.map((p) => p.id);

    if (petIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const where: Record<string, unknown> = { petId: { in: petIds } };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const moments = await prisma.moment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { user: true, pet: true },
    });

    const hasMore = moments.length > limit;
    const items = moments.slice(0, limit).map((m) => {
      const dto = MomentService.toDTO(m);
      if (m.user) dto.author = AuthService.toDTO(m.user);
      if (m.pet) dto.pet = PetService.toDTO(m.pet);
      return dto;
    });

    if (items.length > 0) {
      const likes = await prisma.momentLike.findMany({
        where: { userId, momentId: { in: items.map((m) => m.id) } },
        select: { momentId: true },
      });
      const likedIds = new Set(likes.map((l) => l.momentId));
      items.forEach((m) => {
        m.isLiked = likedIds.has(m.id);
      });
    }

    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt : null,
    };
  }

  /**
   * Delete a moment. Verifies ownership.
   */
  static async deleteMoment(momentId: string, userId: string): Promise<void> {
    const moment = await prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) throw new Error('碎片不存在');
    if (moment.userId !== userId) throw new Error('无权删除该碎片');

    await prisma.moment.delete({ where: { id: momentId } });
    logger.info(`Moment deleted: ${momentId}`);
  }

  /**
   * Promote a lightweight moment into a formal growth diary entry.
   */
  static async promoteToDiary(momentId: string, userId: string): Promise<GrowthDiaryEntryDTO> {
    const moment = await prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) throw new Error('碎片不存在');
    if (moment.userId !== userId) throw new Error('无权升级该碎片');

    const entry = await prisma.growthDiaryEntry.create({
      data: {
        petId: moment.petId,
        userId: moment.userId,
        title: MomentService.diaryTitleFor(moment.content),
        content: moment.content,
        mood: moment.mood,
        photos: moment.images,
        videos: (moment as { videos?: string[] }).videos || [],
      },
    });

    logger.info(`Moment promoted to growth diary: ${momentId} -> ${entry.id}`);
    return MomentService.growthDiaryEntryToDTO(entry);
  }

  /**
   * List comments for a moment, with one-level replies for the shared comment UI.
   */
  static async listComments(momentId: string): Promise<MomentCommentDTO[]> {
    const comments = await prisma.momentComment.findMany({
      where: { momentId, parentId: null },
      include: {
        author: true,
        replies: {
          include: { author: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return comments.map((comment) => MomentService.toCommentDTO(comment));
  }

  /**
   * Create a top-level comment or reply for a moment.
   */
  static async createComment(
    momentId: string,
    userId: string,
    content: string,
    parentId?: string,
  ): Promise<MomentCommentDTO> {
    const moment = await prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) throw new Error('碎片不存在');

    const comment = await prisma.momentComment.create({
      data: {
        momentId,
        userId,
        parentId: parentId || null,
        content,
      },
      include: { author: true },
    });

    await prisma.moment.update({
      where: { id: momentId },
      data: { commentCount: { increment: 1 } },
    });

    if (moment.userId !== userId) {
      const author = await prisma.user.findUnique({ where: { id: userId } });
      await NotificationService.create({
        userId: moment.userId,
        type: 'COMMENT',
        content: `${author?.nickname || '有人'}评论了你的日常碎片`,
        linkUrl: `/moments/${momentId}`,
      });
    }

    return MomentService.toCommentDTO(comment);
  }

  /**
   * Toggle like on a moment. Notifies the moment author.
   */
  static async toggleLike(momentId: string, userId: string): Promise<{ liked: boolean }> {
    const moment = await prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) throw new Error('碎片不存在');

    const existing = await prisma.momentLike.findUnique({
      where: { userId_momentId: { userId, momentId } },
    });

    if (existing) {
      await prisma.momentLike.delete({ where: { id: existing.id } });
      await prisma.moment.update({
        where: { id: momentId },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false };
    }

    await prisma.momentLike.create({ data: { userId, momentId } });
    await prisma.moment.update({
      where: { id: momentId },
      data: { likeCount: { increment: 1 } },
    });

    if (moment.userId !== userId) {
      const liker = await prisma.user.findUnique({ where: { id: userId } });
      await NotificationService.create({
        userId: moment.userId,
        type: 'LIKE',
        content: `${liker?.nickname || '有人'}赞了你的日常碎片`,
        linkUrl: `/moments/${momentId}`,
      });
    }

    return { liked: true };
  }

  /**
   * Record that a moment was shared through an external share sheet.
   */
  static async recordShare(momentId: string): Promise<{ shareCount: number }> {
    const moment = await prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) throw new Error('碎片不存在');

    const updated = await prisma.moment.update({
      where: { id: momentId },
      data: { shareCount: { increment: 1 } },
    });

    return {
      shareCount: (updated as { shareCount?: number }).shareCount || 0,
    };
  }

  // ---- DTO Converter ----

  static toDTO(moment: Moment): MomentDTO {
    return {
      id: moment.id,
      userId: moment.userId,
      petId: moment.petId,
      content: moment.content,
      images: moment.images,
      videos: (moment as { videos?: string[] }).videos || [],
      mood: moment.mood,
      location: moment.location,
      likeCount: moment.likeCount,
      commentCount: (moment as { commentCount?: number }).commentCount || 0,
      shareCount: (moment as { shareCount?: number }).shareCount || 0,
      createdAt: moment.createdAt.toISOString(),
      updatedAt: moment.updatedAt.toISOString(),
    };
  }

  private static diaryTitleFor(content: string): string {
    const title = content.trim();
    return title.length > 0 ? title.slice(0, 18) : '日常碎片';
  }

  private static growthDiaryEntryToDTO(entry: GrowthDiaryEntry): GrowthDiaryEntryDTO {
    return {
      id: entry.id,
      petId: entry.petId,
      userId: entry.userId,
      title: entry.title,
      content: entry.content,
      mood: entry.mood,
      photos: entry.photos,
      videos: entry.videos,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private static toCommentDTO(
    comment: MomentComment
      & { author?: { id: string; email: string; nickname: string; avatar: string; bio: string; city: string; membershipLevel: string; createdAt: Date; updatedAt: Date } }
      & { replies?: unknown[] },
  ): MomentCommentDTO {
    return {
      id: comment.id,
      postId: comment.momentId,
      momentId: comment.momentId,
      userId: comment.userId,
      parentId: comment.parentId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author ? AuthService.toDTO(comment.author as never) : undefined,
      replies: ((comment.replies || []) as Array<MomentComment & { author?: { id: string; email: string; nickname: string; avatar: string; bio: string; city: string; membershipLevel: string; createdAt: Date; updatedAt: Date } }>).map((reply) =>
        MomentService.toCommentDTO(reply),
      ),
    };
  }
}
