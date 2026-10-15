-- Keep only ADMIN and PARTICIPANT as system roles.
-- Existing judges become PARTICIPANT accounts with the editable "Судья" custom role.
INSERT INTO "Role" (
  "id", "key", "name", "description", "permissions", "isSystem", "createdAt", "updatedAt"
)
VALUES (
  'usd-custom-role-judge',
  'judge',
  'Судья',
  'Перенесённая роль для операционной работы на этапах. Все разрешения редактируются администратором.',
  '{
    "stages": ["view", "create", "update"],
    "registrations": ["view", "create", "update"],
    "inspections": ["view", "create", "update"],
    "results": ["view", "create"],
    "statistics": ["view"],
    "participants": ["view"],
    "cars": ["view"],
    "configurations": ["view"],
    "disqualifications": ["view", "create", "update"],
    "history": ["view"]
  }'::jsonb,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "permissions" = EXCLUDED."permissions",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "User"
SET "role" = 'PARTICIPANT',
    "customRoleId" = (SELECT "id" FROM "Role" WHERE "key" = 'judge')
WHERE "role"::text = 'JUDGE';

-- PostgreSQL cannot drop a single enum value in place; recreate the enum after migrating rows.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PARTICIPANT');
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::text)::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PARTICIPANT';
DROP TYPE "UserRole_old";
