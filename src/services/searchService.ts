import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { PostDTO, SearchResult } from '../types';
import { CommunityService } from './communityService';
import { AuthService } from './authService';
import { PetService } from './petService';

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

  /**
   * Search across all content types (posts only — knowledge module removed).
   * Used by AI assistant pipeline.
   */
  static async searchAll(keyword: string, limit: number = 5): Promise<SearchResult> {
    const posts = await SearchService.searchPosts(keyword, limit);
    logger.info(`Search "${keyword}": ${posts.length} posts`);
    return { posts };
  }
}
