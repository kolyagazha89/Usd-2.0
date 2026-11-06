-- Add-only audit trail for manual ownership review of legacy participant profiles.
-- No existing profiles, users or results are modified.
CREATE TABLE "ProfileLinkRequest" (
    "id" TEXT NOT NULL,
    "claimantUserId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(1000) NOT NULL,
    "reviewedByUserId" TEXT,
    "decisionReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ProfileLinkRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProfileLinkRequest_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CONFLICT'))
);

CREATE UNIQUE INDEX "ProfileLinkRequest_claimantUserId_participantId_key"
    ON "ProfileLinkRequest"("claimantUserId","participantId");
CREATE INDEX "ProfileLinkRequest_status_createdAt_idx"
    ON "ProfileLinkRequest"("status","createdAt");
CREATE INDEX "ProfileLinkRequest_participantId_status_idx"
    ON "ProfileLinkRequest"("participantId","status");

ALTER TABLE "ProfileLinkRequest"
 ADD CONSTRAINT "ProfileLinkRequest_claimantUserId_fkey" FOREIGN KEY ("claimantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfileLinkRequest"
 ADD CONSTRAINT "ProfileLinkRequest_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfileLinkRequest"
 ADD CONSTRAINT "ProfileLinkRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
