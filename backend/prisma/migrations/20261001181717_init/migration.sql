-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'JUDGE');

-- CreateEnum
CREATE TYPE "RegistrationSource" AS ENUM ('PRE_REGISTRATION', 'ON_SITE', 'IMPORT');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResultUnit" AS ENUM ('DB', 'MPS', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "team" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Car" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Car_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "registrationStartsAt" TIMESTAMP(3),
    "registrationEndsAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Direction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Direction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "directionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageClass" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "participantNumber" INTEGER NOT NULL,
    "source" "RegistrationSource" NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacyId" TEXT,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationClass" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL,
    "checkedByUserId" TEXT,
    "checkedByName" TEXT,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "legacyId" TEXT,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "registrationClassId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "value" DECIMAL(10,3) NOT NULL,
    "unit" "ResultUnit" NOT NULL,
    "place" INTEGER,
    "isBest" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "seasonId" TEXT,
    "stageId" TEXT,
    "participantId" TEXT,
    "carId" TEXT,
    "resultId" TEXT,
    "value" DECIMAL(10,3) NOT NULL,
    "unit" "ResultUnit" NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_legacyId_key" ON "Participant"("legacyId");

-- CreateIndex
CREATE INDEX "Participant_fullName_idx" ON "Participant"("fullName");

-- CreateIndex
CREATE INDEX "Participant_team_idx" ON "Participant"("team");

-- CreateIndex
CREATE UNIQUE INDEX "Car_legacyId_key" ON "Car"("legacyId");

-- CreateIndex
CREATE INDEX "Car_participantId_idx" ON "Car"("participantId");

-- CreateIndex
CREATE INDEX "Car_brand_idx" ON "Car"("brand");

-- CreateIndex
CREATE INDEX "Car_model_idx" ON "Car"("model");

-- CreateIndex
CREATE UNIQUE INDEX "Season_year_key" ON "Season"("year");

-- CreateIndex
CREATE UNIQUE INDEX "Season_legacyId_key" ON "Season"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_legacyId_key" ON "Stage"("legacyId");

-- CreateIndex
CREATE INDEX "Stage_seasonId_idx" ON "Stage"("seasonId");

-- CreateIndex
CREATE INDEX "Stage_date_idx" ON "Stage"("date");

-- CreateIndex
CREATE INDEX "Stage_registrationOpen_idx" ON "Stage"("registrationOpen");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_seasonId_stageNumber_key" ON "Stage"("seasonId", "stageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Direction_legacyId_key" ON "Direction"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_code_key" ON "Class"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Class_legacyId_key" ON "Class"("legacyId");

-- CreateIndex
CREATE INDEX "Class_directionId_idx" ON "Class"("directionId");

-- CreateIndex
CREATE INDEX "Class_sortOrder_idx" ON "Class"("sortOrder");

-- CreateIndex
CREATE INDEX "Class_isActive_idx" ON "Class"("isActive");

-- CreateIndex
CREATE INDEX "StageClass_stageId_idx" ON "StageClass"("stageId");

-- CreateIndex
CREATE INDEX "StageClass_classId_idx" ON "StageClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "StageClass_stageId_classId_key" ON "StageClass"("stageId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_legacyId_key" ON "Registration"("legacyId");

-- CreateIndex
CREATE INDEX "Registration_stageId_idx" ON "Registration"("stageId");

-- CreateIndex
CREATE INDEX "Registration_participantId_idx" ON "Registration"("participantId");

-- CreateIndex
CREATE INDEX "Registration_carId_idx" ON "Registration"("carId");

-- CreateIndex
CREATE INDEX "Registration_status_idx" ON "Registration"("status");

-- CreateIndex
CREATE INDEX "Registration_source_idx" ON "Registration"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_stageId_participantNumber_key" ON "Registration"("stageId", "participantNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_stageId_participantId_carId_key" ON "Registration"("stageId", "participantId", "carId");

-- CreateIndex
CREATE INDEX "RegistrationClass_registrationId_idx" ON "RegistrationClass"("registrationId");

-- CreateIndex
CREATE INDEX "RegistrationClass_classId_idx" ON "RegistrationClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationClass_registrationId_classId_key" ON "RegistrationClass"("registrationId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_registrationId_key" ON "Inspection"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_legacyId_key" ON "Inspection"("legacyId");

-- CreateIndex
CREATE INDEX "Inspection_status_idx" ON "Inspection"("status");

-- CreateIndex
CREATE INDEX "Inspection_checkedByUserId_idx" ON "Inspection"("checkedByUserId");

-- CreateIndex
CREATE INDEX "Result_registrationId_idx" ON "Result"("registrationId");

-- CreateIndex
CREATE INDEX "Result_registrationClassId_idx" ON "Result"("registrationClassId");

-- CreateIndex
CREATE INDEX "Result_place_idx" ON "Result"("place");

-- CreateIndex
CREATE INDEX "Result_isBest_idx" ON "Result"("isBest");

-- CreateIndex
CREATE UNIQUE INDEX "Result_registrationClassId_attemptNumber_key" ON "Result"("registrationClassId", "attemptNumber");

-- CreateIndex
CREATE INDEX "Record_classId_idx" ON "Record"("classId");

-- CreateIndex
CREATE INDEX "Record_seasonId_idx" ON "Record"("seasonId");

-- CreateIndex
CREATE INDEX "Record_stageId_idx" ON "Record"("stageId");

-- CreateIndex
CREATE INDEX "Record_participantId_idx" ON "Record"("participantId");

-- CreateIndex
CREATE INDEX "Record_isCurrent_idx" ON "Record"("isCurrent");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Car" ADD CONSTRAINT "Car_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "Direction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageClass" ADD CONSTRAINT "StageClass_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageClass" ADD CONSTRAINT "StageClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationClass" ADD CONSTRAINT "RegistrationClass_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationClass" ADD CONSTRAINT "RegistrationClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_registrationClassId_fkey" FOREIGN KEY ("registrationClassId") REFERENCES "RegistrationClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "Result"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
