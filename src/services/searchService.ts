import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { CircleDTO, MomentDTO, PetDTO, PostDTO, SearchResult, UserDTO } from '../types';
import { CommunityService } from './communityService';
import { AuthService } from './authService';
import { PetService } from './petService';
import { MomentService } from './momentService';

/**
 * SearchService — full-text search across community posts.
 * Uses PostgreSQL ILIKE for MVP (pg_trgm can be added later for better fuzzy matching).
 */
export class SearchService {
  /**
   * Search community posts by keyword.
   * Matches against title and content fields.
   */
  static async searchPosts(keyword: string, limit: number = 10): Promise<PostDTO[]> {
    const posts = await prisma.post.findMany({
      where: {
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { content: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { author: true, pet: true, circle: true },
    });

    return posts.map((p) => {
      const dto = CommunityService.toPostDTO(p);
      if (p.author) dto.author = AuthService.toDTO(p.author as never);
      if (p.pet) dto.pet = PetService.toDTO(p.pet as never);
      if (p.circle) dto.circle = CommunityService.toCircleDTO(p.circle as never);
      return dto;
    });
  }

  static async searchCircles(keyword: string, limit: number = 10): Promise<CircleDTO[]> {
    const circles = await prisma.circle.findMany({
      where: {
        visibility: { not: 'PRIVATE' },
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ memberCount: 'desc' }, { postCount: 'desc' }],
      take: limit,
    });

    return circles.map(CommunityService.toCircleDTO);
  }

  static async searchUsers(keyword: string, limit: number = 10): Promise<UserDTO[]> {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { nickname: { contains: keyword, mode: 'insensitive' } },
          { bio: { contains: keyword, mode: 'insensitive' } },
          { city: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return users.map(AuthService.toDTO);
  }

  static async searchPets(keyword: string, userId: string | undefined, limit: number = 10): Promise<PetDTO[]> {
    if (!userId) return [];

    const pets = await prisma.pet.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { breed: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return pets.map(PetService.toDTO);
  }

  static async searchMoments(keyword: string, limit: number = 10): Promise<MomentDTO[]> {
    const moments = await prisma.moment.findMany({
      where: {
        visibility: 'PUBLIC',
        OR: [
          { content: { contains: keyword, mode: 'insensitive' } },
          { mood: { contains: keyword, mode: 'insensitive' } },
          { location: { contains: keyword, mode: 'insensitive' } },
        ],
      },
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

  /**
   * Search across all content types (posts only — knowledge module removed).
   * Used by AI assistant pipeline.
   */
  static async searchAll(keyword: string, limit: number = 5, userId?: string): Promise<SearchResult> {
    const [posts, circles, users, pets, moments] = await Promise.all([
      SearchService.searchPosts(keyword, limit),
      SearchService.searchCircles(keyword, limit),
      SearchService.searchUsers(keyword, limit),
      SearchService.searchPets(keyword, userId, limit),
      SearchService.searchMoments(keyword, limit),
    ]);
    logger.info(
      `Search "${keyword}": ${posts.length} posts, ${circles.length} circles, ` +
        `${users.length} users, ${pets.length} pets, ${moments.length} moments`,
    );
    return { posts, circles, users, pets, moments };
  }
}
