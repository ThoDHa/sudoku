#!/usr/bin/env python3
"""Tests for mutation_floors.py. Run: python3 -m unittest mutation_floors_test."""

import json
import os
import re
import subprocess
import tempfile
import unittest

import mutation_floors as mf
# Reuse the report writer rather than restating the go-mutesting v2.3.1 stats
# shape, whose `timeOutCount` spelling is easy to get wrong, in two test files.
from mutation_aggregate_test import write_report as _write_report

_REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                      os.pardir, os.pardir))

SOURCE = {"measured": 90.0, "run": "1", "recorded": "2026-08-04", "note": "test"}


def write_report(dir_path, killed, escaped, total=None, timeout=0):
    _write_report(dir_path, killed, escaped,
                  total if total is not None else killed + escaped + timeout,
                  timeout)
    return os.path.join(dir_path, "report.json")


def package_dir(root, scope):
    """Mirror the Makefile's per-package report layout."""
    return os.path.join(root, mf.report_slug(mf.PACKAGE_PKGS[scope]))


def write_floors(dir_path, floors, shards=None, sources=None):
    path = os.path.join(dir_path, "floors.json")
    with open(path, "w") as f:
        json.dump({"floors": floors,
                   "techniques_shards": shards or {},
                   "sources": sources or {}}, f)
    return path


def shard_dir(root, name):
    """Mirror the CI artifact layout so path-based shard identification is
    exercised against the real shape, not a convenient one."""
    return os.path.join(root, f"mutation-go-techniques-shard-{name}",
                        "reports", "mutation", f"techniques-shard-{name}")


class Ratchet(unittest.TestCase):
    """The one-way property is the whole point of the mechanism."""

    def test_raises_to_a_better_measurement(self):
        self.assertEqual(mf.ratchet(92.8, 100.0), 100.0)

    def test_never_lowers_on_a_worse_measurement(self):
        # A bad run must not be able to walk a floor back down.
        self.assertEqual(mf.ratchet(100.0, 58.97), 100.0)

    def test_unmeasured_floor_adopts_the_measurement(self):
        self.assertEqual(mf.ratchet(None, 92.8), 92.8)

    def test_absent_measurement_leaves_the_floor_alone(self):
        self.assertEqual(mf.ratchet(92.8, None), 92.8)

    def test_measurement_is_truncated_to_two_places(self):
        self.assertEqual(mf.ratchet(None, 58.9743), 58.97)

    def test_a_ratcheted_floor_still_passes_the_run_that_set_it(self):
        """The property that matters: ratchet from a run, then gate the same run
        again, and it must pass. Rounding to two places set floors up to 0.005pp
        above their own measurement, which the gate's float tolerance is far too
        small to absorb: 29 killed of 30 measures 96.666..., took a 96.67 floor,
        and failed a re-run that regressed nothing. Swept across the denominators
        the shards actually have."""
        for denom in range(1, 200):
            for killed in range(denom + 1):
                measured = mf.agg.efficacy(killed, denom - killed)
                floor = mf.ratchet(None, measured)
                self.assertGreaterEqual(
                    measured + mf.GATE_TOLERANCE, floor,
                    f"{killed}/{denom} measured {measured} but took floor "
                    f"{floor}, which its own run cannot satisfy")


class ShardIdentification(unittest.TestCase):
    def test_recovers_shard_name_from_ci_artifact_path(self):
        path = os.path.join(shard_dir("/tmp/shards", "xwing_finned"), "report.json")
        self.assertEqual(mf.shard_name_from_path(path), "xwing_finned")

    def test_returns_none_for_an_unidentifiable_path(self):
        self.assertIsNone(mf.shard_name_from_path("/tmp/shards/whatever/report.json"))


class FloorLookup(unittest.TestCase):
    def test_get_prints_a_package_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 92.8}, shards={"formatter": 100})
            self.assertEqual(mf.main(["--floors-file", floors, "get", "dp"]), 0)

    def test_get_prints_a_shard_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 92.8}, shards={"formatter": 100})
            self.assertEqual(mf.main(["--floors-file", floors, "get", "formatter"]), 0)

    def test_get_rejects_an_unknown_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 92.8})
            self.assertEqual(mf.main(["--floors-file", floors, "get", "nope"]), 2)

    def test_report_slug_matches_the_makefile_layout(self):
        self.assertEqual(mf.report_slug("./internal/sudoku/human/techniques"),
                         "internal-sudoku-human-techniques")

    def test_the_makefile_writes_reports_where_the_gate_reads_them(self):
        """`mutation-go` still derives the report directory itself, so run the
        expression it actually uses and require it to agree with report_slug.

        Asserting report_slug against a literal is not enough: the workflow's
        own slug expression drifted from this one unnoticed for exactly as long
        as nothing compared the two."""
        with open(os.path.join(_REPO, "api", "Makefile")) as f:
            makefile = f.read()
        m = re.search(r"slug=\$\$\(echo \"\$\$pkg\" \| (sed [^)]+)\)", makefile)
        self.assertIsNotNone(m, "could not find mutation-go's slug expression")
        expr = m.group(1).replace("$$", "$")
        for pkg in mf.PACKAGE_PKGS.values():
            got = subprocess.run(f'echo "{pkg}" | {expr}', shell=True,
                                 capture_output=True, text=True, check=True)
            self.assertEqual(got.stdout.strip(), mf.report_slug(pkg), pkg)


class PackageGate(unittest.TestCase):
    def _run(self, tmp, floor, killed, escaped, source=SOURCE):
        floors = write_floors(tmp, {"dp": floor},
                              sources={"dp": source} if source else {})
        write_report(package_dir(tmp, "dp"), killed, escaped)
        return mf.main(["--floors-file", floors, "gate-package",
                        "--package-dir", tmp, "--scope", "dp"])

    def test_passes_when_efficacy_meets_the_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self._run(tmp, 92.8, killed=232, escaped=18), 0)

    def test_fails_when_efficacy_is_below_the_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self._run(tmp, 100, killed=232, escaped=18), 1)

    def test_exactly_on_the_floor_passes(self):
        # 232/250 is exactly 92.8; float arithmetic must not turn the boundary
        # into a nightly failure on a run that did not regress.
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self._run(tmp, 92.8, killed=232, escaped=18), 0)

    def test_unmeasured_floor_is_reported_but_not_enforced(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self._run(tmp, None, killed=1, escaped=99, source=None), 0)

    def test_missing_report_is_untrustworthy_not_passing(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 100}, sources={"dp": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "gate-package",
                                      "--package-dir", tmp, "--scope", "dp"]), 2)

    def test_enforced_floor_without_a_recorded_source_is_refused(self):
        # A floor hand-edited in without provenance must not silently enforce.
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self._run(tmp, 100, killed=1, escaped=0, source=None), 2)

    def test_all_null_source_entry_is_refused(self):
        # propose leaves `run` null when given no run id, so mere presence of a
        # sources entry is not provenance.
        empty = {"measured": None, "run": None, "recorded": None, "note": None}
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self._run(tmp, 100, killed=1, escaped=0, source=empty), 2)

    def test_a_report_measuring_nothing_is_untrustworthy_not_perfect(self):
        # An empty denominator scores 100% by convention and would clear any
        # floor. A run that caught nothing because it measured nothing must not
        # read as a closed scope.
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self._run(tmp, 100, killed=0, escaped=0), 2)


class ShardGate(unittest.TestCase):
    """Per-shard floors exist because an aggregate floor cannot protect a shard
    that has already been closed."""

    def _tree(self, tmp, closed_escapes):
        # One small closed shard plus one large open shard, in the proportions
        # the real package has: formatter is 30 mutants against roughly 3573.
        write_report(shard_dir(tmp, "formatter"), killed=30 - closed_escapes,
                     escaped=closed_escapes)
        write_report(shard_dir(tmp, "ur"), killed=2000, escaped=0)
        return tmp

    def test_regression_in_a_closed_shard_fails_the_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._tree(tmp, closed_escapes=10)
            floors = write_floors(
                tmp, {"techniques": 99},
                shards={"formatter": 100, "ur": None},
                sources={"techniques": SOURCE, "techniques/formatter": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "gate-shards",
                                      "--shards-dir", tmp]), 1)

    def test_the_same_regression_slips_past_an_aggregate_only_gate(self):
        # Identical data, per-shard floors removed: 2020 killed against 10
        # escaped is 99.5%, comfortably over a 99% package floor. This is the
        # gap per-shard floors close, stated as an executable fact rather than
        # an assertion in a comment.
        with tempfile.TemporaryDirectory() as tmp:
            self._tree(tmp, closed_escapes=10)
            floors = write_floors(tmp, {"techniques": 99},
                                  shards={"formatter": None, "ur": None},
                                  sources={"techniques": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "gate-shards",
                                      "--shards-dir", tmp]), 0)

    def test_passes_when_the_closed_shard_stays_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._tree(tmp, closed_escapes=0)
            floors = write_floors(
                tmp, {"techniques": 99},
                shards={"formatter": 100, "ur": None},
                sources={"techniques": SOURCE, "techniques/formatter": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "gate-shards",
                                      "--shards-dir", tmp]), 0)

    def test_missing_shard_is_untrustworthy_not_passing(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_report(shard_dir(tmp, "formatter"), killed=30, escaped=0)
            floors = write_floors(tmp, {"techniques": 99},
                                  shards={"formatter": 100, "ur": 100},
                                  sources={"techniques": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "gate-shards",
                                      "--shards-dir", tmp]), 2)

    def test_a_shard_that_measured_nothing_is_refused(self):
        # The missing-shard check only catches a shard with no report at all.
        # The run step is continue-on-error, so a shard that aborted after
        # emitting a stub report would otherwise pass its own 100 floor and
        # contribute nothing to the aggregate, moving neither.
        with tempfile.TemporaryDirectory() as tmp:
            write_report(shard_dir(tmp, "formatter"), killed=0, escaped=0, total=0)
            write_report(shard_dir(tmp, "ur"), killed=2000, escaped=0)
            floors = write_floors(
                tmp, {"techniques": 99},
                shards={"formatter": 100, "ur": None},
                sources={"techniques": SOURCE, "techniques/formatter": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "gate-shards",
                                      "--shards-dir", tmp]), 2)

    def test_shard_absent_from_the_floors_file_is_refused(self):
        # A technique file added to the workflow matrix but not to the floors
        # file would otherwise run ungated forever.
        with tempfile.TemporaryDirectory() as tmp:
            write_report(shard_dir(tmp, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(tmp, "newthing"), killed=5, escaped=5)
            floors = write_floors(tmp, {"techniques": 99},
                                  shards={"formatter": 100},
                                  sources={"techniques": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "gate-shards",
                                      "--shards-dir", tmp]), 2)


class Propose(unittest.TestCase):
    def _propose(self, tmp, floors_path, argv):
        out = os.path.join(tmp, "candidate.json")
        rc = mf.main(["--floors-file", floors_path, "propose", "--out", out,
                      "--run", "999", "--recorded", "2026-08-04"] + argv)
        with open(out) as f:
            return rc, json.load(f)

    def test_raises_a_package_floor_to_the_measurement(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 92.8}, sources={"dp": SOURCE})
            write_report(package_dir(tmp, "dp"), killed=250, escaped=0)
            rc, data = self._propose(tmp, floors, ["--package-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["dp"], 100.0)
            self.assertEqual(data["sources"]["dp"]["run"], "999")

    def test_a_worse_run_leaves_the_floor_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 100}, sources={"dp": SOURCE})
            write_report(package_dir(tmp, "dp"), killed=50, escaped=50)
            rc, data = self._propose(tmp, floors, ["--package-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["dp"], 100)
            # Provenance is not rewritten either, so the surviving floor keeps
            # pointing at the run that actually justified it.
            self.assertEqual(data["sources"]["dp"]["run"], "1")

    def test_raises_per_shard_floors(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_report(shard_dir(tmp, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(tmp, "ur"), killed=315, escaped=269)
            floors = write_floors(tmp, {"techniques": 100},
                                  shards={"formatter": None, "ur": None},
                                  sources={"techniques": SOURCE})
            rc, data = self._propose(tmp, floors, ["--shards-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["techniques_shards"]["formatter"], 100.0)
            self.assertAlmostEqual(data["techniques_shards"]["ur"], 53.93, places=2)

    def test_partial_run_ratchets_shards_but_not_the_aggregate(self):
        # An aggregate over an incomplete shard set is not a floor for the
        # complete one; per-shard floors are safe because each is derived only
        # from its own report.
        with tempfile.TemporaryDirectory() as tmp:
            write_report(shard_dir(tmp, "formatter"), killed=30, escaped=0)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": None, "ur": None},
                                  sources={})
            rc, data = self._propose(tmp, floors, ["--shards-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["techniques_shards"]["formatter"], 100.0)
            self.assertIsNone(data["floors"]["techniques"])

    def test_complete_run_ratchets_the_aggregate(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_report(shard_dir(tmp, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(tmp, "ur"), killed=584, escaped=0)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": None, "ur": None},
                                  sources={})
            rc, data = self._propose(tmp, floors, ["--shards-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["techniques"], 100.0)


class ProposeCorroboration(unittest.TestCase):
    """A raise onto one run's number reds the gate when that number drifts.

    Supplying a previous run turns every raise in that block into the lower of
    the two, and leaves alone anything only one run measured.
    """

    def _propose(self, tmp, floors_path, argv):
        out = os.path.join(tmp, "candidate.json")
        rc = mf.main(["--floors-file", floors_path, "propose", "--out", out,
                      "--run", "999", "--recorded", "2026-08-04"] + argv)
        with open(out) as f:
            return rc, json.load(f)

    def test_a_shard_raises_only_to_the_lower_of_the_two_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_report(shard_dir(now, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(prev, "formatter"), killed=27, escaped=3)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": None}, sources={})
            rc, data = self._propose(tmp, floors, [
                "--shards-dir", now, "--previous-shards-dir", prev])
            self.assertEqual(rc, 0)
            self.assertEqual(data["techniques_shards"]["formatter"], 90.0)

    def test_the_earlier_run_does_not_drag_a_floor_below_where_it_stands(self):
        # Corroboration chooses what to raise TO; it never lowers, because the
        # ratchet itself still takes the max against the standing floor.
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_report(shard_dir(now, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(prev, "formatter"), killed=15, escaped=15)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": 95.0},
                                  sources={"techniques/formatter": SOURCE})
            rc, data = self._propose(tmp, floors, [
                "--shards-dir", now, "--previous-shards-dir", prev])
            self.assertEqual(rc, 0)
            self.assertEqual(data["techniques_shards"]["formatter"], 95.0)

    def test_a_shard_only_this_run_measured_is_left_unraised(self):
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_report(shard_dir(now, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(prev, "ur"), killed=584, escaped=0)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": None, "ur": None},
                                  sources={})
            rc, data = self._propose(tmp, floors, [
                "--shards-dir", now, "--previous-shards-dir", prev])
            self.assertEqual(rc, 0)
            self.assertIsNone(data["techniques_shards"]["formatter"])

    def test_the_aggregate_takes_the_lower_of_two_complete_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_report(shard_dir(now, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(now, "ur"), killed=70, escaped=0)
            write_report(shard_dir(prev, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(prev, "ur"), killed=60, escaped=10)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": None, "ur": None},
                                  sources={})
            rc, data = self._propose(tmp, floors, [
                "--shards-dir", now, "--previous-shards-dir", prev])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["techniques"], 90.0)

    def test_an_incomplete_previous_run_leaves_the_aggregate_unraised(self):
        # An aggregate over part of the shard set is not comparable with one
        # over all of it, so there is nothing to corroborate against.
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_report(shard_dir(now, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(now, "ur"), killed=70, escaped=0)
            write_report(shard_dir(prev, "formatter"), killed=30, escaped=0)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": None, "ur": None},
                                  sources={})
            rc, data = self._propose(tmp, floors, [
                "--shards-dir", now, "--previous-shards-dir", prev])
            self.assertEqual(rc, 0)
            self.assertIsNone(data["floors"]["techniques"])

    def test_a_package_floor_takes_the_lower_of_the_two_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_report(package_dir(now, "dp"), killed=250, escaped=0)
            write_report(package_dir(prev, "dp"), killed=225, escaped=25)
            floors = write_floors(tmp, {"dp": 50.0}, sources={"dp": SOURCE})
            rc, data = self._propose(tmp, floors, [
                "--package-dir", now, "--previous-package-dir", prev])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["dp"], 90.0)

    def test_without_a_previous_run_a_single_measurement_still_raises(self):
        # The local ratchet has one run and stays usable; CI supplies both.
        with tempfile.TemporaryDirectory() as tmp:
            write_report(package_dir(tmp, "dp"), killed=250, escaped=0)
            floors = write_floors(tmp, {"dp": 50.0}, sources={"dp": SOURCE})
            rc, data = self._propose(tmp, floors, ["--package-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["dp"], 100.0)


class ProposeResilience(unittest.TestCase):
    """propose skips what it cannot measure; the gates refuse it. Skipping is
    conservative here, since a floor left alone can only be lower than it might
    have been, whereas aborting discards every legitimate raise in the run."""

    def test_one_stub_report_does_not_discard_the_other_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_report(package_dir(tmp, "dp"), killed=250, escaped=0)
            write_report(package_dir(tmp, "human"), killed=0, escaped=0, total=0)
            floors = write_floors(tmp, {"dp": 92.8, "human": 90},
                                  sources={"dp": SOURCE, "human": SOURCE})
            out = os.path.join(tmp, "candidate.json")
            rc = mf.main(["--floors-file", floors, "propose", "--out", out,
                          "--package-dir", tmp, "--run", "999"])
            self.assertEqual(rc, 0)
            with open(out) as f:
                data = json.load(f)
            self.assertEqual(data["floors"]["dp"], 100.0)
            self.assertEqual(data["floors"]["human"], 90)

    def test_an_unmeasurable_shard_blocks_only_the_aggregate(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_report(shard_dir(tmp, "formatter"), killed=30, escaped=0)
            write_report(shard_dir(tmp, "ur"), killed=0, escaped=0, total=0)
            floors = write_floors(tmp, {"techniques": None},
                                  shards={"formatter": None, "ur": None})
            out = os.path.join(tmp, "candidate.json")
            self.assertEqual(mf.main(["--floors-file", floors, "propose",
                                      "--out", out, "--shards-dir", tmp]), 0)
            with open(out) as f:
                data = json.load(f)
            self.assertEqual(data["techniques_shards"]["formatter"], 100.0)
            self.assertIsNone(data["techniques_shards"]["ur"])
            self.assertIsNone(data["floors"]["techniques"])

    def test_a_proposed_floor_is_accepted_by_the_gate_it_will_face(self):
        # propose used to leave `recorded` null, writing a floor its own gate
        # then refused for missing provenance.
        with tempfile.TemporaryDirectory() as tmp:
            write_report(package_dir(tmp, "dp"), killed=250, escaped=0)
            floors = write_floors(tmp, {"dp": 92.8}, sources={"dp": SOURCE})
            self.assertEqual(mf.main(["--floors-file", floors, "propose",
                                      "--in-place", "--package-dir", tmp]), 0)
            self.assertEqual(mf.main(["--floors-file", floors, "gate-package",
                                      "--package-dir", tmp, "--scope", "dp"]), 0)


class ReportPath(unittest.TestCase):
    def test_report_path_matches_what_the_gate_reads(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 92.8}, sources={"dp": SOURCE})
            write_report(package_dir(tmp, "dp"), killed=250, escaped=0)
            self.assertEqual(mf.report_path(tmp, "dp"),
                             os.path.join(package_dir(tmp, "dp"), "report.json"))
            self.assertEqual(mf.main(["--floors-file", floors, "report-path",
                                      "--package-dir", tmp, "--scope", "dp"]), 0)

    def test_report_path_rejects_an_unknown_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 92.8})
            self.assertEqual(mf.main(["--floors-file", floors, "report-path",
                                      "--package-dir", tmp, "--scope", "nope"]), 2)


class CanonicalFile(unittest.TestCase):
    """The shipped floors file has to satisfy the contracts the tooling assumes."""

    def setUp(self):
        self.data = mf.load()

    def test_every_enforced_floor_records_where_it_came_from(self):
        for scope, floor in self.data["floors"].items():
            if floor is not None:
                self.assertIn(scope, self.data["sources"],
                              f"enforced floor '{scope}' has no source entry")
        for shard, floor in self.data["techniques_shards"].items():
            if floor is not None:
                self.assertIn(f"techniques/{shard}", self.data["sources"],
                              f"enforced shard floor '{shard}' has no source entry")

    def test_shard_list_matches_the_nightly_workflow_matrix(self):
        # A technique file added to the matrix without a floors entry would run
        # ungated; one removed from the matrix would leave a floor nothing can
        # ever satisfy.
        with open(os.path.join(_REPO, ".github", "workflows",
                               "nightly-mutation.yml")) as f:
            text = f.read()
        matrix = set(re.findall(r"-\s*shard:\s*(\S+)\s*\n\s*files:", text))
        self.assertEqual(matrix, set(self.data["techniques_shards"]))

    def test_floors_are_within_range(self):
        everything = list(self.data["floors"].items()) + \
            list(self.data["techniques_shards"].items())
        for scope, floor in everything:
            if floor is not None:
                self.assertGreaterEqual(floor, 0, scope)
                self.assertLessEqual(floor, 100, scope)

    def test_no_package_scope_can_be_disarmed_by_nulling_its_floor(self):
        """Nulling a floor turns its gate off, and unlike lowering a number it
        does not read as a floor going down in the diff reviewers are told to
        watch. It is therefore the cheapest way to surrender ground, and the one
        the ratchet's one-way property does not by itself prevent."""
        for scope in mf.PACKAGE_PKGS:
            self.assertIn(scope, self.data["floors"], scope)
            self.assertIsNotNone(
                self.data["floors"][scope],
                f"package scope '{scope}' has a null floor, which disarms its "
                f"gate; lower it explicitly with a stated reason instead")

    def test_every_enforced_floor_has_usable_provenance(self):
        for scope, floor in self.data["floors"].items():
            if floor is not None:
                mf._require_source(self.data, scope)
        for shard, floor in self.data["techniques_shards"].items():
            if floor is not None:
                mf._require_source(self.data, f"techniques/{shard}")


if __name__ == "__main__":
    unittest.main()
