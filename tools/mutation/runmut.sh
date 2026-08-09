#!/usr/bin/env bash
# go-mutesting --exec script.
# Contract (calibrated against /bin/true): exit 0 => recorded KILLED (PASS),
# exit 1 => recorded ESCAPED (FAIL).
set -u
: "${MUTATE_CHANGED:?}"
: "${MUTATE_ORIGINAL:?}"

hash=$(md5sum "$MUTATE_CHANGED" | cut -d' ' -f1)
backup=$(mktemp)
cp "$MUTATE_ORIGINAL" "$backup"
restore() { cp "$backup" "$MUTATE_ORIGINAL"; rm -f "$backup"; }
trap restore EXIT

cp "$MUTATE_CHANGED" "$MUTATE_ORIGINAL"

cd "$MUT_DIR" || exit 0
if timeout "${MUT_TIMEOUT:-60}" go test -count=1 \
     ${MUT_SKIP:+-skip "$MUT_SKIP"} ${MUT_RUN:+-run "$MUT_RUN"} \
     "$MUT_PKG" >/dev/null 2>&1; then
  echo "SURVIVED $hash" >> "$MUT_LOG"
  exit 1
else
  echo "KILLED $hash" >> "$MUT_LOG"
  exit 0
fi
