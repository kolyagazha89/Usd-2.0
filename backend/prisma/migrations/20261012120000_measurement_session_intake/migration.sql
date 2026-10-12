CREATE TYPE "MeasurementStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'REJECTED');

CREATE TABLE "MeasurementSession" (
  "id" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "registrationClassId" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL,
  "deviceSerial" TEXT,
  "measurementType" TEXT NOT NULL,
  "value" DECIMAL(10,3) NOT NULL,
  "unit" "ResultUnit" NOT NULL,
  "frequencyHz" DECIMAL(10,2),
  "durationMs" INTEGER,
  "measuredAt" TIMESTAMPTZ(3) NOT NULL,
  "rawData" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "status" "MeasurementStatus" NOT NULL DEFAULT 'RECEIVED',
  "capturedByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewNote" TEXT,
  "resultId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MeasurementSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeasurementSession_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MeasurementSession_registrationClassId_fkey" FOREIGN KEY ("registrationClassId") REFERENCES "RegistrationClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MeasurementSession_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MeasurementSession_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeasurementSession_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "Result"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MeasurementSession_idempotencyKey_key" ON "MeasurementSession"("idempotencyKey");
CREATE UNIQUE INDEX "MeasurementSession_resultId_key" ON "MeasurementSession"("resultId");
CREATE INDEX "MeasurementSession_registrationId_createdAt_idx" ON "MeasurementSession"("registrationId", "createdAt");
CREATE INDEX "MeasurementSession_registrationClassId_status_idx" ON "MeasurementSession"("registrationClassId", "status");
CREATE INDEX "MeasurementSession_status_measuredAt_idx" ON "MeasurementSession"("status", "measuredAt");
CREATE INDEX "MeasurementSession_capturedByUserId_idx" ON "MeasurementSession"("capturedByUserId");
CREATE INDEX "MeasurementSession_reviewedByUserId_idx" ON "MeasurementSession"("reviewedByUserId");
