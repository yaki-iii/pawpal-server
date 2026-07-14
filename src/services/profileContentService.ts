import { prisma } from '../config/database';
import type { MomentDTO, PostDTO } from '../types';
import { AuthService } from './authService';
import { CommunityService } from './communityService';
import { MomentService } from './momentService';
import { PetService } from './petService';

export type FavoriteContentType = 'all' | 'post' | 'moment' | 'knowledge' | 'vet';

export interface FavoriteContentItemDTO {
  id: string;
  type: Exclude<FavoriteContentType, 'all'>;
  savedAt: string;
  title: string;
  subtitle: string;
  imageUrls: string[];
  payload: PostDTO | MomentDTO | null;
}

export interface FavoriteContentResultDTO {
  items: FavoriteContentItemDTO[];
  counts: Record<FavoriteContentType, number>;
}

export class ProfileContentService {
  static async togglePostBookmark(userId: string, postId: string): Promise<{ bookmarked: boolean }> {
    const post = await prisma.post.findFirst({ where: { id: postId, isRemoved: false }, select: { id: true } });
    if (!post) throw new Error('帖子不存在');
    const existing = await prisma.postBookmark.findUnique({ where: { userId_postId: { userId, postId } } });
    if (existing) {
      await prisma.postBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await prisma.postBookmark.create({ data: { userId, postId } });
    return { bookmarked: true };
  }

  static async toggleMomentBookmark(userId: string, momentId: string): Promise<{ bookmarked: boolean }> {
    const moment = await prisma.moment.findFirst({ where: { id: momentId, isRemoved: false }, select: { id: true } });
    if (!moment) throw new Error('日常不存在');
    const existing = await prisma.momentBookmark.findUnique({ where: { userId_momentId: { userId, momentId } } });
    if (existing) {
      await prisma.momentBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await prisma.momentBookmark.create({ data: { userId, momentId } });
    return { bookmarked: true };
  }
  static async listUserMoments(
    userId: string,
    limit: number = 20,
    viewerId?: string,
  ): Promise<MomentDTO[]> {
    const visibility = await ProfileContentService.visibilityFilterForProfileViewer(userId, viewerId);
    const moments = await prisma.moment.findMany({
      where: { userId, visibility },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: true, pet: true },
    });

    return moments.map((moment) => {
      const dto = MomentService.toDTO(moment);
      if (moment.user) dto.author = AuthService.toDTO(moment.user as never);
      if (moment.pet) dto.pet = PetService.toDTO(moment.pet as never);
      return dto;
    });
  }

  private static async visibilityFilterForProfileViewer(
    ownerId: string,
    viewerId?: string,
  ): Promise<'PUBLIC' | { in: Array<'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'> }> {
    if (!viewerId) return 'PUBLIC';
    if (viewerId === ownerId) return { in: ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] };

    const follows = await prisma.follow.findMany({
      where: { followerId: viewerId, followeeId: ownerId },
      select: { followeeId: true },
    });

    return follows.length > 0 ? { in: ['PUBLIC', 'FOLLOWERS'] } : 'PUBLIC';
  }

  static async listLikedPosts(userId: string, limit: number = 20): Promise<PostDTO[]> {
    const likes = await prisma.like.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        post: {
          include: { author: true, pet: true, circle: true },
        },
      },
    });

    return likes.map((like) => {
      const post = like.post;
      const dto = CommunityService.toPostDTO({ ...post, isLiked: true });
      if (post.author) dto.author = AuthService.toDTO(post.author as never);
      if (post.pet) dto.pet = PetService.toDTO(post.pet as never);
      if (post.circle) dto.circle = CommunityService.toCircleDTO(post.circle as never);
      return dto;
    });
  }

  static async listFavorites(
    userId: string,
    type: FavoriteContentType = 'all',
    limit: number = 20,
  ): Promise<FavoriteContentResultDTO> {
    const [posts, moments] = await Promise.all([
      type === 'all' || type === 'post'
        ? ProfileContentService.listFavoritePosts(userId, limit)
        : Promise.resolve([]),
      type === 'all' || type === 'moment'
        ? ProfileContentService.listFavoriteMoments(userId, limit)
        : Promise.resolve([]),
    ]);

    const allItems = [...posts, ...moments].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );

    const counts: Record<FavoriteContentType, number> = {
      all: posts.length + moments.length,
      post: posts.length,
      moment: moments.length,
      knowledge: 0,
      vet: 0,
    };

    const selectedItems = type === 'all'
      ? allItems
      : allItems.filter((item) => item.type === type);

    return {
      items: selectedItems.slice(0, limit),
      counts,
    };
  }

  private static async listFavoritePosts(
    userId: string,
    limit: number,
  ): Promise<FavoriteContentItemDTO[]> {
    const bookmarks = await prisma.postBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        post: {
          include: { author: true, pet: true, circle: true },
        },
      },
    });

    return bookmarks.map((bookmark) => {
      const post = bookmark.post;
      const dto = CommunityService.toPostDTO(post);
      if (post.author) dto.author = AuthService.toDTO(post.author as never);
      if (post.pet) dto.pet = PetService.toDTO(post.pet as never);
      if (post.circle) dto.circle = CommunityService.toCircleDTO(post.circle as never);
      return {
        id: post.id,
        type: 'post',
        savedAt: bookmark.createdAt.toISOString(),
        title: post.title || '社区帖子',
        subtitle: post.content,
        imageUrls: post.images,
        payload: dto,
      };
    });
  }

  private static async listFavoriteMoments(
    userId: string,
    limit: number,
  ): Promise<FavoriteContentItemDTO[]> {
    const bookmarks = await prisma.momentBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        moment: {
          include: { user: true, pet: true },
        },
      },
    });

    return bookmarks.map((bookmark) => {
      const moment = bookmark.moment;
      const dto = MomentService.toDTO(moment as never);
      if (moment.user) dto.author = AuthService.toDTO(moment.user as never);
      if (moment.pet) dto.pet = PetService.toDTO(moment.pet as never);
      return {
        id: moment.id,
        type: 'moment',
        savedAt: bookmark.createdAt.toISOString(),
        title: moment.content.slice(0, 18) || '日常碎片',
        subtitle: moment.content,
        imageUrls: moment.images,
        payload: dto,
      };
    });
  }
}
