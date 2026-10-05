CREATE TYPE "AssistantRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');
CREATE TYPE "AssistantRequestType" AS ENUM ('CODE_CHANGE', 'ASSISTANT_FUNCTION', 'SYSTEM_ACTION');

CREATE TABLE "AssistantRequest" (
  "id" TEXT NOT NULL,
  "type" "AssistantRequestType" NOT NULL,
  "status" "AssistantRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "plan" TEXT,
  "diff" TEXT,
  "risk" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "appliedAt" TIMESTAMPTZ(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantRequest_status_idx" ON "AssistantRequest"("status");
CREATE INDEX "AssistantRequest_type_idx" ON "AssistantRequest"("type");
CREATE INDEX "AssistantRequest_requestedByUserId_idx" ON "AssistantRequest"("requestedByUserId");
CREATE INDEX "AssistantRequest_createdAt_idx" ON "AssistantRequest"("createdAt");

ALTER TABLE "AssistantRequest"
  ADD CONSTRAINT "AssistantRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssistantRequest"
  ADD CONSTRAINT "AssistantRequest_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;