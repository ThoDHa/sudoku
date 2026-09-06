#!/usr/bin/env python3
"""Tests for mutation_floors.py. Run: python3 -m unittest mutation_floors_test."""

import contextlib
import io
import json
import os
import re
import subprocess
import sys
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


def write_floors(dir_path, floors, shards=None, sources=None, frontend=None):
    path = os.path.join(dir_path, "floors.json")
    data = {"floors": floors,
            "techniques_shards": shards or {},
            "sources": sources or {}}
    if frontend is not None:
        data["frontend"] = frontend
    with open(path, "w") as f:
        json.dump(data, f)
    return path


def shard_dir(root, name):
    """Mirror the CI artifact layout so path-based shard identification is
    exercised against the real shape, not a convenient one."""
    return os.path.join(root, f"mutation-go-techniques-shard-{name}",
                        "reports", "mutation", f"techniques-shard-{name}")


def write_mutation_json(dir_path, statuses):
    """Write one StrykerJS mutation.json holding one file with the statuses.

    Each entry is a status string or a dict carrying at least "status", and
    dicts use the real report shape (mutatorName, statusReason, location, ...)
    so the adapter is calibrated against what Stryker actually writes."""
    os.makedirs(dir_path, exist_ok=True)
    mutants = []
    for i, entry in enumerate(statuses):
        mutant = {"status": entry} if isinstance(entry, str) else dict(entry)
        mutant["id"] = str(i)
        mutants.append(mutant)
    path = os.path.join(dir_path, "mutation.json")
    with open(path, "w") as f:
        json.dump({"schemaVersion": "1.0",
                   "files": {"src/x.ts": {"language": "typescript",
                                          "source": "",
                                          "mutants": mutants}}}, f)
    return path


# Real report entries, verbatim from a nightly artifact via
# frontend/scripts/mutation_aggregate_test.py's fixtures, which documents them
# as copied from mutation-results/.../reports/mutation/mutation.json.
_REAL_TIMEOUT_HIT_LIMIT = {
    "mutatorName": "UpdateOperator",
    "replacement": "c--",
    "statusReason": "Hit limit reached (7054501/7054500)",
    "status": "Timeout",
    "static": False,
    "coveredBy": ["15", "61", "62"],
    "location": {"end": {"column": 38, "line": 20},
                 "start": {"column": 35, "line": 20}},
}
_REAL_KILLED_ASSERTION = {
    "mutatorName": "Block",
    "replacement": "{}",
    "statusReason": "expected false to be true // Object.is equality",
    "status": "Killed",
    "static": False,
    "coveredBy": ["15"],
    "location": {"end": {"column": 38, "line": 20},
                 "start": {"column": 35, "line": 20}},
}


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


def _frontend_aggregate():
    """Import frontend/scripts/mutation_aggregate.py under its own module name.

    Loaded by file path rather than sys.path so it cannot collide with the
    api/scripts mutation_aggregate this suite already imports as agg, and so
    the equivalence below is judged against the exact file the frontend gate
    runs, not a copy."""
    import importlib.util
    path = os.path.join(_REPO, "frontend", "scripts", "mutation_aggregate.py")
    spec = importlib.util.spec_from_file_location("frontend_mutation_aggregate", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CountingConventionEquivalence(unittest.TestCase):
    """The Go convention (killed+timeout over killed+escaped) and the frontend
    convention (Killed+Timeout+RuntimeError+CompileError over that plus
    Survived+NoCoverage, Ignored excluded) must be proven identical before any
    number moves between them: a floor migrated while the conventions disagreed
    would silently change meaning. These tests feed the same real-shape Stryker
    fixture to the adapter this tool uses and to frontend/scripts/
    mutation_aggregate.py, the aggregator the frontend gates actually run."""

    @classmethod
    def setUpClass(cls):
        cls.frontend_agg = _frontend_aggregate()

    def _fixture_statuses(self):
        return [_REAL_KILLED_ASSERTION, _REAL_TIMEOUT_HIT_LIMIT,
                "Killed", "Killed", "Survived", "Survived",
                "Timeout", "NoCoverage", "RuntimeError", "CompileError",
                "Ignored", "Ignored", "Ignored"]

    def test_the_adapter_counts_what_the_frontend_aggregator_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_mutation_json(tmp, self._fixture_statuses())
            killed, timeout, escaped, total = mf.combine_stryker([path])
            caught, fe_escaped, ignored, fe_total = self.frontend_agg.combine([path])
            self.assertEqual(killed + timeout, caught)
            self.assertEqual(escaped, fe_escaped)
            self.assertEqual(total, fe_total)
            # Ignored rides in the total of both, and in neither score.
            self.assertEqual(total, caught + fe_escaped + ignored)

    def test_both_conventions_score_the_same_scenario_identically(self):
        """One scenario, both report formats: 30 assertion kills, 2 timeout
        kills, 3 survivors, 5 ignored directives. The go-mutesting report and
        the Stryker fixture must produce the same efficacy through measure()."""
        with tempfile.TemporaryDirectory() as tmp:
            go_report = write_report(tmp, killed=30, escaped=3, timeout=2)
            fe_dir = os.path.join(tmp, "stryker")
            fe_report = write_mutation_json(fe_dir, ["Killed"] * 30 + ["Survived"] * 3
                                            + ["Timeout"] * 2 + ["Ignored"] * 5)
            go_eff = mf.measure([go_report], "go")[0]
            fe_eff = mf.measure([fe_report], "frontend", combine=mf.combine_stryker)[0]
            self.assertEqual(go_eff, fe_eff)
            self.assertEqual(fe_eff, self.frontend_agg.efficacy(32, 3))

    def test_ignored_mutants_move_neither_numerator_nor_denominator(self):
        with tempfile.TemporaryDirectory() as tmp:
            scored = ["Killed", "Killed", "Survived"]
            with_ignored = write_mutation_json(tmp, scored + ["Ignored"] * 4)
            eff, _k, _e, total = mf.measure(
                [with_ignored], "frontend", combine=mf.combine_stryker)
            self.assertEqual(eff, mf.agg.efficacy(2, 1))
            # ...but Ignored still counts in the total, matching the frontend
            # aggregator's tally, so a report cannot hide mutants either way.
            self.assertEqual(total, 7)

    def test_the_status_sets_agree_with_the_frontend_aggregator(self):
        """A Stryker upgrade renaming a status must surface here rather than
        silently reclassify mutants on one side of the equivalence only."""
        self.assertEqual({"Killed"} | mf.STRYKER_TIMEOUT_LIKE,
                         self.frontend_agg.CAUGHT)
        self.assertEqual(mf.STRYKER_ESCAPED, self.frontend_agg.ESCAPED)


class PackageEnumeration(unittest.TestCase):
    """PACKAGE_PKGS is the only list of what gets mutated, so the Makefile and
    the nightly matrix have to be reading it rather than repeating it."""

    def _run(self, argv):
        out = subprocess.run(
            [sys.executable, os.path.join(_REPO, "api", "scripts", "mutation_floors.py")] + argv,
            capture_output=True, text=True, check=True)
        return out.stdout.split()

    def test_packages_prints_every_scope_in_order(self):
        self.assertEqual(self._run(["packages"]), list(mf.PACKAGE_PKGS))

    def test_packages_prints_every_pkg_path_in_order(self):
        self.assertEqual(self._run(["packages", "--pkg-paths"]),
                         list(mf.PACKAGE_PKGS.values()))

    def test_the_makefile_sweeps_the_packages_the_gate_knows_about(self):
        """A hardcoded loop here is how a package gets swept but never gated,
        or gated against a report nothing produced."""
        with open(os.path.join(_REPO, "api", "Makefile")) as f:
            makefile = f.read()
        self.assertIn("packages --pkg-paths", makefile,
                      "mutation-go must read its package list from this script")
        m = re.search(r"^mutation-gate:\n(?:\t.*\n)+", makefile, re.MULTILINE)
        self.assertIsNotNone(m, "could not find the mutation-gate recipe")
        self.assertNotIn("--scope", m.group(0),
                         "mutation-gate must gate every package scope, not a "
                         "hand-picked subset that can fall behind the sweep")

    def test_the_nightly_matrix_covers_every_unsharded_package(self):
        """techniques is absent because it has its own sharded job; every other
        package scope needs a matrix entry or it is never measured in CI."""
        with open(os.path.join(_REPO, ".github", "workflows",
                               "nightly-mutation.yml")) as f:
            text = f.read()
        job = text.split("go-mutation:", 1)[1].split("techniques-mutation:", 1)[0]
        matrix = dict(re.findall(r"-\s*name:\s*(\S+)\s*\n\s*pkg:\s*(\S+)", job))
        expected = {k: v for k, v in mf.PACKAGE_PKGS.items() if k != "techniques"}
        self.assertEqual(matrix, expected)


def _derived_package_glob():
    """The glob the emitter must produce, built here from PACKAGE_PKGS so the
    tests never restate a literal."""
    return "mutation-go-@(" + "|".join(
        scope for scope, pkg in mf.PACKAGE_PKGS.items()
        if pkg != mf.TECHNIQUES_LABEL) + ")"


class PackageArtifactGlob(unittest.TestCase):
    """The lag check's download pattern must be derived from PACKAGE_PKGS, the
    same enumeration the sweep and the gate read, or a new scope gets swept and
    gated but never downloaded, and the lag check silently stops covering it."""

    def _emitted(self, extra_scope=None):
        """Run the emitter, optionally against a grown PACKAGE_PKGS."""
        argv = ["packages", "--artifact-glob"]
        if extra_scope is None:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(mf.main(argv), 0)
            return out.getvalue().strip()
        original = mf.PACKAGE_PKGS
        mf.PACKAGE_PKGS = {**original, "zzz_fake": "./pkg/zzz_fake"}
        try:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(mf.main(argv), 0)
            return out.getvalue().strip()
        finally:
            mf.PACKAGE_PKGS = original

    def test_the_glob_names_every_unsharded_scope_in_order(self):
        self.assertEqual(self._emitted(), _derived_package_glob())

    def test_a_synthetic_scope_grows_the_emitted_glob(self):
        """The derivation proof: a scope added to PACKAGE_PKGS appears in the
        glob with no other edit, so the emitter reads the map rather than
        restating a literal."""
        self.assertIn("zzz_fake", self._emitted(extra_scope=True))

    def test_techniques_never_appears_in_the_emitted_glob(self):
        """techniques has no mutation-go-techniques artifact; it is measured
        through its shards, whose pattern the workflow carries separately."""
        self.assertNotIn("techniques", self._emitted())

    def test_the_glob_prefix_matches_the_workflow_artifact_naming(self):
        with open(os.path.join(_REPO, ".github", "workflows",
                               "nightly-mutation.yml")) as f:
            text = f.read()
        m = re.search(r"^          name: (mutation-go-\$\{\{ matrix\.name \}\})$",
                      text, re.M)
        self.assertIsNotNone(m, "could not find the go artifact name template")
        glob = self._emitted()
        prefix = glob.split("@(")[0]
        self.assertTrue(m.group(1).startswith(prefix),
                        f"glob prefix {prefix!r} does not match artifact "
                        f"naming {m.group(1)!r}")


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

    def test_get_prints_a_frontend_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {"dp": 92.8},
                                  frontend={"hooks": 100, "surface": 97})
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(mf.main(["--floors-file", floors,
                                          "get", "frontend/surface"]), 0)
            self.assertEqual(out.getvalue().strip(), "97")

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

    def test_omitting_scope_gates_every_package_scope(self):
        """`make mutation-gate` passes no --scope, so the default has to be the
        whole set: a default of "nothing" would exit 0 having checked nothing."""
        with tempfile.TemporaryDirectory() as tmp:
            floors = write_floors(tmp, {s: 100.0 for s in mf.PACKAGE_PKGS},
                                  sources={s: SOURCE for s in mf.PACKAGE_PKGS})
            for scope in mf.PACKAGE_PKGS:
                # One breached scope; a gate that skipped it would exit 0.
                escaped = 1 if scope == list(mf.PACKAGE_PKGS)[-1] else 0
                write_report(package_dir(tmp, scope), killed=10, escaped=escaped)
            self.assertEqual(mf.main(["--floors-file", floors, "gate-package",
                                      "--package-dir", tmp]), 1)

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


def frontend_shard_dir(root, scope, name):
    """Mirror the CI artifact layout for a frontend scope: one artifact per
    shard, named mutation-frontend-<scope>-<shard>, each carrying the Stryker
    report tree."""
    return os.path.join(root, f"mutation-frontend-{scope}-{name}",
                        "frontend", "reports", "mutation")


def write_frontend_shard(root, scope, name, killed, escaped, ignored=0):
    statuses = (["Killed"] * killed + ["Survived"] * escaped
                + ["Ignored"] * ignored)
    return write_mutation_json(frontend_shard_dir(root, scope, name), statuses)


class FrontendRatchet(unittest.TestCase):
    """The ratchet extends to the StrykerJS scopes with no new mechanism:
    raises only, the lower of two corroborating runs, and a scope only one run
    measured is left alone."""

    def _propose(self, tmp, floors_path, argv):
        out = os.path.join(tmp, "candidate.json")
        rc = mf.main(["--floors-file", floors_path, "propose", "--out", out,
                      "--run", "999", "--recorded", "2026-08-04"] + argv)
        # A refused propose writes no candidate; there is nothing to read.
        if rc != 0:
            return rc, None
        with open(out) as f:
            return rc, json.load(f)

    def test_raises_a_frontend_floor_to_the_measurement(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_frontend_shard(tmp, "hooks", "a", killed=14, escaped=1)
            write_frontend_shard(tmp, "hooks", "b", killed=14, escaped=1)
            floors = write_floors(tmp, {"dp": 100}, frontend={"hooks": 90})
            rc, data = self._propose(tmp, floors, ["--frontend-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["frontend"]["hooks"], 93.33)
            self.assertEqual(data["sources"]["frontend/hooks"]["run"], "999")

    def test_a_worse_frontend_run_leaves_the_floor_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_frontend_shard(tmp, "hooks", "a", killed=5, escaped=5)
            floors = write_floors(tmp, {"dp": 100}, frontend={"hooks": 100},
                                  sources={"frontend/hooks": SOURCE})
            rc, data = self._propose(tmp, floors, ["--frontend-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["frontend"]["hooks"], 100)
            self.assertEqual(data["sources"]["frontend/hooks"]["run"], "1")

    def test_a_frontend_scope_raises_only_to_the_lower_of_two_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_frontend_shard(now, "hooks", "a", killed=30, escaped=0)
            write_frontend_shard(prev, "hooks", "a", killed=57, escaped=3)
            floors = write_floors(tmp, {"dp": 100}, frontend={"hooks": 90})
            rc, data = self._propose(tmp, floors, [
                "--frontend-dir", now, "--previous-frontend-dir", prev])
            self.assertEqual(rc, 0)
            self.assertEqual(data["frontend"]["hooks"], 95.0)

    def test_a_frontend_scope_only_this_run_measured_is_left_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_frontend_shard(now, "hooks", "a", killed=30, escaped=0)
            write_frontend_shard(prev, "surface", "b", killed=97, escaped=3)
            floors = write_floors(tmp, {"dp": 100},
                                  frontend={"hooks": 90, "surface": 90})
            rc, data = self._propose(tmp, floors, [
                "--frontend-dir", now, "--previous-frontend-dir", prev])
            self.assertEqual(rc, 0)
            self.assertEqual(data["frontend"]["hooks"], 90)

    def test_a_frontend_scope_with_no_report_this_run_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_frontend_shard(tmp, "hooks", "a", killed=30, escaped=0)
            floors = write_floors(tmp, {"dp": 100},
                                  frontend={"hooks": 90, "surface": 97})
            rc, data = self._propose(tmp, floors, ["--frontend-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["frontend"]["hooks"], 100.0)
            self.assertEqual(data["frontend"]["surface"], 97)

    def test_a_frontend_report_from_an_unknown_scope_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_frontend_shard(tmp, "newscope", "a", killed=5, escaped=0)
            floors = write_floors(tmp, {"dp": 100}, frontend={"hooks": 100})
            self.assertEqual(self._propose(tmp, floors,
                                           ["--frontend-dir", tmp])[0], 2)

    def test_propose_without_a_frontend_block_refuses_frontend_reports(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_frontend_shard(tmp, "hooks", "a", killed=5, escaped=0)
            floors = write_floors(tmp, {"dp": 100})
            self.assertEqual(self._propose(tmp, floors,
                                           ["--frontend-dir", tmp])[0], 2)


class LagDetectionControls(unittest.TestCase):
    """The controls from the testing strategy, on `config`: a scope beyond dp
    and human, which the lag check historically did not download. They prove
    the extended check detects lag (a floor a measurement has passed is
    reported as a raise) rather than merely completing with exit 0. Every
    control runs against a temporary floors file; the canonical file is never
    touched."""

    def _propose(self, tmp, argv):
        floors = os.path.join(tmp, "floors.json")
        with open(floors, "w") as f:
            json.dump({"floors": {"config": self.floors["config"]},
                       "techniques_shards": {},
                       "sources": {"config": SOURCE}}, f)
        out = os.path.join(tmp, "candidate.json")
        rc = mf.main(["--floors-file", floors, "propose", "--out", out,
                      "--run", "999", "--recorded", "2026-08-04"] + argv)
        with open(out) as f:
            return rc, json.load(f)

    def test_a_lagging_config_floor_produces_a_raise(self):
        """A floor at 90.0 against a report measuring 100.0 must be written up
        as a change to 100.0: this is the signal the lag check exists for."""
        with tempfile.TemporaryDirectory() as tmp:
            self.floors = {"config": 90.0}
            write_report(package_dir(tmp, "config"), killed=100, escaped=0)
            rc, data = self._propose(tmp, ["--package-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["config"], 100.0)
            self.assertEqual(data["sources"]["config"]["run"], "999")

    def test_a_level_config_floor_produces_no_change(self):
        """A floor already at the measurement must come back unchanged, with
        its provenance still pointing at the run that set it."""
        with tempfile.TemporaryDirectory() as tmp:
            self.floors = {"config": 100.0}
            write_report(package_dir(tmp, "config"), killed=100, escaped=0)
            rc, data = self._propose(tmp, ["--package-dir", tmp])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["config"], 100.0)
            self.assertEqual(data["sources"]["config"]["run"], "1")

    def test_a_corroborated_pair_clamps_to_the_lower_run(self):
        """The same fixture with a previous run at 95.0 proposes 95.0, not
        100.0: a raise takes the lower of the two runs so unchanged code
        cannot red the next night on a single-run fluke."""
        with tempfile.TemporaryDirectory() as tmp:
            self.floors = {"config": 90.0}
            now, prev = os.path.join(tmp, "now"), os.path.join(tmp, "prev")
            write_report(package_dir(now, "config"), killed=100, escaped=0)
            write_report(package_dir(prev, "config"), killed=95, escaped=5)
            rc, data = self._propose(
                tmp, ["--package-dir", now, "--previous-package-dir", prev])
            self.assertEqual(rc, 0)
            self.assertEqual(data["floors"]["config"], 95.0)


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


def _nightly_jobs():
    """Split nightly-mutation.yml into job-name -> job body.

    Text-level rather than a YAML parse so the guard adds no dependency to a
    suite that runs on every push. Job keys sit at two-space indent under
    `jobs:`, which is the only place that indent is used for a mapping key."""
    with open(os.path.join(_REPO, ".github", "workflows",
                           "nightly-mutation.yml")) as f:
        text = f.read()
    starts = [(m.start(), m.group(1))
              for m in re.finditer(r"^  ([a-zA-Z0-9_-]+):$", text, re.M)]
    bounds = [s for s, _ in starts] + [len(text)]
    return {name: text[bounds[i]:bounds[i + 1]]
            for i, (_, name) in enumerate(starts)}


class LagCheckDownloads(unittest.TestCase):
    """The floors-lag-check job must download every gated package scope, by a
    pattern derived from PACKAGE_PKGS. A hardcoded list is the failure mode
    being prevented: the day a scope joins PACKAGE_PKGS, the sweep and the gate
    start covering it, but a literal download pattern keeps naming only the
    scopes it was written with, so the new scope is enforced by its own run's
    gate and then never lag-checked, and the omission is invisible until
    somebody reads the job. Deriving the pattern makes the failure impossible
    instead of merely detectable; these tests hold that property."""

    def test_the_emitted_pattern_covers_every_package_scope(self):
        """Judged through the workflow itself: whatever pattern the job's step
        emits must name every scope still in PACKAGE_PKGS, so dropping a scope
        from the emitter while it remains in the map fails here, where the
        consequence would otherwise be a silently un-downloaded scope."""
        out = subprocess.run(
            [sys.executable, os.path.join(_REPO, "api", "scripts",
                                          "mutation_floors.py"),
             "packages", "--artifact-glob"],
            capture_output=True, text=True, check=True)
        self.assertEqual(out.stdout.strip(), _derived_package_glob())

    def test_both_package_downloads_reference_the_derived_pattern(self):
        """A pattern written as a literal here re-opens the failure mode the
        emitter exists to close: neither download step may carry scope names,
        and both must read the derivation step's output."""
        job = _nightly_jobs()["floors-lag-check"]
        self.assertNotIn("mutation-go-@(", job,
                         "a literal artifact glob in the lag check defeats the "
                         "derived emitter; reference the step output instead")
        # Anchored to whole lines so the derivation step's shell
        # `echo "pattern=..."` cannot be mistaken for a download key.
        pattern_steps = re.findall(r"^\s*pattern:\s*(.+?)\s*$", job, re.M)
        package_patterns = [p for p in pattern_steps
                            if "techniques-shard" not in p
                            and "frontend" not in p]
        self.assertEqual(
            package_patterns,
            ["${{ steps.package-pattern.outputs.pattern }}"] * 2,
            "both package download steps must read the derived pattern")

    def test_the_shard_and_frontend_patterns_are_carried_verbatim(self):
        """The shard set and the frontend scopes have their own artifact
        patterns; this guard pins them so a pattern refactor cannot silently
        narrow what the lag check downloads."""
        job = _nightly_jobs()["floors-lag-check"]
        self.assertEqual(re.findall(r"^\s*pattern:\s*(mutation-go-techniques-\S+)$",
                                    job, re.M),
                         ["mutation-go-techniques-shard-*"] * 2)
        self.assertEqual(re.findall(r"^\s*pattern:\s*(mutation-frontend-\S+)$",
                                    job, re.M),
                         ["mutation-frontend-*"] * 2)

    def test_the_previous_run_guards_still_stand(self):
        """Corroboration must be best-effort per artifact family: the previous
        run's downloads keep continue-on-error so a missing family degrades to
        uncorroborated checking rather than reds the whole job."""
        job = _nightly_jobs()["floors-lag-check"]
        previous = job.split("Download the previous run's", 1)[1]
        self.assertEqual(previous.count("continue-on-error: true"), 3)


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
        for scope, floor in self.data.get("frontend", {}).items():
            if floor is not None:
                self.assertIn(f"frontend/{scope}", self.data["sources"],
                              f"enforced frontend floor '{scope}' has no source entry")

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
            list(self.data["techniques_shards"].items()) + \
            list(self.data.get("frontend", {}).items())
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

    def test_no_frontend_scope_can_be_disarmed_by_nulling_its_floor(self):
        """Same contract as the Go package scopes: the frontend gates read the
        floor through `get`, which prints a null as 0, so a nulled frontend
        floor silently gates at zero. Hooks and surface carry current values;
        this task moved where the numbers live, not the numbers."""
        frontend = self.data.get("frontend")
        self.assertTrue(frontend, "the floors file has no frontend block")
        for scope, floor in frontend.items():
            self.assertIsNotNone(
                floor, f"frontend scope '{scope}' has a null floor, which "
                f"disarms its gate; lower it explicitly with a stated reason")

    def test_the_workflow_gates_read_the_frontend_floors_from_here(self):
        """The values the nightly's aggregate gates consume, printed the way
        the workflow's command substitution sees them."""
        for scope, floor in self.data["frontend"].items():
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(mf.main(["get", f"frontend/{scope}"]), 0)
            self.assertEqual(out.getvalue().strip(), str(floor))

    def test_every_enforced_floor_has_usable_provenance(self):
        for scope, floor in self.data["floors"].items():
            if floor is not None:
                mf._require_source(self.data, scope)
        for shard, floor in self.data["techniques_shards"].items():
            if floor is not None:
                mf._require_source(self.data, f"techniques/{shard}")
        for scope, floor in self.data.get("frontend", {}).items():
            if floor is not None:
                mf._require_source(self.data, f"frontend/{scope}")


if __name__ == "__main__":
    unittest.main()
