#!/usr/bin/env bash
# Stage 1 of the two-stage shard sweep: a fast survivor filter.
#
#   sweep.sh <label> <shard-file.go> <api-root> <out-dir>
#
# Runs the techniques suite minus its two slow curated-fixture drivers, so a
# pass costs ~3s per mutant instead of ~32s. Skipping tests can only turn a
# kill into a reported survivor, never the reverse, so the survivor set is a
# strict over-approximation of the truth. It is a filter, not a measurement:
# stage 2 (confirm.py) re-tests each survivor against the full suite.
#
# ISOLATION IS NOT OPTIONAL. go-mutesting rewrites the target file in place,
# continuously, for the whole sweep. Point <api-root> at a dedicated git
# worktree, never at a checkout anyone (including you) is editing, and never
# run two sweeps against one checkout.
set -u
LABEL=$1
FILE=$2
API=$3
OUT=$4
SD="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$OUT"
export MUT_DIR="$API"
export MUT_PKG=./internal/sudoku/human/techniques/
export MUT_SKIP='TestCuratedFixturesSolveBoard|TestCuratedFixturesFireTargetTechnique'
export MUT_RUN=
export MUT_LOG="$OUT/$LABEL.log"
rm -f "$MUT_LOG"

cd "$API" || exit 1
# Bounds runaway-allocation mutants so they die alone as a Go OOM instead of
# exhausting the machine. Mirrors MUTATION_ADDRESS_SPACE_KB in api/Makefile.
ulimit -v 3000000
~/go/bin/go-mutesting --exec="$SD/runmut.sh" --config="$SD/mut-config.yml" \
  "./internal/sudoku/human/techniques/$FILE" > "$OUT/$LABEL-run.log" 2>&1
mv -f report.json "$OUT/$LABEL-report.json" 2>/dev/null
rm -f go-mutesting-report.html
tail -1 "$OUT/$LABEL-run.log"
