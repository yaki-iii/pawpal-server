import type { Request, Response } from 'express';
import { CommunityService } from '../services/communityService';
import { FeedService } from '../services/feedService';
import { sendSuccess, sendError } from '../middleware/error';

/**
 * CommunityController — handles feed, posts, circles, comments, likes, follows.
 */
export class CommunityController {
  // ---- Feed ----

  /**
   * GET /posts/feed?type=LATEST&cursor=xxx&limit=10
   */
  static async getFeed(req: Request, res: Response): Promise<void> {
    try {
      const { type = 'LATEST', cursor, limit = '10' } = req.query;
      const result = await FeedService.getFeed(
        type as string,
        cursor as string | undefined,
        parseInt(limit as string, 10),
        req.userId,
      );
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  // ---- Posts ----

  /**
   * GET /posts/:id
   */
  static async getPostById(req: Request, res: Response): Promise<void> {
    try {
      const post = await CommunityService.getPostById(req.params.id, req.userId);
      sendSuccess(res, post);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 500, message);
      }
    }
  }

  /**
   * POST /posts
   */
  static async createPost(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const post = await CommunityService.publishPost(req.userId, req.body);
      sendSuccess(res, post, '发布成功', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '发布失败');
    }
  }

  /**
   * DELETE /posts/:id
   */
  static async deletePost(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CommunityService.deletePost(req.params.id, req.userId);
      sendSuccess(res, null, '删除成功');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }

  // ---- Likes ----

  /**
   * POST /posts/:id/like
   */
  static async toggleLike(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const result = await CommunityService.toggleLike(req.params.id, req.userId);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '操作失败');
    }
  }

  // ---- Comments ----

  /**
   * GET /posts/:id/comments
   */
  static async listComments(req: Request, res: Response): Promise<void> {
    try {
      const comments = await CommunityService.listComments(req.params.id);
      sendSuccess(res, comments);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * POST /posts/:id/comments
   */
  static async createComment(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { content, parentId } = req.body;
      const comment = await CommunityService.createComment(
        req.params.id,
        req.userId,
        content,
        parentId,
      );
      sendSuccess(res, comment, '评论成功', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '评论失败');
    }
  }

  /**
   * DELETE /posts/:id/comments/:commentId
   */
  static async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CommunityService.deleteComment(req.params.id, req.params.commentId, req.userId);
      sendSuccess(res, null, '删除成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '删除失败');
    }
  }

  // ---- Circles ----

  /**
   * GET /circles?type=BREED&species=DOG&keyword=xxx
   */
  static async listCircles(req: Request, res: Response): Promise<void> {
    try {
      const { type, species, keyword } = req.query;
      const circles = await CommunityService.listCircles(
        {
          type: type as string | undefined,
          species: species as string | undefined,
          keyword: keyword as string | undefined,
        },
        req.userId,
      );
      sendSuccess(res, circles);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /circles/:id
   */
  static async getCircleById(req: Request, res: Response): Promise<void> {
    try {
      const circle = await CommunityService.getCircleById(req.params.id, req.userId);
      sendSuccess(res, circle);
    } catch (error) {
      sendError(res, 404, (error as Error).message, undefined, 404);
    }
  }

  /**
   * GET /circles/:id/posts
   */
  static async getCirclePosts(req: Request, res: Response): Promise<void> {
    try {
      const { cursor, limit = '10' } = req.query;
      const result = await FeedService.getCircleFeed(
        req.params.id,
        cursor as string | undefined,
        parseInt(limit as string, 10),
        req.userId,
      );
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * POST /circles/:id/join
   */
  static async joinCircle(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CommunityService.joinCircle(req.params.id, req.userId);
      sendSuccess(res, null, '加入成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '加入失败');
    }
  }

  /**
   * POST /circles/:id/leave
   */
  static async leaveCircle(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await CommunityService.leaveCircle(req.params.id, req.userId);
      sendSuccess(res, null, '退出成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '退出失败');
    }
  }

  /**
   * POST /circles — create a new topic circle (user-created)
   */
  static async createCircle(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { name, description, coverImage } = req.body;
      const circle = await CommunityService.createCircle(req.userId, {
        name,
        description: description || '',
        coverImage: coverImage || '',
      });
      sendSuccess(res, circle, '创建成功', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '创建失败');
    }
  }
}
