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
| `./internal/sudoku/human/techniques` | 85% | 93.3% | 8.3pp |
| `./internal/transport/http` | 95% | 97.4% | 2.4pp |

Floors are encoded as Make variables at the top of the `coverage-gate` target
in `api/Makefile` (`TECHNIQUES_COVERAGE_FLOOR`, `TRANSPORT_HTTP_COVERAGE_FLOOR`).

### Why the floors sit below the measured baselines

Coverage percentages fluctuate slightly across Go versions, test ordering, and
platforms. Setting a floor exactly at the measured value would flap: a 0.1pp
drift on a toolchain upgrade would fail the build for no real regression. The
floors sit a few percentage points below the measured baseline to
absorb this variance while still catching genuine regressions. This mirrors the
frontend philosophy in `frontend/vite.config.ts`, where floors sit about 4pp
below measured coverage.

The `transport/http` floor is a round 95%, a couple of points below the
package's measured 97.4%. It supersedes the historical `>= 80%` acceptance
contract: coverage has since climbed well above that minimum, so the floor was
raised to reflect and protect the real coverage rather than a long-obsolete
threshold, while keeping ~2.4pp of headroom against cross-platform variance.

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
   go test -cover ./internal/transport/http/
   ```
2. Set the floor in `api/Makefile` to a value 3 to 4 percentage points below
   the new measured baseline, following the headroom practice above.
3. Update the "Measured baseline" and "Headroom" columns in the table above to
   match.
4. Run `make coverage-gate` to confirm it passes at the new floor.
5. If the change is a lowering of a floor (relaxing the contract), call that
   out explicitly in the commit message so reviewers see the trade.

## Scope

Only the two packages above are gated today. Other packages in the module are
tested by the existing suite but have no per-package floor. Add a new package
to the gate by introducing a `*_COVERAGE_FLOOR` variable and an additional
`check_pkg` call in the `coverage-gate` target, plus a row in the table above.
