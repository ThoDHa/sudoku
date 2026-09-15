#!/usr/bin/env python3
"""Classify a Test & Deploy run's outcome from its Actions jobs payload.

The deploy gate in .github/workflows/deploy.yml compares job results against
'success' and 'skipped' only, so a run dropped for want of a runner and a run
whose tests failed roll up to the identical red conclusion. This module is the
single source of the rule that separates them; the classify-outcome job in
deploy.yml executes it, and gen_report_portal_test.py pins it in both
directions against payloads captured from the real runs that motivated it.

Verdicts, evaluated in order:

- QUEUE_DROP: every test job was cancelled without ever acquiring a runner
  (empty step list, no runner assignment) and the companion jobs carry no
  verdict of their own (allure-report dropped or skipped, deploy skipped).
  The run carries no information about the code; it is evidence of a
  runner-capacity problem.
- SUCCESS: every reported job concluded 'success' or 'skipped' (the skipped
  shapes are the deliberately partial workflow_dispatch runs), tolerating a
  test-e2e failure only when deploy concluded success: that verdict is the
  deploy gate's own statement that the E2E failure count stayed inside its
  tolerated threshold. deploy is in the classify-outcome job's needs, so
  its conclusion is terminal when read; tolerating an in-flight deploy row
  is a defensive read, not an expected shape.
- FAILURE: everything else. Any 'failure' outside the tolerated E2E shape,
  any 'timed_out', a mid-flight cancellation (steps executed, runner
  assigned), a mixed shape, a missing job, or a conclusion this module does
  not recognise. The default reddens rather than passes.

Limitation: when the runner starvation is systemic, this job queues and is
cancelled like every other job, and no verdict is produced. Nothing can
classify a run without acquiring a runner.
"""

import argparse
import json
import sys

TEST_JOB_NAMES = ("test-frontend-unit", "test-go", "test-e2e")
REPORTED_JOB_NAMES = TEST_JOB_NAMES + ("allure-report", "deploy")

QUEUE_DROP = "queue-drop"
SUCCESS = "success"
FAILURE = "failure"

_CANCELLED = "cancelled"
_SKIPPED = "skipped"
_HEALTHY_CONCLUSIONS = ("success", _SKIPPED)
# The jobs API's status field emits only queued, in_progress, and completed;
# these two are the non-terminal pair an in-flight deploy can carry.
_IN_FLIGHT_STATUSES = ("in_progress", "queued")


def _never_got_a_runner(job):
    """Return True for the positive queue-drop shape of one job.

    The shape is the one a queued-and-dropped job carries and a mid-flight
    cancellation cannot: conclusion 'cancelled', an empty step list, and no
    runner assignment (the jobs API records runner_id 0 and runner_name ""
    for such a job; the gh run view payload omits both keys, which reads as
    unassigned here).
    """
    return (job.get("conclusion") == _CANCELLED
            and job.get("steps") == []
            and not job.get("runner_id")
            and not job.get("runner_name"))


def _dropped_or_skipped(job):
    """Return True for a job that carries no verdict of its own: either the
    queue-drop shape or a deliberate skip. A companion job with any other
    conclusion (a genuine failure most of all) makes the run a mixed shape
    that the queue-drop verdict must not absorb."""
    return _never_got_a_runner(job) or job.get("conclusion") == _SKIPPED


def classify_jobs(jobs):
    """Classify one run's job payloads into QUEUE_DROP, SUCCESS, or FAILURE.

    The jobs argument is the list of job objects from the Actions jobs
    endpoint (the value of the payload's "jobs" key). A reported job that is
    absent from the list is an unrecognised shape and reddens.
    """
    by_name = {}
    for job in jobs:
        by_name.setdefault(job.get("name"), job)
    for name in REPORTED_JOB_NAMES:
        if name not in by_name:
            return FAILURE

    if (all(_never_got_a_runner(by_name[name]) for name in TEST_JOB_NAMES)
            and all(_dropped_or_skipped(by_name[name])
                    for name in ("allure-report", "deploy"))):
        return QUEUE_DROP

    for name in REPORTED_JOB_NAMES:
        job = by_name[name]
        conclusion = job.get("conclusion")
        # deploy is in needs and terminal when read; tolerating an in-flight
        # deploy row is defensive for a payload captured before its row is
        # finalised. Any other job without a terminal conclusion reddens.
        if (name == "deploy" and conclusion is None
                and job.get("status") in _IN_FLIGHT_STATUSES):
            continue
        # The deploy gate tolerates an E2E failure inside its failure-count
        # threshold, and deploy concluding success is the gate's own verdict
        # that the tolerance applied. Any other deploy state (skipped,
        # in-flight) means the tolerance never came into play and the E2E
        # failure stays fatal.
        if (name == "test-e2e" and conclusion == "failure"
                and by_name["deploy"].get("conclusion") == "success"):
            continue
        if conclusion not in _HEALTHY_CONCLUSIONS:
            return FAILURE
    return SUCCESS


def render_summary(verdict, jobs):
    """Render the job-summary markdown for a verdict, with a per-job table."""
    rows = "\n".join(
        f"| {job.get('name')} | {job.get('conclusion') or job.get('status')} "
        f"| {len(job.get('steps') or [])} |"
        for job in jobs
        if job.get("name") in REPORTED_JOB_NAMES
    )
    table = ("| Job | Conclusion | Steps executed |\n"
             "|-----|------------|----------------|\n" + rows)
    if verdict == QUEUE_DROP:
        return (
            "## Infrastructure drop: no runner acquired\n\n"
            "Every test job was cancelled before executing a single step, "
            "with no runner ever assigned. This run carries no information "
            "about the code: it is evidence of a runner-capacity problem, "
            "not a test failure. Record the drop; re-run only deliberately.\n\n"
            + table + "\n"
        )
    if verdict == SUCCESS:
        return _success_summary(jobs, table)
    return (
        "## Failure\n\n"
        "The run reached a shape that means the code or the pipeline failed: "
        "a test job failed, timed out, was cancelled mid-flight, or reported "
        "an unrecognised conclusion. This is not an infrastructure drop.\n\n"
        + table + "\n"
    )


def _success_summary(jobs, table):
    """Render the SUCCESS verdict's summary, worded by the deploy gate's own
    verdict. Only a run deploy greenlit may be announced as all gates passed;
    a tolerated E2E failure is named rather than glossed over, and a deploy
    verdict other than success is reported as observed, never explained
    away."""
    conclusions = {job.get("name"): job.get("conclusion") for job in jobs}
    if conclusions.get("test-e2e") == "failure":
        return (
            "## Tests green with tolerated E2E failures\n\n"
            "The E2E job failed within the deploy gate's failure-count "
            "threshold and the gate allowed deployment; every other reported "
            "job concluded success or was deliberately skipped.\n\n"
            + table + "\n"
        )
    if conclusions.get("deploy") == "success":
        return (
            "## All test gates passed\n\n"
            "Every reported job concluded success or was deliberately "
            "skipped, and the deploy gate greenlit deployment.\n\n"
            + table + "\n"
        )
    deploy_row = next(job for job in jobs if job.get("name") == "deploy")
    deploy_verdict = deploy_row.get("conclusion") or deploy_row.get("status")
    return (
        "## Tests green; the deploy job did not conclude success\n\n"
        "Every reported job concluded success or was deliberately skipped, "
        f"but the deploy job's verdict is {deploy_verdict}, not success, so "
        "this run is not announced as fully green.\n\n" + table + "\n"
    )


def main(argv=None):
    """CLI entry: classify a jobs payload file, print the verdict, and exit
    0 for QUEUE_DROP and SUCCESS, 1 for FAILURE. With --summary, append the
    rendered markdown to the given path (GitHub's GITHUB_STEP_SUMMARY)."""
    parser = argparse.ArgumentParser(
        description="Classify a Test & Deploy run from its Actions jobs payload.")
    parser.add_argument("jobs_file",
                        help="path to the jobs payload JSON (an object with a "
                             "jobs list, or the list itself)")
    parser.add_argument("--summary",
                        help="path to append the rendered job summary to")
    args = parser.parse_args(argv)

    with open(args.jobs_file) as f:
        payload = json.load(f)
    jobs = payload["jobs"] if isinstance(payload, dict) else payload

    verdict = classify_jobs(jobs)
    summary = render_summary(verdict, jobs)
    if args.summary:
        with open(args.summary, "a") as f:
            f.write(summary)
    print(verdict)
    return 0 if verdict != FAILURE else 1


if __name__ == "__main__":
    sys.exit(main())
