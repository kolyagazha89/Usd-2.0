import importlib.util
from pathlib import Path
import unittest
import io
import subprocess
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("initial_schema", Path(__file__).with_name("initial-schema.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InitialSchemaTests(unittest.TestCase):
    def setUp(self):
        self.allowed = sorted(module.REVIEWED_ADDITIONS)
        self.expected = {"existing_migration": "a" * 64, **module.REVIEWED_ADDITIONS}
        self.history = [{"migration_name": "existing_migration", "checksum": "a" * 64,
                         "finished": True, "rolled_back": False}]

    def test_only_reviewed_nullable_additions_can_be_applied(self):
        self.assertEqual(module.pending_migrations(self.expected, self.history), self.allowed)

    def test_already_applied_additions_are_not_reapplied(self):
        self.history.extend({"migration_name": name, "checksum": digest, "finished": True,
                             "rolled_back": False} for name, digest in module.REVIEWED_ADDITIONS.items())
        self.assertEqual(module.pending_migrations(self.expected, self.history), [])

    def test_missing_prior_migration_cannot_be_bootstrapped(self):
        with self.assertRaisesRegex(ValueError, "Unreviewed pending"):
            module.pending_migrations(self.expected, [])

    def test_changed_applied_migration_refuses_without_repairing_history(self):
        self.history[0]["checksum"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "checksum"):
            module.pending_migrations(self.expected, self.history)

    def test_failed_unknown_or_duplicate_history_refuses(self):
        for extra in [dict(self.history[0], finished=False),
                      dict(self.history[0], migration_name="unknown"), self.history[0]]:
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                module.pending_migrations(self.expected, self.history + [extra])

    def test_changed_reviewed_sql_is_not_implicitly_approved(self):
        self.expected[self.allowed[0]] = "c" * 64
        with self.assertRaisesRegex(ValueError, "Reviewed migration content"):
            module.pending_migrations(self.expected, self.history)

    def test_rolled_back_attempt_does_not_shadow_a_completed_attempt(self):
        self.history.insert(0, dict(self.history[0], finished=False, rolled_back=True))
        self.assertEqual(module.pending_migrations(self.expected, self.history), self.allowed)

    def test_concurrent_new_registrations_do_not_look_like_data_loss(self):
        module.verify_row_counts(["Participant|4", "Result|8"], ["Participant|5", "Result|8"])

    def test_lost_rows_or_tables_refuse_acceptance(self):
        for after in (["Participant|3", "Result|8"], ["Result|8"]):
            with self.subTest(after=after), self.assertRaises(ValueError):
                module.verify_row_counts(["Participant|4", "Result|8"], after)

    def test_timeout_or_interrupt_removes_the_live_migration_container(self):
        for error in (subprocess.TimeoutExpired("docker", 600), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__), patch.object(module.subprocess, "run", side_effect=[SimpleNamespace(returncode=0), error, SimpleNamespace(returncode=0)]) as run:
                with self.assertRaises(type(error)):
                    module.execute_migration("image", "api", "/private/env", io.StringIO())
                create, _, remove = [call.args[0] for call in run.call_args_list]
                name = create[create.index("--name") + 1]
                self.assertEqual(remove, ["docker", "rm", "-f", name])
                self.assertIn("540s", create)

    def test_failed_container_cleanup_blocks_acceptance(self):
        with patch.object(module.subprocess, "run", side_effect=[SimpleNamespace(returncode=0), SimpleNamespace(returncode=0), SimpleNamespace(returncode=1), SimpleNamespace(returncode=0, stdout="still-present")]):
            with self.assertRaisesRegex(ValueError, "CRITICAL"):
                module.execute_migration("image", "api", "/private/env", io.StringIO())


if __name__ == "__main__":
    unittest.main()
