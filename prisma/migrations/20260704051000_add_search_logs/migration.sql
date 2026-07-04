CREATE TABLE IF NOT EXISTS "search_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "keyword" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "search_logs_keyword_createdAt_idx" ON "search_logs"("keyword", "createdAt");
CREATE INDEX IF NOT EXISTS "search_logs_userId_createdAt_idx" ON "search_logs"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_userId_fkey'
  ) THEN
    ALTER TABLE "search_logs"
      ADD CONSTRAINT "search_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
