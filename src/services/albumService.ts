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
  groups: AlbumMonthGroupDTO[];
}

export class AlbumService {
  static async getPetAlbum(petId: string, userId: string): Promise<PetAlbumDTO> {
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
      if (entry.photos.length === 0 && entry.videos.length === 0) continue;
      items.push({
        id: entry.id,
        type: 'diary',
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

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const groups = new Map<string, AlbumItemDTO[]>();
    for (const item of items) {
      const month = item.date.slice(0, 7);
      groups.set(month, [...(groups.get(month) || []), item]);
    }

    return {
      petId,
      groups: Array.from(groups.entries()).map(([month, groupItems]) => ({
        month,
        items: groupItems,
      })),
    };
  }

  private static birthdayForCurrentYear(birthday: Date): Date {
    const currentYear = new Date().getFullYear();
    return new Date(Date.UTC(currentYear, birthday.getUTCMonth(), birthday.getUTCDate()));
  }
}
