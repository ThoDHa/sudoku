#!/usr/bin/env python3
"""Tests for gen_report_portal.py. Run: python3 -m unittest gen_report_portal_test."""

import json
import os
import re
import tempfile
import unittest

import classify_run as classifier
import gen_report_portal as portal


def make_artifact(artifacts_dir, name, rel_path, body="<html>report</html>"):
    """Write a file at artifacts_dir/name/rel_path, creating parent dirs."""
    path = os.path.join(artifacts_dir, name, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(body)


def make_json_artifact(artifacts_dir, name, rel_path, data):
    make_artifact(artifacts_dir, name, rel_path, json.dumps(data))


def prerender(out_dir, rel_path, body="<html>report</html>"):
    """Simulate a report rendered into the Pages tree by an earlier deploy step."""
    path = os.path.join(out_dir, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(body)


class Portal(unittest.TestCase):
    def _gen(self, artifacts_dir, out_dir):
        return portal.main(["--artifacts-dir", artifacts_dir, "--out-dir", out_dir])

    def _page(self, out_dir):
        with open(os.path.join(out_dir, "index.html")) as fh:
            return fh.read()

    def test_allure_link_always_present(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "reports")
            self._gen(os.path.join(d, "none"), out)  # no artifacts dir
            page = self._page(out)
            self.assertIn("../test-report/", page)
            self.assertIn("Allure", page)

    def test_links_frontend_mutation_report(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            make_artifact(artifacts, "mutation-frontend", "reports/mutation/mutation.html")
            make_json_artifact(artifacts, "mutation-frontend", "reports/mutation/mutation.json",
                               {"files": {"a.ts": {"mutants": [
                                   {"status": "Killed"}, {"status": "Killed"}, {"status": "Survived"}]}}})
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)

            self.assertTrue(os.path.exists(os.path.join(out, "mutation/frontend/mutation.html")))
            page = self._page(out)
            self.assertIn("mutation/frontend/mutation.html", page)
            self.assertIn("Frontend · StrykerJS", page)

    def test_links_unified_go_mutation_report(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            # Every Go scope and technique shard contributes to one aggregated tile,
            # each meeting its own floor (dp 100% >= 100, techniques 100% >= 100).
            make_json_artifact(artifacts, "mutation-go-dp", "report.json",
                               {"stats": {"killedCount": 20, "timeOutCount": 0, "escapedCount": 0}})
            make_json_artifact(artifacts, "mutation-go-techniques-shard-aic", "report.json",
                               {"stats": {"killedCount": 20, "timeOutCount": 0, "escapedCount": 0}})
            out = os.path.join(d, "reports")
            # The unified Stryker-style report is rendered into place by the deploy
            # build step before the portal script runs; simulate that here.
            prerender(out, "mutation/go/mutation.html")
            self._gen(artifacts, out)

            page = self._page(out)
            self.assertIn("mutation/go/mutation.html", page)
            self.assertIn("Go · mutation", page)
            # One unified tile: no per-scope tiles, no go-mutesting pages.
            self.assertNotIn("Go · dp", page)
            self.assertNotIn("go-mutesting-report.html", page)
            self.assertNotIn("<details>", page)
            # Aggregated efficacy: 40 detected / 40 -> 100%; all floors met.
            self.assertIn("100.0%", page)
            self.assertNotIn("below floor", page)

    def test_go_tile_fails_when_a_package_breaches_its_own_floor(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            # dp at 90% breaches its stricter 100 floor, even though the huge
            # techniques package pools the overall efficacy up near 100%.
            make_json_artifact(artifacts, "mutation-go-dp", "report.json",
                               {"stats": {"killedCount": 90, "escapedCount": 10}})
            make_json_artifact(artifacts, "mutation-go-techniques-shard-aic", "report.json",
                               {"stats": {"killedCount": 9000, "escapedCount": 0}})
            out = os.path.join(d, "reports")
            prerender(out, "mutation/go/mutation.html")
            self._gen(artifacts, out)
            page = self._page(out)
            # The pooled number stays high (~99.9%), but the dp breach is not
            # diluted: the tile and the overall banner both go red.
            self.assertIn("99.9%", page)
            self.assertIn("below floor: dp 90%", page)  # < is HTML-escaped in the page
            self.assertIn('class="tile fail"', page)
            self.assertIn('class="banner fail"', page)

    def test_coverage_below_gate_is_marked_fail(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            make_artifact(artifacts, "coverage-frontend", "index.html")
            make_json_artifact(artifacts, "coverage-frontend", "coverage-summary.json",
                               {"total": {"lines": {"pct": 60.0}}})  # below the 75 warn / 85 ok gate
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)
            page = self._page(out)
            self.assertIn("60.0%", page)
            self.assertIn('class="tile fail"', page)

    def test_go_mutation_tile_omitted_without_rendered_report(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            # Stats present but the unified report was never rendered (e.g. the
            # render step was skipped): the tile must not become a dead link.
            make_json_artifact(artifacts, "mutation-go-dp", "report.json",
                               {"stats": {"killedCount": 9, "escapedCount": 1}})
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)
            page = self._page(out)
            self.assertNotIn("mutation/go/mutation.html", page)
            self.assertNotIn("Go · mutation", page)

    def test_copies_profiling_playwright_report_dir_with_assets(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            make_artifact(artifacts, "nightly-playwright-report", "index.html")
            make_artifact(artifacts, "nightly-playwright-report", "data/trace.zip")
            # The Profiling section renders from per-device comparison reports.
            make_json_artifact(artifacts, "nightly-profiling-results", "chrome-comparison-report.json",
                               {"deviceLabel": "chrome-desktop",
                                "analysis": {"verdict": "PASS", "wasmIdlePercentage": 99.1,
                                             "memoryOverheadMB": 3.2, "findings": []}})
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)
            self.assertTrue(os.path.exists(os.path.join(out, "profiling/playwright/index.html")))
            # The whole report dir is copied, not just the entry file.
            self.assertTrue(os.path.exists(os.path.join(out, "profiling/playwright/data/trace.zip")))
            page = self._page(out)
            self.assertIn("profiling/playwright/index.html", page)
            self.assertIn("Profiling", page)

    def test_copies_coverage_reports(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            make_artifact(artifacts, "coverage-frontend", "index.html")
            make_artifact(artifacts, "coverage-frontend", "assets/style.css")
            make_json_artifact(artifacts, "coverage-frontend", "coverage-summary.json",
                               {"total": {"lines": {"pct": 91.2}}})
            make_artifact(artifacts, "coverage-go", "coverage.func.txt", "total: (statements) 88.5%")
            out = os.path.join(d, "reports")
            # Go coverage is pre-rendered as an istanbul report by the deploy step.
            prerender(out, "coverage/go/index.html")
            self._gen(artifacts, out)
            self.assertTrue(os.path.exists(os.path.join(out, "coverage/frontend/index.html")))
            self.assertTrue(os.path.exists(os.path.join(out, "coverage/frontend/assets/style.css")))
            page = self._page(out)
            self.assertIn("coverage/frontend/index.html", page)
            self.assertIn("coverage/go/index.html", page)
            self.assertIn("Coverage", page)

    def test_omits_missing_reports_no_dead_links(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            # An artifact dir with no readable report.json inside.
            os.makedirs(os.path.join(artifacts, "mutation-go-human"), exist_ok=True)
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)
            page = self._page(out)
            self.assertNotIn("go-mutesting-report.html", page)
            self.assertNotIn("mutation/go/mutation.html", page)


def _repo(*parts):
    return os.path.join(portal._REPO_ROOT, *parts)


def _nightly_jobs():
    """Split nightly-mutation.yml into job-name -> job body.

    Text-level rather than a YAML parse so the guard adds no dependency to a
    suite that runs on every push. Job keys sit at two-space indent under
    `jobs:`, which is the only place that indent is used for a mapping key."""
    with open(_repo(".github", "workflows", "nightly-mutation.yml")) as f:
        text = f.read()
    return _split_job_bodies(text)


def _deploy_jobs():
    """Split deploy.yml into job-name -> job body, by the same text-level
    split _nightly_jobs uses. Scoped to the text after the top-level `jobs:`
    key: deploy.yml's `on:` block carries two-space keys (push, pull_request)
    that the job-key regex would otherwise swallow."""
    with open(_repo(".github", "workflows", "deploy.yml")) as f:
        text = f.read()
    jobs_heading = re.search(r"^jobs:$", text, re.M)
    return _split_job_bodies(text[jobs_heading.start():])


def _split_job_bodies(text):
    """Split a workflow text into job-name -> job body. Job keys sit at
    two-space indent, which is the only place that indent is used for a
    mapping key within the text passed in."""
    starts = [(m.start(), m.group(1))
              for m in re.finditer(r"^  ([a-zA-Z0-9_-]+):$", text, re.M)]
    bounds = [s for s, _ in starts] + [len(text)]
    return {name: text[bounds[i]:bounds[i + 1]]
            for i, (_, name) in enumerate(starts)}


class MutationFloorSources(unittest.TestCase):
    """The mutation gate numbers have single sources of truth (Stryker config for
    the frontend, api/mutation-floors.json for the Go floors). The portal reads
    them, and since MUT-6-1 so do api/Makefile and the nightly-mutation workflow,
    which no longer keep copies. These guards therefore assert that no floor
    literal exists to drift, rather than that the copies happen to match."""

    def setUp(self):
        with open(_repo("api", "mutation-floors.json")) as f:
            self.floors = {k: float(v) for k, v in json.load(f)["floors"].items()}

    def test_portal_loads_canonical_go_floors(self):
        self.assertEqual(portal.GO_MUTATION_FLOORS, self.floors)

    def test_portal_frontend_gate_matches_stryker_config(self):
        with open(_repo("frontend", "stryker.config.json")) as f:
            th = json.load(f)["thresholds"]
        self.assertEqual(portal.MUTATION, {"ok": float(th["high"]), "warn": float(th["low"])})

    def test_go_floor_loader_falls_back_on_missing_file(self):
        self.assertEqual(portal._load_go_mutation_floors("/no/such/floors.json"),
                         {"dp": 95.0, "human": 85.0, "techniques": 85.0})

    def test_go_floor_loader_drops_unmeasured_scopes_without_losing_the_rest(self):
        """A null floor means unmeasured. Coercing it raised TypeError, which the
        fallback caught, so one unmeasured scope replaced every real floor with
        numbers matching nothing in the canonical file."""
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "floors.json")
            with open(path, "w") as f:
                json.dump({"floors": {"dp": 92.8, "unmeasured": None}}, f)
            self.assertEqual(portal._load_go_mutation_floors(path), {"dp": 92.8})

    def test_frontend_gate_loader_falls_back_on_missing_file(self):
        self.assertEqual(portal._load_frontend_mutation_gate("/no/such/config.json"),
                         {"ok": 90.0, "warn": 90.0})

    def test_makefile_carries_no_floor_literal(self):
        """MUT-6-1 replaced the api/Makefile floor mirrors with calls into
        scripts/mutation_floors.py, so drift is impossible rather than merely
        detected. Guard the property that made it impossible: a literal
        reintroduced here would silently outrank the file the ratchet writes."""
        with open(_repo("api", "Makefile")) as f:
            text = f.read()
        stray = re.findall(r"^\s*\w*_?MUTATION_FLOOR\w*\s*[:?]?=\s*[\d.]+\s*$",
                           text, re.M)
        self.assertEqual(stray, [], f"floor literals left in api/Makefile: {stray}")
        self.assertRegex(text, re.compile(
            r"^MUTATION_FLOORS\s*:?=.*mutation_floors\.py", re.M))
        self.assertIn("$(MUTATION_FLOORS) gate-package", text)

    def test_nightly_go_jobs_carry_no_floor_literal(self):
        """The Go matrix and the techniques aggregate step both used to carry
        their own copies of the floor. Both now read the canonical file.

        Scoped to the Go jobs by name rather than by position, so a Go job added
        above them is still covered. The frontend StrykerJS jobs in the same
        file legitimately pass --floor: they gate against thresholds in
        frontend/stryker.config.json and have no bearing on the Go floors."""
        jobs = _nightly_jobs()
        for name in ("go-mutation", "techniques-mutation", "techniques-aggregate"):
            self.assertIn(name, jobs, f"{name} job not found")
            body = jobs[name]
            stray = re.findall(r"^\s*floor:\s*[\d.]+", body, re.M)
            self.assertEqual(stray, [], f"floor literals left in {name}: {stray}")
            self.assertNotIn("--floor", body,
                             f"a --floor argument in {name} bypasses "
                             f"api/mutation-floors.json")
        self.assertIn("mutation_floors.py gate-package", jobs["go-mutation"])
        self.assertIn("mutation_floors.py gate-shards", jobs["techniques-aggregate"])

    def test_go_mutation_job_does_not_derive_its_own_report_path(self):
        """The run step and the gate step must agree on where report.json goes.

        They previously each rolled a slug expression and disagreed: the
        workflow's `tr -d './'` strips every dot and slash, giving
        `internalsudokudp` where the Makefile and the gate produce
        `internal-sudoku-dp`. That went unnoticed because the old inline gate
        was wrong in the same way, so the mismatch only appeared once the gate
        started deriving the path correctly."""
        job = _nightly_jobs()["go-mutation"]
        self.assertNotIn("tr -d", job,
                         "the go-mutation job is deriving a report slug itself; "
                         "ask mutation_floors.py report-path instead")
        self.assertIn("mutation_floors.py report-path", job)


def _ci4_fixture(stem):
    """Load a jobs payload from .github/scripts/fixtures by file stem. The
    recorded ci4_run_* files note their capture provenance under _provenance;
    the jobs list is the live payload reduced to the fields classify_run.py
    reads. The ci4_synth_* files pin synthetic shapes by the same contract."""
    path = _repo(".github", "scripts", "fixtures", f"{stem}.json")
    with open(path) as f:
        return json.load(f)


class ClassifyRunOutcome(unittest.TestCase):
    """CI-4's run classification, verified in both directions against the
    real runs recorded in the task: the queue-dropped run must stop reading
    as a test failure, and every genuine failure shape must still read as a
    failure. Direction one is load-bearing precisely because the opposite
    direction exists: a rule loose enough to spare the dropped run must not
    also spare the failing ones."""

    RUN_QUEUE_DROP = "31124097075"
    RUN_UNIT_FAILURES = ("32208165825", "31733141760")
    RUN_DEPLOY_STEP_FAILURE = "31102171693"

    def _jobs(self, run_id):
        return _ci4_fixture(f"ci4_run_{run_id}")["jobs"]

    def _synth_jobs(self, scenario):
        return _ci4_fixture(f"ci4_synth_{scenario}")["jobs"]

    def _job(self, jobs, name):
        return next(job for job in jobs if job["name"] == name)

    def _synthetic_job(self, name, conclusion, steps=()):
        return {"name": name, "conclusion": conclusion,
                "status": "completed" if conclusion else "in_progress",
                "steps": list(steps), "runner_id": 0, "runner_name": ""}

    def test_queue_dropped_run_classifies_as_infrastructure_drop(self):
        """Direction one: run 31124097075 (all test jobs cancelled before a
        step executed, deploy skipped) reports the infrastructure verdict."""
        jobs = self._jobs(self.RUN_QUEUE_DROP)
        # Guard the fixture itself carries the positive shape, so a bad
        # re-capture cannot silently weaken this direction.
        for name in classifier.TEST_JOB_NAMES:
            job = self._job(jobs, name)
            self.assertEqual(job["conclusion"], "cancelled", name)
            self.assertEqual(job["steps"], [], name)
        self.assertEqual(classifier.classify_jobs(jobs), classifier.QUEUE_DROP)

    def test_unit_test_failure_runs_still_classify_as_failure(self):
        """Direction two: a unit-test failure after 16 executed steps is red
        for a real reason, on both commits where this shape occurred."""
        for run_id in self.RUN_UNIT_FAILURES:
            with self.subTest(run_id=run_id):
                jobs = self._jobs(run_id)
                unit = self._job(jobs, "test-frontend-unit")
                self.assertEqual(unit["conclusion"], "failure")
                self.assertTrue(unit["steps"], "the job must have executed steps")
                self.assertEqual(classifier.classify_jobs(jobs),
                                 classifier.FAILURE)

    def test_deploy_step_failure_run_still_classifies_as_failure(self):
        """Direction two: run 31102171693 (all test jobs success, deploy
        failed at 'Deploy to GitHub Pages') is red for a real reason and
        must stay red, not be excused as a drop."""
        jobs = self._jobs(self.RUN_DEPLOY_STEP_FAILURE)
        for name in classifier.TEST_JOB_NAMES:
            self.assertEqual(self._job(jobs, name)["conclusion"], "success", name)
        self.assertEqual(self._job(jobs, "deploy")["conclusion"], "failure")
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_midflight_cancellation_does_not_read_as_queue_drop(self):
        """A cancellation with executed steps and a named runner is a user
        cancellation, not a capacity drop: it must redden."""
        jobs = self._jobs(self.RUN_QUEUE_DROP)
        for job in jobs:
            if job["name"] in classifier.TEST_JOB_NAMES:
                job["steps"] = [{"number": 1, "name": "Checkout",
                                 "status": "completed", "conclusion": "success"}]
                job["runner_id"] = 91
                job["runner_name"] = "runner-91"
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_mixed_queue_drop_and_midflight_cancellation_classifies_as_failure(self):
        """A partially-cancelled run (one job got a runner, the rest did not)
        is a mixed shape, not a clean drop: it must redden."""
        jobs = self._jobs(self.RUN_QUEUE_DROP)
        go = self._job(jobs, "test-go")
        go["steps"] = [{"number": 1, "name": "Checkout",
                        "status": "completed", "conclusion": "success"}]
        go["runner_id"] = 92
        go["runner_name"] = "runner-92"
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_unrecognised_conclusion_falls_through_to_failure(self):
        """Two dropped jobs plus one job with a conclusion the classifier
        does not know must land in the failure branch, never the drop."""
        jobs = self._jobs(self.RUN_QUEUE_DROP)
        self._job(jobs, "test-e2e")["conclusion"] = "action_required"
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_missing_test_job_falls_through_to_failure(self):
        """A reported test job absent from the payload is an unrecognised
        shape and must redden rather than classify."""
        jobs = [job for job in self._jobs(self.RUN_QUEUE_DROP)
                if job["name"] != "test-go"]
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_timed_out_job_classifies_as_failure(self):
        """A timeout cap is a real failure shape, not an infrastructure drop."""
        jobs = self._jobs(self.RUN_QUEUE_DROP)
        go = self._job(jobs, "test-go")
        go["conclusion"] = "timed_out"
        go["steps"] = [{"number": 1, "name": "Run Go tests",
                        "status": "completed", "conclusion": "timed_out"}]
        go["runner_id"] = 93
        go["runner_name"] = "runner-93"
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_green_run_with_deploy_still_running_classifies_as_success(self):
        """deploy is in the classifier job's needs, so a deploy row without
        a terminal conclusion is not an expected shape; the in-flight
        tolerance is defensive and must still not redden such a read."""
        jobs = self._jobs(self.RUN_DEPLOY_STEP_FAILURE)
        deploy = self._job(jobs, "deploy")
        deploy["conclusion"] = None
        deploy["status"] = "in_progress"
        self.assertEqual(classifier.classify_jobs(jobs), classifier.SUCCESS)

    def test_in_flight_test_job_does_not_read_as_success(self):
        """A test job without a terminal conclusion is an unrecognised
        shape and must redden; the defensive in-flight tolerance covers
        deploy alone."""
        jobs = self._jobs(self.RUN_DEPLOY_STEP_FAILURE)
        go = self._job(jobs, "test-go")
        go["conclusion"] = None
        go["status"] = "in_progress"
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_deliberately_skipped_partial_dispatch_classifies_as_success(self):
        """A workflow_dispatch run for one suite skips the other test jobs;
        a deliberate skip is not a drop and not a failure."""
        ran = [{"number": 1, "name": "Checkout",
                "status": "completed", "conclusion": "success"}]
        jobs = [
            self._synthetic_job("test-frontend-unit", "success", steps=ran),
            self._synthetic_job("test-go", "skipped"),
            self._synthetic_job("test-e2e", "skipped"),
            self._synthetic_job("allure-report", "success", steps=ran),
            self._synthetic_job("deploy", "skipped"),
        ]
        self.assertEqual(classifier.classify_jobs(jobs), classifier.SUCCESS)

    def test_tolerated_e2e_failure_with_deploy_success_classifies_as_success(self):
        """The deploy gate tolerates an E2E failure inside its failure-count
        threshold, and deploy concluding success is the gate's own verdict
        that the tolerance applied: this shape must not redden."""
        jobs = self._synth_jobs("e2e_toleration")
        e2e = self._job(jobs, "test-e2e")
        self.assertEqual(e2e["conclusion"], "failure")
        self.assertTrue(e2e["steps"], "the job must have executed steps")
        self.assertEqual(self._job(jobs, "deploy")["conclusion"], "success")
        self.assertEqual(classifier.classify_jobs(jobs), classifier.SUCCESS)

    def test_e2e_failure_without_deploy_success_classifies_as_failure(self):
        """An E2E failure stays fatal whenever the gate did not issue its
        success verdict: deploy skipped in the payload, or deploy absent."""
        jobs = self._synth_jobs("e2e_fatal_gate_blocked")
        self.assertEqual(self._job(jobs, "test-e2e")["conclusion"], "failure")
        self.assertEqual(self._job(jobs, "deploy")["conclusion"], "skipped")
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)
        absent = [job for job in jobs if job["name"] != "deploy"]
        self.assertEqual(classifier.classify_jobs(absent), classifier.FAILURE)

    def test_mixed_queue_drop_with_allure_failure_classifies_as_failure(self):
        """All three test jobs dropped but allure-report genuinely failed is
        a mixed shape with a companion verdict of its own, not a clean drop:
        it must redden rather than read as an infrastructure drop."""
        jobs = self._synth_jobs("mixed_drop_allure_failure")
        for name in classifier.TEST_JOB_NAMES:
            job = self._job(jobs, name)
            self.assertEqual(job["conclusion"], "cancelled", name)
            self.assertEqual(job["steps"], [], name)
        allure = self._job(jobs, "allure-report")
        self.assertEqual(allure["conclusion"], "failure")
        self.assertTrue(allure["steps"], "the job must have executed steps")
        self.assertEqual(classifier.classify_jobs(jobs), classifier.FAILURE)

    def test_success_summary_claims_all_gates_passed_only_when_deploy_greenlit(self):
        """The 'All test gates passed' headline is conditional on the deploy
        gate's own verdict: a run deploy never greenlit must not be announced
        as fully green, while a greenlit run keeps the claim."""
        greenlit = self._jobs(self.RUN_DEPLOY_STEP_FAILURE)
        self._job(greenlit, "deploy")["conclusion"] = "success"
        verdict = classifier.classify_jobs(greenlit)
        self.assertEqual(verdict, classifier.SUCCESS)
        self.assertIn("All test gates passed",
                      classifier.render_summary(verdict, greenlit))
        blocked = self._jobs(self.RUN_DEPLOY_STEP_FAILURE)
        self._job(blocked, "deploy")["conclusion"] = "skipped"
        verdict = classifier.classify_jobs(blocked)
        self.assertEqual(verdict, classifier.SUCCESS)
        summary = classifier.render_summary(verdict, blocked)
        self.assertNotIn("All test gates passed", summary)
        # deploy is in the classifier job's needs, so its row is terminal:
        # the summary names the observed verdict rather than inventing a
        # reason such as a deliberately partial run.
        self.assertNotIn("deliberately partial", summary)
        self.assertIn("verdict is skipped, not success", summary)

    def test_success_summary_names_tolerated_e2e_failures(self):
        """A SUCCESS verdict that contains an E2E failure must say so rather
        than announce all gates passed."""
        jobs = self._synth_jobs("e2e_toleration")
        verdict = classifier.classify_jobs(jobs)
        self.assertEqual(verdict, classifier.SUCCESS)
        summary = classifier.render_summary(verdict, jobs)
        self.assertNotIn("All test gates passed", summary)
        self.assertIn("tolerated E2E failures", summary)


class DeployClassificationGuard(unittest.TestCase):
    """Text-level guards over deploy.yml, on the _nightly_jobs pattern: the
    classification must not be collapsible back into a single 'not success'
    branch, and the deploy gate's semantics must not shift now that another
    job also reads conclusions."""

    CLASSIFICATION_JOB = "classify-outcome"
    REQUIRED_NEEDS = {"test-frontend-unit", "test-go", "test-e2e",
                      "allure-report", "deploy"}

    def setUp(self):
        self.jobs = _deploy_jobs()

    def test_classification_job_declared_additively(self):
        """The job exists, always runs, depends on all five existing jobs
        (deploy included, so the classifier never reads a deploy verdict
        still in flight), executes the guarded classifier module, and
        nothing reads its result: additivity is what keeps the deploy set
        unchanged."""
        self.assertIn(self.CLASSIFICATION_JOB, self.jobs)
        body = self.jobs[self.CLASSIFICATION_JOB]
        self.assertIn("if: always()", body)
        needs = re.search(r"^    needs: \[(.+)\]$", body, re.M)
        self.assertIsNotNone(needs, "classification job must declare its needs")
        self.assertEqual({name.strip() for name in needs.group(1).split(",")},
                         self.REQUIRED_NEEDS)
        self.assertIn("classify_run.py", body)
        for name, other in self.jobs.items():
            if name != self.CLASSIFICATION_JOB:
                self.assertNotIn(self.CLASSIFICATION_JOB, other,
                                 f"{name} must not depend on the classifier")

    def test_classification_rule_names_the_drop_shape_explicitly(self):
        """The rule production executes must test the positive queue-drop
        shape ('cancelled', empty steps, no runner), not the absence of
        success."""
        with open(_repo(".github", "scripts", "classify_run.py")) as f:
            source = f.read()
        self.assertIn('"cancelled"', source)
        self.assertIn("steps", source)
        self.assertIn("runner_id", source)
        self.assertIn("runner_name", source)

    def test_deploy_gate_still_requires_success_from_its_three_gates(self):
        """The deploy gate is the only route to production; it must still
        demand success from allure-report, test-go, and test-frontend-unit,
        so the classifier can never become a route to deploying a run that
        did not pass."""
        body = self.jobs["deploy"]
        for job in ("allure-report", "test-go", "test-frontend-unit"):
            self.assertIn(f"needs.{job}.result == 'success'", body)


if __name__ == "__main__":
    unittest.main()
