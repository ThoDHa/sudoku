#!/usr/bin/env python3
"""Tests for the mutation_aggregate.py counting primitives.

Run: python3 -m unittest mutation_aggregate_test. Gating is tested in
mutation_floors_test, which owns the floors and the comparison against them."""

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


if __name__ == "__main__":
    unittest.main()
