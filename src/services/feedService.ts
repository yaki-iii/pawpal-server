import { prisma } from '../config/database';
import type { Post } from '@prisma/client';
import type { PostDTO, PaginatedResult } from '../types';
import { CommunityService } from './communityService';
import { AuthService } from './authService';
import { PetService } from './petService';

/**
 * FeedService — assembles community feed with cursor-based pagination.
 * Supports: RECOMMEND (by likes+comments), LATEST (by time), FOLLOWING (by followed users).
 *
 * Removed (isRemoved=true) posts are excluded from all feeds.
 * Pinned posts are surfaced first in circle feeds.
 */
export class FeedService {
  /**
   * Get feed posts.
   * @param type - RECOMMEND | LATEST | FOLLOWING
   * @param cursor - ISO date string for pagination
   * @param limit - number of items per page
   * @param userId - current user ID (required for FOLLOWING feed and like status)
   */
  static async getFeed(
    type: string,
    cursor: string | undefined,
    limit: number,
    userId?: string,
  ): Promise<PaginatedResult<PostDTO>> {
    const where: Record<string, unknown> = { isRemoved: false };

    // For FOLLOWING feed, filter by followed users
    if (type === 'FOLLOWING' && userId) {
      const following = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followeeId: true },
      });
      const followingIds = following.map((f) => f.followeeId);
      if (followingIds.length === 0) {
        return { items: [], nextCursor: null };
      }
      where.userId = { in: followingIds };
    }

    // Cursor pagination
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    let posts: (Post & { author?: unknown; pet?: unknown; circle?: unknown })[];

    if (type === 'RECOMMEND') {
      posts = await prisma.post.findMany({
        where,
        orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }],
        take: limit + 1,
        include: { author: true, pet: true, circle: true },
      });
    } else {
      posts = await prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: { author: true, pet: true, circle: true },
      });
    }

    const hasMore = posts.length > limit;
    const items = posts.slice(0, limit).map((p) => {
      const dto = CommunityService.toPostDTO(p);
      if (p.author) dto.author = AuthService.toDTO(p.author as never);
      if (p.pet) dto.pet = PetService.toDTO(p.pet as never);
      if (p.circle) dto.circle = CommunityService.toCircleDTO(p.circle as never);
      return dto;
    });

    // Add like status if user is authenticated
    if (userId && items.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId,
          postId: { in: items.map((p) => p.id) },
        },
        select: { postId: true },
      });
      const likedPostIds = new Set(likes.map((l) => l.postId));
      items.forEach((p) => {
        p.isLiked = likedPostIds.has(p.id);
      });
    }

    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt : null,
    };
  }

  /**
   * Get posts within a specific circle.
   * Pinned posts are sorted first, then by createdAt desc.
   * Removed posts are excluded.
   */
  static async getCircleFeed(
    circleId: string,
    cursor: string | undefined,
    limit: number,
    userId?: string,
  ): Promise<PaginatedResult<PostDTO>> {
    const where: Record<string, unknown> = { circleId, isRemoved: false };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      include: { author: true, pet: true, circle: true },
    });

    const hasMore = posts.length > limit;
    const items = posts.slice(0, limit).map((p) => {
      const dto = CommunityService.toPostDTO(p);
      if (p.author) dto.author = AuthService.toDTO(p.author as never);
      if (p.pet) dto.pet = PetService.toDTO(p.pet as never);
      if (p.circle) dto.circle = CommunityService.toCircleDTO(p.circle as never);
      return dto;
    });

    if (userId && items.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId,
          postId: { in: items.map((p) => p.id) },
        },
        select: { postId: true },
      });
      const likedPostIds = new Set(likes.map((l) => l.postId));
      items.forEach((p) => {
        p.isLiked = likedPostIds.has(p.id);
      });
    }

    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt : null,
    };
  }
}
