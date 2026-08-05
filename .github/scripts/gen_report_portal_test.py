#!/usr/bin/env python3
"""Tests for gen_report_portal.py. Run: python3 -m unittest gen_report_portal_test."""

import json
import os
import re
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()
