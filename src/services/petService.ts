import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { Pet, Prisma } from '@prisma/client';
import type { PetDTO } from '../types';
import { PetSpecies, PetGender } from '@prisma/client';

/**
 * PetService — pet profile CRUD and business logic.
 */
export class PetService {
  /**
   * List all pets belonging to a user.
   */
  static async listByUser(userId: string): Promise<PetDTO[]> {
    const pets = await prisma.pet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return pets.map(PetService.toDTO);
  }

  /**
   * Get a single pet by ID.
   * Verifies ownership.
   */
  static async getById(petId: string, userId: string): Promise<PetDTO> {
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) {
      throw new Error('宠物不存在');
    }
    if (pet.userId !== userId) {
      throw new Error('无权访问该宠物');
    }
    return PetService.toDTO(pet);
  }

  /**
   * Create a new pet profile.
   */
  static async create(
    userId: string,
    data: {
      name: string;
      species: PetSpecies;
      breed: string;
      gender: PetGender;
      birthday?: string;
      weight: number;
      photo?: string;
      neutered: boolean;
    },
  ): Promise<PetDTO> {
    const pet = await prisma.pet.create({
      data: {
        userId,
        name: data.name,
        species: data.species,
        breed: data.breed,
        gender: data.gender,
        birthday: data.birthday ? new Date(data.birthday) : null,
        weight: data.weight,
        photo: data.photo || '',
        neutered: data.neutered,
      },
    });

    logger.info(`Pet created: ${pet.name} for user ${userId}`);
    return PetService.toDTO(pet);
  }

  /**
   * Update an existing pet profile.
   * Verifies ownership.
   */
  static async update(
    petId: string,
    userId: string,
    data: Partial<{
      name: string;
      species: PetSpecies;
      breed: string;
      gender: PetGender;
      birthday: string;
      weight: number;
      photo: string;
      neutered: boolean;
    }>,
  ): Promise<PetDTO> {
    const existing = await prisma.pet.findUnique({ where: { id: petId } });
    if (!existing) {
      throw new Error('宠物不存在');
    }
    if (existing.userId !== userId) {
      throw new Error('无权修改该宠物');
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.species !== undefined) updateData.species = data.species;
    if (data.breed !== undefined) updateData.breed = data.breed;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.birthday !== undefined) updateData.birthday = data.birthday ? new Date(data.birthday) : null;
    if (data.weight !== undefined) updateData.weight = data.weight;
    if (data.photo !== undefined) updateData.photo = data.photo;
    if (data.neutered !== undefined) updateData.neutered = data.neutered;

    const pet = await prisma.pet.update({
      where: { id: petId },
      data: updateData,
    });

    logger.info(`Pet updated: ${pet.name}`);
    return PetService.toDTO(pet);
  }

  /**
   * Delete a pet profile (cascade deletes related records).
   * Verifies ownership.
   */
  static async delete(petId: string, userId: string): Promise<void> {
    const existing = await prisma.pet.findUnique({ where: { id: petId } });
    if (!existing) {
      throw new Error('宠物不存在');
    }
    if (existing.userId !== userId) {
      throw new Error('无权删除该宠物');
    }

    await prisma.pet.delete({ where: { id: petId } });
    logger.info(`Pet deleted: ${existing.name}`);
  }

  /**
   * Convert a Prisma Pet to a PetDTO.
   */
  static toDTO(pet: Pet): PetDTO {
    return {
      id: pet.id,
      userId: pet.userId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      gender: pet.gender,
      birthday: pet.birthday ? pet.birthday.toISOString() : null,
      weight: pet.weight,
      photo: pet.photo,
      neutered: pet.neutered,
      createdAt: pet.createdAt.toISOString(),
      updatedAt: pet.updatedAt.toISOString(),
    };
  }
}
