-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(120) NOT NULL,
    "description" VARCHAR(4000) NOT NULL DEFAULT '',
    "commanderUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPost" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(10000) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TeamPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_nameKey_key" ON "Team"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Team_commanderUserId_key" ON "Team"("commanderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_participantId_key" ON "TeamMembership"("participantId");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_status_idx" ON "TeamMembership"("teamId", "status");

-- CreateIndex
CREATE INDEX "TeamPost_teamId_status_createdAt_idx" ON "TeamPost"("teamId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_commanderUserId_fkey" FOREIGN KEY ("commanderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPost" ADD CONSTRAINT "TeamPost_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPost" ADD CONSTRAINT "TeamPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Application states are constrained at the storage boundary too.
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','LEFT'));
ALTER TABLE "TeamPost" ADD CONSTRAINT "TeamPost_kind_check" CHECK ("kind" IN ('NEWS','ACHIEVEMENT'));
ALTER TABLE "TeamPost" ADD CONSTRAINT "TeamPost_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','PUBLISHED'));
ALTER TABLE "TeamPost" ADD CONSTRAINT "TeamPost_publishedAt_check" CHECK (("status" = 'PUBLISHED') = ("publishedAt" IS NOT NULL));
ALTER TABLE "Team" ADD CONSTRAINT "Team_name_check" CHECK (length(trim("name")) > 0 AND length(trim("nameKey")) > 0);
ALTER TABLE "TeamPost" ADD CONSTRAINT "TeamPost_text_check" CHECK (length(trim("title")) > 0 AND length(trim("body")) > 0);
