import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Validate request body against a Zod schema.
 * On failure, returns 400 with detailed error messages.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({
        code: 400,
        data: null,
        message: '参数校验失败',
        errors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate request query params against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({
        code: 400,
        data: null,
        message: '参数校验失败',
        errors,
      });
      return;
    }
    req.query = result.data as Record<string, string>;
    next();
  };
}

/**
 * Validate request params against a Zod schema.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({
        code: 400,
        data: null,
        message: '参数校验失败',
        errors,
      });
      return;
    }
    req.params = result.data as Record<string, string>;
    next();
  };
}
