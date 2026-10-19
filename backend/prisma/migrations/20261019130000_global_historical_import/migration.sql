CREATE TABLE "HistoricalImportBatch" (
 "id" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "activeKey" TEXT, "status" TEXT NOT NULL DEFAULT 'RUNNING', "plan" JSONB NOT NULL, "progress" JSONB NOT NULL, "leaseOwner" TEXT, "leaseUntil" TIMESTAMPTZ(3), "createdByUserId" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "HistoricalImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HistoricalImportBatch_activeKey_key" ON "HistoricalImportBatch"("activeKey");
CREATE INDEX "HistoricalImportBatch_sourceHash_idx" ON "HistoricalImportBatch"("sourceHash");
CREATE INDEX "HistoricalImportBatch_status_idx" ON "HistoricalImportBatch"("status");
