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

Exit codes (same contract as the Go aggregator):
    0  aggregated efficacy meets the floor
    1  aggregated efficacy below the floor
    2  a shard report is missing or unreadable (result is untrustworthy)
"""

import argparse
import json
import os
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
    args = parser.parse_args(argv)

    reports = find_reports(args.reports_dir)
    if len(reports) < args.expected:
        print(f"mutation-gate: FAIL {args.label} incomplete: found "
              f"{len(reports)}/{args.expected} shard reports under "
              f"{args.reports_dir} (a shard likely timed out)", file=sys.stderr)
        return 2

    try:
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
    return 0 if eff >= args.floor else 1


if __name__ == "__main__":
    sys.exit(main())
