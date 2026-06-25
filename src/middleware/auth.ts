import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

// Extend Express Request type to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * JWT authentication middleware (required).
 * Extracts and verifies the Bearer token from the Authorization header.
 * On success, attaches userId to req.userId.
 * On failure, returns 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, data: null, message: '未授权：缺少认证令牌' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };
    req.userId = decoded.userId;
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    logger.warn(`JWT verification failed: ${(error as Error).message}`);
    res.status(401).json({ code: 401, data: null, message: '认证令牌无效或已过期' });
  }
}

/**
 * Optional authentication middleware.
 * If a valid token is present, attaches userId. If not, continues without error.
 * Used for endpoints that behave differently for authenticated vs anonymous users.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };
    req.userId = decoded.userId;
    req.user = { id: decoded.userId, email: decoded.email };
  } catch {
    // Silently ignore invalid tokens for optional auth
  }

  next();
}
