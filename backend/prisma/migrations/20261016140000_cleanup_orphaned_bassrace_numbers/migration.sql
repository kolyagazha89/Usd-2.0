-- Release stale non-primary sticker numbers left behind when BassRace classes
-- were removed before the cleanup was implemented. The primary participant
-- number is retained even when no class references it.
DELETE FROM "RegistrationNumber" rn
WHERE rn."isPrimary" = false
  AND NOT EXISTS (
    SELECT 1
    FROM "RegistrationClass" rc
    WHERE rc."numberId" = rn."id"
  );
