import { PetService } from '../src/services/petService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    pet: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../src/config', () => ({
  config: {
    encryption: { key: 'test-encryption-key-32bytes-ok!!!' },
  },
}));

// Mock logger
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
  name: '煤球',
  species: 'DOG',
  breed: '柯基',
  gender: 'MALE',
  birthday: new Date('2023-06-15'),
  weight: 12.5,
  photo: '/uploads/pet1.jpg',
  neutered: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listByUser', () => {
    it('should return all pets for a user, ordered by creation time', async () => {
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([mockPet]);

      const pets = await PetService.listByUser('user-1');

      expect(pets).toHaveLength(1);
      expect(pets[0].name).toBe('煤球');
      expect(prisma.pet.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return empty array if user has no pets', async () => {
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([]);

      const pets = await PetService.listByUser('user-1');
      expect(pets).toEqual([]);
    });

    it('should return DTOs with ISO date strings', async () => {
      (prisma.pet.findMany as jest.Mock).mockResolvedValue([mockPet]);

      const pets = await PetService.listByUser('user-1');
      expect(typeof pets[0].createdAt).toBe('string');
      expect(typeof pets[0].birthday).toBe('string');
    });
  });

  describe('getById', () => {
    it('should return pet when user is the owner', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);

      const pet = await PetService.getById('pet-1', 'user-1');

      expect(pet.id).toBe('pet-1');
      expect(pet.name).toBe('煤球');
    });

    it('should throw error if pet does not exist', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(PetService.getById('nonexistent', 'user-1')).rejects.toThrow('宠物不存在');
    });

    it('should throw error if user is not the owner', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);

      await expect(PetService.getById('pet-1', 'other-user')).rejects.toThrow('无权访问该宠物');
    });
  });

  describe('create', () => {
    it('should create a new pet with all fields', async () => {
      (prisma.pet.create as jest.Mock).mockResolvedValue(mockPet);

      const pet = await PetService.create('user-1', {
        name: '煤球',
        species: 'DOG' as never,
        breed: '柯基',
        gender: 'MALE' as never,
        birthday: '2023-06-15',
        weight: 12.5,
        photo: '/uploads/pet1.jpg',
        neutered: true,
      });

      expect(pet.name).toBe('煤球');
      expect(prisma.pet.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          name: '煤球',
          species: 'DOG',
          breed: '柯基',
          gender: 'MALE',
          birthday: new Date('2023-06-15'),
          weight: 12.5,
          neutered: true,
        }),
      });
    });

    it('should handle missing birthday (set to null)', async () => {
      (prisma.pet.create as jest.Mock).mockResolvedValue({
        ...mockPet,
        birthday: null,
      });

      await PetService.create('user-1', {
        name: '煤球',
        species: 'DOG' as never,
        breed: '柯基',
        gender: 'MALE' as never,
        weight: 12.5,
        neutered: true,
      });

      expect(prisma.pet.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          birthday: null,
          photo: '',
        }),
      });
    });
  });

  describe('update', () => {
    it('should update pet fields when user is owner', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);
      const updatedPet = { ...mockPet, name: '新名字', weight: 13.0 };
      (prisma.pet.update as jest.Mock).mockResolvedValue(updatedPet);

      const result = await PetService.update('pet-1', 'user-1', {
        name: '新名字',
        weight: 13.0,
      });

      expect(result.name).toBe('新名字');
      expect(result.weight).toBe(13.0);
    });

    it('should throw error if pet does not exist', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        PetService.update('nonexistent', 'user-1', { name: '新名字' }),
      ).rejects.toThrow('宠物不存在');
    });

    it('should throw error if user is not the owner', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);

      await expect(
        PetService.update('pet-1', 'other-user', { name: '新名字' }),
      ).rejects.toThrow('无权修改该宠物');
    });

    it('should only update provided fields (partial update)', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);
      (prisma.pet.update as jest.Mock).mockResolvedValue(mockPet);

      await PetService.update('pet-1', 'user-1', { weight: 15.0 });

      const updateData = (prisma.pet.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData).toEqual({ weight: 15.0 });
      expect(updateData).not.toHaveProperty('name');
    });
  });

  describe('delete', () => {
    it('should delete pet when user is owner', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);
      (prisma.pet.delete as jest.Mock).mockResolvedValue(mockPet);

      await PetService.delete('pet-1', 'user-1');

      expect(prisma.pet.delete).toHaveBeenCalledWith({ where: { id: 'pet-1' } });
    });

    it('should throw error if pet does not exist', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(PetService.delete('nonexistent', 'user-1')).rejects.toThrow('宠物不存在');
    });

    it('should throw error if user is not the owner', async () => {
      (prisma.pet.findUnique as jest.Mock).mockResolvedValue(mockPet);

      await expect(PetService.delete('pet-1', 'other-user')).rejects.toThrow('无权删除该宠物');
    });
  });

  describe('toDTO', () => {
    it('should convert Prisma Pet to PetDTO with ISO strings', () => {
      const dto = PetService.toDTO(mockPet);

      expect(dto.id).toBe('pet-1');
      expect(dto.name).toBe('煤球');
      expect(dto.birthday).toBe('2023-06-15T00:00:00.000Z');
      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.weight).toBe(12.5);
      expect(dto.neutered).toBe(true);
    });

    it('should handle null birthday', () => {
      const petWithNullBirthday = { ...mockPet, birthday: null };
      const dto = PetService.toDTO(petWithNullBirthday);
      expect(dto.birthday).toBeNull();
    });
  });
});
