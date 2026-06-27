import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Parse CORS_ORIGIN environment variable.
 * Supports both single origin and comma-separated list of origins.
 * @returns Array of allowed origin strings
 */
function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:5173';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Centralized application configuration.
 * All env vars are read here and validated for presence.
 */
export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://pawpal:pawpal123@localhost:5432/pawpal?schema=public',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  llm: {
    // DEEPSEEK_* takes precedence over LLM_* (the multi-turn chat endpoint
    // uses DEEPSEEK_*; the legacy /consult endpoint uses LLM_*)
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.LLM_MODEL || 'deepseek-chat',
  },

  amap: {
    webServiceKey: process.env.AMAP_WEB_SERVICE_KEY || '',
    placeAroundUrl: process.env.AMAP_PLACE_AROUND_URL || 'https://restapi.amap.com/v3/place/around',
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || 'pawpal-encryption-key-32bytes-changeme!!',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10),
  },

  rateLimit: {
    aiPerHour: parseInt(process.env.AI_RATE_LIMIT_PER_HOUR || '20', 10),
    authPer15Min: parseInt(process.env.AUTH_RATE_LIMIT_PER_15MIN || '10', 10),
  },

  cors: {
    origin: parseCorsOrigins(),
  },
} as const;

export type AppConfig = typeof config;
