#!/usr/bin/env python3
"""Aggregate sharded go-mutesting reports into one efficacy number and gate it.

The techniques package is too large to mutate within GitHub Actions' hard 6h
per-job limit, so its mutation run is split across N matrix shards, each
mutating a subset of files. Each shard emits its own report.json. This script
combines those per-shard reports into a single efficacy figure and enforces the
package floor, exactly as a single unsharded run's gate would.

Efficacy is defined as in the per-package gate: killed (including timeouts) over
killed + escaped. Mutants that were not covered or errored are excluded from the
denominator so the number reflects test effectiveness, not coverage gaps.

Usage:
    mutation_aggregate.py --floor 85 --expected 4 --reports-dir shards/

Exit codes:
    0  aggregated efficacy meets the floor
    1  aggregated efficacy below the floor
    2  a shard report is missing or unreadable (result is untrustworthy)
"""

import argparse
import json
import os
import sys


def find_reports(reports_dir):
    """Return every report.json path under reports_dir (recursively), sorted."""
    found = []
    for root, _dirs, files in os.walk(reports_dir):
        for name in files:
            if name == "report.json":
                found.append(os.path.join(root, name))
    return sorted(found)


def combine(report_paths):
    """Sum the killed/timeout/escaped/total counts across the given reports."""
    killed = timeout = escaped = total = 0
    for path in report_paths:
        with open(path) as f:
            stats = json.load(f)["stats"]
        killed += stats["killedCount"]
        timeout += stats.get("timeOutCount", 0)
        escaped += stats["escapedCount"]
        total += stats["totalMutantsCount"]
    return killed, timeout, escaped, total


def efficacy(killed_with_timeouts, escaped):
    """Killed (incl. timeouts) over killed + escaped, as a percentage."""
    denom = killed_with_timeouts + escaped
    if denom == 0:
        return 100.0
    return killed_with_timeouts / denom * 100


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--floor", type=float, required=True,
                        help="Minimum acceptable efficacy percentage.")
    parser.add_argument("--expected", type=int, required=True,
                        help="Number of shard reports that must be present.")
    parser.add_argument("--reports-dir", required=True,
                        help="Directory searched recursively for report.json files.")
    parser.add_argument("--label", default="./internal/sudoku/human/techniques",
                        help="Package label used in the gate output line.")
    args = parser.parse_args(argv)

    reports = find_reports(args.reports_dir)
    if len(reports) < args.expected:
        print(f"mutation-gate: FAIL {args.label} incomplete: found "
              f"{len(reports)}/{args.expected} shard reports under "
              f"{args.reports_dir} (a shard likely timed out)", file=sys.stderr)
        return 2

    try:
        killed_no_timeout, timeout, escaped, total = combine(reports)
    except (OSError, ValueError, KeyError) as err:
        print(f"mutation-gate: FAIL {args.label} unreadable shard report: {err}",
              file=sys.stderr)
        return 2
    killed = killed_no_timeout + timeout
    eff = efficacy(killed, escaped)
    status = "OK" if eff >= args.floor else "FAIL"
    print(f"mutation-gate: {status} {args.label} {eff:.1f}% (floor "
          f"{args.floor:.0f}%) [shards={len(reports)} killed={killed} "
          f"escaped={escaped} total={total}]")
    return 0 if eff >= args.floor else 1


if __name__ == "__main__":
    sys.exit(main())
