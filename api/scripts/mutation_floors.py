#!/usr/bin/env python3
"""Read, enforce, and ratchet the canonical mutation floors in mutation-floors.json.

This is the only place a Go mutation floor is compared against a measurement.
api/Makefile and .github/workflows/nightly-mutation.yml both call in here rather
than carrying their own copies of the numbers, so the two cannot drift apart.

Floors move in one direction. `propose` reads a completed run and emits a
candidate floors file in which every floor is max(current, measured); it has no
path that lowers one. Lowering therefore requires hand-editing the canonical
file, which shows up in review as a number going down, and the `source` block
that every enforced floor must carry records where the number came from. The
full procedure lives in the `_ratchet` block of mutation-floors.json.

An unmeasured shard carries a null floor. The gate prints it as UNSET and does
not enforce it, so a shard nobody has measured can never be mistaken for a shard
that passed. The three package scopes may NOT be null: nulling a floor disarms
its gate without reading as a number going down, which would be a cheaper way to
surrender ground than lowering one, so a test refuses it.

Usage:
    mutation_floors.py get <scope>
    mutation_floors.py gate-package --package-dir reports/mutation --scope dp
    mutation_floors.py gate-shards --shards-dir shards/
    mutation_floors.py propose --package-dir reports/mutation --shards-dir shards/

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
# report directories are named after.
PACKAGE_PKGS = {
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


def measure(paths, what):
    """Efficacy over one or more reports, with the counts behind it.

    The single place the "a timeout counts as a kill" rule is applied, so it
    cannot drift between the package gate, the shard gate, and the ratchet.
    """
    try:
        killed_no_timeout, timeout, escaped, total = agg.combine(paths)
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


def cmd_get(args):
    data = load(args.floors_file)
    floors = {**data["floors"], **data["techniques_shards"]}
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
    for scope in args.scope:
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


def cmd_propose(args):
    data = load(args.floors_file)
    out = copy.deepcopy(data)
    changes = []

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
            "note": args.note or f"Raised by mutation_floors.py propose from {label}.",
        }
        changes.append(f"  {source_key}: {old} -> {new}")

    def measured_or_skipped(paths, what):
        """Measure, or return None and say why.

        Unlike the gates, `propose` skips what it cannot measure rather than
        aborting. Skipping is the conservative outcome here, since a floor left
        alone can only be lower than it might have been, whereas aborting throws
        away every legitimate raise in the same run because one scope emitted a
        stub report.
        """
        try:
            return measure(paths, what)[0]
        except FloorsError as err:
            print(f"mutation-floors: skipping {what}: {err}", file=sys.stderr)
            return None

    if args.package_dir:
        for scope in PACKAGE_PKGS:
            path = report_path(args.package_dir, scope)
            # A scope nobody ran this time is simply not measured.
            if not os.path.isfile(path):
                continue
            apply(out["floors"], scope, scope, path,
                  measured_or_skipped([path], scope))

    if args.shards_dir:
        by_shard = group_by_shard(agg.find_reports(args.shards_dir))
        unknown = sorted(set(by_shard) - set(out["techniques_shards"]))
        if unknown:
            raise FloorsError(f"shards {unknown} have no entry in the floors file")
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
            apply(out["techniques_shards"], name, f"techniques/{name}",
                  f"techniques shard {name}", eff)
        # The aggregate is a weighted average over the whole shard set, so a
        # partial run yields a number for a package that was not fully measured.
        # Per-shard floors above are safe from this because each is derived only
        # from its own report.
        if measured_shards == len(out["techniques_shards"]):
            apply(out["floors"], "techniques", "techniques",
                  "the full techniques shard run",
                  agg.efficacy(agg_killed, agg_escaped))
        else:
            print(f"mutation-floors: not proposing an aggregate techniques floor "
                  f"from {measured_shards}/{len(out['techniques_shards'])} "
                  f"measured shards; per-shard floors above are unaffected",
                  file=sys.stderr)

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
    p_pkg.add_argument("--scope", action="append", required=True,
                       help="Package scope, repeatable.")
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
