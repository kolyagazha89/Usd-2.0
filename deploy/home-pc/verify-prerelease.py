#!/usr/bin/env python3
"""Read-only external acceptance of a specific frontend revision and API."""
import json
import re
import sys
import time
import urllib.error
import urllib.request


def get_json(url: str):
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "USD-release-check"})
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status != 200:
            raise ValueError("Prerelease endpoint did not return HTTP 200")
        return json.load(response)


def verify(sha: str) -> None:
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("Expected a full Git commit SHA")
    metadata = get_json("https://app.usd-russia.ru/usd-release.json?check=" + str(time.time_ns()))
    if not isinstance(metadata, dict) or metadata.get("revision") != sha:
        raise ValueError("Public frontend revision does not match the requested commit")
    api_metadata = get_json("https://api.usd-russia.ru/release?check=" + str(time.time_ns()))
    if not isinstance(api_metadata, dict) or api_metadata.get("revision") != sha:
        raise ValueError("Public API revision does not match the requested commit")
    for route in ("/site-settings/public", "/stages/public"):
        if not isinstance(get_json("https://api.usd-russia.ru" + route), (dict, list)):
            raise ValueError("Public API did not return application data")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: usd-verify-prerelease <full Git SHA>")
        verify(sys.argv[1])
        print("Public frontend revision and public API verified: " + sys.argv[1])
    except (ValueError, OSError, urllib.error.URLError) as exc:
        print("Prerelease acceptance failed: " + str(exc), file=sys.stderr)
        sys.exit(1)
