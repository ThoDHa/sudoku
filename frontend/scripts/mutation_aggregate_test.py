#!/usr/bin/env python3
"""Unit tests for the StrykerJS mutation_aggregate.py combiner.

Mirrors the contract of api/scripts/mutation_aggregate_test.py but feeds the
StrykerJS mutation testing elements schema (mutation.json) instead of
go-mutesting's report.json.
"""

import json
import os
import sys
import tempfile
import unittest

# Make the script importable when run from frontend/scripts/.
sys.path.insert(0, os.path.dirname(__file__))
import mutation_aggregate as agg  # noqa: E402


def _stryker_report(files):
    """Build a minimal StrykerJS mutation.json dict from {filename: [statuses]}."""
    out = {"schemaVersion": "1.0", "files": {}}
    for fname, statuses in files.items():
        out["files"][fname] = {
            "language": "typescript",
            "source": "",
            "mutants": [{"status": s, "id": str(i)} for i, s in enumerate(statuses)],
        }
    return out


def _write_report(dir_path, shard_name, files):
    shard_dir = os.path.join(dir_path, shard_name)
    os.makedirs(shard_dir, exist_ok=True)
    with open(os.path.join(shard_dir, "mutation.json"), "w") as f:
        json.dump(_stryker_report(files), f)


class CombineTests(unittest.TestCase):
    def test_counts_every_status_category(self):
        files = {"a.ts": ["Killed", "Survived", "Timeout", "NoCoverage",
                          "RuntimeError", "CompileError", "Ignored"]}
        paths = self._write_tmp(files)
        caught, escaped, ignored, total = agg.combine(paths)
        # Killed + Timeout + RuntimeError + CompileError = 4 caught
        self.assertEqual(caught, 4)
        # Survived + NoCoverage = 2 escaped
        self.assertEqual(escaped, 2)
        # Ignored is excluded from scoring entirely
        self.assertEqual(ignored, 1)
        self.assertEqual(total, 7)

    def test_efficacy_excludes_ignored(self):
        # 4 caught, 2 escaped, 1 ignored -> 4/6 = 66.67%
        self.assertAlmostEqual(agg.efficacy(4, 2), 66.66666666, places=4)

    def test_efficacy_100_when_nothing_scored(self):
        # All ignored -> denominator 0 -> 100 by convention.
        self.assertEqual(agg.efficacy(0, 0), 100.0)

    def _write_tmp(self, files):
        tmp = tempfile.mkdtemp()
        _write_report(tmp, "shard", files)
        # combine takes a list of report paths
        import glob
        return glob.glob(os.path.join(tmp, "**", "mutation.json"), recursive=True)


class GateTests(unittest.TestCase):
    def test_missing_shard_fails_loudly(self):
        tmp = tempfile.mkdtemp()
        _write_report(tmp, "only-shard", {"a.ts": ["Killed"]})
        rc = agg.main(["--floor", "100", "--expected", "7",
                       "--reports-dir", tmp, "--label", "test"])
        self.assertEqual(rc, 2)

    def test_meets_floor_passes(self):
        tmp = tempfile.mkdtemp()
        _write_report(tmp, "s1", {"a.ts": ["Killed", "Killed", "Survived"]})
        rc = agg.main(["--floor", "50", "--expected", "1",
                       "--reports-dir", tmp, "--label", "test"])
        self.assertEqual(rc, 0)

    def test_below_floor_fails(self):
        tmp = tempfile.mkdtemp()
        _write_report(tmp, "s1", {"a.ts": ["Killed", "Survived", "Survived"]})
        rc = agg.main(["--floor", "90", "--expected", "1",
                       "--reports-dir", tmp, "--label", "test"])
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
