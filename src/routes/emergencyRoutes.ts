import { Router } from 'express';
import { EmergencyController } from '../controllers/emergencyController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const createHelpSchema = z.object({
  petId: z.string().optional(),
  type: z.enum(['SYMPTOM', 'ACCIDENT', 'LOST', 'OTHER']),
  description: z.string().min(1, '请描述紧急情况').max(1000, '描述最多1000字'),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  location: z.string().max(200, '位置最多200字').optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const respondSchema = z.object({
  message: z.string().max(500, '响应信息最多500字').default(''),
});

const router = Router();

// All emergency routes require authentication
router.use(requireAuth);

// Specific routes — must come BEFORE /:id
router.post('/help', validateBody(createHelpSchema), EmergencyController.createHelp);
router.get('/vets', EmergencyController.listVets);
router.get('/active', EmergencyController.listActive);

// Parameterized routes
router.post('/:id/respond', validateBody(respondSchema), EmergencyController.respond);
router.post('/:id/resolve', EmergencyController.resolve);

export default router;
