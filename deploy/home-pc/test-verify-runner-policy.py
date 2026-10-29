import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('runner_policy', Path(__file__).with_name('verify-runner-policy.py'))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class SudoPolicyTests(unittest.TestCase):
    RUNNER = 'usd-runner'
    DENIED = 'User usd-runner is not allowed to run sudo on ubuntu.\n'
    HEADER = 'Matching Defaults entries for usd-runner on ubuntu:\n    env_reset, use_pty\n\nUser usd-runner may run the following commands on ubuntu:\n'
    NARROW = '    (root) NOPASSWD: /usr/bin/systemctl start usd-auto-deploy.service\n'

    def test_fresh_account_requires_an_explicit_no_privileges_response(self):
        self.assertTrue(policy.accepts_sudo_policy(self.DENIED, self.RUNNER, False))
        for output in ('', 'sudo: permission denied', self.HEADER + self.NARROW, self.DENIED + 'extra output'):
            self.assertFalse(policy.accepts_sudo_policy(output, self.RUNNER, False))

    def test_reused_trigger_requires_exactly_the_one_effective_command(self):
        self.assertTrue(policy.accepts_sudo_policy(self.HEADER + self.NARROW, self.RUNNER, True))
        self.assertFalse(policy.accepts_sudo_policy(self.DENIED, self.RUNNER, True))

    def test_a_separate_direct_or_group_grant_cannot_hide_behind_the_narrow_trigger(self):
        for extra in ('    (root) NOPASSWD: ALL\n', '    (root) /usr/bin/true\n', '    (ALL : ALL) ALL\n'):
            for output in (self.HEADER + self.NARROW + extra, self.HEADER + extra + self.NARROW):
                with self.subTest(output=output):
                    self.assertFalse(policy.accepts_sudo_policy(output, self.RUNNER, True))

    def test_wrapped_exact_command_is_supported_but_argument_wildcards_are_not(self):
        self.assertTrue(policy.accepts_sudo_policy(self.HEADER + self.NARROW.replace(' start ', '\n        start '), self.RUNNER, True))
        for command in ('/usr/bin/systemctl *', '/usr/bin/systemctl start usd-auto-deploy.service, /usr/bin/true', '/usr/bin/systemctl start usd-auto-deploy.service *'):
            self.assertFalse(policy.accepts_sudo_policy(self.HEADER + '    (root) NOPASSWD: ' + command, self.RUNNER, True))


if __name__ == '__main__':
    unittest.main()
