import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { Reminder } from '@prisma/client';
import type { ReminderDTO } from '../types';
import { ReminderType, ReminderStatus } from '@prisma/client';
import { NotificationService } from './notificationService';

// Default reminder cycles (in days)
const DEFAULT_CYCLES: Record<ReminderType, number> = {
  [ReminderType.VACCINE]: 365,
  [ReminderType.DEWORMING]: 90,
  [ReminderType.CHECKUP]: 365,
};

/**
 * ReminderService — calculates and manages health reminders.
 * Generates reminders from health records, checks due dates, sends notifications.
 */
export class ReminderService {
  /**
   * Calculate the next reminder date given a last date and cycle days.
   */
  static calculateNextDate(lastDate: Date, cycleDays: number): Date {
    const next = new Date(lastDate);
    next.setDate(next.getDate() + cycleDays);
    return next;
  }

  /**
   * Generate a reminder from a health record.
   * Creates or updates the reminder for the given pet + type.
   */
  static async generateFromHealthRecord(
    petId: string,
    type: ReminderType,
    lastDate: Date,
  ): Promise<ReminderDTO | null> {
    const cycleDays = DEFAULT_CYCLES[type] || 365;
    const nextDate = ReminderService.calculateNextDate(lastDate, cycleDays);

    // Upsert: if a pending reminder exists for this pet+type, update it
    const existing = await prisma.reminder.findFirst({
      where: { petId, type, status: { in: [ReminderStatus.PENDING, ReminderStatus.NOTIFIED] } },
    });

    if (existing) {
      const updated = await prisma.reminder.update({
        where: { id: existing.id },
        data: { nextDate, cycleDays, status: ReminderStatus.PENDING },
      });
      logger.info(`Reminder updated: pet=${petId}, type=${type}, nextDate=${nextDate.toISOString()}`);
      return ReminderService.toDTO(updated);
    }

    const reminder = await prisma.reminder.create({
      data: {
        petId,
        type,
        nextDate,
        cycleDays,
        status: ReminderStatus.PENDING,
      },
    });

    logger.info(`Reminder created: pet=${petId}, type=${type}, nextDate=${nextDate.toISOString()}`);
    return ReminderService.toDTO(reminder);
  }

  /**
   * List all reminders for a pet.
   */
  static async listByPet(petId: string): Promise<ReminderDTO[]> {
    const reminders = await prisma.reminder.findMany({
      where: { petId },
      orderBy: { nextDate: 'asc' },
    });
    return reminders.map(ReminderService.toDTO);
  }

  /**
   * List all reminders for a user (across all their pets).
   * Includes pet info for display.
   */
  static async listByUser(userId: string): Promise<Array<ReminderDTO & { pet?: { id: string; name: string; species: string; breed: string } }>> {
    const reminders = await prisma.reminder.findMany({
      where: { pet: { userId } },
      include: {
        pet: {
          select: { id: true, name: true, species: true, breed: true },
        },
      },
      orderBy: { nextDate: 'asc' },
    });

    return reminders.map((r) => ({
      ...ReminderService.toDTO(r),
      pet: r.pet ? {
        id: r.pet.id,
        name: r.pet.name,
        species: r.pet.species,
        breed: r.pet.breed,
      } : undefined,
    }));
  }

  /**
   * Mark a reminder as done and generate the next one.
   */
  static async markDone(reminderId: string): Promise<ReminderDTO> {
    const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!reminder) {
      throw new Error('提醒不存在');
    }

    const updated = await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: ReminderStatus.DONE },
    });

    // Generate the next reminder
    const nextDate = ReminderService.calculateNextDate(reminder.nextDate, reminder.cycleDays);
    await prisma.reminder.create({
      data: {
        petId: reminder.petId,
        type: reminder.type,
        nextDate,
        cycleDays: reminder.cycleDays,
        status: ReminderStatus.PENDING,
      },
    });

    logger.info(`Reminder marked done: ${reminderId}, next reminder scheduled for ${nextDate.toISOString()}`);
    return ReminderService.toDTO(updated);
  }

  /**
   * Update the cycle days for a reminder.
   */
  static async updateCycle(reminderId: string, cycleDays: number): Promise<ReminderDTO> {
    const reminder = await prisma.reminder.update({
      where: { id: reminderId },
      data: { cycleDays },
    });
    return ReminderService.toDTO(reminder);
  }

  /**
   * Process all due reminders — mark overdue and send notifications.
   * Called by the cron scheduler.
   */
  static async processDueReminders(): Promise<void> {
    const now = new Date();

    // Find reminders that are overdue (past due date, still pending/notified)
    const overdueReminders = await prisma.reminder.findMany({
      where: {
        status: { in: [ReminderStatus.PENDING, ReminderStatus.NOTIFIED] },
        nextDate: { lt: now },
      },
      include: {
        pet: {
          select: { userId: true, name: true },
        },
      },
    });

    for (const reminder of overdueReminders) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.OVERDUE },
      });

      if (reminder.pet) {
        const typeName: Record<ReminderType, string> = {
          [ReminderType.VACCINE]: '疫苗',
          [ReminderType.DEWORMING]: '驱虫',
          [ReminderType.CHECKUP]: '体检',
        };
        await NotificationService.create({
          userId: reminder.pet.userId,
          type: 'REMINDER',
          content: `${reminder.pet.name}的${typeName[reminder.type]}已过期，请尽快安排！`,
          linkUrl: `/pets?reminder=${reminder.id}`,
        });
      }
    }

    if (overdueReminders.length > 0) {
      logger.info(`Processed ${overdueReminders.length} overdue reminders`);
    }

    // Find reminders due within 7 days — send notification
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const upcomingReminders = await prisma.reminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        nextDate: { gte: now, lte: sevenDaysLater },
      },
      include: {
        pet: {
          select: { userId: true, name: true },
        },
      },
    });

    for (const reminder of upcomingReminders) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.NOTIFIED },
      });

      if (reminder.pet) {
        const typeName: Record<ReminderType, string> = {
          [ReminderType.VACCINE]: '疫苗',
          [ReminderType.DEWORMING]: '驱虫',
          [ReminderType.CHECKUP]: '体检',
        };
        const daysLeft = Math.ceil((reminder.nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        await NotificationService.create({
          userId: reminder.pet.userId,
          type: 'REMINDER',
          content: `${reminder.pet.name}的${typeName[reminder.type]}将在${daysLeft}天后到期，请提前安排。`,
          linkUrl: `/pets?reminder=${reminder.id}`,
        });
      }
    }

    if (upcomingReminders.length > 0) {
      logger.info(`Sent notifications for ${upcomingReminders.length} upcoming reminders`);
    }
  }

  /**
   * Convert a Prisma Reminder to a ReminderDTO.
   */
  static toDTO(reminder: Reminder): ReminderDTO {
    return {
      id: reminder.id,
      petId: reminder.petId,
      type: reminder.type,
      nextDate: reminder.nextDate.toISOString(),
      cycleDays: reminder.cycleDays,
      status: reminder.status,
      createdAt: reminder.createdAt.toISOString(),
      updatedAt: reminder.updatedAt.toISOString(),
    };
  }
}
