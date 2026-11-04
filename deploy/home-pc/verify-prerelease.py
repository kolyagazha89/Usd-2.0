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
MAX_BYTES = 10 * 1024 * 1024  # same hard limit as accepted image uploads


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



def public_image_url(value) -> str | None:
    """Only an existing prerelease API SITE_ASSET URL may be probed."""
    if not isinstance(value, str):
        return None
    if value.startswith('/media/public-file/SITE_ASSET/'):
        url = API + value
    else:
        url = value
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != 'https' or parts.netloc != 'api.usd-russia.ru':
        return None
    if not re.fullmatch(r'/media/public-file/SITE_ASSET/[A-Za-z0-9._-]{2,180}', parts.path):
        return None
    if parts.username or parts.password or parts.fragment:
        return None
    return url


def verify_public_image_assets(settings: dict, stages: list | None = None) -> int:
    """Smoke-check already published posters, without listing or changing S3.

    No third-party image URLs are fetched. The probe validates actual image
    bytes through the public RustFS-backed API proxy, not a 200 HTML fallback.
    Only three deterministic stage posters + one branding logo are sampled;
    this is NOT a full inventory check or an S3 integrity scan.
    """
    homepage = settings.get('homepage') if isinstance(settings, dict) else None
    branding = settings.get('branding') if isinstance(settings, dict) else None
    posters = homepage.get('stagePosters') if isinstance(homepage, dict) else None
    chosen = []
    if isinstance(branding, dict):
        chosen.append(('branding', branding.get('logoUrl')))
    if isinstance(posters, dict):
        # The latest publicly visible stages are more useful to participants
        # than the first three lexicographically sorted UUIDs.
        selected = []
        if isinstance(stages, list):
            sorted_stages = sorted(
                (stage for stage in stages if isinstance(stage, dict)),
                key=lambda stage: str(stage.get('date') or ''),
                reverse=True,
            )
            for stage in sorted_stages:
                stage_id = stage.get('id')
                if isinstance(stage_id, str) and stage_id in posters and stage_id not in selected:
                    selected.append(stage_id)
                if len(selected) >= 3:
                    break
        for key in sorted(posters):
            if len(selected) >= 3:
                break
            if key not in selected:
                selected.append(key)
        chosen.extend(('stage poster', posters[key]) for key in selected)
    seen = set()
    verified = 0
    for label, value in chosen:
        url = public_image_url(value)
        if not url or url in seen:
            continue
        seen.add(url)
        for attempt in range(2):
            try:
                status, content_type, body = fetch(url, 'image/jpeg, image/png, image/webp')
            except (OSError, urllib.error.URLError):
                if attempt == 0:
                    continue
                raise ValueError('Public ' + label + ' image read is unavailable after two attempts') from None
            valid = (
                content_type == 'image/jpeg' and body.startswith(b'\xff\xd8\xff')
                or content_type == 'image/png' and body.startswith(b'\x89PNG\r\n\x1a\n')
                or content_type == 'image/webp' and body[:4] == b'RIFF' and body[8:12] == b'WEBP'
            )
            if status == 200 and valid:
                verified += 1
                break
            if status in (429, 500, 502, 503, 504) and attempt == 0:
                continue
            raise ValueError('Public ' + label + ' image returned invalid or unavailable media')
    return verified

def require_revision(metadata, expected: str, kind: str) -> None:
    """Print only validated public commit IDs, never arbitrary response bodies.
    An outdated external reverse proxy must not be mistaken for a bad image
    (the protected in-container image identity is checked separately).
    """
    raw = metadata.get('revision') if isinstance(metadata, dict) else None
    actual = raw if isinstance(raw, str) and re.fullmatch(r'[a-f0-9]{40}', raw) else None
    if actual != expected:
        observed = actual[:12] if actual else 'missing-or-invalid'
        raise ValueError(
            'Public ' + kind + ' revision does not match the requested commit; '
            'expected=' + expected[:12] + ', observed=' + observed +
            '. Check the prerelease ingress target and cache; release must roll back.'
        )


def verify(sha: str) -> None:
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Expected a full Git commit SHA')
    metadata = get_json(APP + '/usd-release.json?check=' + str(time.time_ns()))
    require_revision(metadata, sha, 'frontend')
    api_metadata = get_json(API + '/release?check=' + str(time.time_ns()))
    require_revision(api_metadata, sha, 'API')
    settings = get_json(API + '/site-settings/public')
    if not isinstance(settings, dict) or not isinstance(settings.get('settings'), dict):
        raise ValueError('Public API did not return settings application data')
    stages = get_json(API + '/stages/public')
    if not isinstance(stages, list):
        raise ValueError('Public API did not return list application data')
    verify_public_image_assets(settings['settings'], stages)
    if not isinstance(get_json(API + '/records/current'), list):
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
