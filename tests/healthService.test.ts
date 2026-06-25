import { HealthService } from '../src/services/healthService';
import { prisma } from '../src/config/database';
import { HealthRecordType } from '@prisma/client';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    healthRecord: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    weightRecord: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    pet: {
      update: jest.fn(),
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

// Mock ReminderService
jest.mock('../src/services/reminderService', () => ({
  ReminderService: {
    generateFromHealthRecord: jest.fn().mockResolvedValue(null),
    calculateNextDate: jest.fn(),
    toDTO: jest.fn(),
  },
}));

import { ReminderService } from '../src/services/reminderService';

const mockHealthRecord = {
  id: 'record-1',
  petId: 'pet-1',
  type: HealthRecordType.VACCINE,
  date: new Date('2026-06-01'),
  itemName: '狂犬疫苗',
  notes: '第一针',
  images: ['/uploads/vaccine1.jpg'],
  createdAt: new Date('2026-06-01'),
};

const mockWeightRecord = {
  id: 'weight-1',
  petId: 'pet-1',
  weight: 12.5,
  date: new Date('2026-06-01'),
  createdAt: new Date('2026-06-01'),
};

describe('HealthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listHealthRecords', () => {
    it('should list all health records for a pet, ordered by date desc', async () => {
      (prisma.healthRecord.findMany as jest.Mock).mockResolvedValue([mockHealthRecord]);

      const records = await HealthService.listHealthRecords('pet-1');

      expect(records).toHaveLength(1);
      expect(records[0].itemName).toBe('狂犬疫苗');
      expect(prisma.healthRecord.findMany).toHaveBeenCalledWith({
        where: { petId: 'pet-1' },
        orderBy: { date: 'desc' },
      });
    });

    it('should filter by type when provided', async () => {
      (prisma.healthRecord.findMany as jest.Mock).mockResolvedValue([]);

      await HealthService.listHealthRecords('pet-1', 'VACCINE');

      expect(prisma.healthRecord.findMany).toHaveBeenCalledWith({
        where: { petId: 'pet-1', type: 'VACCINE' },
        orderBy: { date: 'desc' },
      });
    });

    it('should return DTOs with ISO date strings', async () => {
      (prisma.healthRecord.findMany as jest.Mock).mockResolvedValue([mockHealthRecord]);

      const records = await HealthService.listHealthRecords('pet-1');
      expect(typeof records[0].date).toBe('string');
      expect(records[0].date).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  describe('createHealthRecord', () => {
    it('should create a new health record', async () => {
      (prisma.healthRecord.create as jest.Mock).mockResolvedValue(mockHealthRecord);

      const record = await HealthService.createHealthRecord('pet-1', {
        type: HealthRecordType.VACCINE,
        date: '2026-06-01',
        itemName: '狂犬疫苗',
        notes: '第一针',
        images: ['/uploads/vaccine1.jpg'],
      });

      expect(record.itemName).toBe('狂犬疫苗');
      expect(prisma.healthRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          petId: 'pet-1',
          type: HealthRecordType.VACCINE,
          date: new Date('2026-06-01'),
          itemName: '狂犬疫苗',
        }),
      });
    });

    it('should auto-generate reminder for VACCINE type', async () => {
      (prisma.healthRecord.create as jest.Mock).mockResolvedValue(mockHealthRecord);

      await HealthService.createHealthRecord('pet-1', {
        type: HealthRecordType.VACCINE,
        date: '2026-06-01',
        itemName: '狂犬疫苗',
        notes: '',
        images: [],
      });

      expect(ReminderService.generateFromHealthRecord).toHaveBeenCalledWith(
        'pet-1',
        HealthRecordType.VACCINE,
        new Date('2026-06-01'),
      );
    });

    it('should auto-generate reminder for DEWORMING type', async () => {
      (prisma.healthRecord.create as jest.Mock).mockResolvedValue({
        ...mockHealthRecord,
        type: HealthRecordType.DEWORMING,
      });

      await HealthService.createHealthRecord('pet-1', {
        type: HealthRecordType.DEWORMING,
        date: '2026-06-01',
        itemName: '体内驱虫',
        notes: '',
        images: [],
      });

      expect(ReminderService.generateFromHealthRecord).toHaveBeenCalledWith(
        'pet-1',
        HealthRecordType.DEWORMING,
        new Date('2026-06-01'),
      );
    });

    it('should auto-generate reminder for CHECKUP type', async () => {
      (prisma.healthRecord.create as jest.Mock).mockResolvedValue({
        ...mockHealthRecord,
        type: HealthRecordType.CHECKUP,
      });

      await HealthService.createHealthRecord('pet-1', {
        type: HealthRecordType.CHECKUP,
        date: '2026-06-01',
        itemName: '年度体检',
        notes: '',
        images: [],
      });

      expect(ReminderService.generateFromHealthRecord).toHaveBeenCalledWith(
        'pet-1',
        HealthRecordType.CHECKUP,
        new Date('2026-06-01'),
      );
    });

    it('should NOT auto-generate reminder for VISIT type', async () => {
      (prisma.healthRecord.create as jest.Mock).mockResolvedValue({
        ...mockHealthRecord,
        type: HealthRecordType.VISIT,
      });

      await HealthService.createHealthRecord('pet-1', {
        type: HealthRecordType.VISIT,
        date: '2026-06-01',
        itemName: '就诊',
        notes: '',
        images: [],
      });

      expect(ReminderService.generateFromHealthRecord).not.toHaveBeenCalled();
    });

    it('should not throw if reminder generation fails (graceful degradation)', async () => {
      (prisma.healthRecord.create as jest.Mock).mockResolvedValue(mockHealthRecord);
      (ReminderService.generateFromHealthRecord as jest.Mock).mockRejectedValue(new Error('DB error'));

      const record = await HealthService.createHealthRecord('pet-1', {
        type: HealthRecordType.VACCINE,
        date: '2026-06-01',
        itemName: '狂犬疫苗',
        notes: '',
        images: [],
      });

      // Should still return the record even if reminder fails
      expect(record).toBeDefined();
      expect(record.itemName).toBe('狂犬疫苗');
    });
  });

  describe('updateHealthRecord', () => {
    it('should update specified fields', async () => {
      const updated = { ...mockHealthRecord, notes: '更新备注' };
      (prisma.healthRecord.update as jest.Mock).mockResolvedValue(updated);

      const result = await HealthService.updateHealthRecord('pet-1', 'record-1', {
        notes: '更新备注',
      });

      expect(result.notes).toBe('更新备注');
      expect(prisma.healthRecord.update).toHaveBeenCalledWith({
        where: { id: 'record-1' },
        data: { notes: '更新备注' },
      });
    });
  });

  describe('deleteHealthRecord', () => {
    it('should delete a health record by ID', async () => {
      (prisma.healthRecord.delete as jest.Mock).mockResolvedValue(mockHealthRecord);

      await HealthService.deleteHealthRecord('pet-1', 'record-1');

      expect(prisma.healthRecord.delete).toHaveBeenCalledWith({ where: { id: 'record-1' } });
    });
  });

  describe('Weight Records', () => {
    describe('listWeightRecords', () => {
      it('should list weight records ordered by date asc', async () => {
        (prisma.weightRecord.findMany as jest.Mock).mockResolvedValue([mockWeightRecord]);

        const records = await HealthService.listWeightRecords('pet-1');

        expect(records).toHaveLength(1);
        expect(records[0].weight).toBe(12.5);
        expect(prisma.weightRecord.findMany).toHaveBeenCalledWith({
          where: { petId: 'pet-1' },
          orderBy: { date: 'asc' },
        });
      });
    });

    describe('createWeightRecord', () => {
      it('should create a weight record and update pet weight', async () => {
        (prisma.weightRecord.create as jest.Mock).mockResolvedValue(mockWeightRecord);
        (prisma.pet.update as jest.Mock).mockResolvedValue({});

        const result = await HealthService.createWeightRecord('pet-1', 12.5, '2026-06-01');

        expect(result.weight).toBe(12.5);

        // Verify weight record was created
        expect(prisma.weightRecord.create).toHaveBeenCalledWith({
          data: {
            petId: 'pet-1',
            weight: 12.5,
            date: new Date('2026-06-01'),
          },
        });

        // Verify pet's current weight was updated
        expect(prisma.pet.update).toHaveBeenCalledWith({
          where: { id: 'pet-1' },
          data: { weight: 12.5 },
        });
      });
    });

    describe('deleteWeightRecord', () => {
      it('should delete a weight record', async () => {
        (prisma.weightRecord.delete as jest.Mock).mockResolvedValue({});

        await HealthService.deleteWeightRecord('pet-1', 'weight-1');

        expect(prisma.weightRecord.delete).toHaveBeenCalledWith({ where: { id: 'weight-1' } });
      });
    });
  });

  describe('toHealthRecordDTO', () => {
    it('should convert to DTO with ISO date strings', () => {
      const dto = HealthService.toHealthRecordDTO(mockHealthRecord);
      expect(dto.id).toBe('record-1');
      expect(dto.date).toBe('2026-06-01T00:00:00.000Z');
      expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
      expect(dto.images).toEqual(['/uploads/vaccine1.jpg']);
    });
  });

  describe('toWeightRecordDTO', () => {
    it('should convert to DTO with ISO date strings', () => {
      const dto = HealthService.toWeightRecordDTO(mockWeightRecord);
      expect(dto.id).toBe('weight-1');
      expect(dto.weight).toBe(12.5);
      expect(dto.date).toBe('2026-06-01T00:00:00.000Z');
    });
  });
});
