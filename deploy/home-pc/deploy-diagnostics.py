#!/usr/bin/env python3
"""Read-only failed-deployment triage using public prerelease and GitHub data.

This does NOT inspect the host's approved schema pin, perform migrations,
grant release approval or read private deployment secrets.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO_API = 'https://api.github.com/repos/kolyagazha89/Usd-2.0'
APP = 'https://app.usd-russia.ru'
API = 'https://api.usd-russia.ru'
SHA = re.compile(r'^[a-f0-9]{40}$')
MAX_BYTES = 128 * 1024


class DiagnosticEndpointUnavailable(ValueError):
    """Only a constant endpoint identifier and a numeric HTTP status may escape."""


def endpoint_kind(host):
    return {
        'app.usd-russia.ru': 'frontend',
        'api.usd-russia.ru': 'api',
        'api.github.com': 'github_tree',
    }[host]


class SameOriginRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        old = urllib.parse.urlsplit(request.full_url)
        new = urllib.parse.urlsplit(newurl)
        if (old.scheme, old.netloc) != (new.scheme, new.netloc):
            raise ValueError('Cross-origin redirect refused')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def get_json(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != 'https' or parsed.netloc not in {
        'api.github.com', 'app.usd-russia.ru', 'api.usd-russia.ru'
    } or parsed.username or parsed.password or parsed.fragment):
        raise ValueError('Unexpected diagnostic URL origin')
    if parsed.netloc == 'api.github.com' and not parsed.path.startswith('/repos/kolyagazha89/Usd-2.0/git/'):
        raise ValueError('Unexpected GitHub API path')
    if parsed.netloc == 'app.usd-russia.ru' and parsed.path != '/usd-release.json':
        raise ValueError('Unexpected frontend path')
    if parsed.netloc == 'api.usd-russia.ru' and parsed.path != '/release':
        raise ValueError('Unexpected API path')
    request = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json, application/json',
        'Cache-Control': 'no-cache', 'User-Agent': 'USD-read-only-deploy-triage',
    })
    # A hosted diagnostic must be actionable without logging untrusted HTML,
    # response bodies, redirected URLs, authorization headers or exception text.
    # This is a read-only best-effort probe, not an approval/release gate.
    origin = endpoint_kind(parsed.netloc)
    try:
        with urllib.request.build_opener(SameOriginRedirects()).open(request, timeout=12) as response:
            if response.status != 200:
                raise DiagnosticEndpointUnavailable(f'{origin}_http_unexpected')
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError('Diagnostic response too large')
    except urllib.error.HTTPError as error:
        status = error.code if isinstance(error.code, int) and 400 <= error.code <= 599 else 'unexpected'
        raise DiagnosticEndpointUnavailable(f'{origin}_http_{status}') from None
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise DiagnosticEndpointUnavailable(f'{origin}_network_error') from None
    return json.loads(body)


def public_revision(origin, path):
    payload = get_json(origin + path)
    revision = payload.get('revision') if isinstance(payload, dict) else None
    if not isinstance(revision, str) or not SHA.fullmatch(revision):
        raise ValueError('Invalid public release revision')
    return revision


def prisma_tree(commit_sha):
    if not SHA.fullmatch(commit_sha):
        raise ValueError('Invalid commit SHA')
    commit = get_json(f'{REPO_API}/git/commits/{commit_sha}')
    parent = commit.get('tree', {}).get('sha')
    if not isinstance(parent, str) or not SHA.fullmatch(parent):
        raise ValueError('Missing public commit tree')
    for component in ('backend', 'prisma'):
        tree = get_json(f'{REPO_API}/git/trees/{parent}')
        children = tree.get('tree') if isinstance(tree, dict) else None
        entry = (next((item for item in children
                       if isinstance(item, dict) and item.get('path') == component
                       and item.get('type') == 'tree'), None)
                 if isinstance(children, list) else None)
        if not entry or not isinstance(entry.get('sha'), str) or not SHA.fullmatch(entry['sha']):
            raise ValueError('Missing backend/Prisma subtree')
        parent = entry['sha']
    return parent


def diagnose(target):
    if not SHA.fullmatch(target):
        raise ValueError('Expected a full 40-character target SHA')
    frontend = public_revision(APP, '/usd-release.json')
    api = public_revision(API, '/release')
    result = {'target': target, 'public_frontend': frontend, 'public_api': api,
              'classification': 'unknown', 'schema_changed': None}
    if frontend != api:
        result['classification'] = 'mixed_public_revisions'
    elif frontend == target:
        result['classification'] = 'public_revision_current'
    else:
        result['schema_changed'] = prisma_tree(frontend) != prisma_tree(target)
        result['classification'] = ('schema_changed_host_eligibility_unknown'
                                    if result['schema_changed'] else
                                    'same_schema_deploy_failed_check_host_service')
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    try:
        result = diagnose(args.target)
    except DiagnosticEndpointUnavailable as error:
        # All messages originate from the fixed allowlist + sanitized HTTP
        # status, never from upstream error bodies/URLs or secrets.
        print('Deployment triage unavailable: ' + str(error), file=sys.stderr)
        return 2
    except (ValueError, KeyError, TypeError, OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        # Do not log untrusted responses, private data, or environment values.
        print('Deployment triage unavailable: ' + type(error).__name__, file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    else:
        print('Public frontend SHA: ' + result['public_frontend'])
        print('Public API SHA:      ' + result['public_api'])
        print('Candidate SHA:       ' + result['target'])
        print('Classification: ' + result['classification'])
        if result['schema_changed']:
            print('Prisma differs; actual host eligibility is UNKNOWN. Read the trusted host attempt status: approved additive migrations may already be supported. Public trees cannot reveal the installed helpers, live migration history, schema pin or backup policy.')
        elif result['classification'] == 'same_schema_deploy_failed_check_host_service':
            print('Same Prisma tree. Check root-owned service journal, disk/RAM, image signatures, backups and failed-release quarantine.')
        elif result['classification'] == 'mixed_public_revisions':
            print('STOP: public frontend/API disagree. Resolve mixed release before approving a new deployment.')
    return 0  # Diagnostics cannot authorize deployment.


if __name__ == '__main__':
    sys.exit(main())
