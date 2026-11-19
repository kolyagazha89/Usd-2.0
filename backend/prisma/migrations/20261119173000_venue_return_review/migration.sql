-- Immutable pairing to one authorized venue-device journal. No imported PII
-- or decrypted return payload is stored by this migration.
CREATE TABLE "VenueReturnReview" (
 "id" TEXT PRIMARY KEY,
 "authorizationId" TEXT NOT NULL,
 "stageId" TEXT NOT NULL,
 "journalEndHash" VARCHAR(64) NOT NULL,
 "envelopeHash" VARCHAR(64) NOT NULL,
 "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
 "conflicts" JSONB NOT NULL,
 "decisions" JSONB,
 "version" INTEGER NOT NULL DEFAULT 0,
 "reviewedByUserId" TEXT,
 "reviewedAt" TIMESTAMPTZ(3),
 "appliedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
 CONSTRAINT "VenueReturnReview_authorization_fkey"
 FOREIGN KEY ("authorizationId") REFERENCES "VenueSyncAuthorization"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "VenueReturnReview_status_check"
 CHECK ("status" IN ('PENDING','DEFERRED','APPROVED','APPLIED')),
 CONSTRAINT "VenueReturnReview_version_check" CHECK ("version" >= 0)
);
CREATE UNIQUE INDEX "VenueReturnReview_authorization_journal_unique"
 ON "VenueReturnReview"("authorizationId","journalEndHash");
CREATE INDEX "VenueReturnReview_stage_created_idx"
 ON "VenueReturnReview"("stageId","createdAt");
CREATE INDEX "VenueReturnReview_status_created_idx"
 ON "VenueReturnReview"("status","createdAt");
