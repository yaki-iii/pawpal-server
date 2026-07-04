-- Add admin-operation fields for circle recommendation and notes.
ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "isRecommended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "operationNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "circles" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "circles_isRecommended_idx" ON "circles"("isRecommended");
