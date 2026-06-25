import { Router } from 'express';
import { MomentController } from '../controllers/momentController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const createMomentSchema = z.object({
  content: z.string().min(1, '请输入内容').max(500, '内容最多500字'),
  images: z.array(z.string()).max(9, '最多9张图片').default([]),
  mood: z.string().max(20, '心情最多20字').optional(),
  location: z.string().max(50, '位置最多50字').optional(),
});

/**
 * Moment routes — split across two mount points:
 *  - /pets (pet-nested: list/create moments for a pet)
 *  - /moments (top-level: delete + like a single moment)
 *  - /feed (top-level: moments feed)
 *
 * Since routes/index.ts mounts this file at multiple paths, we export
 * three separate routers.
 */

/** Mounted at /pets — pet-nested moment endpoints. */
export const petMomentRoutes = Router();

// GET /pets/:petId/moments — public (optional auth for like status)
petMomentRoutes.get('/:petId/moments', optionalAuth, MomentController.listMoments);

// POST /pets/:petId/moments — auth required
petMomentRoutes.post('/:petId/moments', requireAuth, validateBody(createMomentSchema), MomentController.createMoment);

/** Mounted at /moments — single-moment operations. */
export const momentRoutes = Router();

// DELETE /moments/:id — auth required (owner only)
momentRoutes.delete('/:id', requireAuth, MomentController.deleteMoment);

// POST /moments/:id/like — auth required
momentRoutes.post('/:id/like', requireAuth, MomentController.toggleLike);

/** Mounted at /feed — feed endpoints. */
export const momentFeedRoutes = Router();

// GET /feed/moments — auth required
momentFeedRoutes.get('/moments', requireAuth, MomentController.getMomentsFeed);

export default momentRoutes;
