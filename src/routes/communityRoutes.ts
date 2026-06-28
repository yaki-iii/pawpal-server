import { Router } from 'express';
import { CommunityController } from '../controllers/communityController';
import { CircleModerationController } from '../controllers/circleModerationController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

// Validation schemas
const postSchema = z.object({
  title: z.string().max(100, '标题最多100字').default(''),
  content: z.string().min(1, '请输入内容').max(5000, '内容最多5000字'),
  circleId: z.string().optional(),
  petId: z.string().optional(),
  images: z.array(z.string()).max(9, '最多9张图片').default([]),
  tags: z.array(z.string()).max(5, '最多5个标签').default([]),
});

const commentSchema = z.object({
  content: z.string().min(1, '请输入评论内容').max(500, '评论最多500字'),
  parentId: z.string().optional(),
});

const createCircleSchema = z.object({
  name: z.string().min(2, '圈子名称至少2个字').max(20, '圈子名称最多20个字'),
  description: z.string().max(200, '描述最多200字').default(''),
  coverImage: z.string().default(''),
  rules: z.string().max(2000, '规则最多2000字').optional(),
  visibility: z.enum(['PUBLIC', 'RESTRICTED', 'PRIVATE']).optional(),
});

const editCircleSchema = z.object({
  name: z.string().min(2, '圈子名称至少2个字').max(20, '圈子名称最多20个字').optional(),
  description: z.string().max(200, '描述最多200字').optional(),
  coverImage: z.string().optional(),
  rules: z.string().max(2000, '规则最多2000字').optional(),
});

const visibilitySchema = z.object({
  visibility: z.enum(['PUBLIC', 'RESTRICTED', 'PRIVATE']),
});

const joinRequestSchema = z.object({
  message: z.string().max(200, '申请留言最多200字').default(''),
});

const banSchema = z.object({
  reason: z.string().min(1, '请填写禁言原因').max(200, '原因最多200字'),
  bannedUntil: z.string().optional(),
});

const kickSchema = z.object({
  reason: z.string().min(1, '请填写踢出原因').max(200, '原因最多200字'),
});

const warnSchema = z.object({
  reason: z.string().min(1, '请填写警告原因').max(200, '原因最多200字'),
});

const removePostSchema = z.object({
  reason: z.string().min(1, '请填写移除原因').max(200, '原因最多200字'),
});

/**
 * Post routes — mounted at /posts
 * Relative paths (no /posts prefix).
 */
export const postRoutes = Router();

// Feed — public (optional auth for like status)
postRoutes.get('/feed', optionalAuth, CommunityController.getFeed);

// Post detail — public (optional auth for like status)
postRoutes.get('/:id', optionalAuth, CommunityController.getPostById);

// Post actions — require auth
postRoutes.post('/', requireAuth, validateBody(postSchema), CommunityController.createPost);
postRoutes.delete('/:id', requireAuth, CommunityController.deletePost);
postRoutes.post('/:id/like', requireAuth, CommunityController.toggleLike);

// Comments — list is public, create/delete require auth
postRoutes.get('/:id/comments', CommunityController.listComments);
postRoutes.post('/:id/comments', requireAuth, validateBody(commentSchema), CommunityController.createComment);
postRoutes.delete('/:id/comments/:commentId', requireAuth, CommunityController.deleteComment);

/**
 * Circle routes — mounted at /circles
 * Relative paths (no /circles prefix).
 */
export const circleRoutes = Router();

// Specific routes — must come BEFORE /:id
circleRoutes.get('/created', requireAuth, CircleModerationController.listCreatedCircles);

// Circle creation — auth required
circleRoutes.post('/', requireAuth, validateBody(createCircleSchema), CommunityController.createCircle);

// Circle listing/detail — public (optional auth for membership status)
circleRoutes.get('/', optionalAuth, CommunityController.listCircles);
circleRoutes.get('/:id', optionalAuth, CommunityController.getCircleById);
circleRoutes.get('/:id/posts', optionalAuth, CommunityController.getCirclePosts);
circleRoutes.get('/:id/members', CircleModerationController.listMembers);

// Circle membership — auth required
circleRoutes.post('/:id/join', requireAuth, CommunityController.joinCircle);
circleRoutes.post('/:id/leave', requireAuth, CommunityController.leaveCircle);

// Join requests (RESTRICTED / PRIVATE circles)
circleRoutes.post('/:id/join-request', requireAuth, validateBody(joinRequestSchema), CircleModerationController.submitJoinRequest);
circleRoutes.get('/:id/join-requests', requireAuth, CircleModerationController.listJoinRequests);
circleRoutes.post('/:id/join-requests/:requestId/approve', requireAuth, CircleModerationController.approveJoinRequest);
circleRoutes.post('/:id/join-requests/:requestId/reject', requireAuth, CircleModerationController.rejectJoinRequest);

// Circle management — OWNER only
circleRoutes.put('/:id', requireAuth, validateBody(editCircleSchema), CircleModerationController.editCircle);
circleRoutes.delete('/:id', requireAuth, CircleModerationController.deleteCircle);
circleRoutes.put('/:id/visibility', requireAuth, validateBody(visibilitySchema), CircleModerationController.setVisibility);

// Member moderation — MODERATOR+ (OWNER for promote/demote)
circleRoutes.post('/:id/members/:userId/ban', requireAuth, validateBody(banSchema), CircleModerationController.banMember);
circleRoutes.post('/:id/members/:userId/kick', requireAuth, validateBody(kickSchema), CircleModerationController.kickMember);
circleRoutes.post('/:id/members/:userId/warn', requireAuth, validateBody(warnSchema), CircleModerationController.warnMember);
circleRoutes.post('/:id/members/:userId/promote', requireAuth, CircleModerationController.promoteMember);
circleRoutes.post('/:id/members/:userId/demote', requireAuth, CircleModerationController.demoteMember);

// Post moderation — MODERATOR+
circleRoutes.put('/:id/posts/:postId/remove', requireAuth, validateBody(removePostSchema), CircleModerationController.removePost);
circleRoutes.put('/:id/posts/:postId/pin', requireAuth, CircleModerationController.togglePinPost);

export default postRoutes;
