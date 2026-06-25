import type { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { sendSuccess, sendError } from '../middleware/error';
import { logger } from '../utils/logger';

/**
 * AuthController — handles registration, login, and current user info.
 */
export class AuthController {
  /**
   * POST /auth/register
   * Register a new user account.
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, nickname } = req.body;
      const result = await AuthService.register(email, password, nickname);
      sendSuccess(res, result, '注册成功', 201);
    } catch (error) {
      logger.warn(`Registration failed: ${(error as Error).message}`);
      const message = (error as Error).message;
      if (message.includes('已被注册')) {
        sendError(res, 409, message, undefined, 409);
      } else {
        sendError(res, 400, message || '注册失败');
      }
    }
  }

  /**
   * POST /auth/login
   * Login with email and password.
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      sendSuccess(res, result, '登录成功');
    } catch (error) {
      logger.warn(`Login failed: ${(error as Error).message}`);
      sendError(res, 401, (error as Error).message || '登录失败', undefined, 401);
    }
  }

  /**
   * GET /auth/me
   * Get current authenticated user's info.
   */
  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const user = await AuthService.getUserById(req.userId);
      sendSuccess(res, user);
    } catch (error) {
      sendError(res, 404, (error as Error).message || '用户不存在', undefined, 404);
    }
  }
}
