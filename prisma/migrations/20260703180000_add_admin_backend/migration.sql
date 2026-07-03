-- Add management-backend account controls and audit tables.

CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPS_ADMIN', 'CONTENT_MODERATOR', 'SUPPORT', 'READONLY');
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

ALTER TABLE "users" ADD COLUMN "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN "suspendedUntil" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "suspendedReason" TEXT NOT NULL DEFAULT '';

CREATE TABLE "admin_users" (
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
);

CREATE TABLE "admin_audit_logs" (
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
);

CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE INDEX "admin_users_role_status_idx" ON "admin_users"("role", "status");
CREATE INDEX "admin_audit_logs_adminUserId_createdAt_idx" ON "admin_audit_logs"("adminUserId", "createdAt");
CREATE INDEX "admin_audit_logs_targetType_targetId_idx" ON "admin_audit_logs"("targetType", "targetId");
CREATE INDEX "admin_audit_logs_action_createdAt_idx" ON "admin_audit_logs"("action", "createdAt");

ALTER TABLE "admin_audit_logs"
  ADD CONSTRAINT "admin_audit_logs_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
