import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { logger } from './logger';

const prisma = new PrismaClient();

/**
 * Start all cron-based background tasks.
 * - Reminder processing: every day at 8:00 AM
 * - Hard delete of soft-deleted accounts: every day at 2:00 AM (30-day retention)
 */
export function startScheduler(): void {
  // Process reminders every day at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    logger.info('⏰ Cron: Processing due reminders...');
    try {
      const { ReminderService } = await import('../services/reminderService');
      await ReminderService.processDueReminders();
      logger.info('✅ Reminder processing complete');
    } catch (error) {
      logger.error(`❌ Reminder processing failed: ${(error as Error).message}`);
    }
  });

  // Hard delete soft-deleted accounts older than 30 days — every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('⏰ Cron: Cleaning up soft-deleted accounts...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await prisma.user.deleteMany({
        where: {
          deletedAt: { lte: thirtyDaysAgo },
        },
      });

      if (result.count > 0) {
        logger.info(`✅ Hard-deleted ${result.count} expired accounts`);
      }
    } catch (error) {
      logger.error(`❌ Account cleanup failed: ${(error as Error).message}`);
    }
  });

  logger.info('📅 Cron scheduler started (reminders@8am, cleanup@2am)');
}
