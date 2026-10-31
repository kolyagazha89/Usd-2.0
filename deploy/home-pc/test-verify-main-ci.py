#!/usr/bin/env python3
"""Offline policy tests: no GitHub credentials or production access required."""
import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).with_name("verify-main-ci.py")
spec = importlib.util.spec_from_file_location("usd_ci_gate", path)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
SHA = "a" * 40


WORKFLOW_PATHS = {
    "Backend CI": ".github/workflows/backend-ci.yml",
    "Home PC deployment safety checks": ".github/workflows/home-pc-safety.yml",
    "Frontend CI": ".github/workflows/frontend.yml",
}
ADDITIONAL_WORKFLOWS = {
    "Competition journey, archive replay and permanent deletion": ".github/workflows/identity-release-ci.yml",
    "Public browser QA": ".github/workflows/public-browser-qa.yml",
    "Publish self-hosted USD images": ".github/workflows/publish-home-pc-images.yml",
    "Web push on PostgreSQL 18": ".github/workflows/push-notifications-ci.yml",
}


def run(name, *, sha=SHA, branch="main", event="push", status="completed", conclusion="success", attempt=1, ident=1, path=None):
    return {"name": name, "path": path if path is not None else WORKFLOW_PATHS.get(name),
            "head_sha": sha, "head_branch": branch, "event": event,
            "status": status, "conclusion": conclusion, "run_attempt": attempt, "id": ident}


def evaluate(payload, sha, frontend):
    # Baseline fixtures for the three workflows added to the mandatory gate;
    # the dedicated tests below explicitly remove/fail each one.
    if isinstance(payload, dict) and isinstance(payload.get("workflow_runs"), list):
        payload = {"workflow_runs": payload["workflow_runs"] +
                   [run(name, path=path) for name, path in ADDITIONAL_WORKFLOWS.items()]}
    return gate.evaluate(payload, sha, frontend)


class CIGateTests(unittest.TestCase):
    def test_unit_builds_alone_cannot_bypass_journey_browser_or_image_publication(self):
        base = [run("Backend CI"), run("Home PC deployment safety checks"), run("Frontend CI")]
        required = ADDITIONAL_WORKFLOWS
        complete = base + [run(name, path=path) for name, path in required.items()]
        for name in required:
            with self.subTest(name=name):
                others = [item for item in complete if item["name"] != name]
                self.assertEqual(gate.evaluate({"workflow_runs": others}, SHA, True)[0], 75)
                for conclusion in ("failure", "cancelled", "skipped"):
                    self.assertEqual(gate.evaluate({"workflow_runs": others + [run(name, path=required[name], conclusion=conclusion)]}, SHA, True)[0], 1)
                self.assertEqual(gate.evaluate({"workflow_runs": others + [run(name, path=required[name], event="pull_request")]}, SHA, True)[0], 75)
        self.assertEqual(gate.evaluate({"workflow_runs": complete}, SHA, True)[0], 0)

    def test_both_required_workflows_green(self):
        self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), run("Backend CI"), run("Frontend CI")]}, SHA, True)[0], 0)

    def test_backend_only_commit_does_not_require_path_filtered_frontend(self):
        self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), run("Backend CI")]}, SHA, False)[0], 0)

    def test_frontend_missing_or_pending_blocks_release(self):
        self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), run("Backend CI")]}, SHA, True)[0], 75)
        self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), run("Backend CI"), run("Frontend CI", status="in_progress", conclusion=None)]}, SHA, True)[0], 75)

    def test_failed_or_cancelled_workflow_blocks_release(self):
        for conclusion in ("failure", "cancelled", "timed_out", "skipped"):
            with self.subTest(conclusion=conclusion):
                self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), run("Backend CI", conclusion=conclusion)]}, SHA, False)[0], 1)

    def test_pr_and_other_branch_runs_cannot_approve_main(self):
        for fake in (run("Backend CI", event="pull_request"), run("Backend CI", branch="feature"),
                     run("Backend CI", sha="b" * 40)):
            self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), fake]}, SHA, False)[0], 75)

    def test_workflow_name_impersonation_cannot_authorize_release(self):
        # GitHub Actions workflow names are editable display strings, not
        # identities. A green same-named workflow at another path is invalid.
        for name in WORKFLOW_PATHS:
            with self.subTest(name=name):
                required = [run("Backend CI"), run("Home PC deployment safety checks"), run("Frontend CI")]
                impostor = run(name, path=".github/workflows/pretend-green.yml", ident=999)
                missing_real = [item for item in required if item["name"] != name]
                self.assertEqual(evaluate({"workflow_runs": missing_real + [impostor]}, SHA, True)[0], 75)
                self.assertEqual(evaluate({"workflow_runs": required + [impostor]}, SHA, True)[0], 0)

    def test_latest_attempt_must_pass(self):
        payload = {"workflow_runs": [run("Home PC deployment safety checks"), run("Backend CI", attempt=1, ident=1),
                                     run("Backend CI", attempt=2, ident=2, conclusion="failure")]}
        self.assertEqual(evaluate(payload, SHA, False)[0], 1)

    def test_newer_run_wins_even_if_older_run_was_rerun_more_times(self):
        # Attempts are scoped to a run ID, not globally ordered. An old
        # successful rerun cannot approve a newer failed or pending run.
        older_success = run("Backend CI", attempt=4, ident=10)
        newer_failed = run("Backend CI", attempt=1, ident=11, conclusion="failure")
        newer_pending = run("Backend CI", attempt=1, ident=11, status="in_progress", conclusion=None)
        self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), older_success, newer_failed]}, SHA, False)[0], 1)
        self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), older_success, newer_pending]}, SHA, False)[0], 75)
        # For attempts of the same run ID, the latest attempt still wins.
        newer_successful_attempt = run("Backend CI", attempt=2, ident=11)
        self.assertEqual(evaluate({"workflow_runs": [run("Home PC deployment safety checks"), newer_failed, newer_successful_attempt]}, SHA, False)[0], 0)

    def test_missing_pending_or_failed_real_docker_rehearsal_blocks_main_release(self):
        # An otherwise green backend and frontend cannot bypass the disposable
        # PostgreSQL 18 backup/restore and actual Docker rollback test.
        base = [run("Backend CI"), run("Frontend CI")]
        self.assertEqual(evaluate({"workflow_runs": base}, SHA, True)[0], 75)
        pending = run("Home PC deployment safety checks", status="in_progress", conclusion=None)
        self.assertEqual(evaluate({"workflow_runs": base + [pending]}, SHA, True)[0], 75)
        failed = run("Home PC deployment safety checks", conclusion="failure")
        self.assertEqual(evaluate({"workflow_runs": base + [failed]}, SHA, True)[0], 1)
        wrong_event = run("Home PC deployment safety checks", event="pull_request")
        self.assertEqual(evaluate({"workflow_runs": base + [wrong_event]}, SHA, True)[0], 75)

    def test_newer_failed_safety_run_overrides_old_success(self):
        runs = [run("Backend CI"), run("Home PC deployment safety checks", ident=10),
                run("Home PC deployment safety checks", ident=11, conclusion="failure")]
        self.assertEqual(evaluate({"workflow_runs": runs}, SHA, False)[0], 1)

    def test_malformed_response_is_fail_closed(self):
        for payload in (None, [], {}, {"workflow_runs": "success"}, {"workflow_runs": [run("Home PC deployment safety checks"), ]}):
            self.assertNotEqual(evaluate(payload, SHA, False)[0], 0)


if __name__ == "__main__":
    unittest.main()
