-- Preserve configuration history: configuration edits are represented by new versions.
ALTER TABLE "CarConfiguration"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "CarConfiguration_isActive_idx"
  ON "CarConfiguration"("isActive");

CREATE TABLE "EmailChangeToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "newEmail" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailChangeToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmailChangeToken_userId_idx" ON "EmailChangeToken"("userId");
CREATE INDEX "EmailChangeToken_newEmail_idx" ON "EmailChangeToken"("newEmail");
CREATE INDEX "EmailChangeToken_expiresAt_idx" ON "EmailChangeToken"("expiresAt");
CREATE INDEX "EmailChangeToken_usedAt_idx" ON "EmailChangeToken"("usedAt");
