import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AdminService, type AdminDTO } from '../services/adminService';

declare global {
  namespace Express {
    interface Request {
      adminUserId?: string;
      admin?: AdminDTO;
    }
  }
}

type AdminRoleName = 'SUPER_ADMIN' | 'OPS_ADMIN' | 'CONTENT_MODERATOR' | 'SUPPORT' | 'READONLY';

/**
 * Verifies a management-backend JWT and attaches the active admin user.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, data: null, message: '未授权：缺少管理员认证令牌' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.admin.jwtSecret) as { adminUserId: string };
    if (!decoded.adminUserId) {
      res.status(401).json({ code: 401, data: null, message: '管理员认证令牌无效或已过期' });
      return;
    }

    const admin = await AdminService.getAdminById(decoded.adminUserId);
    req.adminUserId = admin.id;
    req.admin = admin;
    next();
  } catch (error) {
    logger.warn(`Admin JWT verification failed: ${(error as Error).message}`);
    res.status(401).json({ code: 401, data: null, message: '管理员认证令牌无效或已过期' });
  }
}

/**
 * Enforces fixed admin roles. SUPER_ADMIN is allowed everywhere.
 */
export function requireAdminRole(roles: AdminRoleName[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({ code: 401, data: null, message: '未授权：缺少管理员认证令牌' });
      return;
    }

    if (req.admin.role === 'SUPER_ADMIN' || roles.includes(req.admin.role)) {
      next();
      return;
    }

    res.status(403).json({ code: 403, data: null, message: '权限不足' });
  };
}
