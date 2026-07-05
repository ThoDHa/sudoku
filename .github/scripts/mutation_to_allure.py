#!/usr/bin/env python3
"""Convert mutation reports into Allure results, one test per mutated file.

Mutation tools (StrykerJS, go-mutesting) emit their own report formats, not
Allure results, so mutation efficacy never shows up in the combined Allure
report. This converter turns those reports into Allure `*-result.json` files:
each mutated source file becomes one Allure test, passed when all its mutants
were killed and failed when any survived, with the surviving mutants listed in
the failure detail. The rich per-mutant diffs still live in the native mutation
HTML linked from the report portal; this is the summary-in-Allure view.

Write the results into the same allure-results directory that feeds
`allure generate`, so they fold into the one combined report.

Usage:
    mutation_to_allure.py --out-dir allure-results \
        --stryker frontend/mutation.json \
        --go dp api/reports/mutation/internal-sudoku-dp/report.json \
        --go techniques-shard-1 .../techniques-shard-1/report.json
"""

import argparse
import hashlib
import json
import os

# Stryker mutant statuses that count as "the test suite caught it".
STRYKER_KILLED = {"Killed", "Timeout"}
# Statuses that mean a real, actionable gap (a mutant the tests did not catch).
STRYKER_SURVIVED = {"Survived"}


def _uuid_like(seed):
    """Deterministic uuid-shaped id from a seed (stable across runs for trends)."""
    h = hashlib.sha1(seed.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def allure_result(suite, file, survivors, total):
    """Build one Allure result dict for a file's mutation outcome."""
    passed = not survivors
    name = f"{file}"
    full = f"mutation::{suite}::{file}"
    result = {
        "uuid": _uuid_like(full + "::uuid"),
        "historyId": _uuid_like(full),
        "name": name,
        "fullName": full,
        "status": "passed" if passed else "failed",
        "labels": [
            {"name": "suite", "value": f"Mutation: {suite}"},
            {"name": "feature", "value": "Mutation testing"},
        ],
        "start": 0,
        "stop": 0,
    }
    if passed:
        result["statusDetails"] = {
            "message": f"All {total} mutant(s) killed"}
    else:
        lines = "\n".join(f"  - {s}" for s in survivors)
        result["statusDetails"] = {
            "message": f"{len(survivors)} of {total} mutant(s) survived",
            "trace": f"Surviving mutants:\n{lines}",
        }
    return result


def from_stryker(path):
    """Return {file: (survivors, total)} from a Stryker mutation.json."""
    with open(path) as f:
        data = json.load(f)
    out = {}
    for file, info in data.get("files", {}).items():
        survivors, total = [], 0
        for m in info.get("mutants", []):
            status = m.get("status")
            if status in STRYKER_KILLED or status in STRYKER_SURVIVED:
                total += 1
            if status in STRYKER_SURVIVED:
                loc = m.get("location", {}).get("start", {})
                survivors.append(
                    f"{file}:{loc.get('line', '?')} {m.get('mutatorName', '')}")
        if total:
            out[file] = (survivors, total)
    return out


def from_go(path):
    """Return {file: (survivors, total)} from a go-mutesting report.json."""
    with open(path) as f:
        data = json.load(f)

    def file_of(mutant):
        return mutant.get("mutator", {}).get("originalFilePath", "unknown")

    def line_of(mutant):
        return mutant.get("mutator", {}).get("originalStartLine", "?")

    files = {}
    # Killed + timeouts count as caught; escaped are survivors. Errored mutants
    # never compiled/ran and are excluded from efficacy, matching the gate.
    for mutant in data.get("killed", []) + data.get("timeouted", []):
        files.setdefault(file_of(mutant), {"survivors": [], "total": 0})["total"] += 1
    for mutant in data.get("escaped", []):
        entry = files.setdefault(file_of(mutant), {"survivors": [], "total": 0})
        entry["total"] += 1
        entry["survivors"].append(
            f"{file_of(mutant)}:{line_of(mutant)} {mutant.get('mutator', {}).get('mutatorName', '')}")
    return {f: (v["survivors"], v["total"]) for f, v in files.items()}


def write_results(out_dir, suite, per_file):
    os.makedirs(out_dir, exist_ok=True)
    count = 0
    for file, (survivors, total) in sorted(per_file.items()):
        result = allure_result(suite, file, survivors, total)
        with open(os.path.join(out_dir, f"{result['uuid']}-result.json"), "w") as f:
            json.dump(result, f)
        count += 1
    return count


def _find(root, filename):
    for dirpath, _dirs, files in os.walk(root):
        if filename in files:
            return os.path.join(dirpath, filename)
    return None


def discover(artifacts_dir):
    """Find (stryker_path, [(label, go_report_path)]) in a fetched artifacts dir.

    Mirrors the report portal's layout: a `mutation-frontend` artifact carries
    Stryker's mutation.json, and each `mutation-go-<label>` artifact carries a
    go-mutesting report.json.
    """
    stryker, go = None, []
    if not os.path.isdir(artifacts_dir):
        return stryker, go
    for name in sorted(os.listdir(artifacts_dir)):
        path = os.path.join(artifacts_dir, name)
        if not os.path.isdir(path):
            continue
        if name == "mutation-frontend":
            stryker = _find(path, "mutation.json")
        elif name.startswith("mutation-go-"):
            report = _find(path, "report.json")
            if report:
                go.append((name[len("mutation-go-"):], report))
    return stryker, go


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--stryker", help="Path to a Stryker mutation.json.")
    parser.add_argument("--go", nargs=2, action="append", default=[],
                        metavar=("LABEL", "PATH"),
                        help="A go-mutesting report.json and its package label.")
    parser.add_argument("--artifacts-dir",
                        help="Auto-discover Stryker + go-mutesting reports under this dir.")
    args = parser.parse_args(argv)

    stryker = args.stryker
    go = list(args.go)
    if args.artifacts_dir:
        found_stryker, found_go = discover(args.artifacts_dir)
        stryker = stryker or found_stryker
        go += found_go

    written = 0
    if stryker and os.path.isfile(stryker):
        written += write_results(args.out_dir, "Frontend (StrykerJS)",
                                 from_stryker(stryker))
    for label, path in go:
        if os.path.isfile(path):
            written += write_results(args.out_dir, f"Go: {label}", from_go(path))

    print(f"mutation-to-allure: wrote {written} Allure result(s) to {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
