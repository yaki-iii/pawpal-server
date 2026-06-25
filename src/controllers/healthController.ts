import type { Request, Response } from 'express';
import { HealthService } from '../services/healthService';
import { ReminderService } from '../services/reminderService';
import { sendSuccess, sendError } from '../middleware/error';

/**
 * HealthController — handles health records, weight records, and reminders.
 */
export class HealthController {
  // ---- Health Records ----

  /**
   * GET /pets/:petId/health-records
   */
  static async listHealthRecords(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { petId } = req.params;
      const { type } = req.query;
      const records = await HealthService.listHealthRecords(petId, type as string | undefined);
      sendSuccess(res, records);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * POST /pets/:petId/health-records
   */
  static async createHealthRecord(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { petId } = req.params;
      const record = await HealthService.createHealthRecord(petId, req.body);
      sendSuccess(res, record, '创建成功', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '创建失败');
    }
  }

  /**
   * PUT /pets/:petId/health-records/:recordId
   */
  static async updateHealthRecord(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { petId, recordId } = req.params;
      const record = await HealthService.updateHealthRecord(petId, recordId, req.body);
      sendSuccess(res, record, '更新成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '更新失败');
    }
  }

  /**
   * DELETE /pets/:petId/health-records/:recordId
   */
  static async deleteHealthRecord(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { petId, recordId } = req.params;
      await HealthService.deleteHealthRecord(petId, recordId);
      sendSuccess(res, null, '删除成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '删除失败');
    }
  }

  // ---- Weight Records ----

  /**
   * GET /pets/:petId/weight-records
   */
  static async listWeightRecords(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const records = await HealthService.listWeightRecords(req.params.petId);
      sendSuccess(res, records);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * POST /pets/:petId/weight-records
   */
  static async createWeightRecord(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { weight, date } = req.body;
      const record = await HealthService.createWeightRecord(req.params.petId, weight, date);
      sendSuccess(res, record, '记录成功', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '记录失败');
    }
  }

  /**
   * DELETE /pets/:petId/weight-records/:recordId
   */
  static async deleteWeightRecord(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { petId, recordId } = req.params;
      await HealthService.deleteWeightRecord(petId, recordId);
      sendSuccess(res, null, '删除成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '删除失败');
    }
  }

  // ---- Reminders ----

  /**
   * GET /pets/:petId/reminders
   */
  static async listReminders(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const reminders = await ReminderService.listByPet(req.params.petId);
      sendSuccess(res, reminders);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /reminders — list all reminders for the current user
   */
  static async listAllReminders(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const reminders = await ReminderService.listByUser(req.userId);
      sendSuccess(res, reminders);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * PATCH /reminders/:id/done — mark a reminder as done
   */
  static async markReminderDone(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const reminder = await ReminderService.markDone(req.params.id);
      sendSuccess(res, reminder, '已完成');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '操作失败');
    }
  }

  /**
   * PATCH /reminders/:id — update reminder cycle
   */
  static async updateReminder(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { cycleDays } = req.body;
      const reminder = await ReminderService.updateCycle(req.params.id, cycleDays);
      sendSuccess(res, reminder, '更新成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '更新失败');
    }
  }
}
