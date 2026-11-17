"""Exercise the shipped Caddy routing and real TLS with disposable upstreams."""
from pathlib import Path
import http.client
import http.server
import os
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parent

class Upstream(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'USD LIVE' if self.path == '/venue/live' else b'USD LOGIN')

    def do_POST(self):
        self.send_response(200)
        self.send_header('Set-Cookie', 'usd_refresh_token=fixture; Path=/auth; HttpOnly; Secure; SameSite=Lax')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"success":true}')

def unused_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

@unittest.skipUnless(os.environ.get('CADDY_BIN'), 'CADDY_BIN required for real gateway test')
class VenueGatewayRuntime(unittest.TestCase):
    def test_https_refresh_cookie_is_scoped_to_proxy_and_http_stays_spectator_only(self):
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        tls_port, http_port = unused_port(), unused_port()
        try:
            with tempfile.TemporaryDirectory(prefix='usd-gateway-') as directory:
                folder = Path(directory)
                source = (ROOT/'Caddyfile').read_text()
                source = source.replace('default_sni {$VENUE_BIND_IP}', 'admin off\n  auto_https disable_redirects\n  skip_install_trust\n  default_sni 127.0.0.1')
                source = source.replace('https://{$VENUE_BIND_IP}', f'https://127.0.0.1:{tls_port}')
                source = source.replace('http://{$VENUE_BIND_IP}', f'http://127.0.0.1:{http_port}')
                for upstream in ('api:3000', 'frontend:80'):
                    source = source.replace(upstream, f'127.0.0.1:{server.server_port}')
                config = folder/'Caddyfile'
                config.write_text(source)
                env = {**os.environ, 'XDG_DATA_HOME': str(folder/'data'), 'XDG_CONFIG_HOME': str(folder/'config')}
                with (folder/'caddy.log').open('w+') as logs:
                    process = subprocess.Popen([os.environ['CADDY_BIN'], 'run', '--config', str(config), '--adapter', 'caddyfile'], env=env, stdout=logs, stderr=logs)
                    try:
                        cert = folder/'data/caddy/pki/authorities/local/root.crt'
                        for _ in range(100):
                            if process.poll() is not None:
                                logs.seek(0)
                                self.fail(logs.read())
                            if cert.exists():
                                try:
                                    context = ssl.create_default_context(cafile=str(cert))
                                    conn = http.client.HTTPSConnection('127.0.0.1', tls_port, context=context, timeout=2)
                                    conn.request('GET', '/login')
                                    response = conn.getresponse()
                                    self.assertEqual(response.status, 200)
                                    response.read()
                                    conn.close()
                                    break
                                except OSError:
                                    pass
                            time.sleep(0.05)
                        else:
                            self.fail('TLS gateway did not start')
                        conn = http.client.HTTPSConnection('127.0.0.1', tls_port, context=context, timeout=2)
                        conn.request('POST', '/venue-api/auth/login', '{}', {'Content-Type': 'application/json'})
                        response = conn.getresponse()
                        self.assertEqual(response.status, 200)
                        cookie = response.getheader('Set-Cookie')
                        self.assertIn('Path=/venue-api/auth;', cookie)
                        self.assertIn('HttpOnly', cookie)
                        self.assertIn('Secure', cookie)
                        self.assertIn('SameSite=Lax', cookie)
                        response.read()
                        conn.close()
                        for method, path, status in [('GET', '/venue/live', 200), ('GET', '/login', 403), ('POST', '/venue-api/auth/login', 403), ('POST', '/venue-api/results/venue-live', 403)]:
                            conn = http.client.HTTPConnection('127.0.0.1', http_port, timeout=2)
                            conn.request(method, path)
                            response = conn.getresponse()
                            self.assertEqual(response.status, status, (method, path))
                            response.read()
                            conn.close()
                    finally:
                        process.terminate()
                        process.wait(timeout=10)
        finally:
            server.shutdown()
            server.server_close()
