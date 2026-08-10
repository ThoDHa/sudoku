#!/usr/bin/env bash
# go-mutesting --exec wrapper that records WHY each mutant died.
#
# go-mutesting's built-in runner reads one `go test` exit code and keeps none of
# the output, so a mutant that the address-space cap killed (`ulimit -v`, see
# MUTATION_ADDRESS_SPACE_KB) is recorded identically to one an assertion caught.
# The audit that question needs can only be built where the output still exists,
# which is here. Each verdict is appended to $MUTATION_AUDIT_LOG, one line per
# mutant, keyed by the mutation file path that also appears in report.json's
# processOutput, so a log line and a report entry can be joined.
#
# THE EXIT CONTRACT IS THE WHOLE RISK. cmd/go-mutesting/main.go reads this
# script's exit code directly, with no mapping:
#
#   0 -> killed    1 -> escaped    2 -> skipped (did not compile)    other -> errored
#
# Get it backwards and every score the tool reports is fiction, and it fails
# quietly: a harness that can only report kills reads as a perfect score. Run
# tools/mutation/calibrate-ci-exec.sh after every edit to this file. It asserts
# all four directions in about ten seconds; tools/mutation/README.md records the
# results and the same-code control that showed no score moved.
#
# Exit 3 is reserved for this script failing at its own job (it cannot back up
# the original, say). go-mutesting records that as errored, which the efficacy
# denominator excludes, so a broken wrapper shows up as a visible count rather
# than as inflated kills.
#
# This script must reproduce the built-in runner exactly apart from the logging,
# because the scores must not move. Two of those obligations are easy to miss:
#
#   * The compile probe. patches/go-mutesting-v2.3.1-compile-probe.patch teaches
#     the BUILT-IN runner that a mutant which does not compile is skipped, not
#     killed; that patch does not run on this path. Without the `go test -c`
#     below, non-compiling mutants would be scored as kills again, which the
#     patch header measured at 11.07% of dp, 16.99% of human and ~9.07% of
#     techniques.
#   * The per-mutant timeout. go-mutesting applies --exec-timeout only in its
#     built-in runner ("TODO timeout here" on the exec path), so the budget has
#     to be handed to `go test` here, from MUTATE_TIMEOUT, which carries the
#     same value.
set -u

: "${MUTATE_CHANGED:?go-mutesting must supply the mutated file}"
: "${MUTATE_ORIGINAL:?go-mutesting must supply the original file}"
: "${MUTATE_PACKAGE:?go-mutesting must supply the package import path}"

AUDIT_LOG="${MUTATION_AUDIT_LOG:-mutation-audit.log}"
TIMEOUT_SECONDS="${MUTATE_TIMEOUT:-300}"

# Exit codes, named because reading them as bare integers is how the contract
# gets inverted.
readonly EXIT_KILLED=0
readonly EXIT_ESCAPED=1
readonly EXIT_DID_NOT_COMPILE=2
readonly EXIT_WRAPPER_FAILED=3

# Patterns that mean the address-space cap (or an external OOM killer) ended the
# process, rather than a test detecting anything. The first two are measured
# output from the known runaway mutant (the AIC BFS dequeue, `queue = queue[1:]`
# mutated to `queue[0:]`) under `ulimit -v 3000000` on go1.26:
#
#   runtime: out of memory: cannot allocate 406847488-byte block (1387921408 in use)
#   fatal error: out of memory
#
# The rest are the other shapes the same condition takes and cannot be assumed
# absent: the runtime words an allocation failure differently depending on which
# allocator path fails, an address-space cap also blocks thread creation, and a
# cgroup or the kernel OOM killer sends SIGKILL instead, which `go test` reports
# as "signal: killed". Anything killed with none of these is NOT assumed genuine;
# it is logged as unclassified with its output tail (see below).
readonly OOM_PATTERNS='runtime: out of memory|fatal error: out of memory|out of memory allocating heap|runtime: cannot allocate memory|cannot allocate memory|runtime: failed to create new OS thread|newosproc|not in usable address space|runtime: address space conflict|signal: killed|signal: SIGKILL'

# A crash that is not an allocation failure. The mutant really did change
# observable behaviour, so this is a genuine kill and is bucketed apart from the
# unclassified ones rather than left to look like a mystery.
readonly CRASH_PATTERNS='^panic:|^fatal error:|^\[signal SIGSEGV'

# The other kill nobody's tests earned: the mutant outlived --exec-timeout and
# the timeout panic exited non-zero. Bucketed separately for the same reason the
# cap kills are, since neither says a test caught anything.
readonly TIMEOUT_PATTERNS='panic: test timed out after'

work=$(mktemp -d) || exit "$EXIT_WRAPPER_FAILED"
backup="$work/original"
output="$work/output"
mkdir -p "$(dirname "$AUDIT_LOG")" 2>/dev/null

# The original file is restored on EVERY exit path. go-mutesting does not touch
# it on this path, so a wrapper that dies without restoring leaves a mutated
# source in the tree and every later mutant is applied on top of it: the suite
# then fails for unrelated reasons and each failure is scored a kill.
restore() {
  local status=$?
  if [ -f "$backup" ]; then
    cp "$backup" "$MUTATE_ORIGINAL" || {
      echo "ci-exec.sh: FAILED to restore $MUTATE_ORIGINAL from $backup" >&2
      rm -rf "$work"
      exit "$EXIT_WRAPPER_FAILED"
    }
  fi
  rm -rf "$work"
  exit "$status"
}
trap restore EXIT

cp "$MUTATE_ORIGINAL" "$backup" || exit "$EXIT_WRAPPER_FAILED"
cp "$MUTATE_CHANGED" "$MUTATE_ORIGINAL" || exit "$EXIT_WRAPPER_FAILED"

# Where the mutant sits, taken from the diff the same way go-mutesting's own
# built-in runner takes it. The exec path never populates originalStartLine in
# report.json, so without this the audit could name the file but not the line.
start_line=$(diff -u "$backup" "$MUTATE_CHANGED" 2>/dev/null |
  sed -n 's/^@@ -\([0-9]*\).*/\1/p' | head -1)

first_match() {
  grep -m1 -E "$1" "$output" 2>/dev/null | tr -d '\000' | tr '\n' ' ' | cut -c1-200
}

log() {
  local verdict=$1 detail=$2
  printf '%s %s:%s %s %ss %s\n' \
    "$verdict" "$MUTATE_ORIGINAL" "${start_line:-?}" "$MUTATE_CHANGED" \
    "$SECONDS" "$detail" >> "$AUDIT_LOG"
}

# An unclassified kill is the one outcome that must never be quietly bucketed as
# genuine, so it carries its own evidence. The tail is indented behind a marker
# that cannot collide with a verdict line, keeping `grep -c '^KILLED-OOM'` exact.
log_tail() {
  {
    tail -n 25 "$output" 2>/dev/null | tr -d '\000' | sed 's/^/  | /'
    echo "  | ---"
  } >> "$AUDIT_LOG"
}

# A mutant that does not compile is skipped, not killed. See the header.
if ! go test -c -o /dev/null "$MUTATE_PACKAGE" > "$output" 2>&1; then
  if grep -qE "$OOM_PATTERNS" "$output"; then
    log "SKIPPED-NOCOMPILE-OOM" "$(first_match "$OOM_PATTERNS")"
    log_tail
  else
    log "SKIPPED-NOCOMPILE" "$(first_match '.')"
  fi
  exit "$EXIT_DID_NOT_COMPILE"
fi

if go test -timeout "${TIMEOUT_SECONDS}s" "$MUTATE_PACKAGE" > "$output" 2>&1; then
  log "SURVIVED" "-"
  exit "$EXIT_ESCAPED"
fi

# Killed. Which of the three reasons decides whether the headline score earned
# this one. A test failure outranks an allocation failure: if an assertion
# already caught the mutant, the cap did not need to, and the kill is genuine
# whether or not a later test also ran the machine out of memory. That case is
# still visible, through the oom=yes flag rather than a separate bucket.
oom_flag=""
if grep -qE "$OOM_PATTERNS" "$output"; then
  oom_flag=" oom=yes"
fi

if grep -q -- '--- FAIL:' "$output"; then
  log "KILLED-TEST" "$(grep -m3 -- '--- FAIL:' "$output" | tr '\n' ' ')$oom_flag"
elif [ -n "$oom_flag" ]; then
  log "KILLED-OOM" "$(first_match "$OOM_PATTERNS")"
elif grep -qE "$TIMEOUT_PATTERNS" "$output"; then
  log "KILLED-TIMEOUT" "$(first_match "$TIMEOUT_PATTERNS")"
elif grep -qE "$CRASH_PATTERNS" "$output"; then
  log "KILLED-CRASH" "$(first_match "$CRASH_PATTERNS")"
else
  log "KILLED-UNCLASSIFIED" "no --- FAIL:, no OOM marker, no crash marker"
  log_tail
fi

exit "$EXIT_KILLED"
