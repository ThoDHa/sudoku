#!/usr/bin/env bash
# Select the newest successful run of a nightly workflow that still has
# non-expired artifacts. The latest successful run alone is not a reliable
# owner of the live artifacts: on a quiet tree the Profiling Gate's skip
# mode succeeds with zero artifacts and then shadows the older run that
# actually holds them (see nightly-profiling.yml).
#
# Usage: pick-nightly-run.sh <workflow-file>
#
# Arguments:
#   workflow-file: the workflow's file name as gh expects it, e.g.
#     nightly-profiling.yml
#
# Environment:
#   GH_TOKEN: token used for both gh commands (required)
#   GH_REPO:  "owner/repo" identifying the repository; when only
#             GITHUB_REPOSITORY is set (Actions always sets it), it is
#             re-exported as GH_REPO because gh run list ignores
#             GITHUB_REPOSITORY
#
# Output:
#   "<run_id> <earliest_expiry>" for the newest qualifying run, where
#   earliest_expiry is the run's earliest non-expired artifact expiry in
#   ISO 8601; empty output with exit 0 when no successful run within the
#   walked window qualifies.
#
# Errors:
#   exits 2 on wrong usage, 1 when the repository cannot be resolved, and
#   propagates gh failures (each gh call is retried up to 2 times, 3
#   attempts 2s apart, before its failure propagates); callers that treat
#   this as best-effort must contain those themselves.

set -euo pipefail

# Cap follows the deepest known artifact shadow: nightly-mutation's
# retention math (30 days minus 2 slack) allows ~28 consecutive green
# skip-nights between measuring runs, so anything shorter can miss the
# run that actually holds the artifacts.
MAX_RUNS_CHECKED=30

# Retry bound for transient gh failures (5xx, rate-limit hiccups): a
# single 502 must not red-fail the weekly gate.
MAX_GH_ATTEMPTS=3
GH_RETRY_SLEEP_SECONDS=2

# Runs gh with the given arguments, retrying on failure up to
# MAX_GH_ATTEMPTS attempts with GH_RETRY_SLEEP_SECONDS between attempts.
# Returns 1 (with gh's stderr already on stderr) once the attempts are
# exhausted, so persistent failures propagate to the caller.
gh_retry() {
  local attempt=1
  until gh "$@"; do
    if [ "$attempt" -ge "$MAX_GH_ATTEMPTS" ]; then
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "$GH_RETRY_SLEEP_SECONDS"
  done
}

if [ "$#" -ne 1 ]; then
  echo "usage: $(basename "$0") <workflow-file>" >&2
  exit 2
fi

workflow=$1
repo=${GH_REPO:-${GITHUB_REPOSITORY:-}}
if [ -z "$repo" ]; then
  echo "error: GH_REPO or GITHUB_REPOSITORY must be set to resolve the repository" >&2
  exit 1
fi
export GH_REPO="$repo"

run_ids=$(gh_retry run list --workflow="$workflow" --status=success \
  --limit "$MAX_RUNS_CHECKED" --json databaseId --jq '.[].databaseId')

for run_id in $run_ids; do
  # per_page guards the qualification of measuring runs against the API's
  # 30-artifact default page: more than 30 artifacts must not look empty.
  earliest_expiry=$(gh_retry api "repos/${repo}/actions/runs/${run_id}/artifacts?per_page=100" \
    --jq '[.artifacts[] | select(.expired == false and .expires_at != null) | .expires_at] | min // ""')
  if [ -n "$earliest_expiry" ]; then
    echo "$run_id $earliest_expiry"
    exit 0
  fi
done
