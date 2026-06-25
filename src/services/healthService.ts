import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { HealthRecord, WeightRecord } from '@prisma/client';
import type { HealthRecordDTO, WeightRecordDTO } from '../types';
import { HealthRecordType } from '@prisma/client';
import { ReminderService } from './reminderService';

/**
 * HealthService — health records, weight records, and related business logic.
 */
export class HealthService {
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
}
