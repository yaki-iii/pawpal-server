import { GrowthDiaryService } from '../src/services/growthDiaryService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    pet: { findUnique: jest.fn() },
    growthDiaryEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockPet = {
  id: 'pet-1',
  userId: 'user-1',
  name: '奶盖',
};

describe('GrowthDiaryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEntry', () => {
    it('should preserve cloud upload URLs from file.path', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);
      (prisma.growthDiaryEntry.create as jest.Mock).mockResolvedValue({
        id: 'entry-1',
        petId: 'pet-1',
        userId: 'user-1',
        title: '相册照片',
        content: '手动上传到相册',
        mood: '',
        photos: ['https://cdn.example.com/uploads/pet-photo.jpg'],
        videos: [],
        createdAt: new Date('2026-06-28T08:00:00Z'),
      });

      const entry = await GrowthDiaryService.createEntry(
        'pet-1',
        'user-1',
        { title: '相册照片', content: '手动上传到相册', mood: '' },
        [
          {
            fieldname: 'media',
            originalname: 'pet-photo.jpg',
            encoding: '7bit',
            mimetype: 'image/jpeg',
            size: 1024,
            filename: 'pet-photo.jpg',
            path: 'https://cdn.example.com/uploads/pet-photo.jpg',
          } as Express.Multer.File,
        ],
      );

      expect(entry.photos).toEqual(['https://cdn.example.com/uploads/pet-photo.jpg']);
      expect(prisma.growthDiaryEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          photos: ['https://cdn.example.com/uploads/pet-photo.jpg'],
          videos: [],
        }),
      });
    });
  });
});
