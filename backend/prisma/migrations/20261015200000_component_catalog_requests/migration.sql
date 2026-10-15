CREATE TYPE "ComponentCatalogRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ComponentCatalogRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "details" TEXT,
  "status" "ComponentCatalogRequestStatus" NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "catalogEntryId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "resolvedAt" TIMESTAMPTZ(3),
  "resolvedByUserId" TEXT,
  "adminEmailStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "participantEmailStatus" TEXT NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "ComponentCatalogRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ComponentCatalogRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ComponentCatalogRequest_status_createdAt_idx" ON "ComponentCatalogRequest"("status", "createdAt");
CREATE INDEX "ComponentCatalogRequest_userId_createdAt_idx" ON "ComponentCatalogRequest"("userId", "createdAt");
CREATE INDEX "ComponentCatalogRequest_category_brand_model_idx" ON "ComponentCatalogRequest"("category", "brand", "model");
