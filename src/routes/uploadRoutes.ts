import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { uploadMedia, uploadMultiple } from '../middleware/upload';
import { UploadController } from '../controllers/uploadController';

const router = Router();

router.use(requireAuth);

router.post('/images', uploadMultiple, UploadController.uploadImages);
router.post('/media', uploadMedia, UploadController.uploadMedia);

export default router;
