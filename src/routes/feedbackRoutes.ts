import { Router } from 'express';
import { z } from 'zod';
import { FeedbackController } from '../controllers/feedbackController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();
const schema = z.object({
  category: z.string().min(1).max(30),
  description: z.string().min(1, '请填写问题描述').max(2000),
  contact: z.string().max(100).optional(),
  screenshotUrls: z.array(z.string().url()).max(9).default([]),
});
router.post('/', requireAuth, validateBody(schema), FeedbackController.create);
export default router;
