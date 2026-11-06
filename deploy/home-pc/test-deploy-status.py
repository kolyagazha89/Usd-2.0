import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

PATH = Path(__file__).with_name('deploy-status.py')
spec = importlib.util.spec_from_file_location('deploy_status', PATH)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
A, B = 'a' * 40, 'b' * 40


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / 'status'
        # Exercise real permissions/atomic files under the test actor's UID;
        # CI additionally runs this suite as root and checks a dropped UID.
        self.uid = patch.object(m, 'ROOT_UID', os.geteuid())
        self.uid.start()
        self.addCleanup(self.uid.stop)

    def start(self):
        return m.create_attempt(self.directory, now=1000)

    def test_atomic_root_report_has_distinct_attempts_and_no_private_fields(self):
        first = self.start()
        m.update_attempt(first, 'CI_PENDING', candidate=A, directory=self.directory, now=1001)
        data = m.read_status(self.directory, now=1001)
        self.assertEqual((data['phase'], data['candidate'], data['retryable']), ('waiting', A, True))
        self.assertIsNone(data['completed'])
        self.assertEqual(set(data), {'protocol', 'attempt', 'candidate', 'completed', 'phase', 'reason', 'retryable', 'started_at', 'updated_at'})
        self.assertEqual((self.directory.stat().st_mode & 0o777, (self.directory/'status.json').stat().st_mode & 0o777), (0o755, 0o644))
        self.assertNotEqual(self.start(), first)
        self.assertEqual(len(list(self.directory.iterdir())), 1)

    def test_previous_writer_cannot_overwrite_new_attempt(self):
        old = self.start()
        current = self.start()
        with self.assertRaises(ValueError):
            m.update_attempt(old, 'RELEASED', candidate=A, directory=self.directory, now=1001)
        self.assertEqual(m.read_status(self.directory, now=1001)['attempt'], current)

    def test_completion_is_exact_candidate_not_latest_main(self):
        attempt = self.start()
        m.update_attempt(attempt, 'RELEASED', candidate=A, directory=self.directory, now=1001)
        row = m.read_status(self.directory, now=1001)
        self.assertEqual((row['candidate'], row['completed'], row['phase']), (A, A, 'succeeded'))
        row['completed'] = B
        with self.assertRaises(ValueError):
            m.validate(row, now=1001)

    def test_unknown_protocol_reason_fields_and_false_success_are_rejected(self):
        self.start()
        row = m.read_status(self.directory, now=1001)
        for change in ({'protocol': True}, {'protocol': 2}, {'reason': 'SECRET=raw log'}, {'phase': 'succeeded'}, {'candidate': 'main'}, {'attempt': '../x'}, {'retryable': True}, {'unexpected': 'private'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                m.validate({**row, **change}, now=1001)

    def test_stale_future_and_backdated_reports_are_rejected(self):
        self.start()
        row = m.read_status(self.directory, now=1001)
        for change in ({'updated_at': 2000}, {'updated_at': 999}, {'started_at': -1}, {'updated_at': True}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                m.validate({**row, **change}, now=1001)
        with self.assertRaises(ValueError):
            m.validate(row, now=1000 + m.MAX_AGE + 1)

    def test_writable_symlink_and_oversized_reports_fail_closed(self):
        self.start()
        file = self.directory/'status.json'
        original = file.read_bytes()
        for mode in (0o666, 0o664):
            file.chmod(mode)
            with self.assertRaises(ValueError):
                m.read_status(self.directory, now=1001)
        file.chmod(0o644)
        file.write_bytes(b'x' * (m.MAX_BYTES + 1))
        with self.assertRaises(ValueError):
            m.read_status(self.directory, now=1001)
        file.write_bytes(original)
        actual = self.directory/'actual'
        file.rename(actual)
        file.symlink_to(actual)
        with self.assertRaises(ValueError):
            m.read_status(self.directory, now=1001)

    def test_untrusted_directory_owner_or_permissions_are_refused(self):
        self.start()
        self.directory.chmod(0o777)
        with self.assertRaises(ValueError):
            m.read_status(self.directory, now=1001)
        self.directory.chmod(0o755)
        with patch.object(m, 'ROOT_UID', os.geteuid() + 1), self.assertRaises(ValueError):
            m.read_status(self.directory, now=1001)

    def test_mutation_guard_is_private_and_survives_a_new_attempt(self):
        private = Path(self.temp.name)/'private'
        private.mkdir(mode=0o700)
        m.guard_candidate(A, private)
        marker=private/'failed-release-sha'
        self.assertEqual(marker.read_text().strip(), A)
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)
        self.start()
        self.assertEqual(marker.read_text().strip(), A)
        with self.assertRaises(ValueError):
            m.guard_candidate('main', private)
        private.chmod(0o777)
        with self.assertRaises(ValueError):
            m.guard_candidate(B, private)
        self.assertEqual(marker.read_text().strip(), A)

    def test_ordinary_user_cannot_write_production_status(self):
        def drop():
            os.setgid(65534)
            os.setuid(65534)
        result = subprocess.run(['python3', str(PATH), 'start'], text=True, capture_output=True,
                                preexec_fn=drop if os.geteuid() == 0 else None)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('Traceback', result.stderr)
        self.assertNotIn('/etc/', result.stderr)


if __name__ == '__main__':
    unittest.main()
