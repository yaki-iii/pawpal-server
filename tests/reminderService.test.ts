import { ReminderService } from '../src/services/reminderService';
import { prisma } from '../src/config/database';
import { ReminderType, ReminderStatus } from '@prisma/client';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    reminder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
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

// Mock NotificationService
jest.mock('../src/services/notificationService', () => ({
  NotificationService: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

const mockReminder = {
  id: 'reminder-1',
  petId: 'pet-1',
  type: ReminderType.VACCINE,
  nextDate: new Date('2027-06-01'),
  cycleDays: 365,
  status: ReminderStatus.PENDING,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
};

describe('ReminderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateNextDate', () => {
    it('should add cycle days to the last date', () => {
      const lastDate = new Date('2026-06-01');
      const nextDate = ReminderService.calculateNextDate(lastDate, 365);
      expect(nextDate.getFullYear()).toBe(2027);
      expect(nextDate.getMonth()).toBe(5); // June (0-indexed)
      expect(nextDate.getDate()).toBe(1);
    });

    it('should handle 90-day cycle (DEWORMING)', () => {
      const lastDate = new Date('2026-06-01');
      const nextDate = ReminderService.calculateNextDate(lastDate, 90);
      // 90 days from June 1 = August 30
      expect(nextDate.getMonth()).toBe(7); // August
    });

    it('should handle month boundary correctly', () => {
      const lastDate = new Date('2026-01-31');
      const nextDate = ReminderService.calculateNextDate(lastDate, 30);
      // Jan 31 + 30 days = March 2
      expect(nextDate.getMonth()).toBe(2); // March
      expect(nextDate.getDate()).toBe(2);
    });
  });

  describe('generateFromHealthRecord', () => {
    it('should create a new reminder when none exists', async () => {
      (prisma.reminder.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.reminder.create as jest.Mock).mockResolvedValue(mockReminder);

      const result = await ReminderService.generateFromHealthRecord(
        'pet-1',
        ReminderType.VACCINE,
        new Date('2026-06-01'),
      );

      expect(result).toBeDefined();
      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          petId: 'pet-1',
          type: ReminderType.VACCINE,
          cycleDays: 365,
          status: ReminderStatus.PENDING,
        }),
      });
    });

    it('should use 365 days for VACCINE', async () => {
      (prisma.reminder.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.reminder.create as jest.Mock).mockResolvedValue(mockReminder);

      await ReminderService.generateFromHealthRecord('pet-1', ReminderType.VACCINE, new Date('2026-06-01'));

      const createData = (prisma.reminder.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.cycleDays).toBe(365);
    });

    it('should use 90 days for DEWORMING', async () => {
      (prisma.reminder.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.reminder.create as jest.Mock).mockResolvedValue({
        ...mockReminder,
        type: ReminderType.DEWORMING,
        cycleDays: 90,
      });

      await ReminderService.generateFromHealthRecord('pet-1', ReminderType.DEWORMING, new Date('2026-06-01'));

      const createData = (prisma.reminder.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.cycleDays).toBe(90);
    });

    it('should use 365 days for CHECKUP', async () => {
      (prisma.reminder.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.reminder.create as jest.Mock).mockResolvedValue({
        ...mockReminder,
        type: ReminderType.CHECKUP,
        cycleDays: 365,
      });

      await ReminderService.generateFromHealthRecord('pet-1', ReminderType.CHECKUP, new Date('2026-06-01'));

      const createData = (prisma.reminder.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.cycleDays).toBe(365);
    });

    it('should update existing pending reminder (upsert behavior)', async () => {
      const existing = { ...mockReminder, id: 'existing-reminder' };
      (prisma.reminder.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.reminder.update as jest.Mock).mockResolvedValue(mockReminder);

      const result = await ReminderService.generateFromHealthRecord(
        'pet-1',
        ReminderType.VACCINE,
        new Date('2026-06-01'),
      );

      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'existing-reminder' },
        data: expect.objectContaining({
          status: ReminderStatus.PENDING,
        }),
      });
      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });
  });

  describe('listByPet', () => {
    it('should list reminders for a pet, ordered by nextDate asc', async () => {
      (prisma.reminder.findMany as jest.Mock).mockResolvedValue([mockReminder]);

      const reminders = await ReminderService.listByPet('pet-1');

      expect(reminders).toHaveLength(1);
      expect(prisma.reminder.findMany).toHaveBeenCalledWith({
        where: { petId: 'pet-1' },
        orderBy: { nextDate: 'asc' },
      });
    });
  });

  describe('listByUser', () => {
    it('should list reminders across all user pets, with pet info', async () => {
      (prisma.reminder.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockReminder,
          pet: { id: 'pet-1', name: '煤球', species: 'DOG', breed: '柯基' },
        },
      ]);

      const reminders = await ReminderService.listByUser('user-1');

      expect(reminders).toHaveLength(1);
      expect(reminders[0].pet).toBeDefined();
      expect(reminders[0].pet?.name).toBe('煤球');
    });
  });

  describe('markDone', () => {
    it('should mark reminder as DONE and generate next reminder', async () => {
      (prisma.reminder.findUnique as jest.Mock).mockResolvedValue(mockReminder);
      (prisma.reminder.update as jest.Mock).mockResolvedValue({ ...mockReminder, status: ReminderStatus.DONE });
      (prisma.reminder.create as jest.Mock).mockResolvedValue({});

      const result = await ReminderService.markDone('reminder-1');

      expect(result.status).toBe(ReminderStatus.DONE);

      // Should create next reminder
      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          petId: 'pet-1',
          type: ReminderType.VACCINE,
          status: ReminderStatus.PENDING,
        }),
      });
    });

    it('should throw error if reminder does not exist', async () => {
      (prisma.reminder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(ReminderService.markDone('nonexistent')).rejects.toThrow('提醒不存在');
    });
  });

  describe('processDueReminders', () => {
    it('should mark overdue reminders and send notifications', async () => {
      const overdueReminder = {
        ...mockReminder,
        nextDate: new Date('2020-01-01'), // Past date
        pet: { userId: 'user-1', name: '煤球' },
      };
      (prisma.reminder.findMany as jest.Mock)
        .mockResolvedValueOnce([overdueReminder]) // First call: overdue
        .mockResolvedValueOnce([]); // Second call: upcoming (empty)

      await ReminderService.processDueReminders();

      // Should update status to OVERDUE
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { status: ReminderStatus.OVERDUE },
      });

      // Should send notification
      const { NotificationService } = require('../src/services/notificationService');
      expect(NotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REMINDER',
          content: expect.stringContaining('已过期'),
        }),
      );
    });

    it('should send notifications for reminders due within 7 days', async () => {
      const upcomingReminder = {
        ...mockReminder,
        id: 'reminder-2',
        nextDate: new Date(Date.now() + 3 * 86400000), // 3 days from now
        pet: { userId: 'user-1', name: '煤球' },
      };
      (prisma.reminder.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // First call: overdue (empty)
        .mockResolvedValueOnce([upcomingReminder]); // Second call: upcoming

      await ReminderService.processDueReminders();

      // Should update status to NOTIFIED
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-2' },
        data: { status: ReminderStatus.NOTIFIED },
      });

      // Should send notification
      const { NotificationService } = require('../src/services/notificationService');
      expect(NotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REMINDER',
          content: expect.stringContaining('到期'),
        }),
      );
    });
  });

  describe('toDTO', () => {
    it('should convert to DTO with ISO date strings', () => {
      const dto = ReminderService.toDTO(mockReminder);

      expect(dto.id).toBe('reminder-1');
      expect(dto.type).toBe(ReminderType.VACCINE);
      expect(dto.status).toBe(ReminderStatus.PENDING);
      expect(dto.nextDate).toBe('2027-06-01T00:00:00.000Z');
      expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });
});
