import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import petRoutes from './petRoutes';
import { petHealthRoutes, reminderRoutes } from './healthRoutes';
import { postRoutes, circleRoutes } from './communityRoutes';
import aiRoutes from './aiRoutes';
import { growthDiaryRoutes } from './growthDiaryRoutes';
import { petMomentRoutes, momentRoutes, momentFeedRoutes } from './momentRoutes';
import emergencyRoutes from './emergencyRoutes';
import uploadRoutes from './uploadRoutes';
import searchRoutes from './searchRoutes';
import { generalRateLimiter } from '../middleware/rateLimit';

const router = Router();

// Apply general rate limiting to all API routes
router.use(generalRateLimiter);

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/pets', petRoutes);
router.use('/pets', petHealthRoutes); // /pets/:petId/health-records, etc.
router.use('/pets', growthDiaryRoutes); // /pets/:petId/entries, etc.
router.use('/pets', petMomentRoutes); // /pets/:petId/moments
router.use('/posts', postRoutes); // /posts, /posts/:id, /posts/feed, etc.
router.use('/circles', circleRoutes); // /circles, /circles/:id, etc.
router.use('/moments', momentRoutes); // /moments/:id, /moments/:id/like
router.use('/feed', momentFeedRoutes); // /feed/moments
router.use('/uploads', uploadRoutes); // /uploads/images
router.use('/search', searchRoutes); // /search?q=...
router.use('/ai', aiRoutes);
router.use('/reminders', reminderRoutes); // /reminders, /reminders/:id, etc.
router.use('/emergency', emergencyRoutes); // /emergency/help, /emergency/vets, etc.

export const apiRoutes = router;
