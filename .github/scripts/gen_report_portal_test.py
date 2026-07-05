#!/usr/bin/env python3
"""Tests for gen_report_portal.py. Run: python3 -m unittest gen_report_portal_test."""

import os
import tempfile
import unittest

import gen_report_portal as portal


def make_artifact(artifacts_dir, name, rel_html_path):
    path = os.path.join(artifacts_dir, name, os.path.dirname(rel_html_path))
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(artifacts_dir, name, rel_html_path), "w") as f:
        f.write("<html>report</html>")


class Portal(unittest.TestCase):
    def _gen(self, artifacts_dir, out_dir):
        return portal.main(["--artifacts-dir", artifacts_dir, "--out-dir", out_dir])

    def test_allure_link_always_present(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "reports")
            self._gen(os.path.join(d, "none"), out)  # no artifacts dir
            with open(os.path.join(out, "index.html")) as fh:
                page = fh.read()
            self.assertIn("../test-report/", page)
            self.assertIn("Allure", page)

    def test_copies_and_links_frontend_and_go_reports(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            make_artifact(artifacts, "mutation-frontend", "reports/mutation/mutation.html")
            make_artifact(artifacts, "mutation-go-dp",
                          "reports/mutation/internal-sudoku-dp/go-mutesting-report.html")
            make_artifact(artifacts, "mutation-go-techniques-shard-1",
                          "reports/mutation/techniques-shard-1/go-mutesting-report.html")
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)

            self.assertTrue(os.path.exists(os.path.join(out, "mutation/frontend/mutation.html")))
            self.assertTrue(os.path.exists(os.path.join(out, "mutation/dp/go-mutesting-report.html")))
            self.assertTrue(os.path.exists(
                os.path.join(out, "mutation/techniques-shard-1/go-mutesting-report.html")))

            with open(os.path.join(out, "index.html")) as fh:
                page = fh.read()
            self.assertIn("mutation/frontend/mutation.html", page)
            self.assertIn("mutation/dp/go-mutesting-report.html", page)
            self.assertIn("Frontend (StrykerJS)", page)
            self.assertIn("Go: dp", page)

    def test_copies_profiling_playwright_report_dir_with_assets(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            make_artifact(artifacts, "nightly-playwright-report", "index.html")
            make_artifact(artifacts, "nightly-playwright-report", "data/trace.zip")
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)
            self.assertTrue(os.path.exists(os.path.join(out, "profiling/playwright/index.html")))
            # The whole report dir is copied, not just the entry file.
            self.assertTrue(os.path.exists(os.path.join(out, "profiling/playwright/data/trace.zip")))
            with open(os.path.join(out, "index.html")) as fh:
                page = fh.read()
            self.assertIn("profiling/playwright/index.html", page)
            self.assertIn("Profiling", page)

    def test_copies_coverage_reports(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            make_artifact(artifacts, "coverage-frontend", "index.html")
            make_artifact(artifacts, "coverage-frontend", "assets/style.css")
            make_artifact(artifacts, "coverage-go", "coverage.html")
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)
            self.assertTrue(os.path.exists(os.path.join(out, "coverage/frontend/index.html")))
            self.assertTrue(os.path.exists(os.path.join(out, "coverage/frontend/assets/style.css")))
            self.assertTrue(os.path.exists(os.path.join(out, "coverage/go/coverage.html")))
            with open(os.path.join(out, "index.html")) as fh:
                page = fh.read()
            self.assertIn("coverage/frontend/index.html", page)
            self.assertIn("coverage/go/coverage.html", page)
            self.assertIn("Coverage", page)

    def test_omits_missing_reports_no_dead_links(self):
        with tempfile.TemporaryDirectory() as d:
            artifacts = os.path.join(d, "artifacts")
            # An artifact dir with no recognizable HTML report inside.
            os.makedirs(os.path.join(artifacts, "mutation-go-human"), exist_ok=True)
            out = os.path.join(d, "reports")
            self._gen(artifacts, out)
            with open(os.path.join(out, "index.html")) as fh:
                page = fh.read()
            self.assertNotIn("go-mutesting-report.html", page)


if __name__ == "__main__":
    unittest.main()
