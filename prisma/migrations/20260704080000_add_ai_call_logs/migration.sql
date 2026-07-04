CREATE TABLE IF NOT EXISTS "ai_call_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "conversationId" TEXT NOT NULL DEFAULT '',
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT '',
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "imageCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_call_logs_provider_status_createdAt_idx" ON "ai_call_logs"("provider", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_operation_status_createdAt_idx" ON "ai_call_logs"("operation", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_userId_createdAt_idx" ON "ai_call_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_call_logs_conversationId_createdAt_idx" ON "ai_call_logs"("conversationId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_call_logs_userId_fkey'
  ) THEN
    ALTER TABLE "ai_call_logs"
      ADD CONSTRAINT "ai_call_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
