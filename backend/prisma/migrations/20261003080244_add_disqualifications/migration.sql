-- CreateEnum
CREATE TYPE "DisqualificationScope" AS ENUM ('STAGE', 'SEASON', 'FORMAT');

-- CreateEnum
CREATE TYPE "DisqualificationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "Disqualification" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "scope" "DisqualificationScope" NOT NULL,
    "status" "DisqualificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "stageId" TEXT,
    "seasonId" TEXT,
    "reason" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Disqualification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Disqualification_participantId_idx" ON "Disqualification"("participantId");

-- CreateIndex
CREATE INDEX "Disqualification_scope_idx" ON "Disqualification"("scope");

-- CreateIndex
CREATE INDEX "Disqualification_status_idx" ON "Disqualification"("status");

-- CreateIndex
CREATE INDEX "Disqualification_stageId_idx" ON "Disqualification"("stageId");

-- CreateIndex
CREATE INDEX "Disqualification_seasonId_idx" ON "Disqualification"("seasonId");

-- CreateIndex
CREATE INDEX "Disqualification_issuedByUserId_idx" ON "Disqualification"("issuedByUserId");

-- CreateIndex
CREATE INDEX "Disqualification_revokedByUserId_idx" ON "Disqualification"("revokedByUserId");

-- CreateIndex
CREATE INDEX "Disqualification_createdAt_idx" ON "Disqualification"("createdAt");

-- AddForeignKey
ALTER TABLE "Disqualification" ADD CONSTRAINT "Disqualification_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disqualification" ADD CONSTRAINT "Disqualification_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disqualification" ADD CONSTRAINT "Disqualification_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disqualification" ADD CONSTRAINT "Disqualification_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disqualification" ADD CONSTRAINT "Disqualification_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
