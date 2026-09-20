#!/usr/bin/env python3
"""Drift guard for the unmeasured-residue inventory in stryker.config.json.

The _comment_unmeasured_residue note claims that every production .tsx under
src/components, src/pages, src/App.tsx and src/main.tsx lies outside the
mutate surface and is named, file by file, in _unmeasured_residue_files.
Nothing else in the repository enforces that claim, so a new component, a
deleted file, or a glob edit silently invalidates the note's completeness
record. This module derives both sides independently and fails in either
drift direction:

  * direction 1 (unlisted file): a production .tsx outside the measured
    surface and absent from the inventory;
  * direction 2 (stale entry): an inventory entry that no longer exists on
    disk or that the mutate globs now cover;
  * inventory hygiene: a missing mutate key, or an entry listed more than
    once, each of which would otherwise hide or mute the checks above.

The measured surface is derived from the mutate globs with the same
glob-based expansion mutation_shards.py uses (the real-tree test pins the two
expansions to each other), never by importing Stryker or reading Stryker
output. The check functions take the config dict and the frontend root as
explicit parameters, so the negative-path tests run against synthetic trees
in temporary directories and the shipped stryker.config.json is only ever
read. Runs without Stryker as part of `make test-scripts` and its deploy.yml
mirror step, alongside mutation_aggregate_test.
"""

import contextlib
import glob
import io
import json
import os
import sys
import tempfile
import unittest
from collections import Counter

# Make the sibling script importable when run from frontend/scripts/.
sys.path.insert(0, os.path.dirname(__file__))
import mutation_shards as shards  # noqa: E402

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_ROOT = os.path.dirname(SCRIPTS_DIR)
STRYKER_CONFIG_PATH = os.path.join(FRONTEND_ROOT, "stryker.config.json")

RESIDUE_ROOTS = ("src/App.tsx", "src/components", "src/main.tsx", "src/pages")
PRODUCTION_SUFFIX = ".tsx"
COLOCATED_TEST_SUFFIXES = (".test.tsx", ".spec.tsx")
INVENTORY_KEY = "_unmeasured_residue_files"
MUTATE_KEY = "mutate"
NEGATION_PREFIX = "!"


def fail(message):
    """Report an untrustworthy config the way mutation_shards.fail() does.

    Parameters:
        message: the reason the config cannot be trusted, phrased for the
            developer running the guard.

    Raises:
        SystemExit: always, with exit code 2 after printing the prefixed
            reason to stderr.
    """
    print("residue-guard: %s" % message, file=sys.stderr)
    raise SystemExit(2)


def expand_mutate_surface(patterns, frontend_root):
    """Expand Stryker mutate patterns into the set of measured file paths.

    Mirrors mutation_shards.mutate_surface(): patterns beginning with "!"
    subtract instead of add, matching is glob.glob(recursive=True) anchored
    at the frontend root, and results are normalized to frontend-relative
    paths. Takes the pattern list and root as parameters so synthetic trees
    exercise the same expansion the shipped config gets.

    Parameters:
        patterns: the config's "mutate" list, negations marked with "!".
        frontend_root: absolute path of the frontend the patterns resolve
            against.

    Returns:
        Set of frontend-relative file paths on the measured surface.
    """
    included, excluded = set(), set()
    for pattern in patterns:
        negated = pattern.startswith(NEGATION_PREFIX)
        target = excluded if negated else included
        matches = glob.glob(
            os.path.join(frontend_root, pattern.lstrip(NEGATION_PREFIX)),
            recursive=True)
        target.update(os.path.relpath(match, frontend_root) for match in matches)
    return included - excluded


def derive_production_tsx_files(frontend_root):
    """Collect the production .tsx paths under the four residue roots.

    Walks the residue roots the way the parent reconciliation did: each root
    may be a directory (walked recursively) or a single file (App.tsx,
    main.tsx); co-located .test.tsx and .spec.tsx suites are excluded. A
    root that is absent contributes nothing, and its former inventory
    entries are then reported stale by find_residue_drift.

    Parameters:
        frontend_root: absolute path of the frontend to walk.

    Returns:
        Set of frontend-relative production .tsx paths.
    """
    found = set()
    for root in RESIDUE_ROOTS:
        full = os.path.join(frontend_root, root)
        if os.path.isfile(full):
            found.add(root)
        elif os.path.isdir(full):
            for base, _subdirs, names in os.walk(full):
                for name in names:
                    if (name.endswith(PRODUCTION_SUFFIX)
                            and not name.endswith(COLOCATED_TEST_SUFFIXES)):
                        found.add(
                            os.path.relpath(os.path.join(base, name), frontend_root))
    return found


def find_residue_drift(config, frontend_root):
    """Check the residue inventory against the measured surface and the tree.

    Derives the measured surface from the config's mutate globs and the
    production .tsx set from disk, then checks the inventory in both
    directions: every production .tsx outside the surface must be
    inventoried, and every inventory entry must exist on disk as a
    production .tsx still outside the surface.

    Parameters:
        config: parsed stryker.config.json dict carrying "mutate" and
            "_unmeasured_residue_files".
        frontend_root: absolute path of the frontend to derive against.

    Returns:
        One human-readable problem string per drifted file, each naming the
        file, the failed direction, and the remedy; an empty list means the
        justification note still holds.

    Raises:
        SystemExit: with exit code 2 when the config lacks the "mutate" key,
            mirroring mutation_shards.fail(); a mangled config cannot yield
            a trustworthy surface derivation.
    """
    if MUTATE_KEY not in config:
        fail("%s does not list mutate patterns under the %r key; the measured "
             "surface cannot be derived" % (STRYKER_CONFIG_PATH, MUTATE_KEY))
    inventory_counts = Counter(config.get(INVENTORY_KEY, ()))
    inventory = set(inventory_counts)
    surface = expand_mutate_surface(config[MUTATE_KEY], frontend_root)
    expected = derive_production_tsx_files(frontend_root) - surface

    problems = []
    for path, count in sorted(inventory_counts.items()):
        if count > 1:
            problems.append(
                "duplicated inventory entry: %s appears %d times in %s; "
                "keep one entry" % (path, count, INVENTORY_KEY))
    for path in sorted(expected - inventory):
        problems.append(
            "unlisted production .tsx outside the mutate surface: %s; "
            "add it to %s with the justification note updated, or move it "
            "onto the measured surface" % (path, INVENTORY_KEY))
    for path in sorted(inventory - expected):
        if not os.path.isfile(os.path.join(frontend_root, path)):
            problems.append(
                "stale inventory entry: %s no longer exists on disk; remove "
                "it from %s and update the note" % (path, INVENTORY_KEY))
        elif path in surface:
            problems.append(
                "stale inventory entry: %s is now covered by the mutate "
                "globs; remove it from %s and update the note's figures"
                % (path, INVENTORY_KEY))
        else:
            problems.append(
                "stale inventory entry: %s is no longer a production .tsx "
                "under %s; remove it from %s and update the note"
                % (path, ", ".join(RESIDUE_ROOTS), INVENTORY_KEY))
    return problems


def _write_tree(root, files):
    """Materialize a {frontend-relative path: content} mapping under root."""
    for relative, content in sorted(files.items()):
        full = os.path.join(root, relative)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as handle:
            handle.write(content)


def _config(mutate, inventory):
    """Build a minimal config dict with just the keys the guard reads."""
    return {MUTATE_KEY: mutate, INVENTORY_KEY: inventory}


class ExpandMutateSurfaceTests(unittest.TestCase):
    def test_negated_patterns_subtract_from_the_surface(self):
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {
                "src/lib/kept.tsx": "",
                "src/lib/skip/Skipped.tsx": "",
            })
            surface = expand_mutate_surface(
                ["src/lib/**/*.tsx", "!src/lib/skip/**"], root)
        self.assertEqual(surface, {"src/lib/kept.tsx"})


class DeriveProductionTsxTests(unittest.TestCase):
    def test_colocated_test_suites_are_not_production_files(self):
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {
                "src/components/Board.tsx": "",
                "src/components/Board.test.tsx": "",
            })
            found = derive_production_tsx_files(root)
        self.assertEqual(found, {"src/components/Board.tsx"})

    def test_colocated_spec_suites_are_not_production_files(self):
        # Either co-located suite suffix marks a test file; a .spec.tsx
        # wrongly counted as production would fail direction 1 for a file
        # no inventory is expected to list.
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {
                "src/components/Board.tsx": "",
                "src/components/Board.spec.tsx": "",
            })
            found = derive_production_tsx_files(root)
        self.assertEqual(found, {"src/components/Board.tsx"})

    def test_single_file_roots_enter_the_derivation(self):
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {"src/App.tsx": "", "src/main.tsx": ""})
            found = derive_production_tsx_files(root)
        self.assertEqual(found, {"src/App.tsx", "src/main.tsx"})


class UnlistedResidueFileTests(unittest.TestCase):
    def test_unlisted_production_tsx_outside_surface_fails_with_remedy(self):
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {
                "src/App.tsx": "",
                "src/components/Listed.tsx": "",
                "src/components/Unlisted.tsx": "",
                "src/main.tsx": "",
            })
            config = _config(["src/lib/**/*.ts"], [
                "src/App.tsx", "src/components/Listed.tsx", "src/main.tsx"])
            problems = find_residue_drift(config, root)
        self.assertEqual(len(problems), 1)
        message = problems[0]
        self.assertIn("src/components/Unlisted.tsx", message)
        self.assertIn("unlisted", message)
        self.assertIn(INVENTORY_KEY, message)
        self.assertIn("measured surface", message)

    def test_passes_once_the_unlisted_file_is_inventoried(self):
        # The same tree with the inventory corrected: the direction-1 failure
        # clears, which is the fail-then-pass pair the real-tree assertion
        # is trusted against.
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {
                "src/App.tsx": "",
                "src/components/Listed.tsx": "",
                "src/components/Unlisted.tsx": "",
                "src/main.tsx": "",
            })
            config = _config(["src/lib/**/*.ts"], [
                "src/App.tsx", "src/components/Listed.tsx",
                "src/components/Unlisted.tsx", "src/main.tsx"])
            problems = find_residue_drift(config, root)
        self.assertEqual(problems, [])


class StaleResidueEntryTests(unittest.TestCase):
    def test_deleted_inventory_entry_fails_with_reason(self):
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {"src/components/Listed.tsx": ""})
            config = _config(
                ["src/lib/**/*.ts"],
                ["src/components/Gone.tsx", "src/components/Listed.tsx"])
            problems = find_residue_drift(config, root)
        self.assertEqual(len(problems), 1)
        message = problems[0]
        self.assertIn("src/components/Gone.tsx", message)
        self.assertIn("no longer exists", message)
        self.assertIn(INVENTORY_KEY, message)

    def test_surfaced_inventory_entry_fails_with_reason(self):
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {
                "src/components/Listed.tsx": "",
                "src/lib/Measured.tsx": "",
            })
            config = _config(
                ["src/lib/**/*.tsx", "!src/**/*.test.tsx"],
                ["src/components/Listed.tsx", "src/lib/Measured.tsx"])
            problems = find_residue_drift(config, root)
        self.assertEqual(len(problems), 1)
        message = problems[0]
        self.assertIn("src/lib/Measured.tsx", message)
        self.assertIn("now covered by the mutate globs", message)
        self.assertIn(INVENTORY_KEY, message)

    def test_entry_no_longer_production_tsx_fails_with_fallback_reason(self):
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {
                "src/components/Listed.tsx": "",
                "src/components/Suite.test.tsx": "",
            })
            config = _config(
                ["src/lib/**/*.ts"],
                ["src/components/Listed.tsx", "src/components/Suite.test.tsx"])
            problems = find_residue_drift(config, root)
        self.assertEqual(len(problems), 1)
        message = problems[0]
        self.assertIn("src/components/Suite.test.tsx", message)
        self.assertIn("no longer a production .tsx", message)


class InventoryHygieneTests(unittest.TestCase):
    """Config shapes that would mute the drift checks must fail loudly."""

    def test_duplicated_inventory_entry_fails_naming_the_duplicate(self):
        # A duplicated path vanishes into the set difference silently, so a
        # copy-paste slip in the config would pass unchecked; it must be
        # named instead.
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {"src/components/Listed.tsx": ""})
            config = _config(
                ["src/lib/**/*.ts"],
                ["src/components/Listed.tsx", "src/components/Listed.tsx"])
            problems = find_residue_drift(config, root)
        self.assertEqual(len(problems), 1)
        message = problems[0]
        self.assertIn("src/components/Listed.tsx", message)
        self.assertIn("duplicated", message)
        self.assertIn(INVENTORY_KEY, message)

    def test_missing_mutate_key_exits_naming_config_and_key(self):
        stderr = io.StringIO()
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {"src/components/Listed.tsx": ""})
            config = {INVENTORY_KEY: ["src/components/Listed.tsx"]}
            with self.assertRaises(SystemExit) as raised:
                with contextlib.redirect_stderr(stderr):
                    find_residue_drift(config, root)
        self.assertEqual(raised.exception.code, 2)
        self.assertIn(STRYKER_CONFIG_PATH, stderr.getvalue())
        self.assertIn(MUTATE_KEY, stderr.getvalue())

    def test_missing_inventory_key_degrades_to_direction_1_drift(self):
        # Deliberately unlike the missing-mutate-key exit: an absent
        # inventory is itself the drift, so every off-surface production
        # .tsx is unlisted by definition and is reported file by file
        # instead of the config being rejected outright.
        with tempfile.TemporaryDirectory() as root:
            _write_tree(root, {"src/components/Orphan.tsx": ""})
            config = {MUTATE_KEY: ["src/lib/**/*.ts"]}
            problems = find_residue_drift(config, root)
        self.assertEqual(len(problems), 1)
        message = problems[0]
        self.assertIn("src/components/Orphan.tsx", message)
        self.assertIn("unlisted", message)
        self.assertIn("measured surface", message)
        self.assertIn(INVENTORY_KEY, message)


class RealRepoTests(unittest.TestCase):
    """The shipped config against the shipped tree; reads only, never writes."""

    def _load_config(self):
        with open(STRYKER_CONFIG_PATH) as handle:
            return json.load(handle)

    def test_shipped_inventory_matches_the_derived_residue(self):
        problems = find_residue_drift(self._load_config(), FRONTEND_ROOT)
        self.assertEqual(problems, [])

    def test_surface_derivation_matches_mutation_shards(self):
        # The guard's glob expansion and the shard enumeration must not be
        # able to drift apart: both derive from the same shipped globs.
        config = self._load_config()
        derived = sorted(expand_mutate_surface(config[MUTATE_KEY], FRONTEND_ROOT))
        self.assertEqual(derived, shards.mutate_surface())


if __name__ == "__main__":
    unittest.main()
