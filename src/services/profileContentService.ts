import { prisma } from '../config/database';
import type { MomentDTO, PostDTO } from '../types';
import { AuthService } from './authService';
import { CommunityService } from './communityService';
import { MomentService } from './momentService';
import { PetService } from './petService';

export class ProfileContentService {
  static async listUserMoments(userId: string, limit: number = 20): Promise<MomentDTO[]> {
    const moments = await prisma.moment.findMany({
      where: { userId },
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
}
