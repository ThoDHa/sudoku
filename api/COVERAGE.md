# Go Coverage Gate

The Go coverage gate enforces per-package coverage floors in CI. It runs in
the `test-go` job of `.github/workflows/deploy.yml` on every push and pull
request, immediately after the JUnit test step. A package whose coverage falls
below its floor fails the build.

The gate lives in `api/Makefile` as the `coverage-gate` target. Run it locally
from the `api/` directory:

```
make coverage-gate
```

## Why a gate

Before the gate existed, coverage floors were stated as task invariants but
never enforced. A coverage regression could ship unnoticed. The gate turns the
floor into a real contract, mirroring the way the frontend already enforces its
own thresholds in `frontend/vite.config.ts`.

## Floors

| Package | Floor | Measured baseline | Headroom |
|---------|-------|-------------------|----------|
| `./internal/sudoku/dp` | 99% | 99.4% | 0.4pp |
| `./internal/sudoku/human` | 99% | 100.0% | 1.0pp |
| `./internal/sudoku/human/techniques` | 99% | 99.1% | 0.1pp |
| `./internal/sudoku/diagnosis` | 98% | 98.6% | 0.6pp |

Floors are encoded as Make variables at the top of the `coverage-gate` target
in `api/Makefile` (`DP_COVERAGE_FLOOR`, `HUMAN_COVERAGE_FLOOR`,
`TECHNIQUES_COVERAGE_FLOOR`, `DIAGNOSIS_COVERAGE_FLOOR`).

`./internal/transport/http` is intentionally NOT gated: it is a dev-only HTTP
harness (ARCH-2; see `internal/transport/http/doc.go`) that is never built for
production, so it carries no production coverage floor. Its tests still run
under `go test ./...`.

### Why the floors sit just below the measured baselines

COV-1 drove every gated package to an honest ceiling: `human` reaches a full
100%, `dp` 99.4%, and `techniques` 99.1%. The residual sub-100 in each of the
latter two is genuinely unreachable defensive code, not a testing gap:
`len(...) == 0` guards behind invariants that guarantee non-empty slices,
bivalue-mask length checks that are always exactly 2, ascending-index swaps
that never fire, `json.Marshal` error paths on all-string structs that cannot
fail, and a greedy-carve floor `break` that empirical probing never reaches.
These are conceded honestly rather than covered with contrived tests or by
deleting the guards.

Coverage percentages can still drift a fraction across Go versions, test
ordering, and platforms, so the floors sit one point below the measured
baseline (99% vs. the 99.1-100% measured). This absorbs that variance while
still catching genuine regressions, mirroring the frontend philosophy in
`frontend/vite.config.ts`, whose deterministic vitest coverage is now pinned at
a hard 100% contract.

`dp` and `human` are newly gated by COV-1; `techniques` (was 85%) had its
floor raised to reflect and protect the coverage the package now genuinely
carries. `transport/http` (was 95%) was removed from the gate by ARCH-2 when
the package was quarantined as a dev-only harness.

## How to read a failure

When a package falls below its floor, the gate prints a line like this to
stderr and exits non-zero:

```
coverage-gate: FAIL ./internal/sudoku/human/techniques 83.4% < floor 85% (short by 1.6pp)
```

The line names the package, the measured coverage, the floor, and the shortfall
in percentage points. A CI failure on this step means a change reduced real
test coverage of a gated package below its contract; add or restore tests
before merging.

If the gate cannot run `go test` or cannot parse the coverage line, it prints
an `ERROR` line with the raw `go test` output and exits 2. Treat that as a
gate malfunction, not a coverage regression, and investigate the parse path.

## How to update a baseline

When measured coverage durably moves (for example, after adding meaningful new
tests, or after a deliberate reduction in tested surface):

1. Re-measure the package from the `api/` directory:
   ```
   go test -cover ./internal/sudoku/human/techniques/
   ```
2. Set the floor in `api/Makefile` to a value 3 to 4 percentage points below
   the new measured baseline, following the headroom practice above.
3. Update the "Measured baseline" and "Headroom" columns in the table above to
   match.
4. Run `make coverage-gate` to confirm it passes at the new floor.
5. If the change is a lowering of a floor (relaxing the contract), call that
   out explicitly in the commit message so reviewers see the trade.

## Scope

Only the four packages above are gated today. Other packages in the module are
tested by the existing suite but have no per-package floor. Add a new package
to the gate by introducing a `*_COVERAGE_FLOOR` variable and an additional
`check_pkg` call in the `coverage-gate` target, plus a row in the table above.
