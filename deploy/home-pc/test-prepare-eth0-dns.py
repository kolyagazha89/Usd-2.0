#!/usr/bin/env python3
"""Pure offline tests for the non-privileged Netplan overlay generator."""

import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).with_name('prepare-eth0-dns.py')
spec = importlib.util.spec_from_file_location('usd_prepare_dns', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NetplanDnsOverlayTests(unittest.TestCase):
    def test_uses_exact_working_resolver_and_verified_interface(self):
        text = module.render_overlay('eth0', '8.8.8.8')
        self.assertIn('    eth0:\n', text)
        self.assertIn('          - 8.8.8.8\n', text)
        self.assertEqual(1, text.count('          - '))
        self.assertIn('      dhcp4-overrides:\n        use-dns: false\n', text)
        self.assertIn('      dhcp6-overrides:\n        use-dns: false\n', text)
        for forbidden in ('gateway4:', 'routes:', 'addresses: [', 'renderer:', 'dhcp4: false'):
            self.assertNotIn(forbidden, text)

    def test_rejects_yaml_injection_and_unsafe_interface_ids(self):
        for interface in ('', 'eth0\n  renderer: NetworkManager', 'eth0: { }', '../eth0', '123', 'eth0 /tmp', 'x' * 16):
            with self.subTest(interface=interface):
                with self.assertRaises(ValueError):
                    module.render_overlay(interface, '8.8.8.8')

    def test_rejects_non_public_or_non_ipv4_dns(self):
        for resolver in ('', '127.0.0.1', '0.0.0.0', '192.168.1.1', '169.254.1.1', '224.0.0.1', '::1', '2606:4700:4700::1111', '8.8.8.8\n  gateway4: 1.2.3.4'):
            with self.subTest(resolver=resolver):
                with self.assertRaises(ValueError):
                    module.render_overlay('eth0', resolver)

    def test_cli_is_read_only_and_renders_to_stdout(self):
        result = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, check=True)
        self.assertIn('eth0:', result.stdout)
        self.assertIn('8.8.8.8', result.stdout)
        self.assertEqual('', result.stderr)

    def test_invalid_cli_fails_without_output_overlay(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--resolver', '127.0.0.1'], capture_output=True, text=True)
        self.assertNotEqual(0, result.returncode)
        self.assertNotIn('network:', result.stdout)


if __name__ == '__main__':
    unittest.main()
