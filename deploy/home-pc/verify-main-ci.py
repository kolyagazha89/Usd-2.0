#!/usr/bin/env python3
"""Fail-closed GitHub Actions gate for the locally built USD main commit.

Exit 0 only after required push workflows succeed for the exact full SHA.
Exit 75 when results are missing/pending or the GitHub API is unavailable;
exit 1 for a completed unsuccessful workflow or invalid input.
"""
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com/repos/kolyagazha89/Usd-2.0/actions/runs"


def evaluate(payload: object, sha: str, require_frontend: bool) -> tuple[int, str]:
    if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
        return 75, "Invalid GitHub Actions response"
    required = {"Backend CI"}
    if require_frontend:
        required.add("Frontend CI")
    runs = payload["workflow_runs"]
    for name in sorted(required):
        candidates = [
            run for run in runs
            if isinstance(run, dict)
            and run.get("name") == name
            and run.get("head_sha") == sha
            and run.get("head_branch") == "main"
            and run.get("event") == "push"
        ]
        if not candidates:
            return 75, f"Waiting for {name} push run for {sha}"
        # GitHub can return reruns/attempts; require the latest attempt.
        # A rerun increments run_attempt only *within* its run ID. An older
        # rerun must never override a newer run for the same commit/workflow.
        # GitHub run IDs increase across newly created workflow runs.
        latest = max(candidates, key=lambda run: (int(run.get("id") or 0), int(run.get("run_attempt") or 0)))
        if latest.get("status") != "completed":
            return 75, f"Waiting for {name}: {latest.get('status')}"
        if latest.get("conclusion") != "success":
            return 1, f"{name} did not pass: {latest.get('conclusion')}"
    return 0, f"Required main push CI succeeded for {sha}"


def main(argv: list[str]) -> int:
    if len(argv) != 3 or not re.fullmatch(r"[0-9a-f]{40}", argv[1]) or argv[2] not in ("0", "1"):
        print("Usage: verify-main-ci.py <full-git-sha> <frontend-changed:0|1>", file=sys.stderr)
        return 1
    sha, require_frontend = argv[1], argv[2] == "1"
    query = urllib.parse.urlencode({"head_sha": sha, "event": "push", "per_page": 100})
    request = urllib.request.Request(
        f"{API}?{query}",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "usd-home-deployer", "X-GitHub-Api-Version": "2022-11-28"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        print(f"Cannot verify GitHub Actions; release deferred: {exc}", file=sys.stderr)
        return 75
    status, message = evaluate(payload, sha, require_frontend)
    print(message, file=sys.stderr if status else sys.stdout)
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv))
