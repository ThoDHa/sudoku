#!/usr/bin/env python3
"""Counting primitives over go-mutesting report.json files.

The techniques package is too large to mutate within GitHub Actions' hard 6h
per-job limit, so its mutation run is split across N matrix shards, each
mutating a subset of files, each emitting its own report.json. This module finds
those reports and sums them.

Efficacy is killed (including timeouts) over killed + escaped. Mutants that were
not covered or errored are excluded from the denominator so the number reflects
test effectiveness, not coverage gaps.

This is a library, not a gate. Floors and the comparison against them live in
mutation_floors.py, which reads the canonical api/mutation-floors.json; nothing
here accepts a floor, so no second copy of a floor can enter through this file.
The sibling frontend/scripts/mutation_aggregate.py still carries a gate CLI,
because the StrykerJS side has no equivalent canonical floors file yet.
"""

import json
import os


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
