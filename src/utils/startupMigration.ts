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
    await prisma.$executeRawUnsafe('ALTER TABLE "moments" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT \'PUBLIC\'');
    await prisma.$executeRawUnsafe('ALTER TABLE "moments" ADD COLUMN IF NOT EXISTS "isRemoved" BOOLEAN NOT NULL DEFAULT false');
    await prisma.$executeRawUnsafe('ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "isRemoved" BOOLEAN NOT NULL DEFAULT false');
    await prisma.$executeRawUnsafe('ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "isRemoved" BOOLEAN NOT NULL DEFAULT false');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserAccountStatus') THEN
          CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminRole') THEN
          CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPS_ADMIN', 'CONTENT_MODERATOR', 'SUPPORT', 'READONLY');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminStatus') THEN
          CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportTargetType') THEN
          CREATE TYPE "ReportTargetType" AS ENUM ('POST', 'MOMENT', 'COMMENT', 'MOMENT_COMMENT', 'USER', 'CIRCLE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportReason') THEN
          CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'FALSE_MEDICAL', 'ILLEGAL_DANGEROUS', 'INAPPROPRIATE_MEDIA', 'PRIVACY', 'OTHER');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportStatus') THEN
          CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportResolutionAction') THEN
          CREATE TYPE "ReportResolutionAction" AS ENUM ('NO_ACTION', 'HIDE_CONTENT', 'RESTORE_CONTENT', 'WARN_USER', 'SUSPEND_USER');
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accountStatus" "UserAccountStatus" NOT NULL DEFAULT \'ACTIVE\'::"UserAccountStatus"');
    await prisma.$executeRawUnsafe('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3)');
    await prisma.$executeRawUnsafe('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT NOT NULL DEFAULT \'\'');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "name" TEXT NOT NULL DEFAULT '',
        "role" "AdminRole" NOT NULL DEFAULT 'READONLY',
        "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
        "lastLoginAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_email_key" ON "admin_users"("email")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "admin_users_role_status_idx" ON "admin_users"("role", "status")');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
        "id" TEXT NOT NULL,
        "adminUserId" TEXT,
        "action" TEXT NOT NULL,
        "targetType" TEXT NOT NULL,
        "targetId" TEXT NOT NULL DEFAULT '',
        "reason" TEXT NOT NULL DEFAULT '',
        "beforeSnapshot" JSONB,
        "afterSnapshot" JSONB,
        "ipAddress" TEXT NOT NULL DEFAULT '',
        "userAgent" TEXT NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "admin_audit_logs_adminUserId_createdAt_idx" ON "admin_audit_logs"("adminUserId", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "admin_audit_logs_targetType_targetId_idx" ON "admin_audit_logs"("targetType", "targetId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_createdAt_idx" ON "admin_audit_logs"("action", "createdAt")');
    await addForeignKeyIfMissing(
      'admin_audit_logs_adminUserId_fkey',
      'ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "content_reports" (
        "id" TEXT NOT NULL,
        "reporterId" TEXT NOT NULL,
        "targetType" "ReportTargetType" NOT NULL,
        "targetId" TEXT NOT NULL,
        "targetOwnerId" TEXT NOT NULL DEFAULT '',
        "reason" "ReportReason" NOT NULL,
        "note" TEXT NOT NULL DEFAULT '',
        "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
        "duplicateCount" INTEGER NOT NULL DEFAULT 1,
        "resolutionAction" "ReportResolutionAction",
        "resolutionNote" TEXT NOT NULL DEFAULT '',
        "handledByAdminId" TEXT,
        "handledAt" TIMESTAMP(3),
        "lastReportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "content_reports_status_createdAt_idx" ON "content_reports"("status", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "content_reports_targetType_targetId_idx" ON "content_reports"("targetType", "targetId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "content_reports_reporterId_targetType_targetId_idx" ON "content_reports"("reporterId", "targetType", "targetId")');
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
    await prisma.$executeRawUnsafe('ALTER TABLE "moment_comments" ADD COLUMN IF NOT EXISTS "isRemoved" BOOLEAN NOT NULL DEFAULT false');
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
