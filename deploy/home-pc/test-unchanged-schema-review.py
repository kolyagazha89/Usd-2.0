"""Actual recovery entry point: equal schema trees are reviewable, never applicable."""
from contextlib import ExitStack
import hashlib
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('schema_review', Path(__file__).with_name('safe-schema-migration.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
OLD, NEW, TREE = 'a'*40, 'b'*40, 'c'*40
NAME = '20261117090000_fixture'
PATH = 'backend/prisma/migrations/'+NAME+'/migration.sql'
SQL = b'CREATE TABLE "Fixture" ("id" TEXT);'
ROW = {'name': NAME, 'sha': hashlib.sha256(SQL).hexdigest(), 'finished': True, 'rolled_back': False}


class UnchangedSchemaReview(unittest.TestCase):
    def review(self, *, mode='--check', rows=None, health='healthy', old_tree=TREE,
               policy=TREE, api_image=None, paths=PATH):
        with ExitStack() as stack:
            source = Mock()
            source.is_symlink.return_value = False
            source.lstat.return_value = SimpleNamespace(st_uid=0, st_mode=0o40755)
            stack.enter_context(patch.object(module, 'SOURCE', source))
            stack.enter_context(patch.object(module, 'POLICY', Mock(read_text=lambda: policy)))
            stack.enter_context(patch.object(module.os, 'geteuid', return_value=0))
            lock = stack.enter_context(patch.object(module, 'locked'))
            private = stack.enter_context(patch.object(module, 'private'))
            stack.enter_context(patch.object(module, 'container', side_effect=lambda name: name+'-fixture'))
            history = stack.enter_context(patch.object(module, 'history', return_value=[ROW] if rows is None else rows))
            stack.enter_context(patch.object(module.subprocess, 'check_output', return_value=SQL))
            def command(*args):
                if args[0] == 'git' and 'rev-parse' in args:
                    return old_tree if args[-1] == OLD+':backend/prisma' else TREE
                if args[0] == 'git' and 'ls-tree' in args:
                    return paths
                if args[0] == 'docker' and args[-2] == '{{.Config.Image}}':
                    return api_image or 'ghcr.io/kolyagazha89/usd-2.0-api:'+OLD
                if args[0] == 'docker' and args[-2] == '{{.State.Health.Status}}':
                    return health
                raise AssertionError('Unexpected command in read-only review: '+str(args))
            stack.enter_context(patch.object(module, 'run', side_effect=command))
            migrate = stack.enter_context(patch.object(module, 'run_migration'))
            promote = stack.enter_context(patch.object(module, 'promote_schema'))
            apply = stack.enter_context(patch.object(module, 'apply_or_reconcile'))
            try:
                result = module.main(['safe-schema-migration.py', mode, NEW, OLD, TREE])
                lock.assert_called_once()
                self.assertEqual(private.call_count, 2)
                history.assert_called_once_with('db-fixture')
                return result
            finally:
                migrate.assert_not_called()
                promote.assert_not_called()
                apply.assert_not_called()

    def test_application_only_release_passes_full_read_only_review(self):
        self.assertEqual(self.review(), 0)

    def test_same_tree_apply_stays_forbidden(self):
        with self.assertRaisesRegex(ValueError, 'Unapproved schema source transition'):
            self.review(mode='--apply')

    def test_wrong_pin_previous_source_or_live_api_is_rejected(self):
        for options in ({'policy': 'd'*40}, {'old_tree': 'd'*40}, {'api_image': 'other-api'}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.review(**options)

    def test_unhealthy_database_and_empty_trusted_history_are_rejected(self):
        for options in ({'health': 'unhealthy'}, {'paths': ''}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.review(**options)

    def test_incomplete_duplicate_modified_or_unknown_live_history_is_rejected(self):
        for rows in ([], [ROW, ROW], [{**ROW, 'sha': '0'*64}],
                     [{**ROW, 'finished': False}], [{**ROW, 'name': 'unknown'}],
                     [{**ROW, 'rolled_back': True}]):
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                self.review(rows=rows)


if __name__ == '__main__':
    unittest.main()
