#!/usr/bin/env python3
"""Enumerate the per-file mutation shards for the frontend surface.

The whole-surface StrykerJS run is not viable: instrumenting all 65 files
inserts 6302 mutant switches, and src/lib carries solver and board code called
in tight loops, so the *initial test run alone* exceeded two hours on a hosted
runner while the uninstrumented suite takes ~170s (CI run 31353467288). Per-file
sharding instruments one file at a time, which keeps each shard's initial run
close to the uninstrumented figure.

Both shard lists are derived, never hand-maintained:

  * the mutate surface comes from stryker.config.json, the same globs the
    unsharded run used, so a new src/lib or src/hooks file gets a shard the day
    it lands rather than the day somebody remembers to add one;
  * the hooks already covered by the frontend-hooks-mutation matrix are read
    out of the workflow itself, so the two jobs cannot double-count a file and
    cannot drift apart.

Usage:
    mutation_shards.py surface   # files needing a shard, minus the hooks matrix
    mutation_shards.py hooks     # the shard names the hooks matrix declares

Both print a JSON object: {"shards": [...], "count": N}. `shards` for `surface`
holds objects with `file` (the path to pass to --mutate) and `name` (a matrix
label and artifact-name-safe identifier).

Exit codes:
    0  the list was produced
    2  the surface or the workflow could not be read (result is untrustworthy)
"""

import argparse
import glob
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND = os.path.join(REPO_ROOT, "frontend")
STRYKER_CONFIG = os.path.join(FRONTEND, "stryker.config.json")
WORKFLOW = os.path.join(REPO_ROOT, ".github", "workflows", "nightly-mutation.yml")
HOOKS_JOB = "frontend-hooks-mutation"


def fail(message):
    print("mutation-shards: %s" % message, file=sys.stderr)
    raise SystemExit(2)


def mutate_surface():
    """Expand stryker.config.json's mutate globs into a sorted file list."""
    try:
        with open(STRYKER_CONFIG) as handle:
            patterns = json.load(handle)["mutate"]
    except (OSError, ValueError, KeyError) as exc:
        fail("cannot read the mutate list from %s: %s" % (STRYKER_CONFIG, exc))

    included, excluded = set(), set()
    for pattern in patterns:
        negated = pattern.startswith("!")
        target = excluded if negated else included
        matches = glob.glob(os.path.join(FRONTEND, pattern.lstrip("!")), recursive=True)
        target.update(os.path.relpath(m, FRONTEND) for m in matches)

    surface = sorted(included - excluded)
    if not surface:
        fail("the mutate globs matched no files; refusing to report an empty surface")
    return surface


def hooks_shard_names():
    """Read the shard names the hooks matrix declares, from the workflow itself.

    Parsed with a narrow scan rather than a YAML load so the script carries no
    dependency beyond the standard library: CI installs nothing for this.
    """
    try:
        with open(WORKFLOW) as handle:
            lines = handle.read().split("\n")
    except OSError as exc:
        fail("cannot read %s: %s" % (WORKFLOW, exc))

    names, inside = [], False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("%s:" % HOOKS_JOB):
            inside = True
            continue
        if inside:
            # A new job starts at two-space indentation; the matrix lives deeper.
            if line and not line.startswith("    ") and stripped and not stripped.startswith("#"):
                break
            if stripped.startswith("- shard:"):
                names.append(stripped.split(":", 1)[1].strip())

    if not names:
        fail("found no '- shard:' entries under the %s job in %s" % (HOOKS_JOB, WORKFLOW))
    return names


def shard_name_for(path):
    """A matrix label and artifact-safe identifier for a source file path."""
    without_ext = os.path.splitext(path)[0]
    trimmed = without_ext[len("src/") :] if without_ext.startswith("src/") else without_ext
    return trimmed.replace("/", "-")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scope", choices=["surface", "hooks"])
    args = parser.parse_args()

    if args.scope == "hooks":
        names = hooks_shard_names()
        print(json.dumps({"shards": names, "count": len(names)}))
        return

    covered = {"src/hooks/%s.ts" % name for name in hooks_shard_names()}
    shards = [
        {"file": path, "name": shard_name_for(path)}
        for path in mutate_surface()
        if path not in covered
    ]
    print(json.dumps({"shards": shards, "count": len(shards)}))


if __name__ == "__main__":
    main()
