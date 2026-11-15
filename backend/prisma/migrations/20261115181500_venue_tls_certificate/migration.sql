-- Public certificate only. The private key remains in the Caddy Docker volume.
CREATE TABLE "VenueTlsCertificate" (
  "id" VARCHAR(24) NOT NULL,
  "pem" TEXT NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "notAfter" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VenueTlsCertificate_pkey" PRIMARY KEY ("id")
);
