import { AlbumService } from '../src/services/albumService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    pet: { findUnique: jest.fn() },
    moment: { findMany: jest.fn() },
    healthRecord: { findMany: jest.fn() },
    growthDiaryEntry: { findMany: jest.fn() },
  },
}));

const mockPet = {
  id: 'pet-1',
  userId: 'user-1',
  name: '煤球',
  birthday: new Date('2023-06-15T00:00:00Z'),
};

describe('AlbumService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPetAlbum', () => {
    it('should aggregate moment, health, diary images and birthday milestone by month', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'moment-1',
          content: '今天去草地玩',
          images: ['/uploads/moment.jpg'],
          videos: ['/uploads/moment-video.mp4'],
          createdAt: new Date('2026-06-20T12:00:00Z'),
        },
      ]);
      (prisma.healthRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'health-1',
          itemName: '疫苗',
          images: ['/uploads/health.jpg'],
          date: new Date('2026-05-10T12:00:00Z'),
        },
      ]);
      (prisma.growthDiaryEntry.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'diary-1',
          title: '第一次游泳',
          photos: ['/uploads/diary.jpg'],
          videos: [],
          createdAt: new Date('2026-06-01T12:00:00Z'),
        },
      ]);

      const album = await AlbumService.getPetAlbum('pet-1', 'user-1');

      expect(album.petId).toBe('pet-1');
      expect(album.groups[0].month).toBe('2026-06');
      expect(album.groups[0].items.map((item) => item.type)).toEqual(
        expect.arrayContaining(['moment', 'diary', 'milestone']),
      );
      expect(album.groups[1].month).toBe('2026-05');
      expect(album.groups[1].items[0].type).toBe('health');
      const momentItem = album.groups[0].items.find((item) => item.id === 'moment-1');
      expect(momentItem?.imageUrls).toEqual(['/uploads/moment.jpg']);
      expect(momentItem?.videoUrls).toEqual(['/uploads/moment-video.mp4']);
    });

    it('should include video-only moments in the album timeline', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue({ ...mockPet, birthday: null });
      (prisma.moment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'moment-video',
          content: '第一次会翻滚',
          images: [],
          videos: ['/uploads/rollover.mp4'],
          createdAt: new Date('2026-06-21T12:00:00Z'),
        },
      ]);
      (prisma.healthRecord.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.growthDiaryEntry.findMany as jest.Mock).mockResolvedValue([]);

      const album = await AlbumService.getPetAlbum('pet-1', 'user-1');

      expect(album.groups).toHaveLength(1);
      expect(album.groups[0].items[0]).toMatchObject({
        id: 'moment-video',
        type: 'moment',
        title: '日常碎片',
        imageUrls: [],
        videoUrls: ['/uploads/rollover.mp4'],
      });
    });

    it('should throw when pet does not exist', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(AlbumService.getPetAlbum('missing', 'user-1')).rejects.toThrow('宠物不存在');
    });

    it('should throw when user does not own the pet', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue({
        ...mockPet,
        userId: 'other-user',
      });

      await expect(AlbumService.getPetAlbum('pet-1', 'user-1')).rejects.toThrow('无权访问该宠物');
    });
  });
});
