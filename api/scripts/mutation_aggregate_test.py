#!/usr/bin/env python3
"""Tests for mutation_aggregate.py. Run: python3 -m unittest mutation_aggregate_test."""

import json
import os
import tempfile
import unittest

import mutation_aggregate as agg


def write_report(dir_path, killed, escaped, total, timeout=0):
    os.makedirs(dir_path, exist_ok=True)
    stats = {
        "killedCount": killed,
        "escapedCount": escaped,
        "totalMutantsCount": total,
        "timeOutCount": timeout,
    }
    with open(os.path.join(dir_path, "report.json"), "w") as f:
        json.dump({"stats": stats}, f)


class EfficacyMath(unittest.TestCase):
    def test_timeouts_count_as_kills(self):
        self.assertEqual(agg.efficacy(90 + 10, 0), 100.0)

    def test_escaped_lower_efficacy(self):
        # 80 killed, 20 escaped -> 80%
        self.assertAlmostEqual(agg.efficacy(80, 20), 80.0)

    def test_no_mutants_is_full_efficacy(self):
        self.assertEqual(agg.efficacy(0, 0), 100.0)


class Aggregation(unittest.TestCase):
    def test_sums_across_shards(self):
        with tempfile.TemporaryDirectory() as d:
            write_report(os.path.join(d, "s1"), killed=40, escaped=5, total=50, timeout=5)
            write_report(os.path.join(d, "s2"), killed=30, escaped=10, total=45, timeout=5)
            reports = agg.find_reports(d)
            killed_no_to, timeout, escaped, total = agg.combine(reports)
            self.assertEqual(killed_no_to, 70)
            self.assertEqual(timeout, 10)
            self.assertEqual(escaped, 15)
            self.assertEqual(total, 95)
            # (70 + 10) / (70 + 10 + 15) = 80 / 95
            self.assertAlmostEqual(agg.efficacy(killed_no_to + timeout, escaped), 80 / 95 * 100)


class Gate(unittest.TestCase):
    def _run(self, floor, expected, dir_path):
        return agg.main(["--floor", str(floor), "--expected", str(expected),
                         "--reports-dir", dir_path])

    def test_passes_when_combined_meets_floor(self):
        with tempfile.TemporaryDirectory() as d:
            write_report(os.path.join(d, "s1"), killed=90, escaped=5, total=100, timeout=0)
            write_report(os.path.join(d, "s2"), killed=88, escaped=6, total=100, timeout=2)
            self.assertEqual(self._run(85, 2, d), 0)

    def test_fails_when_combined_below_floor(self):
        with tempfile.TemporaryDirectory() as d:
            write_report(os.path.join(d, "s1"), killed=70, escaped=30, total=100, timeout=0)
            write_report(os.path.join(d, "s2"), killed=70, escaped=30, total=100, timeout=0)
            self.assertEqual(self._run(85, 2, d), 1)

    def test_missing_shard_fails_loudly(self):
        with tempfile.TemporaryDirectory() as d:
            write_report(os.path.join(d, "s1"), killed=90, escaped=5, total=100, timeout=0)
            # Only 1 of 2 expected shards present -> untrustworthy -> exit 2.
            self.assertEqual(self._run(85, 2, d), 2)

    def test_corrupt_report_fails_as_untrustworthy(self):
        with tempfile.TemporaryDirectory() as d:
            write_report(os.path.join(d, "s1"), killed=90, escaped=5, total=100, timeout=0)
            os.makedirs(os.path.join(d, "s2"), exist_ok=True)
            # A present but truncated/malformed report is unreadable, not "below
            # floor": it must exit 2, mirroring the missing-shard contract.
            with open(os.path.join(d, "s2", "report.json"), "w") as f:
                f.write("{ this is not valid json")
            self.assertEqual(self._run(85, 2, d), 2)


if __name__ == "__main__":
    unittest.main()
