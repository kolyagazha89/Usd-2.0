-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "plateNumber" TEXT;

-- CreateIndex
CREATE INDEX "Car_plateNumber_idx" ON "Car"("plateNumber");
