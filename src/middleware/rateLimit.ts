import rateLimit from 'express-rate-limit';
import { config } from '../config';

const isDev = config.nodeEnv === 'development' || config.nodeEnv === 'dev';

/**
 * Rate limiter for AI consultation endpoints.
 * In dev mode, allows 1000 req/hour for testing.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 1000 : config.rateLimit.aiPerHour,
  keyGenerator: (req) => req.userId || req.ip || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      code: 429,
      data: null,
      message: 'AI 助手请求过于频繁，请稍后再试（每小时限20次）',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for authentication endpoints (register/login).
 * In dev mode, allows 1000 req/15min for testing.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : config.rateLimit.authPer15Min,
  keyGenerator: (req) => req.ip || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      code: 429,
      data: null,
      message: '请求过于频繁，请15分钟后再试',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API rate limiter — 1000 req/min in dev, 100 in production.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 100,
  keyGenerator: (req) => req.ip || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      code: 429,
      data: null,
      message: '请求过于频繁，请稍后再试',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
