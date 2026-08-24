# Mutation instruments

Two instruments share this directory, and they share one hazard.

**The local sweep** (`sweep.sh`, `confirm.py`, `runmut.sh`) is fast iteration
tooling for closing Go mutation escapes, built and calibrated during the MUT-6
campaign that took `dp`, `human` and all 22 techniques shards to zero escapes.
The honest, gating measurement remains `make mutation-go` / CI; this exists
because that measurement costs ~32s per mutant, which makes a 200-mutant file a
two-hour wait per iteration. The sweep turns that into minutes without
sacrificing soundness.

**The CI kill audit** (`ci-exec.sh`, `audit-summary.sh`, `calibrate-ci-exec.sh`)
records why each mutant died during the nightly run, so a kill the memory cap
produced can be told from one a test earned. See
[The CI kill audit](#the-ci-kill-audit).

The shared hazard is that both are `--exec` scripts, and go-mutesting reads an
exec script's exit code as the verdict itself. An inverted contract does not
error; it produces confident, wrong numbers. [Calibration](#calibration) governs
both for that reason.

The floors these sweeps feed live in `api/mutation-floors.json`; how they are
raised (and why hand edits are forbidden) is documented in that file's
`_ratchet` block.

## The two-stage sweep

**Stage 1, `sweep.sh`, is a filter.** It runs the package suite with the two
slow curated-fixture drivers skipped (~3s per mutant instead of ~32s). Skipping
tests can only convert a kill into a reported survivor, never the reverse, so
stage 1's survivor set is a strict over-approximation: no true escape can be
lost, and a stage-1 count of zero is conclusive.

**Stage 2, `confirm.py`, is the measurement.** It applies each stage-1 survivor
to the real file and runs the complete suite. Its output is the genuine escape
set. Stage 1 typically leaves a few dozen candidates, so stage 2 costs minutes.

```sh
# In a dedicated worktree (see Isolation):
tools/mutation/sweep.sh mylabel ur.go /path/to/worktree/api /tmp/out
python3 tools/mutation/confirm.py /tmp/out/mylabel-report.json /tmp/out/confirmed.json /path/to/worktree/api
```

**Do not write a test for a stage-1 survivor before stage 2 confirms it.** On
one shard, 16 of 50 stage-1 survivors were already dead at the hands of the
skipped drivers; on another, 13 of 37. Testing unconfirmed survivors wastes
roughly a third of the effort.

**Scopes covered mainly by the curated drivers** invert the economics: on `aic`,
143 of 163 mutants survived the fast pass because the file is covered almost
entirely through those drivers. The fix is a scope-specific exec script that
adds the scope's own fixture slug (`-run 'TestCuratedFixtures(SolveBoard|FireTargetTechnique)/^aic$'`,
~2.4s) as a second leg after the fast pass. Adding a leg preserves the
over-approximation property.

## Calibration

`runmut.sh` and `ci-exec.sh` both implement the exec contract, which
`cmd/go-mutesting/main.go` reads straight off the exit code with no mapping:
**exit 0 is recorded KILLED, exit 1 is recorded ESCAPED, exit 2 is recorded
SKIPPED, anything else is recorded ERRORED.** Never trust a harness variant
without calibrating both directions first:

- Run it on the unmutated file: it must report SURVIVED. A harness that
  cannot fail invents kills (see Hazards).
- Gut the scope's entry point (`return nil` first line) and run it: it must
  report KILLED. `--exec=/bin/true` also serves as a generation-only control
  and mutant counter (~6s for a whole file).

For `ci-exec.sh` this is automated: `calibrate-ci-exec.sh` drives all four
directions in about ten seconds and refuses to pass on any one of them. Run it
after every edit to that script. Calibrating only the kill direction is the
dangerous half-measure, because a harness that can only report kills reads as a
perfect score.

## The CI kill audit

`ci-exec.sh` is the `--exec` script the nightly workflow's `go-mutation` and
`techniques-mutation` jobs run. It answers a question the reports could not:
**how many of the reported kills did a test actually earn?**

CI caps address space (`ulimit -v`, `MUTATION_ADDRESS_SPACE_KB`) so that a
mutant turning a bounded loop into unbounded allocation dies alone instead of
taking the runner down with it. Such a mutant exits non-zero, and go-mutesting
scores any non-zero exit as a kill, so a cap kill and an assertion kill are the
same event as far as the score is concerned. The reports cannot settle it
afterwards: all 4,692 killed entries across the 24 reports of run 31276617045
carry only go-mutesting's own `PASS` line in `processOutput`, and the `go test`
output is discarded. The audit therefore has to be built where that output still
exists, which is the exec layer.

One line per mutant is appended to `$MUTATION_AUDIT_LOG`, which the workflow
points inside the directory it already uploads, so the audit rides along with
the report and costs no new artifact. The fields are
`<verdict> <source-file>:<line> <mutation-file> <seconds> <evidence>`, and the
mutation file is the same path go-mutesting writes into that mutant's
`processOutput`, which is what lets a log line and a report entry be joined:

| Verdict | Exit | Recorded as | Meaning |
|---------|------|-------------|---------|
| `KILLED-TEST` | 0 | killed | a test asserted the difference |
| `KILLED-CRASH` | 0 | killed | the mutant panicked, a real behaviour change |
| `KILLED-OOM` | 0 | killed | the cap ended it and no test caught it |
| `KILLED-TIMEOUT` | 0 | killed | it outlived `--exec-timeout`, no test caught it |
| `KILLED-UNCLASSIFIED` | 0 | killed | killed for a reason the script does not recognise |
| `SURVIVED` | 1 | escaped | an escape |
| `SKIPPED-NOCOMPILE` | 2 | skipped | never compiled, out of the denominator |
| `SKIPPED-NOCOMPILE-OOM` | 2 | skipped | the cap stopped the compile |

Each log sits beside the `report.json` it describes, as
`reports/mutation/internal-sudoku-dp/audit.log` and
`reports/mutation/techniques-shard-aic/audit.log`, so it needs no artifact of
its own. Answering the audit question is one grep over the downloaded artifacts:

```sh
grep -c '^KILLED-OOM ' reports/mutation/*/audit.log
```

The verdict lines start at column zero and the raw tails are indented, so the
count is exact. `audit-summary.sh` prints the whole table into the run summary
as well, which is what makes an unearned kill visible to somebody who was not
already looking for one.

A test failure outranks an allocation failure. If an assertion already caught
the mutant, the cap did not need to, and the kill is genuine whether or not a
later test also exhausted memory; that case stays visible through an `oom=yes`
flag on the `KILLED-TEST` line rather than a separate bucket.

**Nothing is bucketed as genuine by assumption.** The OOM patterns are matched,
not guessed: `runtime: out of memory` and `fatal error: out of memory` are the
measured output of the known AIC dequeue runaway under the cap on go1.26, and
the script also matches the other shapes the same condition takes (a cap blocks
thread creation as well as allocation, and a cgroup or the kernel OOM killer
sends SIGKILL, which `go test` reports as `signal: killed`). A kill matching
none of the patterns is recorded as `KILLED-UNCLASSIFIED` with the last 25 lines
of its output indented behind `  | `, so it can be diagnosed without re-running
anything.

### What the exec path costs

go-mutesting's exec path is not its built-in path with a hook added. It is a
different path that skips work the built-in one does, and every omission below
corrupts scores if the wrapper does not carry it:

- **The compile probe.** `api/patches/go-mutesting-v2.3.1-compile-probe.patch`
  teaches the *built-in* runner that a mutant which does not compile is skipped
  rather than killed. That patch does not run on the exec path. `ci-exec.sh`
  runs the same `go test -c -o /dev/null` before the suite; without it the
  defect the patch fixed returns in full, and the patch header measured that at
  11.07% of `dp` mutants, 16.99% of `human` and ~9.07% of techniques.
- **The per-mutant timeout.** `--exec-timeout` is applied only by the built-in
  runner; the exec path carries a literal `TODO timeout here` where the budget
  would be. The wrapper hands `MUTATE_TIMEOUT`, which carries the same value, to
  `go test -timeout`.
- **The file swap.** go-mutesting does not apply the mutant on this path, so
  the wrapper copies it over the original and restores on every exit path.

The genuine cost, paid knowingly: `report.json` entries lose `diff` and
`originalStartLine`, which only the built-in runner fills in. Nothing gates on
either (`mutation_floors.py` and `mutation_aggregate.py` read only the `stats`
counts), the complete `originalSourceCode` and `mutatedSourceCode` are still
recorded so a diff is reconstructable, and the audit log carries `file:line` for
every mutant including the survivors. The information moved; it did not
disappear.

### Calibration and the control, as measured

Two things had to be shown before this wrapper was allowed near a score, and
both are re-runnable:

1. **The contract, in all four directions.** `calibrate-ci-exec.sh` asserts the
   exit code *and* the verdict for an unmutated file, a gutted entry point, a
   non-compiling mutant, and a runaway allocation, then asserts the original
   file was restored.
2. **The same-code control.** go-mutesting run twice over identical source,
   once with its built-in runner exactly as CI invokes it and once through the
   wrapper. The stats must be identical, because a wrapper that changes a score
   is a wrapper that broke something.

Measured on go1.26.4 under `ulimit -v 3000000`, built-in runner against
`ci-exec.sh` over identical source:

| Control | total | killed | escaped | skipped |
|---------|------:|-------:|--------:|--------:|
| `internal/mutationfixture/compileprobe` | 4 = 4 | 1 = 1 | 1 = 1 | 2 = 2 |
| `pkg/config` | 7 = 7 | 3 = 3 | 4 = 4 | 0 = 0 |
| `techniques/aic.go --match '^bfsAIC$'` | 29 = 29 | 24 = 24 | 0 = 0 | 5 = 5 |

The `aic` row is the decisive one. It is a scope an actual floor gates at 100, it
puts the compile probe against real technique code rather than a four-mutant
fixture (5 of its 29 mutants never compiled, and both runners skipped the same
5), and it is the scope that contains the real runaway mutant, so it is the one
control where the built-in runner and the wrapper had to agree about a mutant
the memory cap killed. They did. The other two rows cover verdicts `aic` does
not reach: `pkg/config` supplies escapes, which is the direction a broken
harness fails silently in.

That same run produced the first measurement of the thing this audit exists for.
Of 24 kills in `bfsAIC`, **2 were memory-cap kills**, both the BFS dequeue at
`aic.go:163` under `runtime: out of memory`. No test caught either one; the score
counts them as kills regardless. That is 8.3% of that scope's kills, which is
the size of the hole the headline 100% was hiding there.

**What these controls do not cover, stated so nobody assumes otherwise.** No
whole gated scope has been controlled: `dp`, `human` and every full techniques
shard cost hours at roughly a minute or more per mutant, and `aic` was bounded
to one function. The first nightly run is therefore the remaining control:
compare its per-scope killed and escaped counts against the previous run's on
unchanged code, and treat any movement as a wrapper defect until proven
otherwise, not as a code regression. The floors are all at 100, so any
regression this could introduce reds the gate rather than passing silently,
which is the safe direction for a change that has not yet run in CI.

`make mutation-go` still uses the built-in runner, so the local gate and the CI
gate now reach their identical verdicts by different routes. That asymmetry is
deliberate (a local run keeps the richer `diff` and `originalStartLine` in its
report) and it is exactly what the control above exists to keep honest. Re-run
both checks after any edit to `ci-exec.sh`; the local sweep's own harness,
`runmut.sh`, is unaffected by all of this.

## Isolation

Mutation rewrites the target file in place for the entire sweep.

- `make mutation-go` isolates itself: it refuses to start while `api/` or
  `frontend/puzzles.json` is dirty (a worktree of HEAD would measure different
  code than the editor holds), then runs the whole sweep inside a throwaway
  detached `git worktree`
  and tears it down on exit, copying `reports/mutation/` back. The developer's
  checkout is never written, so interrupting the run at any point (Ctrl-C,
  timeout, OOM, `kill -9`) cannot leave a mutant in it. CI needs none of this
  and must not gain it: every nightly job starts from a fresh checkout and
  calls go-mutesting directly with `ci-exec.sh`, not through this target.
- `make mutation-probe-check` (and therefore `make mutation-install`, whose
  final step it is) also never touches the checkout: it probes a minimal copy
  of the compileprobe fixture (plus `go.mod`/`go.sum`) in a scratch tmpdir.
  That copy is exempt from the partial-copy hazard below for one reason only:
  the fixture is hermetic (its sole import is `testing`, it reads no files),
  so a broken copy can only fail compiles, drive `killedCount` to 0, and fail
  the probe assert loudly rather than inflate the score. Packages whose tests
  read files outside the copy get no such exemption; do not reuse the pattern
  for them.
- The manual instruments (`sweep.sh`, `confirm.py`, `runmut.sh`) do NOT
  self-isolate. Run every sweep and every confirm in a dedicated
  `git worktree`. Two sweeps need two worktrees. Never point the instrument at
  a checkout being edited.
- After any interrupted manual run, check `git status` before anything else. A
  stray mutated source file makes the suite fail for unrelated reasons, and a
  failing suite marks every subsequent mutant killed.

## Hazards that produced wrong numbers before they were caught

- **A sandbox copy of `api/` reports every mutant as killed.** The curated
  fixture loaders read `../../../../../frontend/puzzles.json`, five levels
  above the package. Without that directory present, nine unrelated tests fail
  on every run and each failure is scored a kill: a full sandbox measurement
  once read 100% killed and was entirely fiction. Work in a worktree, or
  symlink `frontend/` in and calibrate before trusting anything.
- **Two sweeps sharing a scratch directory can execute each other's scripts.**
  Prefix scratch files with the scope name.

## Classifying survivors

Every confirmed escape is exactly one of two things, and the distinction is
the whole discipline:

- **A coverage gap**: the mutant changes observable behaviour no test asserts.
  Fix: a deterministic kill test. This is the expected majority.
- **A genuinely equivalent mutant**: no observable behaviour can differ. Fix:
  a `// mutator-disable-next-line <mutators>` annotation whose justification
  is stated in the surrounding comment.

Equivalence claims are the integrity risk: an unjustified annotation is
indistinguishable from a suppressed failure, and annotating is always easier
than testing. Rules that held across 24 closed scopes:

- **Restructure before annotating.** If reshaping the code makes the mutant
  killable (or removes the line generating it), prefer that. Removing a
  redundant guard takes its mutants with it instead of silencing them.
- **Name one mutator per directive, on its own line.** Directives filter by
  mutator name; a mutator often generates an equivalent mutant and a killable
  one on the same line, and naming it silences both. If they cannot be
  separated, restructure (split the guard into two statements).
- **Verify every directive by stripping it** and re-counting generated mutants
  with the `/bin/true` control. A directive that does not change the count is
  attached to the wrong line and is doing nothing. Placement differs per
  mutator (`branch/if` attaches to the `if`; `loop/break` attaches to the
  `break`/`continue` statement itself) and cannot be inferred from another
  mutator's placement even on the same construct.
- **A stubborn mutant may be a real bug.** Two production defects were found
  this way, one an unsound detector guard. If code looks redundant, determine
  whether it is redundant or merely unreached; those look identical from the
  mutant's side and have opposite fixes.

## Test-design findings that kill whole mutant classes

- **Assert the complete result value** (the whole `core.Move`), not a field or
  two. The largest survivor group in six consecutive shards was coordinate
  arithmetic, explanation strings and highlight selection that no test read.
  `assertMove` in `ur_test.go` is the pattern.
- **Put the wanted pattern behind a decoy the scan must reject and step
  over.** A test whose pattern is the first thing the search meets leaves the
  search itself unpinned: first-match and abandon-scan mutants pass it.
- **Keep fixtures off the grid origin.** At R1C1 a cell index, its row and its
  column are all zero, so index/coordinate confusions are invisible there.
  The same blindness applies to any scan bound: a bound is invisible until a
  fixture lands exactly on it.
- **Prefer helpers that take data over boards that must produce it.** Functions
  taking an already-built path, cycle or candidate set can be driven from
  hand-built inputs; that is where most of several shards' surface lived.
- **To pin a size-N bound, build a set with no proper subset.** A run of
  bivalue cells cannot do it: every contiguous stretch of one is itself an
  almost locked set, so it supplies the smaller sizes the test means to
  withhold. Overlapping runs of three-candidate cells give a set of a single
  exact size.
- **Digit relabeling is a symmetry.** Exchanging two digits everywhere in a
  known-good fixture (grid and candidate masks) yields a valid position whose
  deductions survive under new names; this is the cheap way to make an
  existing fixture land on a digit-scan bound.

## Definition of done for a scope

1. Stage 1 reports zero escaped (conclusive, since it over-approximates), or
   every remainder carries a verified, justified annotation.
2. The full package suite, `go vet` and `golangci-lint` are clean.
3. The floor is raised through `make mutation-ratchet`, never by editing a
   number. CI's `floors-lag-check` fails the nightly if this step is forgotten.
