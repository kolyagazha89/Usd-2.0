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
    def test_schema_pin_is_atomic_in_systemd_writable_root_state(self):
        service = Path(__file__).with_name("usd-auto-deploy.service").read_text()
        builder = Path(__file__).with_name("auto-deploy.sh").read_text()
        installer = Path(__file__).with_name("install-local-deployer.sh").read_text()
        self.assertIn("ProtectSystem=full", service)
        self.assertIn("StateDirectory=usd-deployer", service)
        self.assertEqual(module.POLICY, module.STATE / "schema-pin")
        self.assertIn('POLICY="$STATE_DIR/schema-pin"', builder)
        self.assertIn('PIN=/var/lib/usd-deployer/schema-pin', installer)
        self.assertIn('LEGACY_PIN=/etc/usd-auto-release-schema', installer)
        self.assertIn('[[ ! -e "$PIN" && ! -L "$PIN"', installer)
        self.assertNotIn('POLICY=/etc/usd-auto-release-schema', builder)
        # Quarantine is never silently removed: only an explicitly requested,
        # audited, SHA-pinned and main-verified recovery is permitted.
        self.assertIn('--review-quarantined-schema-release', installer)
        self.assertIn('remote_main=', installer)
        self.assertIn('reviewed-failed-release-$failed_sha', installer)
        self.assertNotIn('rm -f "$marker"', installer)

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

    def test_reconcile_applied_migration_never_replays_sql(self):
        """Restore previous release after Prisma succeeded but policy pin did not."""
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / "initial-preflight"
            receipt.write_text("test receipt")
            with patch.object(module, "RECEIPT", receipt), \
                 patch.object(module, "run_migration") as migrate, \
                 patch.object(module, "migration_state", return_value=([], {})) as history, \
                 patch.object(module, "container", return_value="known-db"), \
                 patch.object(module, "run", return_value="healthy"), \
                 patch.object(module, "row_counts", return_value={"Registration": 42}), \
                 patch.object(module, "promote_schema") as promote:
                module.apply_or_reconcile("old", "new", "old-api", "known-db",
                                          "candidate-image", "db-url",
                                          {"Registration": 42}, "approved-new-tree", [])
            migrate.assert_not_called()
            history.assert_called_once_with("old", "new", "known-db")
            promote.assert_called_once_with("approved-new-tree")
            self.assertFalse(receipt.exists())

    def test_pending_migration_applies_once_then_verifies(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / "initial-preflight"
            receipt.write_text("test receipt")
            with patch.object(module, "RECEIPT", receipt), \
                 patch.object(module, "run_migration") as migrate, \
                 patch.object(module, "migration_state", return_value=([], {})), \
                 patch.object(module, "container", return_value="known-db"), \
                 patch.object(module, "run", return_value="healthy"), \
                 patch.object(module, "row_counts", return_value={"TeamPost": 5}), \
                 patch.object(module, "promote_schema") as promote:
                module.apply_or_reconcile("old", "new", "old-api", "known-db",
                                          "new-image", "db-url",
                                          {"TeamPost": 5}, "new-tree", ["photo-gallery"])
            migrate.assert_called_once_with("new-image", "old-api", "db-url")
            promote.assert_called_once_with("new-tree")

    def test_incomplete_history_never_promotes_schema(self):
        with patch.object(module, "run_migration") as migrate, \
             patch.object(module, "migration_state", return_value=(["pending-migration"], {})), \
             patch.object(module, "promote_schema") as promote:
            with self.assertRaisesRegex(ValueError, "still contains pending"):
                module.apply_or_reconcile("old", "new", "api", "db", "image",
                                          "db-url", {}, "tree", [])
        migrate.assert_not_called()
        promote.assert_not_called()

    def test_row_loss_or_unhealthy_db_blocks_schema_pin(self):
        for rows, health in (({"Registration": 0}, "healthy"),
                             ({"Registration": 1}, "unhealthy")):
            with self.subTest(rows=rows, health=health):
                with patch.object(module, "migration_state", return_value=([], {})), \
                     patch.object(module, "container", return_value="db"), \
                     patch.object(module, "run", return_value=health), \
                     patch.object(module, "row_counts", return_value=rows), \
                     patch.object(module, "promote_schema") as promote:
                    with self.assertRaisesRegex(ValueError, "rows|unhealthy"):
                        module.apply_or_reconcile("old", "new", "api", "db", "image",
                                                  "db-url", {"Registration": 1}, "tree", [])
                promote.assert_not_called()

    def test_post_migration_subprocess_failures_have_safe_phase_names(self):
        with patch.object(module, "migration_state", side_effect=OSError("sensitive underlying path")), \
             patch.object(module, "promote_schema") as promote:
            with self.assertRaisesRegex(ValueError, "Post-migration Prisma checksum/history verification failed"):
                module.apply_or_reconcile("old", "new", "api", "db", "image",
                                          "db-url", {}, "tree", [])
        promote.assert_not_called()

    def test_preflight_os_error_is_safely_classified_without_path_or_credentials(self):
        import io
        from contextlib import redirect_stderr
        secret = "postgresql://private:secret@db:5432/usd"
        error = FileNotFoundError(2, "unavailable", secret)
        with patch.object(module, "main", side_effect=error), \
             patch.object(module, "sys") as fake_sys:
            # Main's top-level exception formatting is deliberately restricted
            # to exception type and errno; never stringify untrusted paths.
            self.assertIsInstance(error, OSError)
            safe = "Automatic schema migration OS failure: " + type(error).__name__ + " (errno " + str(error.errno) + ")"
            self.assertNotIn(secret, safe)
            self.assertIn("errno 2", safe)

    def test_reconcile_missing_receipt_must_not_replay_sql(self):
        with patch.object(module, "run_migration") as migrate, \
             patch.object(module, "promote_schema") as promote:
            missing = Path("/nonexistent-usd-preflight-test/receipt")
            with patch.object(module, "RECEIPT", missing):
                with self.assertRaises(FileNotFoundError):
                    module.private(missing)
        migrate.assert_not_called()
        promote.assert_not_called()

    def test_failed_atomic_pin_rename_reports_phase_and_errno_not_paths(self):
        # Reproduces a restored/migrated production database whose root-owned
        # schema-pin is immutable: rename fails, but no SQL must be rerun and
        # the original approved pin must remain untouched.
        with tempfile.TemporaryDirectory() as d:
            policy = Path(d) / "schema-pin"
            policy.write_text("a" * 40 + "\n")
            policy.chmod(0o600)
            secret_path = "/root/secret/connection-password"
            failure = PermissionError(1, "Operation not permitted", secret_path)
            with patch.object(module, "POLICY", policy), \
                 patch.object(module, "private"), \
                 patch.object(module.os, "replace", side_effect=failure):
                with self.assertRaises(ValueError) as raised:
                    module.promote_schema("b" * 40)
            msg = str(raised.exception)
            self.assertIn("during rename", msg)
            self.assertIn("errno 1", msg)
            self.assertNotIn(secret_path, msg)
            self.assertEqual(policy.read_text(), "a" * 40 + "\n")
            self.assertFalse(list(Path(d).glob(".usd-auto-schema.*")))

    def test_schema_pin_temp_creation_failure_is_diagnosed_safely(self):
        failure = PermissionError(13, "Cannot create", "/root/private/path")
        with patch.object(module, "private"), \
             patch.object(module.tempfile, "mkstemp", side_effect=failure):
            with self.assertRaisesRegex(ValueError, r"during create.*errno 13") as raised:
                module.promote_schema("b" * 40)
        self.assertNotIn("/root/private/path", str(raised.exception))

    def test_immutable_pin_repair_requires_explicit_review_and_unchanged_baseline(self):
        installer = Path(__file__).with_name("install-local-deployer.sh").read_text()
        builder = Path(__file__).with_name("auto-deploy.sh").read_text()
        self.assertIn('--review-quarantined-schema-release', installer)
        self.assertIn('if [[ "$review_retry" == 1 ]]; then', installer)
        guarded = installer.split('if [[ "$review_retry" == 1 ]]; then', 1)[1]
        self.assertIn('pin_flags="$(lsattr -d "$PIN" 2>/dev/null)"', guarded)
        self.assertIn('cmp -s "$PIN" "$LEGACY_PIN"', guarded)
        self.assertIn('chattr -i "$PIN"', guarded)
        self.assertIn('reviewed-immutable-schema-pin-$failed_sha', guarded)
        self.assertNotIn('chattr -i', builder)
        self.assertEqual(installer.count('chattr -i "$PIN"'), 1)

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
