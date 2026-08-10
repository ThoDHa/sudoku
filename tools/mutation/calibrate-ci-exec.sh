#!/usr/bin/env bash
# Calibrate tools/mutation/ci-exec.sh in every direction its contract has.
#
#   tools/mutation/calibrate-ci-exec.sh [api-root]
#
# go-mutesting reads that script's exit code with no mapping, so a wrapper that
# inverts it turns every mutation number in this repository into fiction, and it
# does so silently: a harness that can only report kills looks like a perfect
# score. tools/mutation/README.md states the rule that follows from that, which
# is that no harness variant is trusted before both directions are calibrated.
# Run this after any edit to ci-exec.sh.
#
# Four cases, because the wrapper has four verdicts to get wrong:
#
#   unmutated      -> exit 1, SURVIVED               (a harness that cannot fail)
#   gutted         -> exit 0, KILLED-TEST            (a harness that cannot kill)
#   non-compiling  -> exit 2, SKIPPED-NOCOMPILE      (the compile probe, which
#                                                     does not run on this path
#                                                     unless the wrapper runs it)
#   runaway alloc  -> exit 0, KILLED-OOM             (the classification itself)
#
# The first three run against internal/mutationfixture/compileprobe, the frozen
# fixture `make mutation-probe-check` also uses. The fourth builds a throwaway
# module in a temp directory: allocating without bound is not something to add
# to this repository's source, and a synthetic case is deterministic where a
# real runaway mutant depends on which technique file is being mutated.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$SCRIPT_DIR/ci-exec.sh"
API="${1:-$(cd "$SCRIPT_DIR/../../api" && pwd)}"
ADDRESS_SPACE_KB=${MUTATION_ADDRESS_SPACE_KB:-3000000}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
log="$work/audit.log"
failures=0

# Asserts on both halves of a verdict: the exit code go-mutesting acts on, and
# the classification the audit is read from. A wrapper can preserve the contract
# and still bucket every kill wrongly, which would leave the audit useless while
# looking healthy.
expect() {
  local label=$1 want_exit=$2 want_verdict=$3 got_exit=$4
  local got_verdict
  got_verdict=$(tail -n 1 "$log" 2>/dev/null | awk '{print $1}')
  if [ "$got_exit" = "$want_exit" ] && [ "$got_verdict" = "$want_verdict" ]; then
    printf 'PASS  %-16s exit %s, %s\n' "$label" "$got_exit" "$got_verdict"
  else
    printf 'FAIL  %-16s exit %s (want %s), %s (want %s)\n' \
      "$label" "$got_exit" "$want_exit" "${got_verdict:-none}" "$want_verdict"
    failures=$((failures + 1))
  fi
}

run_wrapper() {
  local mutant=$1 original=$2 pkg=$3 dir=$4
  (
    cd "$dir" || exit 3
    ulimit -v "$ADDRESS_SPACE_KB"
    MUTATE_CHANGED="$mutant" MUTATE_ORIGINAL="$original" MUTATE_PACKAGE="$pkg" \
      MUTATE_TIMEOUT=300 MUTATION_AUDIT_LOG="$log" "$WRAPPER"
  )
}

FIXTURE="$API/internal/mutationfixture/compileprobe/compileprobe.go"
FIXTURE_PKG=sudoku-api/internal/mutationfixture/compileprobe

cp "$FIXTURE" "$work/unmutated.go"
run_wrapper "$work/unmutated.go" "$FIXTURE" "$FIXTURE_PKG" "$API"
expect "unmutated" 1 SURVIVED $?

sed 's/return r\[0\]/return 0/' "$FIXTURE" > "$work/gutted.go"
run_wrapper "$work/gutted.go" "$FIXTURE" "$FIXTURE_PKG" "$API"
expect "gutted" 0 KILLED-TEST $?

# A negative constant index: the fixture's own frozen non-compiling case.
sed 's/return r\[0\]/return r[-1]/' "$FIXTURE" > "$work/nocompile.go"
run_wrapper "$work/nocompile.go" "$FIXTURE" "$FIXTURE_PKG" "$API"
expect "non-compiling" 2 SKIPPED-NOCOMPILE $?

# The fixture must be back exactly as it was after all three. If the wrapper
# ever fails to restore, the next mutant is applied on top of a mutated file and
# every later failure is scored a kill, which is a whole run of wrong numbers.
if cmp -s "$FIXTURE" "$work/unmutated.go"; then
  echo "PASS  restore          fixture unchanged after three mutations"
else
  echo "FAIL  restore          fixture was NOT restored"
  failures=$((failures + 1))
fi

# Runaway allocation, in a throwaway module so nothing here touches the repo.
runaway="$work/runaway"
mkdir -p "$runaway"
cat > "$runaway/go.mod" <<'GOMOD'
module runaway

go 1.26
GOMOD
cat > "$runaway/runaway.go" <<'GO'
package runaway

// Grow appends until it is stopped, which under an address-space cap is a Go
// runtime out-of-memory rather than a test failure.
func Grow(bounded bool) int {
	var acc [][]byte
	for i := 0; bounded && i < 1 || !bounded; i++ {
		acc = append(acc, make([]byte, 1<<20))
	}
	return len(acc)
}
GO
cat > "$runaway/runaway_test.go" <<'GO'
package runaway

import "testing"

func TestGrowStopsWhenBounded(t *testing.T) {
	if got := Grow(true); got != 1 {
		t.Fatalf("Grow(true) = %d, want 1", got)
	}
}
GO
cp "$runaway/runaway.go" "$work/runaway-original.go"
# The mutant: drop the bound, exactly as a loop-condition mutator would.
sed 's/bounded \&\& i < 1 || !bounded/true/' "$runaway/runaway.go" \
  > "$work/runaway-mutant.go"
run_wrapper "$work/runaway-mutant.go" "$runaway/runaway.go" . "$runaway"
expect "runaway alloc" 0 KILLED-OOM $?

echo
if [ "$failures" -eq 0 ]; then
  echo "calibrate-ci-exec.sh: all four directions calibrated."
  exit 0
fi
echo "calibrate-ci-exec.sh: $failures case(s) failed. Do NOT run a measurement"
echo "with this wrapper: a broken exit contract corrupts scores silently."
exit 1
