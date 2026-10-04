-- CreateEnum
CREATE TYPE "RegistrationCountry" AS ENUM ('RU', 'NO', 'FI', 'EE', 'LV', 'LT', 'PL', 'BY', 'UA', 'GE', 'AZ', 'KZ', 'CN', 'MN', 'KP', 'US');

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "registrationCountry" "RegistrationCountry" NOT NULL DEFAULT 'RU';
