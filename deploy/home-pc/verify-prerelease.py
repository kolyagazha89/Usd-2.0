#!/usr/bin/env python3
"""Read-only public acceptance; no credentials, mutations or primary-domain access."""
from html.parser import HTMLParser
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

APP = 'https://app.usd-russia.ru'
API = 'https://api.usd-russia.ru'
MAX_BYTES = 8 * 1024 * 1024


def allowed_origin(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    origin = f'{parsed.scheme}://{parsed.netloc}'
    if origin not in (APP, API) or parsed.username or parsed.password:
        raise ValueError('Prerelease request target is not an approved HTTPS origin')
    return origin


class PrereleaseRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if allowed_origin(newurl) != allowed_origin(req.full_url):
            raise ValueError('Cross-origin prerelease redirect refused')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url: str, accept: str) -> tuple[int, str, bytes]:
    allowed_origin(url)
    request = urllib.request.Request(url, headers={
        'Cache-Control': 'no-cache', 'User-Agent': 'USD-release-check', 'Accept': accept,
    })
    opener = urllib.request.build_opener(PrereleaseRedirectHandler())
    try:
        response = opener.open(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError('Prerelease response exceeds verification limit')
        return response.code, response.headers.get_content_type(), body


def get_json(url: str):
    status, content_type, body = fetch(url, 'application/json')
    if status != 200 or content_type != 'application/json':
        raise ValueError('Prerelease JSON endpoint did not return HTTP 200 application/json')
    return json.loads(body)


def get_status(url: str) -> int:
    return fetch(url, 'application/json')[0]


class Entrypoints(HTMLParser):
    def __init__(self):
        super().__init__()
        self.root = False
        self.scripts = []
        self.styles = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        self.root = self.root or values.get('id') == 'root'
        if tag == 'script' and values.get('type') == 'module' and values.get('src'):
            self.scripts.append(values['src'])
        if tag == 'link' and 'stylesheet' in values.get('rel', '').split() and values.get('href'):
            self.styles.append(values['href'])


def verify_frontend() -> None:
    assets = {}
    for route in ('/', '/login', '/participant', '/admin/inspections'):
        status, content_type, body = fetch(APP + route, 'text/html')
        if status != 200 or content_type != 'text/html':
            raise ValueError('Public frontend route is unavailable: ' + route)
        page = Entrypoints()
        page.feed(body.decode('utf-8'))
        if not page.root or not page.scripts or not page.styles:
            raise ValueError('Public frontend does not contain built application entrypoints: ' + route)
        for path, types in [(p, ('text/javascript', 'application/javascript')) for p in page.scripts] + [(p, ('text/css',)) for p in page.styles]:
            url = urllib.parse.urljoin(APP + '/', path)
            if allowed_origin(url) != APP or not urllib.parse.urlsplit(url).path.startswith('/assets/'):
                raise ValueError('Public frontend contains an unexpected built asset')
            assets[url] = types
    for url, types in assets.items():
        status, content_type, body = fetch(url, ', '.join(types))
        if status != 200 or content_type not in types or not body.strip():
            raise ValueError('Public frontend asset is missing or has incorrect content type')


def verify(sha: str) -> None:
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Expected a full Git commit SHA')
    metadata = get_json(APP + '/usd-release.json?check=' + str(time.time_ns()))
    if not isinstance(metadata, dict) or metadata.get('revision') != sha:
        raise ValueError('Public frontend revision does not match the requested commit')
    api_metadata = get_json(API + '/release?check=' + str(time.time_ns()))
    if not isinstance(api_metadata, dict) or api_metadata.get('revision') != sha:
        raise ValueError('Public API revision does not match the requested commit')
    settings = get_json(API + '/site-settings/public')
    if not isinstance(settings, dict) or not isinstance(settings.get('settings'), dict):
        raise ValueError('Public API did not return settings application data')
    for route in ('/stages/public', '/records/current'):
        if not isinstance(get_json(API + route), list):
            raise ValueError('Public API did not return list application data')
    for route in ('/auth/me', '/auth/sessions', '/registrations/me'):
        if get_status(API + route) not in (401, 403):
            raise ValueError('Private API route is not protected: ' + route)
    verify_frontend()


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Usage: usd-verify-prerelease <full Git SHA>')
        verify(sys.argv[1])
        print('Public frontend assets/routes, exact API revision, application data and anonymous access protection verified: ' + sys.argv[1])
    except (ValueError, OSError, urllib.error.URLError) as exc:
        print('Prerelease acceptance failed: ' + str(exc), file=sys.stderr)
        sys.exit(1)
