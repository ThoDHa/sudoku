#!/usr/bin/env python3
"""Tests for gen_report_portal.py. Run: python3 -m unittest gen_report_portal_test."""

import json
import os
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
            # each meeting its own floor (dp 100% >= 95, techniques 85% >= 85).
            make_json_artifact(artifacts, "mutation-go-dp", "report.json",
                               {"stats": {"killedCount": 20, "timeOutCount": 0, "escapedCount": 0}})
            make_json_artifact(artifacts, "mutation-go-techniques-shard-aic", "report.json",
                               {"stats": {"killedCount": 17, "timeOutCount": 0, "escapedCount": 3}})
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
            # Aggregated efficacy: 37 detected / 40 -> 92.5%; all floors met.
            self.assertIn("92.5%", page)
            self.assertNotIn("below floor", page)

    def test_go_tile_fails_when_a_package_breaches_its_own_floor(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            # dp at 90% breaches its stricter 95 floor, even though the huge
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


if __name__ == "__main__":
    unittest.main()
