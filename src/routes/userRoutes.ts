import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// Validation schema
const updateProfileSchema = z.object({
  nickname: z.string().min(1, '请输入昵称').max(20, '昵称最多20字').optional(),
  avatar: z.string().optional(),
  avatarUrl: z.string().optional(),
  bio: z.string().max(200, '简介最多200字').optional(),
  city: z.string().max(50, '城市名最多50字').optional(),
  defaultMomentVisibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  profileVisibility: z.enum(['PUBLIC', 'AUTHENTICATED', 'FOLLOWERS']).optional(),
  petVisibility: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  searchable: z.boolean().optional(),
});

// ---- Specific routes (must come BEFORE parameterized /:userId routes) ----

// Profile update — auth required
router.put('/', requireAuth, validateBody(updateProfileSchema), UserController.updateProfile);

// Account deletion — auth required
router.delete('/', requireAuth, UserController.deleteAccount);

// Notifications — auth required
router.get('/notifications', requireAuth, UserController.listNotifications);
router.patch('/notifications/read-all', requireAuth, UserController.markAllNotificationsRead);
router.patch('/notifications/:id/read', requireAuth, UserController.markNotificationRead);

// Data export — auth required
router.get('/export', requireAuth, UserController.exportData);

// ---- Parameterized routes (by userId) ----

// Profile view — public (optional auth for follow status)
router.get('/:userId', optionalAuth, UserController.getProfile);

// Posts by user — public
router.get('/:userId/posts', UserController.getUserPosts);

// Moments by user — public (optional auth for visibility filtering)
router.get('/:userId/moments', optionalAuth, UserController.getUserMoments);

// Pets by user — public with privacy filtering
router.get('/:userId/pets', optionalAuth, UserController.getUserPets);

// Liked posts as favorites MVP — private
router.get('/:userId/liked-posts', requireAuth, UserController.getLikedPosts);
router.get('/:userId/favorites', requireAuth, UserController.getFavorites);

// Follow — requires auth
router.post('/:userId/follow', requireAuth, UserController.toggleFollow);

// Followers / Following — public
router.get('/:userId/followers', UserController.listFollowers);
router.get('/:userId/following', UserController.listFollowing);

export default router;
