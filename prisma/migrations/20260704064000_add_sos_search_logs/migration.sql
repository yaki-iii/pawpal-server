CREATE TABLE IF NOT EXISTS "sos_search_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'SYSTEM_LOCATION',
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "resultStatus" TEXT NOT NULL,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sos_search_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sos_search_logs_source_createdAt_idx" ON "sos_search_logs"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "sos_search_logs_resultStatus_createdAt_idx" ON "sos_search_logs"("resultStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "sos_search_logs_userId_createdAt_idx" ON "sos_search_logs"("userId", "createdAt");

ALTER TABLE "sos_search_logs"
ADD CONSTRAINT "sos_search_logs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
