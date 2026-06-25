import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Rate limiter for AI consultation endpoints.
 * Limits each user to 20 requests per hour.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.rateLimit.aiPerHour,
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
 * Limits each IP to 10 requests per 15 minutes.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.rateLimit.authPer15Min,
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
 * General API rate limiter — 100 requests per minute per IP.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
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
