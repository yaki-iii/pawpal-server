import express, { type Application } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiRoutes } from './routes';

/**
 * Creates and configures the Express application.
 * Registers all middleware (security, CORS, parsing, static files)
 * and mounts API routes under /api/v1.
 */
export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // CORS configuration — temporarily allow all origins for testing
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow all origins during testing phase
      return callback(null, true);
    },
    credentials: true,
  };
  app.use(cors(corsOptions));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static files for uploaded images
  app.use('/api/v1/uploads', express.static(path.resolve(process.cwd(), config.upload.dir)));

  // Health check endpoint
  app.get('/api/v1/health', (_req, res) => {
    res.json({ code: 0, data: { status: 'ok', timestamp: new Date().toISOString() }, message: 'success' });
  });

  // API routes
  app.use('/api/v1', apiRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  logger.info('Express app configured with all middleware and routes.');

  return app;
}
