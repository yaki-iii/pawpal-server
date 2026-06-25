import express from 'express';
import { config } from './config';
import { createApp } from './app';
import { logger } from './utils/logger';
import { startScheduler } from './utils/scheduler';

/**
 * Server entry point.
 * Starts the Express server and initializes background tasks (cron scheduler).
 */
async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`🚀 PawPal server running on http://localhost:${config.port}`);
    logger.info(`📡 Environment: ${config.nodeEnv}`);
  });

  // Start background cron scheduler (reminders, data cleanup)
  startScheduler();

  // Graceful shutdown
  const shutdown = (signal: string): void => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    process.exit(1);
  });
}

main().catch((error) => {
  logger.error(`Failed to start server: ${error}`);
  process.exit(1);
});
