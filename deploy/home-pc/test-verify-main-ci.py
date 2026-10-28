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


def run(name, *, sha=SHA, branch="main", event="push", status="completed", conclusion="success", attempt=1, ident=1):
    return {"name": name, "head_sha": sha, "head_branch": branch, "event": event,
            "status": status, "conclusion": conclusion, "run_attempt": attempt, "id": ident}


class CIGateTests(unittest.TestCase):
    def test_both_required_workflows_green(self):
        self.assertEqual(gate.evaluate({"workflow_runs": [run("Backend CI"), run("Frontend CI")]}, SHA, True)[0], 0)

    def test_backend_only_commit_does_not_require_path_filtered_frontend(self):
        self.assertEqual(gate.evaluate({"workflow_runs": [run("Backend CI")]}, SHA, False)[0], 0)

    def test_frontend_missing_or_pending_blocks_release(self):
        self.assertEqual(gate.evaluate({"workflow_runs": [run("Backend CI")]}, SHA, True)[0], 75)
        self.assertEqual(gate.evaluate({"workflow_runs": [run("Backend CI"), run("Frontend CI", status="in_progress", conclusion=None)]}, SHA, True)[0], 75)

    def test_failed_or_cancelled_workflow_blocks_release(self):
        for conclusion in ("failure", "cancelled", "timed_out", "skipped"):
            with self.subTest(conclusion=conclusion):
                self.assertEqual(gate.evaluate({"workflow_runs": [run("Backend CI", conclusion=conclusion)]}, SHA, False)[0], 1)

    def test_pr_and_other_branch_runs_cannot_approve_main(self):
        for fake in (run("Backend CI", event="pull_request"), run("Backend CI", branch="feature"),
                     run("Backend CI", sha="b" * 40)):
            self.assertEqual(gate.evaluate({"workflow_runs": [fake]}, SHA, False)[0], 75)

    def test_latest_attempt_must_pass(self):
        payload = {"workflow_runs": [run("Backend CI", attempt=1, ident=1),
                                     run("Backend CI", attempt=2, ident=2, conclusion="failure")]}
        self.assertEqual(gate.evaluate(payload, SHA, False)[0], 1)

    def test_newer_run_wins_even_if_older_run_was_rerun_more_times(self):
        # Attempts are scoped to a run ID, not globally ordered. An old
        # successful rerun cannot approve a newer failed or pending run.
        older_success = run("Backend CI", attempt=4, ident=10)
        newer_failed = run("Backend CI", attempt=1, ident=11, conclusion="failure")
        newer_pending = run("Backend CI", attempt=1, ident=11, status="in_progress", conclusion=None)
        self.assertEqual(gate.evaluate({"workflow_runs": [older_success, newer_failed]}, SHA, False)[0], 1)
        self.assertEqual(gate.evaluate({"workflow_runs": [older_success, newer_pending]}, SHA, False)[0], 75)
        # For attempts of the same run ID, the latest attempt still wins.
        newer_successful_attempt = run("Backend CI", attempt=2, ident=11)
        self.assertEqual(gate.evaluate({"workflow_runs": [newer_failed, newer_successful_attempt]}, SHA, False)[0], 0)

    def test_malformed_response_is_fail_closed(self):
        for payload in (None, [], {}, {"workflow_runs": "success"}, {"workflow_runs": []}):
            self.assertNotEqual(gate.evaluate(payload, SHA, False)[0], 0)


if __name__ == "__main__":
    unittest.main()
