import { Router } from 'express';
import { MomentController } from '../controllers/momentController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { uploadMomentMedia } from '../middleware/upload';
import { z } from 'zod';

const createMomentSchema = z.object({
  content: z.string().max(500, '内容最多500字').default(''),
  images: z.union([z.array(z.string()), z.string()]).optional(),
  videos: z.union([z.array(z.string()), z.string()]).optional(),
  mood: z.string().max(20, '心情最多20字').optional(),
  location: z.string().max(50, '位置最多50字').optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).default('PUBLIC'),
});

const createMomentCommentSchema = z.object({
  content: z.string().trim().min(1, '评论不能为空').max(500, '评论最多500字'),
  parentId: z.string().optional(),
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
petMomentRoutes.post(
  '/:petId/moments',
  requireAuth,
  uploadMomentMedia,
  validateBody(createMomentSchema),
  MomentController.createMoment,
);

/** Mounted at /moments — single-moment operations. */
export const momentRoutes = Router();

// DELETE /moments/:id — auth required (owner only)
momentRoutes.delete('/:id', requireAuth, MomentController.deleteMoment);

// POST /moments/:id/like — auth required
momentRoutes.post('/:id/like', requireAuth, MomentController.toggleLike);

// POST /moments/:id/share — records external share taps
momentRoutes.post('/:id/share', optionalAuth, MomentController.recordShare);

// POST /moments/:id/promote-to-diary — auth required (owner only)
momentRoutes.post('/:id/promote-to-diary', requireAuth, MomentController.promoteToDiary);

// GET /moments/:id/comments — public comments
momentRoutes.get('/:id/comments', optionalAuth, MomentController.listComments);

// POST /moments/:id/comments — auth required
momentRoutes.post(
  '/:id/comments',
  requireAuth,
  validateBody(createMomentCommentSchema),
  MomentController.createComment,
);

/** Mounted at /feed — feed endpoints. */
export const momentFeedRoutes = Router();

// GET /feed/moments — auth required
momentFeedRoutes.get('/moments', requireAuth, MomentController.getMomentsFeed);

export default momentRoutes;
