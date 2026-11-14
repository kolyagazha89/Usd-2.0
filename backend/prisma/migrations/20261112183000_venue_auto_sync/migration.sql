CREATE TABLE "VenueSyncAuthorization" (
  "id" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "baselineSha256" VARCHAR(64) NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "venueFingerprint" VARCHAR(64),
  "venuePublicKeyPem" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "lastJournalHash" VARCHAR(64),
  "acceptedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueSyncAuthorization_pkey" PRIMARY KEY("id")
);
ALTER TABLE "VenueSyncAuthorization" ADD CONSTRAINT "VenueSyncAuthorization_stageId_fkey"
  FOREIGN KEY("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "VenueSyncAuthorization_baselineSha256_key" ON "VenueSyncAuthorization"("baselineSha256");
CREATE UNIQUE INDEX "VenueSyncAuthorization_tokenHash_key" ON "VenueSyncAuthorization"("tokenHash");
CREATE INDEX "VenueSyncAuthorization_stageId_expiresAt_idx" ON "VenueSyncAuthorization"("stageId","expiresAt");
