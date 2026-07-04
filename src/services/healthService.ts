import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { HealthRecord, WeightRecord } from '@prisma/client';
import type { HealthRecordDTO, PetHealthReportDTO, WeightRecordDTO } from '../types';
import { HealthRecordType, ReminderStatus } from '@prisma/client';
import { ReminderService } from './reminderService';
import { PetService } from './petService';

/**
 * HealthService — health records, weight records, and related business logic.
 */
export class HealthService {
  static async getHealthReport(petId: string, userId: string): Promise<PetHealthReportDTO> {
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new Error('宠物不存在');
    }
    if (pet.userId !== userId) {
      throw new Error('无权访问该宠物');
    }

    const [healthRecords, weightRecords, reminders] = await Promise.all([
      prisma.healthRecord.findMany({
        where: { petId },
        orderBy: { date: 'desc' },
      }),
      prisma.weightRecord.findMany({
        where: { petId },
        orderBy: { date: 'asc' },
        take: 12,
      }),
      prisma.reminder.findMany({
        where: {
          petId,
          status: { in: [ReminderStatus.PENDING, ReminderStatus.NOTIFIED, ReminderStatus.OVERDUE] },
        },
        orderBy: { nextDate: 'asc' },
        take: 5,
      }),
    ]);

    const latestWeight = weightRecords.length > 0 ? weightRecords[weightRecords.length - 1].weight : null;
    const previousWeight = weightRecords.length > 1 ? weightRecords[weightRecords.length - 2].weight : null;
    const weightChange = latestWeight !== null && previousWeight !== null
      ? Number((latestWeight - previousWeight).toFixed(1))
      : null;

    return {
      pet: PetService.toDTO(pet),
      summary: {
        totalHealthRecords: healthRecords.length,
        latestWeight,
        weightChange,
        pendingReminderCount: reminders.length,
        lastRecordAt: healthRecords[0]?.date.toISOString() ?? null,
      },
      latestRecords: healthRecords.slice(0, 5).map(HealthService.toHealthRecordDTO),
      weightTrend: weightRecords.map(HealthService.toWeightRecordDTO),
      upcomingReminders: reminders.map(ReminderService.toDTO),
      insights: HealthService.buildHealthInsights(healthRecords, latestWeight, weightChange, reminders.length),
    };
  }

  /**
   * List health records for a pet, optionally filtered by type.
   */
  static async listHealthRecords(petId: string, type?: string): Promise<HealthRecordDTO[]> {
    const where: Record<string, unknown> = { petId };
    if (type) where.type = type;

    const records = await prisma.healthRecord.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    return records.map(HealthService.toHealthRecordDTO);
  }

  /**
   * Create a new health record.
   * Also generates a reminder for the next scheduled event.
   */
  static async createHealthRecord(
    petId: string,
    data: {
      type: HealthRecordType;
      date: string;
      itemName: string;
      notes: string;
      images: string[];
    },
  ): Promise<HealthRecordDTO> {
    const record = await prisma.healthRecord.create({
      data: {
        petId,
        type: data.type,
        date: new Date(data.date),
        itemName: data.itemName,
        notes: data.notes,
        images: data.images,
      },
    });

    // Auto-generate reminder for VACCINE, DEWORMING, CHECKUP types
    if (data.type === HealthRecordType.VACCINE || data.type === HealthRecordType.DEWORMING || data.type === HealthRecordType.CHECKUP) {
      try {
        await ReminderService.generateFromHealthRecord(petId, data.type, new Date(data.date));
      } catch (error) {
        logger.warn(`Failed to generate reminder for health record ${record.id}: ${(error as Error).message}`);
      }
    }

    logger.info(`Health record created: ${record.itemName} for pet ${petId}`);
    return HealthService.toHealthRecordDTO(record);
  }

  /**
   * Update a health record.
   */
  static async updateHealthRecord(
    petId: string,
    recordId: string,
    data: Partial<{
      type: HealthRecordType;
      date: string;
      itemName: string;
      notes: string;
      images: string[];
    }>,
  ): Promise<HealthRecordDTO> {
    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.itemName !== undefined) updateData.itemName = data.itemName;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.images !== undefined) updateData.images = data.images;

    const record = await prisma.healthRecord.update({
      where: { id: recordId },
      data: updateData,
    });

    return HealthService.toHealthRecordDTO(record);
  }

  /**
   * Delete a health record.
   */
  static async deleteHealthRecord(petId: string, recordId: string): Promise<void> {
    const record = await prisma.healthRecord.findUnique({ where: { id: recordId } });
    if (!record || record.petId !== petId) {
      throw new Error('健康记录不存在');
    }

    await prisma.healthRecord.delete({ where: { id: recordId } });
    logger.info(`Health record deleted: ${recordId}`);
  }

  // ---- Weight Records ----

  /**
   * List weight records for a pet, ordered by date.
   */
  static async listWeightRecords(petId: string): Promise<WeightRecordDTO[]> {
    const records = await prisma.weightRecord.findMany({
      where: { petId },
      orderBy: { date: 'asc' },
    });
    return records.map(HealthService.toWeightRecordDTO);
  }

  /**
   * Record a new weight measurement.
   * Also updates the pet's current weight field.
   */
  static async createWeightRecord(petId: string, weight: number, date: string): Promise<WeightRecordDTO> {
    const record = await prisma.weightRecord.create({
      data: {
        petId,
        weight,
        date: new Date(date),
      },
    });

    // Update pet's current weight
    await prisma.pet.update({
      where: { id: petId },
      data: { weight },
    });

    logger.info(`Weight record created: ${weight}kg for pet ${petId}`);
    return HealthService.toWeightRecordDTO(record);
  }

  /**
   * Delete a weight record.
   */
  static async deleteWeightRecord(petId: string, recordId: string): Promise<void> {
    const record = await prisma.weightRecord.findUnique({ where: { id: recordId } });
    if (!record || record.petId !== petId) {
      throw new Error('体重记录不存在');
    }

    await prisma.weightRecord.delete({ where: { id: recordId } });
  }

  // ---- DTO Converters ----

  static toHealthRecordDTO(record: HealthRecord): HealthRecordDTO {
    return {
      id: record.id,
      petId: record.petId,
      type: record.type,
      date: record.date.toISOString(),
      itemName: record.itemName,
      notes: record.notes,
      images: record.images,
      createdAt: record.createdAt.toISOString(),
    };
  }

  static toWeightRecordDTO(record: WeightRecord): WeightRecordDTO {
    return {
      id: record.id,
      petId: record.petId,
      weight: record.weight,
      date: record.date.toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }

  private static buildHealthInsights(
    healthRecords: HealthRecord[],
    latestWeight: number | null,
    weightChange: number | null,
    pendingReminderCount: number,
  ): string[] {
    const insights: string[] = [];

    if (healthRecords.length === 0) {
      insights.push('还没有健康记录，可以先补充疫苗、驱虫或体检记录。');
    } else {
      insights.push(`最近一次健康记录是 ${healthRecords[0].itemName}。`);
    }

    if (latestWeight === null) {
      insights.push('还没有体重记录，建议定期记录体重变化。');
    } else if (weightChange === null) {
      insights.push(`当前最近体重为 ${latestWeight}kg。`);
    } else if (weightChange > 0) {
      insights.push(`最近体重较上次增加 ${weightChange}kg。`);
    } else if (weightChange < 0) {
      insights.push(`最近体重较上次减少 ${Math.abs(weightChange)}kg。`);
    } else {
      insights.push('最近两次体重保持稳定。');
    }

    if (pendingReminderCount > 0) {
      insights.push(`有 ${pendingReminderCount} 个健康提醒需要关注。`);
    } else {
      insights.push('当前没有待处理健康提醒。');
    }

    return insights;
  }
}
