-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('DRAFT', 'READY', 'COMMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowType" AS ENUM ('REGISTRATION', 'RESULT');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('READY', 'WARNING', 'RESOLVED', 'COMMITTED');

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "summary" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "type" "ImportRowType" NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'WARNING',
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "warnings" JSONB,
    "resolution" JSONB,
    "participantId" TEXT,
    "registrationId" TEXT,
    "classId" TEXT,
    "participantNumber" INTEGER,
    "place" INTEGER,
    "value" DECIMAL(10,3),
    "unit" "ResultUnit",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_stageId_idx" ON "ImportJob"("stageId");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "ImportRow_importJobId_idx" ON "ImportRow"("importJobId");

-- CreateIndex
CREATE INDEX "ImportRow_status_idx" ON "ImportRow"("status");

-- CreateIndex
CREATE INDEX "ImportRow_participantId_idx" ON "ImportRow"("participantId");

-- CreateIndex
CREATE INDEX "ImportRow_registrationId_idx" ON "ImportRow"("registrationId");

-- CreateIndex
CREATE INDEX "ImportRow_classId_idx" ON "ImportRow"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importJobId_type_rowNumber_key" ON "ImportRow"("importJobId", "type", "rowNumber");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
