CREATE TYPE "ResultVerificationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'VERIFIED');

ALTER TABLE "Result"
  ADD COLUMN "isHistorical" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "verificationStatus" "ResultVerificationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "verifiedByUserId" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMPTZ(3);

ALTER TABLE "Result"
  ADD CONSTRAINT "Result_verifiedByUserId_fkey"
  FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Result_verifiedByUserId_idx" ON "Result"("verifiedByUserId");
CREATE INDEX "Result_verificationStatus_idx" ON "Result"("verificationStatus");
CREATE INDEX "Result_isHistorical_idx" ON "Result"("isHistorical");