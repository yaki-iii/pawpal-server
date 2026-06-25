import type { Request, Response } from 'express';
import { CircleModerationService } from '../services/circleModerationService';
import { sendSuccess, sendError } from '../middleware/error';

/**
 * CircleModerationController — Reddit-style circle moderation endpoints.
 * Routes mounted at /circles.
 */
export class CircleModerationController {
  // ---- Circle CRUD ----

  /**
   * PUT /circles/:id — edit circle info (OWNER only)
   */
  static async editCircle(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { name, description, coverImage, rules } = req.body;
      const circle = await CircleModerationService.editCircle(
        req.params.id,
        req.userId,
        { name, description, coverImage, rules },
      );
      sendSuccess(res, circle, '更新成功');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }

  /**
   * DELETE /circles/:id — dissolve circle (OWNER only)
   */
  static async deleteCircle(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CircleModerationService.deleteCircle(req.params.id, req.userId);
      sendSuccess(res, null, '圈子已解散');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }

  /**
   * PUT /circles/:id/visibility — set visibility (OWNER only)
   */
  static async setVisibility(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { visibility } = req.body;
      const circle = await CircleModerationService.setVisibility(
        req.params.id,
        req.userId,
        visibility,
      );
      sendSuccess(res, circle, '可见性已更新');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }

  // ---- Join Requests ----

  /**
   * POST /circles/:id/join-request
   */
  static async submitJoinRequest(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { message = '' } = req.body;
      const req2 = await CircleModerationService.submitJoinRequest(
        req.params.id,
        req.userId,
        message,
      );
      sendSuccess(res, req2, '申请已提交', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '申请失败');
    }
  }

  /**
   * GET /circles/:id/join-requests
   */
  static async listJoinRequests(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { status } = req.query;
      const list = await CircleModerationService.listJoinRequests(
        req.params.id,
        req.userId,
        status as string | undefined,
      );
      sendSuccess(res, list);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('成员')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 500, message);
      }
    }
  }

  /**
   * POST /circles/:id/join-requests/:requestId/approve
   */
  static async approveJoinRequest(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CircleModerationService.approveJoinRequest(
        req.params.id,
        req.params.requestId,
        req.userId,
      );
      sendSuccess(res, null, '已通过申请');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('成员')) {
        sendError(res, 403, message, undefined, 403);
      } else if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * POST /circles/:id/join-requests/:requestId/reject
   */
  static async rejectJoinRequest(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CircleModerationService.rejectJoinRequest(
        req.params.id,
        req.params.requestId,
        req.userId,
      );
      sendSuccess(res, null, '已拒绝申请');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('成员')) {
        sendError(res, 403, message, undefined, 403);
      } else if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  // ---- Member Management ----

  /**
   * GET /circles/:id/members — paginated member list (public for PUBLIC circles)
   */
  static async listMembers(req: Request, res: Response): Promise<void> {
    try {
      const { cursor, limit = '20' } = req.query;
      const result = await CircleModerationService.listMembers(
        req.params.id,
        cursor as string | undefined,
        parseInt(limit as string, 10),
      );
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * POST /circles/:id/members/:userId/ban
   */
  static async banMember(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { reason, bannedUntil } = req.body;
      await CircleModerationService.banMember(
        req.params.id,
        req.params.userId,
        req.userId,
        { reason, bannedUntil },
      );
      sendSuccess(res, null, '已禁言');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('圈主')) {
        sendError(res, 403, message, undefined, 403);
      } else if (message.includes('不存在') || message.includes('不是')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * POST /circles/:id/members/:userId/kick
   */
  static async kickMember(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { reason } = req.body;
      await CircleModerationService.kickMember(
        req.params.id,
        req.params.userId,
        req.userId,
        reason,
      );
      sendSuccess(res, null, '已踢出');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('圈主')) {
        sendError(res, 403, message, undefined, 403);
      } else if (message.includes('不存在') || message.includes('不是')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * POST /circles/:id/members/:userId/warn
   */
  static async warnMember(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { reason } = req.body;
      const result = await CircleModerationService.warnMember(
        req.params.id,
        req.params.userId,
        req.userId,
        reason,
      );
      sendSuccess(res, result, result.autoBanned ? '已警告并自动禁言' : '已警告');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('圈主')) {
        sendError(res, 403, message, undefined, 403);
      } else if (message.includes('不存在') || message.includes('不是')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * POST /circles/:id/members/:userId/promote
   */
  static async promoteMember(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CircleModerationService.promoteMember(
        req.params.id,
        req.params.userId,
        req.userId,
      );
      sendSuccess(res, null, '已提升为管理员');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('圈主')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * POST /circles/:id/members/:userId/demote
   */
  static async demoteMember(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CircleModerationService.demoteMember(
        req.params.id,
        req.params.userId,
        req.userId,
      );
      sendSuccess(res, null, '已降级为普通成员');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限') || message.includes('圈主')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  // ---- Post Moderation ----

  /**
   * PUT /circles/:id/posts/:postId/remove
   */
  static async removePost(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { reason } = req.body;
      await CircleModerationService.removePost(
        req.params.id,
        req.params.postId,
        req.userId,
        reason,
      );
      sendSuccess(res, null, '帖子已移除');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限')) {
        sendError(res, 403, message, undefined, 403);
      } else if (message.includes('不存在') || message.includes('不属于')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * PUT /circles/:id/posts/:postId/pin
   */
  static async togglePinPost(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const result = await CircleModerationService.togglePinPost(
        req.params.id,
        req.params.postId,
        req.userId,
      );
      sendSuccess(res, result, result.isPinned ? '已置顶' : '已取消置顶');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('权限')) {
        sendError(res, 403, message, undefined, 403);
      } else if (message.includes('不存在') || message.includes('不属于')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  // ---- Queries ----

  /**
   * GET /circles/created — list circles created by current user
   */
  static async listCreatedCircles(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const circles = await CircleModerationService.listCreatedCircles(req.userId);
      sendSuccess(res, circles);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }
}
