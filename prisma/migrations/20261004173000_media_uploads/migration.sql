CREATE TYPE "MediaTargetType" AS ENUM ('PARTICIPANT_PHOTO', 'CAR_PHOTO');

CREATE TABLE "MediaUpload" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetType" "MediaTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaUpload_objectKey_key" UNIQUE ("objectKey"),
  CONSTRAINT "MediaUpload_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "MediaUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MediaUpload_userId_idx" ON "MediaUpload"("userId");
CREATE INDEX "MediaUpload_targetType_targetId_idx" ON "MediaUpload"("targetType", "targetId");
CREATE INDEX "MediaUpload_expiresAt_idx" ON "MediaUpload"("expiresAt");
CREATE INDEX "MediaUpload_completedAt_idx" ON "MediaUpload"("completedAt");
