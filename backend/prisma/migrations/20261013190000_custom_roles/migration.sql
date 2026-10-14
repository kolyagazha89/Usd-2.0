CREATE TABLE "Role" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");
CREATE INDEX "Role_isSystem_idx" ON "Role"("isSystem");

ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT;
CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_customRoleId_fkey"
  FOREIGN KEY ("customRoleId") REFERENCES "Role"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
