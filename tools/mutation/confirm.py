#!/usr/bin/env python3
"""Stage 2 of the shard sweep: re-test stage-1 survivors against the full suite.

Stage 1 skips the two curated-fixture drivers to buy a ~12x faster pass, so its
survivor set is an over-approximation. This applies each stage-1 survivor to the
real file, runs the complete package suite, and reports the ones that still
survive. Those are the shard's genuine escapes.

Usage: confirm.py <stage1-report.json> <out.json> <api-root>
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PKG = "./internal/sudoku/human/techniques/"
TEST_TIMEOUT_SECONDS = 900


def digest(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]


def main() -> int:
    api = Path(sys.argv[3])
    report = json.load(open(sys.argv[1]))
    escaped = report.get("escaped") or []
    if not escaped:
        print("no stage-1 survivors")
        return 0

    target = api / escaped[0]["mutator"]["originalFilePath"]
    backup = Path(tempfile.mkstemp()[1])
    shutil.copy(target, backup)

    results = []
    try:
        for n, entry in enumerate(escaped, 1):
            mut = entry["mutator"]
            target.write_text(mut["mutatedSourceCode"])
            proc = subprocess.run(
                ["go", "test", "-count=1", PKG],
                cwd=api, capture_output=True, text=True,
                timeout=TEST_TIMEOUT_SECONDS,
            )
            survived = proc.returncode == 0
            results.append({
                "id": digest(mut["mutatedSourceCode"]),
                "mutator": mut["mutatorName"],
                "survived": survived,
                "diff": entry["diff"],
            })
            print(f"[{n}/{len(escaped)}] {mut['mutatorName']:28} "
                  f"{'SURVIVED' if survived else 'killed'}", flush=True)
    finally:
        shutil.copy(backup, target)
        backup.unlink()

    out = Path(sys.argv[2])
    out.write_text(json.dumps(results, indent=1))
    live = [r for r in results if r["survived"]]
    print(f"\nstage-1 survivors: {len(results)}   confirmed escapes: {len(live)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
