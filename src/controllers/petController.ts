import type { Request, Response } from 'express';
import { PetService } from '../services/petService';
import { sendSuccess, sendError } from '../middleware/error';
import { logger } from '../utils/logger';

/**
 * PetController — handles pet profile CRUD operations.
 */
export class PetController {
  /**
   * GET /pets
   * List all pets for the current user.
   */
  static async list(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const pets = await PetService.listByUser(req.userId);
      sendSuccess(res, pets);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /pets/:id
   * Get a single pet by ID.
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const pet = await PetService.getById(req.params.id, req.userId);
      sendSuccess(res, pet);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }

  /**
   * POST /pets
   * Create a new pet profile.
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const pet = await PetService.create(req.userId, req.body);
      sendSuccess(res, pet, '创建成功', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '创建失败');
    }
  }

  /**
   * PUT /pets/:id
   * Update an existing pet profile.
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const pet = await PetService.update(req.params.id, req.userId, req.body);
      sendSuccess(res, pet, '更新成功');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message || '更新失败');
      }
    }
  }

  /**
   * DELETE /pets/:id
   * Delete a pet profile.
   */
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await PetService.delete(req.params.id, req.userId);
      sendSuccess(res, null, '删除成功');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message || '删除失败');
      }
    }
  }
}
