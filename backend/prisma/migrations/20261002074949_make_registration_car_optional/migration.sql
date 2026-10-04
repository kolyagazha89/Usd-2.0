/*
  Warnings:

  - A unique constraint covering the columns `[stageId,participantId]` on the table `Registration` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_carId_fkey";

-- DropIndex
DROP INDEX "Registration_stageId_participantId_carId_key";

-- AlterTable
ALTER TABLE "Registration" ALTER COLUMN "carId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Registration_stageId_participantId_key" ON "Registration"("stageId", "participantId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE SET NULL ON UPDATE CASCADE;
