#!/usr/bin/env python3
"""Unit regressions for additive-only automated schema policy (no Docker)."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name("safe-schema-migration.py")
spec = importlib.util.spec_from_file_location("safe_schema_migration", MODULE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SafeSqlTests(unittest.TestCase):
    def test_existing_push_migration_is_recognized(self):
        sql = (Path(__file__).parents[2] /
               "backend/prisma/migrations/20261030061000_push_subscriptions/migration.sql").read_text()
        module.check_additive_sql(sql)

    def test_new_table_and_index(self):
        module.check_additive_sql("""
            CREATE TABLE "NewThing" (
              "id" TEXT NOT NULL,
              "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "NewThing_pkey" PRIMARY KEY ("id")
            );
            CREATE UNIQUE INDEX "NewThing_id_key" ON "NewThing"("id");
            ALTER TABLE "NewThing" ADD CONSTRAINT "NewThing_id_fkey"
              FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        """)

    def test_nullable_added_column_on_old_table(self):
        module.check_additive_sql('ALTER TABLE "Participant" ADD COLUMN "nickname" TEXT;')
        module.check_additive_sql('ALTER TABLE "Participant" ADD COLUMN "rating" DECIMAL(12,2) NULL;')

    def test_destructive_and_data_moving_sql_fails_closed(self):
        cases = [
            'DROP TABLE "Participant";',
            'DELETE FROM "Participant";',
            'UPDATE "Participant" SET "name" = NULL;',
            'TRUNCATE TABLE "Participant";',
            'ALTER TABLE "Participant" DROP COLUMN "name";',
            'ALTER TABLE "Participant" RENAME COLUMN "name" TO "nickname";',
            'ALTER TABLE "Participant" ALTER COLUMN "name" SET NOT NULL;',
            'ALTER TABLE "Participant" ADD COLUMN "rating" INTEGER NOT NULL;',
            'ALTER TABLE "Participant" ADD COLUMN "rating" INTEGER DEFAULT 0;',
            'CREATE INDEX "Participant_name_idx" ON "Participant"("name");',
            'CREATE UNIQUE INDEX "Participant_name_idx" ON "Participant"("name");',
            'ALTER TABLE "Participant" ADD CONSTRAINT "foo" CHECK (TRUE);',
            'CREATE EXTENSION "evil";',
            'CREATE FUNCTION f() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;',
            'CREATE TABLE "T" ("id" TEXT NOT NULL); DROP TABLE "Participant";',
            'CREATE TABLE "T" ("id" TEXT NOT NULL DEFAULT (SELECT password FROM "User"));',
            'CREATE TABLE "T" ("id" TEXT NOT NULL); ALTER TABLE "User" ADD CONSTRAINT "x" FOREIGN KEY ("id") REFERENCES "T"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
            '/* hidden */ CREATE TABLE "T" ("id" TEXT);',
            '',
        ]
        for text in cases:
            with self.subTest(sql=text), self.assertRaises(ValueError):
                module.check_additive_sql(text)

    def test_no_index_or_fk_on_old_tables_in_mixed_migration(self):
        for sql in (
            'CREATE TABLE "T" ("id" TEXT); CREATE INDEX "old_idx" ON "Participant"("name");',
            'CREATE TABLE "T" ("id" TEXT); ALTER TABLE "Participant" ADD CONSTRAINT "fk" FOREIGN KEY ("id") REFERENCES "T"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
        ):
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                module.check_additive_sql(sql)

    def test_duplicate_new_table_and_malformed_definitions(self):
        for sql in (
            'CREATE TABLE "T" ("id" TEXT); CREATE TABLE "T" ("id" TEXT);',
            'CREATE TABLE "T" ("id" TEXT, "x" TEXT NOT NULL DEFAULT now());',
            'CREATE TABLE "T" ("id" TEXT, "x" TEXT, CHECK (TRUE));',
            'CREATE TABLE "T" ("id" TEXT; -- broken',
        ):
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                module.check_additive_sql(sql)

    def test_new_migration_diff_rejects_changes_to_history(self):
        old = "a" * 40
        new = "b" * 40
        with patch.object(module, "run", return_value="M\tbackend/prisma/migrations/20261030061000_push_subscriptions/migration.sql"):
            with self.assertRaisesRegex(ValueError, "Existing migration"):
                module.migration_state(old, new, "db")

    def test_new_migration_diff_rejects_prisma_config_and_deletion(self):
        for changed in ("A\tbackend/prisma/prisma.config.ts",
                        "D\tbackend/prisma/schema.prisma",
                        "R100\tbackend/prisma/old\tbackend/prisma/new"):
            with self.subTest(changed=changed):
                with patch.object(module, "run", return_value=changed):
                    with self.assertRaises(ValueError):
                        module.migration_state("a" * 40, "b" * 40, "db")

    def test_policy_update_is_private_and_atomic(self):
        with tempfile.TemporaryDirectory() as d:
            policy = Path(d) / "policy"
            policy.write_text("a" * 40 + "\n")
            policy.chmod(0o600)
            with patch.object(module, "POLICY", policy):
                # Host trust check expects root; CI runners execute this test
                # unprivileged, so mock just the ownership predicate.
                with patch.object(module, "private"):
                    module.promote_schema("b" * 40)
            self.assertEqual(policy.read_text(), "b" * 40 + "\n")
            self.assertEqual(policy.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
