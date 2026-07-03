import { prisma } from '../config/database';

export type AlbumItemType = 'moment' | 'health' | 'diary' | 'milestone';

export interface AlbumItemDTO {
  id: string;
  type: AlbumItemType;
  title: string;
  detail: string;
  imageUrls: string[];
  videoUrls: string[];
  date: string;
}

export interface AlbumMonthGroupDTO {
  month: string;
  items: AlbumItemDTO[];
}

export interface PetAlbumDTO {
  petId: string;
  coverImage: string;
  groups: AlbumMonthGroupDTO[];
}

export type AlbumSortOrder = 'newest' | 'oldest';

export class AlbumService {
  static async getPetAlbum(
    petId: string,
    userId: string,
    sort: AlbumSortOrder = 'newest',
  ): Promise<PetAlbumDTO> {
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new Error('宠物不存在');
    }
    if (pet.userId !== userId) {
      throw new Error('无权访问该宠物');
    }

    const [moments, healthRecords, diaryEntries] = await Promise.all([
      prisma.moment.findMany({
        where: { petId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.healthRecord.findMany({
        where: { petId },
        orderBy: { date: 'desc' },
      }),
      prisma.growthDiaryEntry.findMany({
        where: { petId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items: AlbumItemDTO[] = [];

    for (const moment of moments) {
      const videoUrls = (moment as { videos?: string[] }).videos || [];
      if (moment.images.length === 0 && videoUrls.length === 0) continue;
      items.push({
        id: moment.id,
        type: 'moment',
        title: '日常碎片',
        detail: moment.content,
        imageUrls: moment.images,
        videoUrls,
        date: moment.createdAt.toISOString(),
      });
    }

    for (const record of healthRecords) {
      if (record.images.length === 0) continue;
      items.push({
        id: record.id,
        type: 'health',
        title: record.itemName || '健康记录',
        detail: record.notes || '健康记录图片',
        imageUrls: record.images,
        videoUrls: [],
        date: record.date.toISOString(),
      });
    }

    for (const entry of diaryEntries) {
      const isManualMilestone = (entry.mood || '').toLowerCase() === 'milestone';
      if (entry.photos.length === 0 && entry.videos.length === 0 && !isManualMilestone) continue;
      items.push({
        id: entry.id,
        type: isManualMilestone ? 'milestone' : 'diary',
        title: entry.title || '成长日记',
        detail: entry.content,
        imageUrls: entry.photos,
        videoUrls: entry.videos,
        date: entry.createdAt.toISOString(),
      });
    }

    if (pet.birthday) {
      const birthday = AlbumService.birthdayForCurrentYear(pet.birthday);
      items.push({
        id: `birthday-${pet.id}-${birthday.getFullYear()}`,
        type: 'milestone',
        title: `${pet.name} 的生日`,
        detail: '自动生成的成长里程碑',
        imageUrls: [],
        videoUrls: [],
        date: birthday.toISOString(),
      });
    }

    items.sort((a, b) => {
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sort === 'oldest' ? diff : -diff;
    });

    const groups = new Map<string, AlbumItemDTO[]>();
    for (const item of items) {
      const month = item.date.slice(0, 7);
      groups.set(month, [...(groups.get(month) || []), item]);
    }

    return {
      petId,
      coverImage: (pet as { photo?: string }).photo || '',
      groups: Array.from(groups.entries()).map(([month, groupItems]) => ({
        month,
        items: groupItems,
      })),
    };
  }

  static async deleteManualAlbumItems(
    petId: string,
    userId: string,
    entryIds: string[],
  ): Promise<{ deletedCount: number }> {
    await AlbumService.assertPetOwner(petId, userId);
    const cleanIds = Array.from(new Set(entryIds.map((id) => id.trim()).filter(Boolean)));
    if (cleanIds.length === 0) {
      return { deletedCount: 0 };
    }

    const result = await prisma.growthDiaryEntry.deleteMany({
      where: {
        id: { in: cleanIds },
        petId,
        userId,
      },
    });

    return { deletedCount: result.count };
  }

  static async setAlbumCover(petId: string, userId: string, imageUrl: string): Promise<void> {
    await AlbumService.assertPetOwner(petId, userId);
    if (!imageUrl.trim()) {
      throw new Error('封面图片不能为空');
    }

    await prisma.pet.update({
      where: { id: petId },
      data: { photo: imageUrl },
    });
  }

  private static async assertPetOwner(petId: string, userId: string): Promise<void> {
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new Error('宠物不存在');
    }
    if (pet.userId !== userId) {
      throw new Error('无权访问该宠物');
    }
  }

  private static birthdayForCurrentYear(birthday: Date): Date {
    const currentYear = new Date().getFullYear();
    return new Date(Date.UTC(currentYear, birthday.getUTCMonth(), birthday.getUTCDate()));
  }
}
