import { Router } from 'express';
import { z } from 'zod';
import { ReportController } from '../controllers/reportController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

const createReportSchema = z.object({
  targetType: z.enum(['POST', 'MOMENT', 'COMMENT', 'MOMENT_COMMENT', 'USER', 'CIRCLE']),
  targetId: z.string().min(1, '缺少举报对象 ID'),
  reason: z.enum(['SPAM', 'HARASSMENT', 'FALSE_MEDICAL', 'ILLEGAL_DANGEROUS', 'INAPPROPRIATE_MEDIA', 'PRIVACY', 'OTHER']),
  note: z.string().max(500, '补充说明最多500字').optional(),
});

router.get('/', requireAuth, ReportController.listMyReports);
router.post('/', requireAuth, validateBody(createReportSchema), ReportController.createReport);

export default router;
