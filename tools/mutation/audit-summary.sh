#!/usr/bin/env bash
# Summarise one ci-exec.sh audit log as a markdown block.
#
#   audit-summary.sh <scope-label> <audit-log-path>
#
# The log is uploaded with the run's report, so the counts are always
# recoverable with `grep -c`. This exists so nobody has to: a scope whose kills
# came from the memory cap rather than from its tests should be readable in the
# run itself, not only by someone who already suspects it and downloads the
# artifact. Written to stdout for redirection into $GITHUB_STEP_SUMMARY.
set -u

label=${1:?scope label}
log=${2:?audit log path}

echo "### Mutation kill audit: $label"
echo

if [ ! -s "$log" ]; then
  echo "No audit log at \`$log\`. The run produced no classified verdicts,"
  echo "so this scope's kills are unaudited: treat its score as unexplained."
  exit 0
fi

# Verdict lines start at column zero; the raw output tails ci-exec.sh records
# for anything it could not classify are indented behind '  | ', so they cannot
# be counted as verdicts here.
count() { grep -c "^$1 " "$log" || true; }

echo "| Verdict | Mutants | Meaning |"
echo "|---------|--------:|---------|"
echo "| KILLED-TEST | $(count KILLED-TEST) | a test asserted the difference |"
echo "| KILLED-CRASH | $(count KILLED-CRASH) | the mutant panicked, which is a real behaviour change |"
echo "| KILLED-OOM | $(count KILLED-OOM) | the address-space cap ended it, no test caught it |"
echo "| KILLED-TIMEOUT | $(count KILLED-TIMEOUT) | it outlived --exec-timeout, no test caught it |"
echo "| KILLED-UNCLASSIFIED | $(count KILLED-UNCLASSIFIED) | killed for a reason this script does not recognise |"
echo "| SURVIVED | $(count SURVIVED) | escaped |"
echo "| SKIPPED-NOCOMPILE | $(count SKIPPED-NOCOMPILE) | never compiled, excluded from the score |"
echo "| SKIPPED-NOCOMPILE-OOM | $(count SKIPPED-NOCOMPILE-OOM) | the cap stopped the compile |"
echo

unearned=$(( $(count KILLED-OOM) + $(count KILLED-TIMEOUT) + $(count KILLED-UNCLASSIFIED) ))
if [ "$unearned" -gt 0 ]; then
  echo "$unearned kill(s) in this scope were not demonstrably earned by a test."
  echo "The score above counts them as kills, so it overstates test efficacy by"
  echo "that many mutants. Raw output tails for the unclassified ones are in the"
  echo "log, indented behind \`  | \`."
else
  echo "Every kill in this scope was earned by a failing test or a mutant crash."
fi
