import { Router } from 'express';
import { HealthController } from '../controllers/healthController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

// Validation schemas
const healthRecordSchema = z.object({
  type: z.enum(['VACCINE', 'DEWORMING', 'CHECKUP', 'VISIT']),
  date: z.string().min(1, '请选择日期'),
  itemName: z.string().min(1, '请输入项目名称').max(100, '项目名称最多100字'),
  notes: z.string().max(500, '备注最多500字').default(''),
  images: z.array(z.string()).default([]),
});

const weightRecordSchema = z.object({
  weight: z.number().min(0, '体重不能为负').max(200, '体重数值过大'),
  date: z.string().min(1, '请选择日期'),
});

const reminderUpdateSchema = z.object({
  cycleDays: z.number().int().min(1, '周期至少1天').max(3650, '周期最长10年'),
});

/**
 * Pet-nested health routes — mounted at /pets
 * All paths are relative: /:petId/health-records, /:petId/weight-records, /:petId/reminders
 */
export const petHealthRoutes = Router();
petHealthRoutes.use(requireAuth);

// Health Records
petHealthRoutes.get('/:petId/health-records', HealthController.listHealthRecords);
petHealthRoutes.post('/:petId/health-records', validateBody(healthRecordSchema), HealthController.createHealthRecord);
petHealthRoutes.put('/:petId/health-records/:recordId', validateBody(healthRecordSchema.partial()), HealthController.updateHealthRecord);
petHealthRoutes.delete('/:petId/health-records/:recordId', HealthController.deleteHealthRecord);

// Weight Records
petHealthRoutes.get('/:petId/weight-records', HealthController.listWeightRecords);
petHealthRoutes.post('/:petId/weight-records', validateBody(weightRecordSchema), HealthController.createWeightRecord);
petHealthRoutes.delete('/:petId/weight-records/:recordId', HealthController.deleteWeightRecord);

// Pet-specific Reminders
petHealthRoutes.get('/:petId/reminders', HealthController.listReminders);

/**
 * Global reminder routes — mounted at /reminders
 * All paths are relative: /, /:id/done, /:id
 */
export const reminderRoutes = Router();
reminderRoutes.use(requireAuth);

reminderRoutes.get('/', HealthController.listAllReminders);
reminderRoutes.patch('/:id/done', HealthController.markReminderDone);
reminderRoutes.patch('/:id', validateBody(reminderUpdateSchema), HealthController.updateReminder);

export default petHealthRoutes;
