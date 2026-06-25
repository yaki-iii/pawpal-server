import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Standard API response shape.
 */
export interface ApiError {
  code: number;
  data: null;
  message: string;
  errors?: unknown;
}

/**
 * Success response helper.
 */
export function sendSuccess<T>(res: Response, data: T, message: string = 'success', status: number = 200): void {
  res.status(status).json({ code: 0, data, message });
}

/**
 * Error response helper.
 */
export function sendError(res: Response, code: number, message: string, errors?: unknown, status?: number): void {
  const response: ApiError = { code, data: null, message };
  if (errors) response.errors = errors;
  res.status(status || code).json(response);
}

/**
 * 404 handler — no route matched.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ code: 404, data: null, message: '接口不存在' });
}

/**
 * Global error handling middleware.
 * Must be registered last (after all routes).
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error(`Error: ${err.message} | Path: ${req.method} ${req.path} | Stack: ${err.stack}`);

  // Zod validation error
  if (err.name === 'ZodError' || (err as Error & { errors?: unknown }).errors) {
    const zodError = err as Error & { errors?: unknown };
    res.status(400).json({
      code: 400,
      data: null,
      message: '参数校验失败',
      errors: zodError.errors,
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({ code: 401, data: null, message: '认证令牌无效或已过期' });
    return;
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    const multerErr = err as Error & { code?: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ code: 400, data: null, message: '文件大小超过限制（最大5MB）' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message: `文件上传错误: ${err.message}` });
    return;
  }

  // Default to 500
  res.status(500).json({
    code: 500,
    data: null,
    message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误',
  });
}
