import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { Post, Circle, Comment } from '@prisma/client';
import type { PostDTO, CircleDTO, CommentDTO, UserDTO, PaginatedResult } from '../types';
import { AuthService } from './authService';
import { PetService } from './petService';
import { NotificationService } from './notificationService';

/**
 * CommunityService — posts, circles, comments, likes, follows.
 */
export class CommunityService {
  // ---- Posts ----

  /**
   * Publish a new post.
   * Returns the post DTO with author info for immediate display.
   */
  static async publishPost(
    userId: string,
    data: {
      title: string;
      content: string;
      circleId?: string;
      petId?: string;
      images?: string[];
      tags?: string[];
    },
  ): Promise<PostDTO> {
    const post = await prisma.post.create({
      data: {
        userId,
        circleId: data.circleId || null,
        petId: data.petId || null,
        title: data.title,
        content: data.content,
        images: data.images || [],
        tags: data.tags || [],
      },
      include: {
        author: true,
        pet: true,
        circle: true,
      },
    });

    // Increment circle post count + refresh lastActiveAt
    if (data.circleId) {
      await prisma.circle.update({
        where: { id: data.circleId },
        data: {
          postCount: { increment: 1 },
          lastActiveAt: new Date(),
        },
      });
    }

    logger.info(`Post published: ${post.id} by user ${userId}`);

    // Build DTO with author/pet/circle info
    const dto = CommunityService.toPostDTO(post);
    if (post.author) {
      dto.author = AuthService.toDTO(post.author);
    }
    if (post.pet) {
      dto.pet = PetService.toDTO(post.pet);
    }
    if (post.circle) {
      dto.circle = CommunityService.toCircleDTO(post.circle);
    }
    return dto;
  }

  /**
   * Get a single post by ID with author and circle info.
   */
  static async getPostById(postId: string, userId?: string): Promise<PostDTO> {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: true,
        pet: true,
        circle: true,
        likes: userId ? { where: { userId } } : false,
      },
    });

    if (!post) {
      throw new Error('动态不存在');
    }

    const dto = CommunityService.toPostDTO(post);
    if (userId && post.likes) {
      dto.isLiked = post.likes.length > 0;
    }
    if (post.author) {
      dto.author = AuthService.toDTO(post.author);
    }
    if (post.pet) {
      dto.pet = PetService.toDTO(post.pet);
    }
    if (post.circle) {
      dto.circle = CommunityService.toCircleDTO(post.circle);
    }
    return dto;
  }

  /**
   * Delete a post. Verifies ownership.
   */
  static async deletePost(postId: string, userId: string): Promise<void> {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new Error('动态不存在');
    }
    if (post.userId !== userId) {
      throw new Error('无权删除该动态');
    }

    // Decrement circle post count
    if (post.circleId) {
      await prisma.circle.update({
        where: { id: post.circleId },
        data: { postCount: { decrement: 1 } },
      });
    }

    await prisma.post.delete({ where: { id: postId } });
    logger.info(`Post deleted: ${postId}`);
  }

  /**
   * Toggle like on a post.
   * Creates notification for the post author.
   */
  static async toggleLike(postId: string, userId: string): Promise<{ liked: boolean }> {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new Error('动态不存在');
    }

    const existing = await prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      await prisma.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false };
    }

    await prisma.like.create({ data: { userId, postId } });
    await prisma.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
    });

    // Send notification to post author (if not self-like)
    if (post.userId !== userId) {
      const author = await prisma.user.findUnique({ where: { id: userId } });
      await NotificationService.create({
        userId: post.userId,
        type: 'LIKE',
        content: `${author?.nickname || '有人'}赞了你的动态「${post.title}」`,
        linkUrl: `/posts/${postId}`,
      });
    }

    return { liked: true };
  }

  // ---- Comments ----

  /**
   * List comments for a post, with nested replies.
   */
  static async listComments(postId: string): Promise<CommentDTO[]> {
    const comments = await prisma.comment.findMany({
      where: { postId, parentId: null },
      include: {
        author: true,
        replies: {
          include: { author: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return comments.map((c) => CommunityService.toCommentDTO(c));
  }

  /**
   * Create a comment (or reply if parentId is provided).
   */
  static async createComment(
    postId: string,
    userId: string,
    content: string,
    parentId?: string,
  ): Promise<CommentDTO> {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new Error('动态不存在');
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        userId,
        parentId: parentId || null,
        content,
      },
      include: { author: true },
    });

    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    // Send notification to post author
    if (post.userId !== userId) {
      const author = await prisma.user.findUnique({ where: { id: userId } });
      await NotificationService.create({
        userId: post.userId,
        type: 'COMMENT',
        content: `${author?.nickname || '有人'}评论了你的动态「${post.title}」`,
        linkUrl: `/posts/${postId}`,
      });
    }

    return CommunityService.toCommentDTO(comment);
  }

  /**
   * Delete a comment. Verifies ownership.
   */
  static async deleteComment(postId: string, commentId: string, userId: string): Promise<void> {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new Error('评论不存在');
    }
    if (comment.userId !== userId) {
      throw new Error('无权删除该评论');
    }

    await prisma.comment.delete({ where: { id: commentId } });
    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { decrement: 1 } },
    });
  }

  // ---- Circles ----

  /**
   * List circles with optional filters.
   * PRIVATE circles are only visible to members.
   */
  static async listCircles(
    params?: { type?: string; species?: string; keyword?: string },
    userId?: string,
  ): Promise<CircleDTO[]> {
    const where: Record<string, unknown> = {};
    if (params?.type) where.type = params.type;
    if (params?.species) where.species = params.species;
    if (params?.keyword) {
      where.OR = [
        { name: { contains: params.keyword, mode: 'insensitive' } },
        { description: { contains: params.keyword, mode: 'insensitive' } },
      ];
    }

    // Hide PRIVATE circles the user is not a member of
    if (userId) {
      const myCircleIds = await prisma.circleMember.findMany({
        where: { userId },
        select: { circleId: true },
      });
      const memberIds = myCircleIds.map((m) => m.circleId);
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : []),
        { visibility: { not: 'PRIVATE' } },
        { id: { in: memberIds } },
      ];
    } else {
      where.visibility = { not: 'PRIVATE' };
    }

    const circles = await prisma.circle.findMany({
      where,
      orderBy: { memberCount: 'desc' },
    });

    const dtos = circles.map(CommunityService.toCircleDTO);

    // Check if user has joined each circle
    if (userId) {
      const memberships = await prisma.circleMember.findMany({
        where: { userId },
        select: { circleId: true, role: true },
      });
      const memberMap = new Map(memberships.map((m) => [m.circleId, m.role]));
      dtos.forEach((dto) => {
        dto.isJoined = memberMap.has(dto.id);
        dto.myRole = memberMap.get(dto.id) ?? undefined;
      });
    }

    return dtos;
  }

  /**
   * Get circle detail by ID.
   */
  static async getCircleById(id: string, userId?: string): Promise<CircleDTO> {
    const circle = await prisma.circle.findUnique({ where: { id } });
    if (!circle) {
      throw new Error('圈子不存在');
    }
    const dto = CommunityService.toCircleDTO(circle);

    if (userId) {
      const membership = await prisma.circleMember.findUnique({
        where: { circleId_userId: { circleId: id, userId } },
      });
      dto.isJoined = !!membership && membership.status === 'ACTIVE';
      dto.myRole = membership?.role;
    }

    return dto;
  }

  /**
   * Join a circle (PUBLIC only — RESTRICTED/PRIVATE use join requests).
   */
  static async joinCircle(circleId: string, userId: string): Promise<void> {
    const circle = await prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) {
      throw new Error('圈子不存在');
    }
    if (circle.visibility === 'PRIVATE') {
      throw new Error('私有圈子需要邀请才能加入');
    }
    if (circle.visibility === 'RESTRICTED') {
      throw new Error('受限圈子需要申请加入，请使用 join-request 接口');
    }

    const existing = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (existing) {
      if (existing.status === 'KICKED') {
        throw new Error('您已被踢出该圈子，无法再次加入');
      }
      return; // Already joined
    }

    await prisma.circleMember.create({
      data: { circleId, userId, role: 'MEMBER' },
    });
    await prisma.circle.update({
      where: { id: circleId },
      data: { memberCount: { increment: 1 } },
    });

    logger.info(`User ${userId} joined circle ${circleId}`);
  }

  /**
   * Leave a circle.
   */
  static async leaveCircle(circleId: string, userId: string): Promise<void> {
    const existing = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!existing) {
      return; // Not a member
    }
    if (existing.role === 'OWNER') {
      throw new Error('圈主不能退出圈子，请先转让或解散圈子');
    }

    await prisma.circleMember.delete({ where: { id: existing.id } });
    await prisma.circle.update({
      where: { id: circleId },
      data: { memberCount: { decrement: 1 } },
    });

    logger.info(`User ${userId} left circle ${circleId}`);
  }

  /**
   * Create a new user-created circle (Reddit-style).
   * The creator automatically becomes the OWNER.
   */
  static async createCircle(
    userId: string,
    data: {
      name: string;
      description: string;
      coverImage: string;
      rules?: string;
      visibility?: string;
    },
  ): Promise<CircleDTO> {
    // Check name uniqueness (Circle.name has @unique constraint)
    const existing = await prisma.circle.findUnique({ where: { name: data.name } });
    if (existing) {
      throw new Error('圈子名称已存在，请换一个');
    }

    // Create circle with type TOPIC, ownerId + createdByUserId set to creator
    const circle = await prisma.circle.create({
      data: {
        name: data.name,
        type: 'TOPIC',
        description: data.description,
        coverImage: data.coverImage,
        rules: data.rules || '',
        visibility: (data.visibility as 'PUBLIC' | 'RESTRICTED' | 'PRIVATE') || 'PUBLIC',
        ownerId: userId,
        createdByUserId: userId,
        memberCount: 1,
      },
    });

    // Creator auto-joins the circle as OWNER
    await prisma.circleMember.create({
      data: { circleId: circle.id, userId, role: 'OWNER' },
    });

    logger.info(`Circle created: ${circle.name} (TOPIC) by user ${userId}`);

    const dto = CommunityService.toCircleDTO(circle);
    dto.isJoined = true;
    dto.myRole = 'OWNER';
    return dto;
  }

  // ---- Follows ----

  /**
   * Toggle follow/unfollow a user.
   */
  static async toggleFollow(followerId: string, followeeId: string): Promise<{ following: boolean }> {
    if (followerId === followeeId) {
      throw new Error('不能关注自己');
    }

    const existing = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      return { following: false };
    }

    await prisma.follow.create({ data: { followerId, followeeId } });

    // Send notification
    const follower = await prisma.user.findUnique({ where: { id: followerId } });
    await NotificationService.create({
      userId: followeeId,
      type: 'FOLLOW',
      content: `${follower?.nickname || '有人'}关注了你`,
      linkUrl: `/profile/${followerId}`,
    });

    return { following: true };
  }

  /**
   * Get user profile with follower/following counts.
   */
  static async getUserProfile(userId: string, currentUserId?: string): Promise<UserDTO & {
    followerCount: number;
    followingCount: number;
    postCount: number;
    isFollowing: boolean;
  }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new Error('用户不存在');
    }

    const [followerCount, followingCount, postCount] = await Promise.all([
      prisma.follow.count({ where: { followeeId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
      prisma.post.count({ where: { userId } }),
    ]);

    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      const follow = await prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: currentUserId, followeeId: userId } },
      });
      isFollowing = !!follow;
    }

    return {
      ...AuthService.toDTO(user),
      followerCount,
      followingCount,
      postCount,
      isFollowing,
    };
  }

  /**
   * Get posts by user ID with cursor pagination.
   */
  static async getPostsByUser(
    userId: string,
    cursor?: string,
    limit: number = 10,
  ): Promise<PaginatedResult<PostDTO>> {
    const where: Record<string, unknown> = { userId };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { author: true, pet: true, circle: true },
    });

    const hasMore = posts.length > limit;
    const items = posts.slice(0, limit).map((p) => {
      const dto = CommunityService.toPostDTO(p);
      if (p.author) dto.author = AuthService.toDTO(p.author);
      if (p.pet) dto.pet = PetService.toDTO(p.pet);
      if (p.circle) dto.circle = CommunityService.toCircleDTO(p.circle);
      return dto;
    });

    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt : null,
    };
  }

  // ---- DTO Converters ----

  static toPostDTO(post: Post & { isLiked?: boolean }): PostDTO {
    return {
      id: post.id,
      userId: post.userId,
      circleId: post.circleId,
      petId: post.petId,
      title: post.title,
      content: post.content,
      images: post.images,
      tags: post.tags,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      isLiked: (post as { isLiked?: boolean }).isLiked,
      isPinned: (post as { isPinned?: boolean }).isPinned,
      isRemoved: (post as { isRemoved?: boolean }).isRemoved,
    };
  }

  static toCircleDTO(circle: Circle): CircleDTO {
    return {
      id: circle.id,
      name: circle.name,
      type: circle.type,
      species: circle.species,
      coverImage: circle.coverImage,
      description: circle.description,
      ownerId: (circle as { ownerId?: string | null }).ownerId ?? null,
      createdByUserId: (circle as { createdByUserId?: string | null }).createdByUserId ?? null,
      isVerified: (circle as { isVerified?: boolean }).isVerified ?? false,
      rules: (circle as { rules?: string }).rules ?? '',
      visibility: (circle as { visibility?: string }).visibility ?? 'PUBLIC',
      moderatorNote: (circle as { moderatorNote?: string }).moderatorNote ?? '',
      lastActiveAt: ((circle as { lastActiveAt?: Date }).lastActiveAt ?? circle.createdAt).toISOString(),
      memberCount: circle.memberCount,
      postCount: circle.postCount,
      createdAt: circle.createdAt.toISOString(),
    };
  }

  static toCommentDTO(comment: Comment & { author?: { id: string; email: string; nickname: string; avatar: string; bio: string; city: string; membershipLevel: string; createdAt: Date; updatedAt: Date } } & { replies?: unknown[] }): CommentDTO {
    return {
      id: comment.id,
      postId: comment.postId,
      userId: comment.userId,
      parentId: comment.parentId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author ? AuthService.toDTO(comment.author as never) : undefined,
      replies: (comment.replies as CommentDTO[]) || [],
    };
  }
}
