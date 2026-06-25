import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { GrowthDiaryEntry } from '@prisma/client';
import type { GrowthDiaryEntryDTO } from '../types';
import { getFileUrl } from '../middleware/upload';

/**
 * GrowthDiaryService — daily growth diary entries with media support.
 * Users can manually record daily moments with photos and videos.
 */
export class GrowthDiaryService {
  /**
   * List growth diary entries for a pet, ordered by creation date descending.
   */
  static async listEntries(petId: string, userId: string): Promise<GrowthDiaryEntryDTO[]> {
    // Verify pet ownership
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new Error('宠物不存在');
    }
    if (pet.userId !== userId) {
      throw new Error('无权访问该宠物');
    }

    const entries = await prisma.growthDiaryEntry.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
    });

    return entries.map(GrowthDiaryService.toDTO);
  }

  /**
   * Create a new growth diary entry.
   * Handles uploaded media files (photos and videos).
   */
  static async createEntry(
    petId: string,
    userId: string,
    data: {
      title: string;
      content: string;
      mood: string;
    },
    files: Express.Multer.File[],
  ): Promise<GrowthDiaryEntryDTO> {
    // Verify pet ownership
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new Error('宠物不存在');
    }
    if (pet.userId !== userId) {
      throw new Error('无权操作该宠物');
    }

    // Separate photos and videos by mimetype
    const photos: string[] = [];
    const videos: string[] = [];
    const dateStr = new Date().toISOString().slice(0, 10);

    for (const file of files) {
      const fileUrl = getFileUrl(file.filename, dateStr);
      if (file.mimetype.startsWith('video/')) {
        videos.push(fileUrl);
      } else {
        photos.push(fileUrl);
      }
    }

    const entry = await prisma.growthDiaryEntry.create({
      data: {
        petId,
        userId,
        title: data.title,
        content: data.content,
        mood: data.mood,
        photos,
        videos,
      },
    });

    logger.info(`Growth diary entry created: ${entry.id} for pet ${petId} by user ${userId}`);
    return GrowthDiaryService.toDTO(entry);
  }

  /**
   * Delete a growth diary entry. Verifies ownership.
   */
  static async deleteEntry(petId: string, entryId: string, userId: string): Promise<void> {
    const entry = await prisma.growthDiaryEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      throw new Error('日记不存在');
    }
    if (entry.petId !== petId) {
      throw new Error('日记不存在');
    }
    if (entry.userId !== userId) {
      throw new Error('无权删除该日记');
    }

    await prisma.growthDiaryEntry.delete({ where: { id: entryId } });
    logger.info(`Growth diary entry deleted: ${entryId}`);
  }

  /**
   * Convert a Prisma GrowthDiaryEntry to a GrowthDiaryEntryDTO.
   */
  static toDTO(entry: GrowthDiaryEntry): GrowthDiaryEntryDTO {
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
}
