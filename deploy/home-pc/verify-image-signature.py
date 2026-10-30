#!/usr/bin/env python3
"""Verify a local USD image by immutable GHCR digest and main-workflow identity."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

COSIGN = Path('/usr/local/libexec/usd-cosign')
COSIGN_SHA256 = '4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71'
IDENTITY = 'https://github.com/kolyagazha89/Usd-2.0/.github/workflows/publish-home-pc-images.yml@refs/heads/main'
ISSUER = 'https://token.actions.githubusercontent.com'


def trusted_cosign() -> None:
    parent = COSIGN.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or parent.st_mode & 0o022:
        raise ValueError('Untrusted signature verifier directory')
    info = COSIGN.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or not os.access(COSIGN, os.X_OK):
        raise ValueError('Untrusted pinned signature verifier')
    checksum = hashlib.sha256()
    with COSIGN.open('rb') as binary:
        for chunk in iter(lambda: binary.read(1024 * 1024), b''):
            checksum.update(chunk)
    if checksum.hexdigest() != COSIGN_SHA256:
        raise ValueError('Pinned signature verifier checksum mismatch')


def run(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=90)


def verify(service: str, sha: str) -> dict:
    if service not in ('api', 'frontend') or not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Expected api/frontend and a full Git SHA')
    if any(key.startswith(('COSIGN_', 'SIGSTORE_', 'FULCIO_', 'REKOR_', 'TUF_')) for key in os.environ):
        raise ValueError('Signature trust or repository overrides are not allowed')
    trusted_cosign()
    repo = 'ghcr.io/kolyagazha89/usd-2.0-' + service
    inspected = run(['docker', 'image', 'inspect', repo + ':' + sha])
    if inspected.returncode:
        raise ValueError('Candidate image is not present locally')
    images = json.loads(inspected.stdout)
    if not isinstance(images, list) or len(images) != 1 or not isinstance(images[0], dict):
        raise ValueError('Invalid image metadata')
    image = images[0]
    if image.get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != sha:
        raise ValueError('Image revision does not match requested SHA')
    image_id = image.get('Id', '')
    if not re.fullmatch('sha256:[a-f0-9]{64}', image_id):
        raise ValueError('Invalid local image identity')
    references = image.get('RepoDigests')
    if not isinstance(references, list):
        raise ValueError('Candidate has no immutable registry digest')
    references = set(ref for ref in references if isinstance(ref, str) and re.fullmatch(re.escape(repo) + '@sha256:[a-f0-9]{64}', ref))
    if len(references) != 1:
        raise ValueError('Candidate registry digest is missing or ambiguous')
    reference = references.pop()
    digest = reference.split('@', 1)[1]
    verified = run([str(COSIGN), 'verify', '--certificate-identity', IDENTITY,
                    '--certificate-oidc-issuer', ISSUER, '-a', 'git_sha=' + sha, reference])
    if verified.returncode:
        raise ValueError('Candidate signature is missing, invalid or from an unapproved workflow')
    payloads = json.loads(verified.stdout)
    def matches(payload):
        if not isinstance(payload, dict): return False
        critical = payload.get('critical', payload.get('Critical', {}))
        optional = payload.get('optional', payload.get('Optional', {}))
        if not isinstance(critical, dict) or not isinstance(optional, dict):
            return False
        image_claim = critical.get('image', critical.get('Image'))
        if not isinstance(image_claim, dict):
            return False
        signed_digest = image_claim.get('docker-manifest-digest', image_claim.get('Docker-manifest-digest'))
        return signed_digest == digest and optional.get('git_sha') == sha

    if not isinstance(payloads, list) or not any(matches(payload) for payload in payloads):
        raise ValueError('Verified signature claims do not bind candidate digest and SHA')
    return {'image': reference, 'id': image_id, 'revision': sha}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ValueError('Usage: usd-verify-image-signature <api|frontend> <full Git SHA>')
        print(json.dumps(verify(sys.argv[1], sys.argv[2])))
    except (ValueError, TypeError, AttributeError, OSError, subprocess.SubprocessError):
        # Registry responses and subprocess environment/output are untrusted and
        # may contain authentication details. Never include them in release logs.
        print('Image signature verification refused; check trusted tools, candidate digest and main-workflow signature', file=sys.stderr)
        sys.exit(1)
