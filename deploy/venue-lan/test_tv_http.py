"""Read-only LAN TV transport: certificate-free viewing must never expose judging."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent

class VenueTvHttpContracts(unittest.TestCase):
    def test_http_only_exposes_tv_shell_assets_and_anonymous_live_snapshot(self):
        caddy = (ROOT / 'Caddyfile').read_text(encoding='utf-8')
        self.assertIn('http://{$VENUE_BIND_IP}', caddy)
        http = caddy.split('http://{$VENUE_BIND_IP} {', 1)[1]
        self.assertRegex(http, r'handle /venue/live\s*\{')
        self.assertRegex(http, r'handle /assets/\*\s*\{')
        self.assertIn('handle /usd-venue-config.js', http)
        self.assertRegex(http, r'method GET')
        self.assertIn('/venue-api/results/venue-live', http)
        self.assertIn('header_up -Cookie', http)
        self.assertIn('header_up -Authorization', http)
        self.assertIn('respond "HTTPS', http)
        self.assertNotIn('handle_path /venue-api/*', http)
        self.assertNotIn('handle /login', http)
        self.assertNotIn('handle /admin', http)

    def test_router_only_port_80_is_separate_from_https_and_db(self):
        compose = (ROOT / 'compose.yaml').read_text(encoding='utf-8')
        self.assertIn('${VENUE_BIND_IP}:80:80/tcp', compose)
        self.assertIn('${VENUE_BIND_IP}:443:443/tcp', compose)
        self.assertNotIn('0.0.0.0:80', compose)
        self.assertNotIn('5432:5432', compose)
        firewall = (ROOT / 'venue-firewall.ps1').read_text(encoding='utf-8')
        self.assertIn('-LocalPort 80,443', firewall)
        self.assertIn('-Profile Private', firewall)
        self.assertIn('-RemoteAddress LocalSubnet', firewall)
        self.assertIn('-LocalAddress $Ip', firewall)

    def test_release_launcher_shows_certificate_free_real_tv_url(self):
        control = (ROOT / 'venue-control.ps1').read_text(encoding='utf-8-sig')
        self.assertIn("'LIVE без сертификата: http://'", control)
        self.assertNotIn('/venue/live?demo=1', control)
        self.assertIn('https://', control)

if __name__ == '__main__':
    unittest.main()
