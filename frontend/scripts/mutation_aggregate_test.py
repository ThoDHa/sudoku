#!/usr/bin/env python3
"""Unit tests for the StrykerJS mutation_aggregate.py combiner.

Mirrors the contract of api/scripts/mutation_aggregate_test.py but feeds the
StrykerJS mutation testing elements schema (mutation.json) instead of
go-mutesting's report.json.
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

# Make the script importable when run from frontend/scripts/.
sys.path.insert(0, os.path.dirname(__file__))
import mutation_aggregate as agg  # noqa: E402


def _stryker_report(files):
    """Build a minimal StrykerJS mutation.json dict from {filename: [entries]}.

    Each entry is either a plain status string or a dict of mutant fields
    carrying at least "status" (e.g. "statusReason", "mutatorName",
    "replacement", "static", "coveredBy"), matching the real report shape.
    """
    out = {"schemaVersion": "1.0", "files": {}}
    for fname, entries in files.items():
        mutants = []
        for i, entry in enumerate(entries):
            if isinstance(entry, str):
                mutant = {"status": entry}
            else:
                mutant = dict(entry)
            mutant["id"] = str(i)
            mutants.append(mutant)
        out["files"][fname] = {
            "language": "typescript",
            "source": "",
            "mutants": mutants,
        }
    return out


def _write_report(dir_path, shard_name, files):
    shard_dir = os.path.join(dir_path, shard_name)
    os.makedirs(shard_dir, exist_ok=True)
    with open(os.path.join(shard_dir, "mutation.json"), "w") as f:
        json.dump(_stryker_report(files), f)


# Fixtures copied verbatim from real entries in
# mutation-results/postbatch/frontend/reports/mutation/mutation.json so the
# classifier is calibrated against the shapes Stryker actually writes.
_HIT_LIMIT_TIMEOUT = {
    "mutatorName": "UpdateOperator",
    "replacement": "c--",
    "statusReason": "Hit limit reached (7054501/7054500)",
    "status": "Timeout",
    "static": False,
    "coveredBy": ["15", "61", "62"],
    "location": {"end": {"column": 38, "line": 20},
                 "start": {"column": 35, "line": 20}},
}
_BARE_TIMEOUT = {
    "mutatorName": "ObjectLiteral",
    "replacement": "{}",
    "status": "Timeout",
    "static": True,
    "coveredBy": [],
    "location": {"end": {"column": 2, "line": 83},
                 "start": {"column": 38, "line": 76}},
}
_KILLED_WITH_REASON = {
    "mutatorName": "Block",
    "replacement": "{}",
    "statusReason": "expected false to be true // Object.is equality",
    "status": "Killed",
    "static": False,
    "coveredBy": ["15"],
    "location": {"end": {"column": 38, "line": 20},
                 "start": {"column": 35, "line": 20}},
}


def _write_tmp_reports(files):
    """Write one shard report into a fresh temp dir; return its mutation.json path."""
    tmp = tempfile.mkdtemp()
    _write_report(tmp, "shard", files)
    return os.path.join(tmp, "shard", "mutation.json")


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
        return [_write_tmp_reports(files)]


class ClassifyTests(unittest.TestCase):
    def test_hit_limit_timeout_is_loop_kill(self):
        path = _write_tmp_reports({"src/hooks/useCandidates.ts": [
            _KILLED_WITH_REASON, _HIT_LIMIT_TIMEOUT]})
        loop, clock, unclassified, per_file = agg.classify_timeouts([path])
        self.assertEqual((loop, clock, unclassified), (1, 0, 0))
        self.assertEqual(per_file["src/hooks/useCandidates.ts"], [1, 0, 0])

    def test_bare_timeout_is_clock_kill(self):
        path = _write_tmp_reports({"src/hooks/useHighlightState.ts": [
            _BARE_TIMEOUT]})
        loop, clock, unclassified, per_file = agg.classify_timeouts([path])
        self.assertEqual((loop, clock, unclassified), (0, 1, 0))
        self.assertEqual(per_file["src/hooks/useHighlightState.ts"], [0, 1, 0])

    def test_unrecognised_status_reason_is_unclassified(self):
        path = _write_tmp_reports({"a.ts": [
            dict(_HIT_LIMIT_TIMEOUT, statusReason="Runner crashed")]})
        loop, clock, unclassified, per_file = agg.classify_timeouts([path])
        self.assertEqual((loop, clock, unclassified), (0, 0, 1))
        self.assertEqual(per_file["a.ts"], [0, 0, 1])

    def test_hit_limit_reword_lands_in_unclassified(self):
        # A Stryker upgrade rewording the template string must surface here,
        # not silently move loop-kills into the wall-clock bucket.
        path = _write_tmp_reports({"a.ts": [
            dict(_HIT_LIMIT_TIMEOUT, statusReason="Exceeded hit limit 7054501/7054500")]})
        loop, clock, unclassified, _per_file = agg.classify_timeouts([path])
        self.assertEqual((loop, clock, unclassified), (0, 0, 1))

    def test_status_reason_shape_must_carry_hit_counts(self):
        path = _write_tmp_reports({"a.ts": [
            dict(_HIT_LIMIT_TIMEOUT, statusReason="Hit limit reached")]})
        loop, clock, unclassified, _per_file = agg.classify_timeouts([path])
        self.assertEqual((loop, clock, unclassified), (0, 0, 1))

    def test_killed_mutant_with_status_reason_contributes_to_no_bucket(self):
        path = _write_tmp_reports({"a.ts": [_KILLED_WITH_REASON]})
        loop, clock, unclassified, per_file = agg.classify_timeouts([path])
        self.assertEqual((loop, clock, unclassified), (0, 0, 0))
        self.assertEqual(per_file, {})

    def test_buckets_reported_per_file_across_shards(self):
        p1 = _write_tmp_reports({"src/hooks/useCandidates.ts": [_HIT_LIMIT_TIMEOUT]})
        p2 = _write_tmp_reports({
            "src/hooks/useHighlightState.ts": [_BARE_TIMEOUT],
            "src/lib/preferences.ts": [_BARE_TIMEOUT, dict(
                _HIT_LIMIT_TIMEOUT,
                statusReason="Hit limit reached (5401/5400)")]})
        loop, clock, unclassified, per_file = agg.classify_timeouts([p1, p2])
        self.assertEqual((loop, clock, unclassified), (2, 2, 0))
        self.assertEqual(per_file, {
            "src/hooks/useCandidates.ts": [1, 0, 0],
            "src/hooks/useHighlightState.ts": [0, 1, 0],
            "src/lib/preferences.ts": [1, 1, 0],
        })

    def test_buckets_conserve_timeout_count_and_gate_totals(self):
        entries = [_KILLED_WITH_REASON, _HIT_LIMIT_TIMEOUT,
                   dict(_HIT_LIMIT_TIMEOUT, statusReason="Hit limit reached (5401/5400)"),
                   _BARE_TIMEOUT, _BARE_TIMEOUT,
                   dict(_HIT_LIMIT_TIMEOUT, statusReason="Runner crashed"),
                   "Survived", "NoCoverage", "Ignored"]
        path = _write_tmp_reports({"a.ts": entries})
        loop, clock, unclassified, _per_file = agg.classify_timeouts([path])
        self.assertEqual(loop + clock + unclassified, 5)
        caught, escaped, ignored, total = agg.combine([path])
        self.assertEqual((caught, escaped, ignored, total), (6, 2, 1, 9))

    def test_caught_and_escaped_sets_unchanged(self):
        self.assertEqual(agg.CAUGHT,
                         {"Killed", "Timeout", "RuntimeError", "CompileError"})
        self.assertEqual(agg.ESCAPED, {"Survived", "NoCoverage"})


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

    def test_gate_line_byte_identical_with_and_without_timeout_split(self):
        files = {"a.ts": [_KILLED_WITH_REASON, _HIT_LIMIT_TIMEOUT, _BARE_TIMEOUT,
                          "Survived"]}
        tmp = tempfile.mkdtemp()
        _write_report(tmp, "s1", files)
        argv = ["--floor", "50", "--expected", "1",
                "--reports-dir", tmp, "--label", "test"]
        plain = io.StringIO()
        with contextlib.redirect_stdout(plain):
            rc_plain = agg.main(argv)
        split = io.StringIO()
        with contextlib.redirect_stdout(split):
            rc_split = agg.main(argv + ["--report-timeouts"])
        self.assertEqual(rc_plain, 0)
        self.assertEqual(rc_split, 0)
        gate_line = ("mutation-gate: OK test 75.0% (floor 50%) "
                     "[shards=1 caught=3 escaped=1 ignored=0 total=4]\n")
        self.assertEqual(plain.getvalue(), gate_line)
        self.assertEqual(
            split.getvalue(),
            gate_line
            + "timeout-split total: loop-kills=1 clock-kills=1 unclassified=0\n"
            + "timeout-split a.ts: loop-kills=1 clock-kills=1 unclassified=0\n")

    def test_unclassified_timeouts_reported_in_gate_output(self):
        tmp = tempfile.mkdtemp()
        _write_report(tmp, "s1", {"a.ts": [
            dict(_HIT_LIMIT_TIMEOUT, statusReason="Runner crashed")]})
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = agg.main(["--floor", "100", "--expected", "1",
                           "--reports-dir", tmp, "--label", "test",
                           "--report-timeouts"])
        self.assertEqual(rc, 0)
        self.assertIn("timeout-split total: loop-kills=0 clock-kills=0 "
                      "unclassified=1\n", out.getvalue())


if __name__ == "__main__":
    unittest.main()
