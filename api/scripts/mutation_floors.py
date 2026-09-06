#!/usr/bin/env python3
"""Read, enforce, and ratchet the canonical mutation floors in mutation-floors.json.

This is the only place a mutation floor is compared against a measurement: the
Go floors at gate and propose time, and the frontend StrykerJS floors at propose
time (their gates live in the nightly's aggregate jobs, which read their floor
from the same file through `get`). api/Makefile and
.github/workflows/nightly-mutation.yml both call in here rather than carrying
their own copies of the numbers, so the two cannot drift apart.

Floors move in one direction. `propose` reads a completed run and emits a
candidate floors file in which every floor is max(current, measured); it has no
path that lowers one. Lowering therefore requires hand-editing the canonical
file, which shows up in review as a number going down, and the `source` block
that every enforced floor must carry records where the number came from. The
full procedure lives in the `_ratchet` block of mutation-floors.json.

An unmeasured shard carries a null floor. The gate prints it as UNSET and does
not enforce it, so a shard nobody has measured can never be mistaken for a shard
that passed. No package scope may be null: nulling a floor disarms its gate
without reading as a number going down, which would be a cheaper way to
surrender ground than lowering one, so a test refuses it. A package scope is
therefore added to PACKAGE_PKGS only once a run has measured it, and a null
entry there is a transient state that exists only between seeding the scope and
the `propose` that fills it in. The same holds for the 'frontend' block.

Usage:
    mutation_floors.py packages [--pkg-paths | --artifact-glob]
    mutation_floors.py get <scope>
    mutation_floors.py gate-package --package-dir reports/mutation --scope dp
    mutation_floors.py gate-shards --shards-dir shards/
    mutation_floors.py propose --package-dir reports/mutation --shards-dir shards/ \
        [--frontend-dir frontend-shards/]

Exit codes:
    0  every enforced floor was met
    1  at least one floor was breached
    2  the measurement is untrustworthy (missing/unreadable report, unknown
       scope, or an enforced floor with no recorded source)
"""

import argparse
import copy
import datetime
import json
import math
import os
import re
import sys

import mutation_aggregate as agg

DEFAULT_FLOORS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), os.pardir, "mutation-floors.json")

TECHNIQUES_LABEL = "./internal/sudoku/human/techniques"
# The Go packages carrying a package-level floor, and the ./pkg paths their
# report directories are named after. This mapping is the single enumeration of
# what gets mutated: api/Makefile's mutation-go loop and mutation-gate both read
# it through the `packages` subcommand rather than repeating the list, and a
# test requires the nightly's go-mutation matrix to agree with it.
#
# ./internal/core is deliberately absent. It generates zero mutants (models.go
# declares types and nothing else), and a report with an empty denominator is
# rejected as untrustworthy by `measure`, so listing it would fail the gate for
# a package that has nothing to gate.
PACKAGE_PKGS = {
    "config": "./pkg/config",
    "constants": "./pkg/constants",
    "puzzles": "./internal/puzzles",
    "diagnosis": "./internal/sudoku/diagnosis",
    "dp": "./internal/sudoku/dp",
    "human": "./internal/sudoku/human",
    "techniques": TECHNIQUES_LABEL,
}

# Artifact directories are named mutation-go-techniques-shard-<shard> and hold
# reports/mutation/techniques-shard-<shard>/report.json, so the shard name is
# recoverable from the path and the 22-entry workflow matrix needs no per-shard
# floor of its own.
_SHARD_IN_PATH = re.compile(r"techniques-shard-([A-Za-z0-9_]+)")

# Slack allowed when comparing a measurement against a floor, sized for float
# representation noise only. One extra escape moves a 3500-mutant package by
# roughly 0.03pp, seven orders of magnitude above this, so it cannot mask a real
# regression. `ratchet` truncates rather than rounds so that a floor it sets
# stays inside this slack of the run that set it.
GATE_TOLERANCE = 1e-9

# StrykerJS status classification for the frontend reports, mapping onto the
# same four counts the go-mutesting reader produces: a timeout-bucket catch
# (Timeout, RuntimeError, CompileError) is a mutant the tests did not let
# survive by any means, and Ignored (a documented Stryker disable directive) is
# excluded from numerator and denominator alike. The sets must agree with
# frontend/scripts/mutation_aggregate.py's CAUGHT/ESCAPED; a test pins them.
STRYKER_TIMEOUT_LIKE = {"Timeout", "RuntimeError", "CompileError"}
STRYKER_ESCAPED = {"Survived", "NoCoverage"}


class FloorsError(Exception):
    """The floors file or a measurement cannot be trusted. Maps to exit 2."""


def load(path=None):
    path = path or DEFAULT_FLOORS_FILE
    try:
        with open(path) as f:
            data = json.load(f)
        for key in ("floors", "techniques_shards", "sources"):
            if key not in data:
                raise FloorsError(f"floors file {path} is missing the '{key}' block")
    except (OSError, ValueError, TypeError) as err:
        raise FloorsError(f"cannot read floors file {path}: {err}") from err
    return data


def report_slug(pkg):
    """Report directory name for a ./pkg path, matching the Makefile layout."""
    return pkg.removeprefix("./").replace("/", "-")


def report_path(package_dir, scope):
    return os.path.join(package_dir, report_slug(PACKAGE_PKGS[scope]), "report.json")


def shard_name_from_path(path):
    """Recover the shard name from a downloaded artifact path, or None."""
    found = _SHARD_IN_PATH.findall(path)
    return found[-1] if found else None


# Frontend artifacts are named mutation-frontend-<scope>-<shard> and hold
# frontend/reports/mutation/mutation.json, so the scope a downloaded StrykerJS
# report belongs to is recoverable from the path. The floors file's 'frontend'
# block is the enumeration of valid scopes; this only decodes the path.
_FRONTEND_SCOPE_IN_PATH = re.compile(r"mutation-frontend-([A-Za-z0-9_]+)-")


def frontend_scope_from_path(path):
    """Recover the frontend scope from a downloaded artifact path, or None."""
    found = _FRONTEND_SCOPE_IN_PATH.findall(path)
    return found[-1] if found else None


def find_frontend_reports(reports_dir):
    """Return every StrykerJS mutation.json under reports_dir (recursively)."""
    found = []
    for root, _dirs, files in os.walk(reports_dir):
        for name in files:
            if name == "mutation.json":
                found.append(os.path.join(root, name))
    return sorted(found)


def group_by_frontend_scope(reports):
    """Map frontend scope to its report paths, rejecting paths we cannot place."""
    by_scope = {}
    for path in reports:
        scope = frontend_scope_from_path(path)
        if scope is None:
            raise FloorsError(
                f"cannot identify the frontend scope that produced {path} "
                f"(expected a 'mutation-frontend-<scope>-<shard>' path element)")
        by_scope.setdefault(scope, []).append(path)
    return by_scope


def combine_stryker(report_paths):
    """Count a StrykerJS mutation.json set into the go-mutesting count shape.

    Returns (killed, timeout_caught, escaped, total): Killed is a kill by
    assertion, the timeout-like statuses are catches by other means, and
    Survived/NoCoverage are escapes. Ignored mutants (documented Stryker
    disable directives) count in the total only, so they move neither the
    numerator nor the denominator, exactly as frontend/scripts/
    mutation_aggregate.py scores them."""
    killed = timeout = escaped = total = 0
    for path in report_paths:
        with open(path) as f:
            data = json.load(f)
        for file_entry in data.get("files", {}).values():
            for mutant in file_entry.get("mutants", []):
                status = mutant.get("status", "")
                total += 1
                if status == "Killed":
                    killed += 1
                elif status in STRYKER_TIMEOUT_LIKE:
                    timeout += 1
                elif status in STRYKER_ESCAPED:
                    escaped += 1
                # Any unrecognized status is counted only in total, neither
                # caught nor escaped, mirroring the frontend aggregator.
    return killed, timeout, escaped, total


def measure(paths, what, combine=agg.combine):
    """Efficacy over one or more reports, with the counts behind it.

    The single place the "a timeout counts as a kill" rule is applied, so it
    cannot drift between the package gate, the shard gate, and the ratchet.
    `combine` selects the report format: the go-mutesting reader by default,
    combine_stryker for StrykerJS frontend reports.
    """
    try:
        killed_no_timeout, timeout, escaped, total = combine(paths)
    except (OSError, ValueError, KeyError, TypeError) as err:
        raise FloorsError(f"unreadable report for {what}: {err}") from err
    killed = killed_no_timeout + timeout
    # An empty denominator scores 100% by the efficacy convention, which would
    # sail past any floor including 100. A report that caught nothing because it
    # measured nothing is an untrustworthy run, not a perfect one: the shard step
    # is continue-on-error, so an aborted run that still emitted a stub report
    # lands exactly here and would otherwise pass as a closed scope.
    if killed + escaped == 0:
        raise FloorsError(
            f"{what} has an empty denominator ({total} mutants, none killed or "
            f"escaped): nothing was measured, so no floor can be demonstrated")
    return agg.efficacy(killed, escaped), killed, escaped, total


def _require_source(data, key):
    """An enforced floor must say where it came from.

    Presence of the key is not enough. `propose` leaves `run` null when no run id
    was supplied, so an entry can exist while saying nothing useful; requiring a
    `recorded` date plus either a run id or a note is what makes it say something.
    """
    src = data["sources"].get(key)
    if not isinstance(src, dict):
        raise FloorsError(
            f"floor '{key}' has no entry in 'sources': a floor without a recorded "
            f"origin cannot be enforced (add measured/run/recorded/note)")
    if not src.get("recorded") or not (src.get("run") or src.get("note")):
        raise FloorsError(
            f"floor '{key}' has an empty 'sources' entry: it needs a 'recorded' "
            f"date and either a 'run' identifier or a 'note' saying where the "
            f"number came from")
    return src


def check(scope_label, floor, measured, killed, escaped, total, extra=""):
    """Print one gate line and return True when the floor is met or unset."""
    counts = f"[killed={killed} escaped={escaped} total={total}{extra}]"
    if floor is None:
        print(f"mutation-gate: UNSET {scope_label} {measured:.2f}% (no floor: "
              f"unmeasured, not enforced) {counts}")
        return True
    if measured + GATE_TOLERANCE >= floor:
        print(f"mutation-gate: OK   {scope_label} {measured:.2f}% "
              f"(floor {floor}%) {counts}")
        return True
    print(f"mutation-gate: FAIL {scope_label} {measured:.2f}% < floor {floor}% "
          f"(short by {floor - measured:.2f}pp) {counts}", file=sys.stderr)
    return False


def group_by_shard(reports):
    """Map shard name to its report paths, rejecting any path we cannot place."""
    by_shard = {}
    for path in reports:
        name = shard_name_from_path(path)
        if name is None:
            raise FloorsError(
                f"cannot identify the shard that produced {path} (expected a "
                f"'techniques-shard-<name>' path element)")
        by_shard.setdefault(name, []).append(path)
    return by_shard


def cmd_report_path(args):
    """Print where a package's report.json belongs.

    Exists so the producer of the report and the gate that reads it derive the
    path from one place. They previously each rolled their own slug expression
    and disagreed: the workflow's `tr -d './'` strips every dot and slash,
    yielding `internalsudokudp`, which happened to work only because the old
    inline gate was wrong in exactly the same way.
    """
    if args.scope not in PACKAGE_PKGS:
        raise FloorsError(f"unknown scope '{args.scope}'")
    print(report_path(args.package_dir, args.scope))
    return 0


def package_artifact_glob():
    """The download-artifact glob naming every unsharded package's artifact.

    Built from PACKAGE_PKGS so the nightly's lag check cannot forget a scope
    the sweep runs. techniques is excluded: it has no mutation-go-techniques
    artifact because it is measured through its shards, whose pattern the
    workflow carries separately. The @(...) alternation is the
    actions/download-artifact pattern syntax."""
    unsharded = [scope for scope, pkg in PACKAGE_PKGS.items()
                 if pkg != TECHNIQUES_LABEL]
    return "mutation-go-@(" + "|".join(unsharded) + ")"


def cmd_packages(args):
    """Print the package scopes, or the ./pkg paths they mutate.

    The Makefile drives its sweep and its gate off this rather than restating
    the package list, so adding a scope in PACKAGE_PKGS is enough to put it in
    both. Insertion order is preserved, which puts the cheap packages first and
    the multi-hour techniques sweep last. --artifact-glob prints the
    download-artifact pattern the floors-lag-check job downloads by, derived
    from the same enumeration."""
    if args.artifact_glob:
        print(package_artifact_glob())
        return 0
    for scope, pkg in PACKAGE_PKGS.items():
        print(pkg if args.pkg_paths else scope)
    return 0


def cmd_get(args):
    data = load(args.floors_file)
    floors = {**data["floors"], **data["techniques_shards"],
              **{f"frontend/{scope}": floor
                 for scope, floor in data.get("frontend", {}).items()}}
    if args.scope not in floors:
        print(f"mutation-floors: unknown scope '{args.scope}'", file=sys.stderr)
        return 2
    # Always a number, so a shell consumer can compare it without a null case.
    # An unmeasured floor prints 0, vacuous in the same way the gate treats it,
    # rather than a word that would compare as garbage.
    print(0 if floors[args.scope] is None else floors[args.scope])
    return 0


def cmd_gate_package(args):
    """Gate one or more package reports in a single pass over the floors file."""
    data = load(args.floors_file)
    ok = True
    # No --scope means every package scope, so `make mutation-gate` cannot gate
    # a smaller set than `make mutation-go` just ran.
    for scope in args.scope or list(PACKAGE_PKGS):
        if scope not in data["floors"]:
            raise FloorsError(f"unknown scope '{scope}'")
        floor = data["floors"][scope]
        if floor is not None:
            _require_source(data, scope)
        path = report_path(args.package_dir, scope)
        if not os.path.isfile(path):
            print(f"mutation-gate: FAIL {scope} no report at {path} (run "
                  f"errored or timed out; efficacy unmeasured)", file=sys.stderr)
            return 2
        eff, killed, escaped, total = measure([path], scope)
        if not check(PACKAGE_PKGS[scope], floor, eff, killed, escaped, total):
            ok = False
    return 0 if ok else 1


def cmd_gate_shards(args):
    """Gate every techniques shard against its own floor, then the aggregate.

    A per-shard floor is what makes the ratchet meaningful here. A closed shard
    is a few dozen mutants against a denominator in the thousands, so a full
    regression of one shard moves the aggregate by a fraction of a point and is
    absorbed long before it reaches a package-level floor.
    """
    data = load(args.floors_file)
    shard_floors = data["techniques_shards"]
    by_shard = group_by_shard(agg.find_reports(args.shards_dir))

    unknown = sorted(set(by_shard) - set(shard_floors))
    if unknown:
        raise FloorsError(
            f"shards {unknown} have no entry in the canonical floors file "
            f"(add them, or the ratchet cannot hold them)")
    missing = sorted(set(shard_floors) - set(by_shard))
    if missing:
        print(f"mutation-gate: FAIL {TECHNIQUES_LABEL} incomplete: shards "
              f"{missing} reported nothing under {args.shards_dir} (they likely "
              f"timed out); a partial run is not a result", file=sys.stderr)
        return 2

    ok = True
    # The aggregate is summed from the per-shard figures rather than by walking
    # the reports a second time. Shard reports run to tens of megabytes, so a
    # re-parse would be a second full pass to recompute three integers already
    # in hand.
    agg_killed = agg_escaped = agg_total = 0
    for name in sorted(by_shard):
        floor = shard_floors[name]
        if floor is not None:
            _require_source(data, f"techniques/{name}")
        eff, killed, escaped, total = measure(by_shard[name], f"shard {name}")
        agg_killed += killed
        agg_escaped += escaped
        agg_total += total
        if not check(f"{TECHNIQUES_LABEL} [shard {name}]", floor, eff,
                     killed, escaped, total):
            ok = False

    floor = data["floors"]["techniques"]
    if floor is not None:
        _require_source(data, "techniques")
    if not check(TECHNIQUES_LABEL, floor,
                 agg.efficacy(agg_killed, agg_escaped),
                 agg_killed, agg_escaped, agg_total,
                 extra=f" shards={len(by_shard)}"):
        ok = False
    return 0 if ok else 1


def ratchet(current, measured):
    """The ratchet itself: a floor rises to a measurement, and never falls.

    An unmeasured floor adopts the measurement. A measured one takes the max, so
    a bad run cannot walk a floor back down and quietly surrender ground the
    campaign has already taken.

    Both sides are efficacy percentages, never mutant counts, and nothing in this
    module compares a count between runs. Closing escapes by deleting redundant
    code shrinks the denominator, so dp's total fell below its measured 250 in
    65a162a; a count-based ratchet reads that as mutants going missing, while a
    percentage reads it correctly as the scope still having zero escapes.

    Truncated, not rounded. Rounding to two places can land up to 0.005pp ABOVE
    the measurement that produced it, which sets a floor no run has actually
    demonstrated and reds the very next identical run. At the denominators the
    techniques shards have (tens to low hundreds of mutants) that is not a corner
    case: 29 killed of 30 measures 96.666..., rounds to a 96.67 floor, and fails
    on a re-run that regressed nothing.
    """
    if measured is None:
        return current
    truncated = math.floor(measured * 100) / 100
    if current is None:
        return truncated
    return max(current, truncated)


def corroborate(measured, previous, what):
    """The lower of two runs' measurements, or None when only one exists.

    A floor raised onto a single run's number reds the gate on unchanged code if
    that number drifts down next time, which is the campaign's own defect in a
    new place. The lower of two independent runs cannot be a single-run fluke.

    A scope only one run measured is left alone rather than guessed at: a floor
    that stayed put can only be lower than it might have been, while a floor
    raised onto an uncorroborated number can be higher than the code can meet.
    """
    if measured is None:
        return None
    if previous is None:
        print(f"mutation-floors: not raising {what}: only one run measured it, "
              f"and a raise takes the lower of two", file=sys.stderr)
        return None
    return min(measured, previous)


def cmd_propose(args):
    data = load(args.floors_file)
    out = copy.deepcopy(data)
    changes = []
    corroborated = bool(args.previous_package_dir or args.previous_shards_dir
                        or args.previous_frontend_dir)

    def apply(block, key, source_key, label, measured):
        old = block[key]
        new = ratchet(old, measured)
        if new == old:
            return
        block[key] = new
        out["sources"][source_key] = {
            "measured": round(measured, 2),
            "run": args.run,
            "recorded": args.recorded,
            "note": args.note or (
                f"Raised by mutation_floors.py propose from {label}, to the "
                f"lower of this run and the previous one."
                if corroborated else
                f"Raised by mutation_floors.py propose from {label}."),
        }
        changes.append(f"  {source_key}: {old} -> {new}")

    def measured_or_skipped(paths, what, combine=agg.combine):
        """Measure, or return None and say why.

        Unlike the gates, `propose` skips what it cannot measure rather than
        aborting. Skipping is the conservative outcome here, since a floor left
        alone can only be lower than it might have been, whereas aborting throws
        away every legitimate raise in the same run because one scope emitted a
        stub report.
        """
        try:
            return measure(paths, what, combine=combine)[0]
        except FloorsError as err:
            print(f"mutation-floors: skipping {what}: {err}", file=sys.stderr)
            return None

    def previous_package(scope):
        if not args.previous_package_dir:
            return None
        path = report_path(args.previous_package_dir, scope)
        if not os.path.isfile(path):
            return None
        return measured_or_skipped([path], f"previous {scope}")

    if args.package_dir:
        for scope in PACKAGE_PKGS:
            path = report_path(args.package_dir, scope)
            # A scope nobody ran this time is simply not measured.
            if not os.path.isfile(path):
                continue
            measured = measured_or_skipped([path], scope)
            if corroborated:
                measured = corroborate(measured, previous_package(scope), scope)
            apply(out["floors"], scope, scope, path, measured)

    if args.shards_dir:
        by_shard = group_by_shard(agg.find_reports(args.shards_dir))
        unknown = sorted(set(by_shard) - set(out["techniques_shards"]))
        if unknown:
            raise FloorsError(f"shards {unknown} have no entry in the floors file")
        prev_by_shard = {}
        prev_agg_killed = prev_agg_escaped = 0
        prev_measured_shards = 0
        if args.previous_shards_dir:
            for name, paths in sorted(
                    group_by_shard(agg.find_reports(args.previous_shards_dir)).items()):
                try:
                    eff, killed, escaped, _total = measure(
                        paths, f"previous shard {name}")
                except FloorsError as err:
                    print(f"mutation-floors: skipping previous shard {name}: {err}",
                          file=sys.stderr)
                    continue
                prev_by_shard[name] = eff
                prev_agg_killed += killed
                prev_agg_escaped += escaped
                prev_measured_shards += 1

        agg_killed = agg_escaped = 0
        measured_shards = 0
        for name, paths in sorted(by_shard.items()):
            try:
                eff, killed, escaped, _total = measure(paths, f"shard {name}")
            except FloorsError as err:
                print(f"mutation-floors: skipping shard {name}: {err}",
                      file=sys.stderr)
                continue
            agg_killed += killed
            agg_escaped += escaped
            measured_shards += 1
            if corroborated:
                eff = corroborate(eff, prev_by_shard.get(name),
                                  f"techniques/{name}")
            apply(out["techniques_shards"], name, f"techniques/{name}",
                  f"techniques shard {name}", eff)
        # The aggregate is a weighted average over the whole shard set, so a
        # partial run yields a number for a package that was not fully measured.
        # Per-shard floors above are safe from this because each is derived only
        # from its own report.
        if measured_shards == len(out["techniques_shards"]):
            aggregate = agg.efficacy(agg_killed, agg_escaped)
            if corroborated:
                # The previous aggregate is only meaningful over the same full
                # shard set, for the reason stated just below.
                prev_aggregate = (
                    agg.efficacy(prev_agg_killed, prev_agg_escaped)
                    if prev_measured_shards == len(out["techniques_shards"])
                    else None)
                aggregate = corroborate(aggregate, prev_aggregate, "techniques")
            apply(out["floors"], "techniques", "techniques",
                  "the full techniques shard run", aggregate)
        else:
            print(f"mutation-floors: not proposing an aggregate techniques floor "
                  f"from {measured_shards}/{len(out['techniques_shards'])} "
                  f"measured shards; per-shard floors above are unaffected",
                  file=sys.stderr)

    if args.frontend_dir:
        if "frontend" not in out:
            raise FloorsError(
                "floors file has no 'frontend' block to hold the StrykerJS "
                "scopes' floors (add one before proposing against them)")
        by_scope = group_by_frontend_scope(find_frontend_reports(args.frontend_dir))
        unknown = sorted(set(by_scope) - set(out["frontend"]))
        if unknown:
            raise FloorsError(
                f"frontend reports for {unknown} have no entry in the floors "
                f"file's 'frontend' block (add them, or the ratchet cannot "
                f"hold them)")
        prev_by_scope = {}
        if args.previous_frontend_dir:
            for scope, paths in group_by_frontend_scope(
                    find_frontend_reports(args.previous_frontend_dir)).items():
                eff = measured_or_skipped(paths, f"previous frontend {scope}",
                                          combine=combine_stryker)
                if eff is not None:
                    prev_by_scope[scope] = eff
        for scope in out["frontend"]:
            paths = by_scope.get(scope)
            # A scope nobody ran this time is simply not measured.
            if not paths:
                continue
            measured = measured_or_skipped(paths, f"frontend {scope}",
                                           combine=combine_stryker)
            if corroborated:
                measured = corroborate(measured, prev_by_scope.get(scope),
                                       f"frontend/{scope}")
            apply(out["frontend"], scope, f"frontend/{scope}",
                  f"the frontend {scope} shard reports", measured)

    text = json.dumps(out, indent=2) + "\n"
    dest = (args.floors_file or DEFAULT_FLOORS_FILE) if args.in_place else args.out
    if dest:
        with open(dest, "w") as f:
            f.write(text)
    else:
        sys.stdout.write(text)

    if changes:
        print("mutation-floors: proposed ratchet (raises only):", file=sys.stderr)
        for line in changes:
            print(line, file=sys.stderr)
    else:
        print("mutation-floors: no floor rose; nothing to ratchet", file=sys.stderr)
    if dest:
        print(f"mutation-floors: wrote {dest}", file=sys.stderr)
    return 0


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--floors-file", default=None,
                        help="Path to mutation-floors.json (default: repo canonical).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_packages = sub.add_parser(
        "packages", help="Print the package scopes (or their ./pkg paths).")
    mode = p_packages.add_mutually_exclusive_group()
    mode.add_argument("--pkg-paths", action="store_true",
                      help="Print ./pkg paths instead of scope names.")
    mode.add_argument("--artifact-glob", action="store_true",
                      help="Print the download-artifact glob covering every "
                           "unsharded package scope.")
    p_packages.set_defaults(func=cmd_packages)

    p_get = sub.add_parser("get", help="Print one floor (0 when unmeasured).")
    p_get.add_argument("scope")
    p_get.set_defaults(func=cmd_get)

    p_rp = sub.add_parser("report-path",
                          help="Print where a package's report.json belongs.")
    p_rp.add_argument("--package-dir", required=True)
    p_rp.add_argument("--scope", required=True)
    p_rp.set_defaults(func=cmd_report_path)

    p_pkg = sub.add_parser("gate-package", help="Gate one or more package reports.")
    p_pkg.add_argument("--package-dir", required=True,
                       help="Directory holding <pkg-slug>/report.json per package.")
    p_pkg.add_argument("--scope", action="append",
                       help="Package scope, repeatable. Default: every package scope.")
    p_pkg.set_defaults(func=cmd_gate_package)

    p_sh = sub.add_parser("gate-shards",
                          help="Gate every techniques shard and the aggregate.")
    p_sh.add_argument("--shards-dir", required=True,
                      help="Directory searched recursively for shard report.json files.")
    p_sh.set_defaults(func=cmd_gate_shards)

    p_pr = sub.add_parser("propose",
                          help="Emit a candidate floors file, raising only.")
    p_pr.add_argument("--package-dir", help="Per-package report directory.")
    p_pr.add_argument("--shards-dir", help="Techniques shard report directory.")
    p_pr.add_argument("--frontend-dir",
                      help="Directory of downloaded frontend shard artifacts, "
                           "searched recursively for StrykerJS mutation.json.")
    # Supplying either previous directory turns on corroboration for its whole
    # block: every raise there takes the lower of the two runs, and a scope only
    # this run measured is left alone. Omit them and the raises come from a
    # single run, which is fine for a local ratchet and not for CI.
    p_pr.add_argument("--previous-package-dir",
                      help="Per-package reports from the previous run, to "
                           "corroborate raises against.")
    p_pr.add_argument("--previous-shards-dir",
                      help="Techniques shard reports from the previous run, to "
                           "corroborate raises against.")
    p_pr.add_argument("--previous-frontend-dir",
                      help="Previous run's frontend shard artifacts, to "
                           "corroborate raises against.")
    p_pr.add_argument("--run", default=None, help="Run identifier to record.")
    # Defaults to today rather than None: a null `recorded` produces a floor the
    # gate then refuses for missing provenance, so the tool would write a file
    # its own gate rejects.
    p_pr.add_argument("--recorded", default=datetime.date.today().isoformat(),
                      help="Date to record (YYYY-MM-DD; defaults to today).")
    p_pr.add_argument("--note", default=None, help="Note to record on raised entries.")
    dest = p_pr.add_mutually_exclusive_group()
    dest.add_argument("--out", default=None, help="Write the candidate here.")
    dest.add_argument("--in-place", action="store_true",
                      help="Overwrite the canonical file (review the diff before committing).")
    p_pr.set_defaults(func=cmd_propose)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except FloorsError as err:
        print(f"mutation-gate: FAIL {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
