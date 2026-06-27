-- Add comment support for daily moments.
ALTER TABLE "moments" ADD COLUMN "commentCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "moment_comments" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moment_comments_momentId_idx" ON "moment_comments"("momentId");

ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_momentId_fkey"
    FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "moment_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
