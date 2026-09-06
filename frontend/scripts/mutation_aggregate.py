#!/usr/bin/env python3
"""Aggregate sharded StrykerJS reports into one efficacy number and gate it.

Mirrors api/scripts/mutation_aggregate.py (which handles go-mutesting output)
but reads the StrykerJS mutation testing elements schema (mutation.json):
    {
      "schemaVersion": "1.0",
      "files": {
        "src/hooks/useGameActions.ts": {
          "mutants": [
            { "status": "Killed" | "Survived" | "Timeout" |
                        "NoCoverage" | "RuntimeError" | "CompileError" |
                        "Ignored", ... }
          ]
        }
      }
    }

Efficacy follows StrykerJS's own definition: killed (including timeouts and
runtime/compile errors) over killed + survived + no-coverage. Ignored mutants
(explained `// Stryker disable` directives) are excluded entirely from both
numerator and denominator, so the number reflects test effectiveness on the
non-disabled code rather than coverage gaps the team already documented.

Usage:
    mutation_aggregate.py --floor 90 --expected 7 --reports-dir ../shards
    mutation_aggregate.py ... --report-timeouts   # also print the Timeout split

Exit codes (same contract as the Go aggregator):
    0  aggregated efficacy meets the floor
    1  aggregated efficacy below the floor
    2  a shard report is missing or unreadable (result is untrustworthy)
"""

import argparse
import json
import os
import re
import sys


def find_reports(reports_dir):
    """Return every mutation.json path under reports_dir (recursively), sorted."""
    found = []
    for root, _dirs, files in os.walk(reports_dir):
        for name in files:
            if name == "mutation.json":
                found.append(os.path.join(root, name))
    return sorted(found)


# Statuses that count as "caught" (the mutant did not survive testing).
CAUGHT = {"Killed", "Timeout", "RuntimeError", "CompileError"}
# Statuses that count against efficacy (the testing failed to catch the mutant).
ESCAPED = {"Survived", "NoCoverage"}

# StrykerJS produces a Timeout in exactly two ways. The wall-clock path
# (TimeoutDecorator.mutantRun) returns {status: Timeout} with no reason key,
# so a Timeout carrying any statusReason was produced by the hit-limit
# counter instead (determineHitLimitReached in
# @stryker-mutator/api run-result-helpers writes "Hit limit reached (N/M)").
# That message shape is not API: it only labels the sub-reason, and any
# statusReason failing the match below is counted as unclassified rather
# than absorbed into either honest bucket.
_HIT_LIMIT_REASON = re.compile(r"^Hit limit reached \(\d+/\d+\)$")


def classify_timeouts(report_paths):
    """Split every Timeout mutant in the given reports into three buckets.

    The primary split is structural: a Timeout with no statusReason is a
    wall-clock kill, one with a statusReason is not (the wall-clock path
    cannot write one). A statusReason matching "Hit limit reached (N/M)"
    labels a loop-kill; anything else is unclassified and never merged into
    either honest bucket.

    Returns (loop_kills, clock_kills, unclassified, per_file) where per_file
    maps filename to a [loop_kills, clock_kills, unclassified] list (files
    with no Timeout are absent from the mapping and therefore zero).
    """
    per_file = {}
    totals = [0, 0, 0]
    for path in report_paths:
        with open(path) as f:
            data = json.load(f)
        for fname, file_entry in data.get("files", {}).items():
            for mutant in file_entry.get("mutants", []):
                if mutant.get("status", "") != "Timeout":
                    continue
                reason = mutant.get("statusReason")
                if reason is None:
                    bucket = 1
                elif _HIT_LIMIT_REASON.match(reason):
                    bucket = 0
                else:
                    bucket = 2
                totals[bucket] += 1
                per_file.setdefault(fname, [0, 0, 0])[bucket] += 1
    loop_kills, clock_kills, unclassified = totals
    return loop_kills, clock_kills, unclassified, per_file


def combine(report_paths):
    """Tally caught/escaped/ignored/total mutants across the given reports.

    Returns (caught, escaped, ignored, total)."""
    caught = escaped = ignored = total = 0
    for path in report_paths:
        with open(path) as f:
            data = json.load(f)
        for _fname, file_entry in data.get("files", {}).items():
            for mutant in file_entry.get("mutants", []):
                status = mutant.get("status", "")
                total += 1
                if status in CAUGHT:
                    caught += 1
                elif status in ESCAPED:
                    escaped += 1
                elif status == "Ignored":
                    ignored += 1
                # Any unrecognized status is counted only in total, neither
                # caught nor escaped, so it does not silently inflate the
                # efficacy number.
    return caught, escaped, ignored, total


def efficacy(caught, escaped):
    """Caught over caught + escaped, as a percentage. 100.0 when denominator is 0."""
    denom = caught + escaped
    if denom == 0:
        return 100.0
    return caught / denom * 100


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--floor", type=float, required=True,
                        help="Minimum acceptable efficacy percentage.")
    parser.add_argument("--expected", type=int, required=True,
                        help="Number of shard reports that must be present.")
    parser.add_argument("--reports-dir", required=True,
                        help="Directory searched recursively for mutation.json files.")
    parser.add_argument("--label", default="frontend/hooks",
                        help="Label used in the gate output line.")
    parser.add_argument("--report-timeouts", action="store_true",
                        help="Also print the Timeout split (loop-kills, "
                             "clock-kills, unclassified) per file and in "
                             "total; the gate line itself is unchanged.")
    args = parser.parse_args(argv)

    reports = find_reports(args.reports_dir)
    if len(reports) < args.expected:
        print(f"mutation-gate: FAIL {args.label} incomplete: found "
              f"{len(reports)}/{args.expected} shard reports under "
              f"{args.reports_dir} (a shard likely timed out)", file=sys.stderr)
        return 2

    split_lines = None
    try:
        if args.report_timeouts:
            loop_kills, clock_kills, unclassified, per_file = \
                classify_timeouts(reports)
            split_lines = [
                f"timeout-split total: loop-kills={loop_kills} "
                f"clock-kills={clock_kills} unclassified={unclassified}"]
            for fname in sorted(per_file):
                loop, clock, unclass = per_file[fname]
                split_lines.append(
                    f"timeout-split {fname}: loop-kills={loop} "
                    f"clock-kills={clock} unclassified={unclass}")
        caught, escaped, ignored, total = combine(reports)
    except (OSError, ValueError) as err:
        print(f"mutation-gate: FAIL {args.label} unreadable shard report: {err}",
              file=sys.stderr)
        return 2
    eff = efficacy(caught, escaped)
    status = "OK" if eff >= args.floor else "FAIL"
    print(f"mutation-gate: {status} {args.label} {eff:.1f}% (floor "
          f"{args.floor:.0f}%) [shards={len(reports)} caught={caught} "
          f"escaped={escaped} ignored={ignored} total={total}]")
    if split_lines is not None:
        for line in split_lines:
            print(line)
    return 0 if eff >= args.floor else 1


if __name__ == "__main__":
    sys.exit(main())
