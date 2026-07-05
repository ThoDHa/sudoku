#!/usr/bin/env python3
"""Tests for mutation_to_allure.py. Run: python3 -m unittest mutation_to_allure_test."""

import glob
import json
import os
import tempfile
import unittest

import mutation_to_allure as conv


def load_results(out_dir):
    results = []
    for path in glob.glob(os.path.join(out_dir, "*-result.json")):
        with open(path) as f:
            results.append(json.load(f))
    return results


class Stryker(unittest.TestCase):
    def _report(self):
        return {
            "files": {
                "src/a.ts": {"mutants": [
                    {"status": "Killed", "mutatorName": "M", "location": {"start": {"line": 1}}},
                    {"status": "Timeout", "mutatorName": "M", "location": {"start": {"line": 2}}},
                ]},
                "src/b.ts": {"mutants": [
                    {"status": "Killed", "mutatorName": "M", "location": {"start": {"line": 3}}},
                    {"status": "Survived", "mutatorName": "EqualityOp", "location": {"start": {"line": 9}}},
                ]},
            }
        }

    def test_passed_and_failed_per_file(self):
        with tempfile.TemporaryDirectory() as d:
            report = os.path.join(d, "mutation.json")
            with open(report, "w") as f:
                json.dump(self._report(), f)
            conv.main(["--out-dir", os.path.join(d, "out"), "--stryker", report])
            results = load_results(os.path.join(d, "out"))
            by_name = {r["name"]: r for r in results}
            self.assertEqual(by_name["src/a.ts"]["status"], "passed")
            self.assertEqual(by_name["src/b.ts"]["status"], "failed")
            self.assertIn("EqualityOp", by_name["src/b.ts"]["statusDetails"]["trace"])
            # Every result carries the Mutation suite label.
            self.assertTrue(all(
                any(l["value"].startswith("Mutation") for l in r["labels"])
                for r in results))


class Go(unittest.TestCase):
    def test_escaped_makes_file_fail(self):
        report = {
            "killed": [
                {"mutator": {"originalFilePath": "dp/x.go", "originalStartLine": 5, "mutatorName": "M"}},
            ],
            "escaped": [
                {"mutator": {"originalFilePath": "dp/y.go", "originalStartLine": 8, "mutatorName": "BranchCond"}},
            ],
            "timeouted": [],
            "errored": [],
        }
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "report.json")
            with open(path, "w") as f:
                json.dump(report, f)
            conv.main(["--out-dir", os.path.join(d, "out"), "--go", "dp", path])
            results = {r["name"]: r for r in load_results(os.path.join(d, "out"))}
            self.assertEqual(results["dp/x.go"]["status"], "passed")
            self.assertEqual(results["dp/y.go"]["status"], "failed")
            self.assertIn("BranchCond", results["dp/y.go"]["statusDetails"]["trace"])
            self.assertIn("Mutation: Go: dp", [l["value"] for l in results["dp/x.go"]["labels"]])


class Stable(unittest.TestCase):
    def test_history_id_is_stable_across_runs(self):
        with tempfile.TemporaryDirectory() as d:
            report = {"files": {"src/a.ts": {"mutants": [
                {"status": "Survived", "mutatorName": "M", "location": {"start": {"line": 1}}}]}}}
            path = os.path.join(d, "mutation.json")
            with open(path, "w") as f:
                json.dump(report, f)
            conv.main(["--out-dir", os.path.join(d, "o1"), "--stryker", path])
            conv.main(["--out-dir", os.path.join(d, "o2"), "--stryker", path])
            h1 = load_results(os.path.join(d, "o1"))[0]["historyId"]
            h2 = load_results(os.path.join(d, "o2"))[0]["historyId"]
            self.assertEqual(h1, h2)


class Discovery(unittest.TestCase):
    def test_discovers_stryker_and_go_from_artifacts_dir(self):
        with tempfile.TemporaryDirectory() as d:
            art = os.path.join(d, "artifacts")
            os.makedirs(os.path.join(art, "mutation-frontend"))
            with open(os.path.join(art, "mutation-frontend", "mutation.json"), "w") as f:
                json.dump({"files": {"src/a.ts": {"mutants": [
                    {"status": "Survived", "mutatorName": "M", "location": {"start": {"line": 1}}}]}}}, f)
            godir = os.path.join(art, "mutation-go-techniques-shard-1", "reports")
            os.makedirs(godir)
            with open(os.path.join(godir, "report.json"), "w") as f:
                json.dump({"escaped": [{"mutator": {"originalFilePath": "t.go",
                          "originalStartLine": 1, "mutatorName": "M"}}]}, f)
            conv.main(["--out-dir", os.path.join(d, "out"), "--artifacts-dir", art])
            results = {r["name"]: r for r in load_results(os.path.join(d, "out"))}
            self.assertEqual(results["src/a.ts"]["status"], "failed")
            self.assertEqual(results["t.go"]["status"], "failed")
            self.assertIn("Mutation: Go: techniques-shard-1",
                          [l["value"] for l in results["t.go"]["labels"]])


if __name__ == "__main__":
    unittest.main()
