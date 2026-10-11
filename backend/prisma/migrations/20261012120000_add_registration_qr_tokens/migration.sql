-- CreateTable
CREATE TABLE "RegistrationQrToken" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RegistrationQrToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationQrToken_registrationId_key" ON "RegistrationQrToken"("registrationId");
CREATE UNIQUE INDEX "RegistrationQrToken_tokenHash_key" ON "RegistrationQrToken"("tokenHash");
CREATE INDEX "RegistrationQrToken_revokedAt_idx" ON "RegistrationQrToken"("revokedAt");

-- AddForeignKey
ALTER TABLE "RegistrationQrToken"
ADD CONSTRAINT "RegistrationQrToken_registrationId_fkey"
FOREIGN KEY ("registrationId") REFERENCES "Registration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
