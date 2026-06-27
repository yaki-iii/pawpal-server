import { prisma } from '../config/database';
import { logger } from './logger';

/**
 * Render deployments may start with a database that has not run the latest
 * Prisma migrations yet. These idempotent guards keep v0.4 runtime paths
 * available while the normal migration pipeline catches up.
 */
export async function runStartupMigrations(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "moments" ADD COLUMN IF NOT EXISTS "videos" TEXT[] DEFAULT ARRAY[]::TEXT[]');
    await prisma.$executeRawUnsafe('ALTER TABLE "moments" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER NOT NULL DEFAULT 0');
    await prisma.$executeRawUnsafe('ALTER TABLE "moments" ADD COLUMN IF NOT EXISTS "shareCount" INTEGER NOT NULL DEFAULT 0');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "moment_comments" (
        "id" TEXT NOT NULL,
        "momentId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "parentId" TEXT,
        "content" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "moment_comments_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "moment_comments_momentId_idx" ON "moment_comments"("momentId")');
    await addForeignKeyIfMissing(
      'moment_comments_momentId_fkey',
      'ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    await addForeignKeyIfMissing(
      'moment_comments_userId_fkey',
      'ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    await addForeignKeyIfMissing(
      'moment_comments_parentId_fkey',
      'ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "moment_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    logger.info('Startup database guards applied.');
  } catch (error) {
    logger.error(`Startup database guards failed: ${(error as Error).message}`);
    throw error;
  }
}

async function addForeignKeyIfMissing(constraintName: string, sql: string): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'
      ) THEN
        ${sql};
      END IF;
    END $$;
  `);
}
