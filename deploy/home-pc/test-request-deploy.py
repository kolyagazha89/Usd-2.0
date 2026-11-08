import importlib.util
from pathlib import Path
import unittest
import time
import subprocess
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('request_deploy', Path(__file__).with_name('request-deploy.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
A, B = 'a' * 40, 'b' * 40


def row(attempt, reason, candidate=A):
    phase, retry = m.status.REASONS[reason]
    return {'protocol': 1, 'attempt': attempt * 32, 'candidate': candidate,
            'completed': candidate if phase == 'succeeded' else None,
            'phase': phase, 'reason': reason, 'retryable': retry,
            'started_at': int(time.time()), 'updated_at': int(time.time())}


class RequestTests(unittest.TestCase):
    def execute(self, reports, outcomes=None, budget=5, verification=True, main=B):
        self.starts, self.verified, self.output = [], [], []
        clock = [0]
        reports = iter(reports)
        outcomes = iter(outcomes or [0] * 10)
        def start(timeout):
            self.starts.append(timeout)
            result = next(outcomes)
            return result if isinstance(result, tuple) else (result, format(len(self.starts), 'x') * 32)
        def verify(sha, timeout):
            self.verified.append(sha)
            return verification
        def sleep(seconds): clock[0] += seconds
        return m.request(A, read=lambda: next(reports), start=start, verify=verify,
                         sleep=sleep, clock=lambda: clock[0], emit=self.output.append,
                         budget=budget, interval=1, latest=lambda _: main)

    def test_pending_ci_is_retried_without_public_probe_then_checks_completed_sha(self):
        self.assertEqual(self.execute([None, row('1', 'CI_PENDING'), row('1', 'CI_PENDING'), row('2', 'RELEASED', B)]), 0)
        self.assertEqual(self.verified, [B])
        self.assertEqual(len(self.starts), 2)

    def test_real_blocker_stops_immediately_without_revision_probe(self):
        for reason in ('SCHEMA_POLICY_MISSING', 'QUARANTINED', 'MIGRATION_CHECK_FAILED', 'CURRENT_RELEASE_INCONSISTENT'):
            with self.subTest(reason=reason):
                self.assertNotEqual(self.execute([None, row('1', reason)], outcomes=[1]), 0)
                self.assertEqual(len(self.starts), 1)
                self.assertEqual(self.verified, [])
                self.assertIn(reason, ' '.join(self.output))

    def test_old_success_after_lock_busy_cannot_be_accepted(self):
        old = row('1', 'RELEASED')
        self.assertNotEqual(self.execute([old, old] * 5, budget=2), 0)
        self.assertEqual(self.verified, [])

    def test_service_failure_with_stale_success_is_not_retried_or_accepted(self):
        old = row('1', 'RELEASED')
        self.assertNotEqual(self.execute([old, old], outcomes=[1]), 0)
        self.assertEqual(self.verified, [])
        self.assertEqual(len(self.starts), 1)

    def test_coalesced_active_attempt_may_finish_but_not_remain_running_forever(self):
        self.assertEqual(self.execute([row('1', 'FETCHING_SOURCE'), row('1', 'RELEASED')]), 0)
        self.assertEqual(self.verified, [A])
        running = row('1', 'FETCHING_SOURCE')
        self.assertNotEqual(self.execute([running, running] * 5, budget=2), 0)
        self.assertEqual(self.verified, [])

    def test_missing_unknown_or_malformed_protocol_is_not_success(self):
        for invalid in (None, {}, {**row('1', 'RELEASED'), 'protocol': 2}):
            with self.subTest(invalid=invalid):
                self.assertNotEqual(self.execute([None, invalid]), 0)
                self.assertEqual(self.verified, [])

    def test_confirmed_completion_with_failed_public_verifier_stops(self):
        self.assertNotEqual(self.execute([None, row('1', 'RELEASED')], verification=False), 0)
        self.assertEqual(self.verified, [A] * 5)  # five-second fixture budget, never more than remaining time
        self.assertEqual(len(self.starts), 1)

    def test_transient_public_probe_failure_retries_exact_completed_sha_without_new_deploy(self):
        calls, output, clock = [], [], [0]
        attempts = iter([False] * 5 + [True])
        def verify(sha, timeout):
            calls.append(sha)
            return next(attempts)
        result = m.request(A, read=iter([None, row('1', 'RELEASED')]).__next__,
                           start=lambda _: (0, '1' * 32), verify=verify,
                           sleep=lambda sec: clock.__setitem__(0, clock[0] + sec),
                           clock=lambda: clock[0], emit=output.append,
                           budget=30, interval=1, latest=lambda _: A)
        self.assertEqual(result, 0)
        self.assertEqual(calls, [A] * 6)
        self.assertEqual(output[-1], 'ACCEPTED ' + A)

    def test_recovery_after_five_transient_public_failures_never_retriggers_root_deploy(self):
        checks, starts, output, clock = [], [], [], [0]
        def verify(sha, _):
            checks.append(sha)
            return len(checks) == 6
        def start(_):
            starts.append(1)
            return 0, '1' * 32
        result = m.request(A, read=iter([None, row('1', 'RELEASED')]).__next__,
                           start=start, verify=verify,
                           sleep=lambda sec: clock.__setitem__(0, clock[0] + sec),
                           clock=lambda: clock[0], emit=output.append,
                           budget=420, interval=30, latest=lambda _: A)
        self.assertEqual(result, 0)
        self.assertEqual(checks, [A] * 6)
        self.assertEqual(starts, [1])
        self.assertEqual(output[-1], 'ACCEPTED ' + A)

    def test_persistent_public_failure_never_pretends_release_is_accepted(self):
        checks, output, clock = [], [], [0]
        result = m.request(A, read=iter([None, row('1', 'RELEASED')]).__next__,
                           start=lambda _: (0, '1' * 32),
                           verify=lambda sha, _: checks.append(sha) or False,
                           sleep=lambda sec: clock.__setitem__(0, clock[0] + sec),
                           clock=lambda: clock[0], emit=output.append,
                           budget=420, interval=30, latest=lambda _: A)
        self.assertNotEqual(result, 0)
        self.assertEqual(checks, [A] * 8)
        self.assertTrue(any('PUBLIC_ACCEPTANCE_FAILED' in x for x in output))
        self.assertFalse(any(x.startswith('ACCEPTED ') for x in output))

    def test_public_probe_persistently_fails_closed_without_acceptance(self):
        calls, output, clock = [], [], [0]
        def verify(sha, timeout):
            calls.append(sha)
            return False
        result = m.request(A, read=iter([None, row('1', 'RELEASED')]).__next__,
                           start=lambda _: (0, '1' * 32), verify=verify,
                           sleep=lambda sec: clock.__setitem__(0, clock[0] + sec),
                           clock=lambda: clock[0], emit=output.append,
                           budget=30, interval=1, latest=lambda _: A)
        self.assertNotEqual(result, 0)
        self.assertEqual(calls, [A] * 8)
        self.assertTrue(any('PUBLIC_ACCEPTANCE_FAILED' in line for line in output))
        self.assertFalse(any(line.startswith('ACCEPTED ') for line in output))

    def test_public_probe_retries_never_verify_an_old_or_different_sha(self):
        checked, clock = [], [0]
        first = [True]
        def read():
            if first.pop() if first else False:
                return None
            return row('1', 'RELEASED', B)
        result = m.request(A, read=read,
                           start=lambda _: (0, '1' * 32),
                           verify=lambda sha, _: checked.append(sha) or False,
                           sleep=lambda sec: clock.__setitem__(0, clock[0] + sec),
                           clock=lambda: clock[0], budget=30, interval=1, latest=lambda _: A,
                           emit=lambda _: None)
        self.assertNotEqual(result, 0)
        self.assertEqual(checked, [])

    def test_service_request_keeps_the_exact_existing_sudo_boundary(self):
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, 'PRIVATE', 'PRIVATE')) as run:
            self.assertEqual(m.start_service(10), (1, None))
        self.assertEqual(run.call_args_list[0].args[0], ['sudo', '-n', '/usr/bin/systemctl', 'start', 'usd-auto-deploy.service'])
        self.assertTrue(run.call_args_list[0].kwargs['capture_output'])
        self.assertEqual(run.call_args_list[0].kwargs['timeout'], 10)

    def test_older_coalesced_release_does_not_satisfy_new_trigger(self):
        self.assertNotEqual(self.execute([row('1', 'FETCHING_SOURCE', B), row('1', 'RELEASED', B)], budget=1, main=A), 0)
        self.assertEqual(self.verified, [])

    def test_initial_read_failure_cannot_reuse_another_service_invocation(self):
        self.assertNotEqual(self.execute([None, row('1', 'RELEASED')], outcomes=[(0, '2'*32)], budget=1), 0)
        self.assertEqual(self.verified, [])

    def test_invalid_trigger_never_starts_systemd(self):
        calls=[]
        self.assertNotEqual(m.request('main', start=lambda _: calls.append(1), emit=lambda _: None), 0)
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
