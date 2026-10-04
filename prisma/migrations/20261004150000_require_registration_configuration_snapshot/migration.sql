-- Registration history must always point to the exact configuration version
-- that was selected at registration time. Do not invent historical versions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Registration"
    WHERE "configurationVersionId" IS NULL
       OR "configurationSnapshot" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot make registration configuration fields required: existing registrations contain NULL configurationVersionId/configurationSnapshot. Backfill historical data explicitly before deploying this migration.';
  END IF;
END $$;

ALTER TABLE "Registration"
  ALTER COLUMN "configurationVersionId" SET NOT NULL,
  ALTER COLUMN "configurationSnapshot" SET NOT NULL;
