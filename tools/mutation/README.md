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

## Frontend static timeout classification

The frontend aggregate scores `Timeout` as caught, so it started from the same
hazard the Go audit exists to expose: a kill the clock produced counted the
same as a kill a test earned. The classifier in
`frontend/scripts/mutation_aggregate.py` (opt-in `--report-timeouts`) splits
every `Timeout` three ways. A loop-kill carries a `statusReason` of the form
`Hit limit reached (N/M)`, written when the mutant switch ran to Stryker's hit
limit. A clock-kill carries no `statusReason` at all, which is the only shape
the wall-clock path through `TimeoutDecorator.mutantRun` can produce. Anything
else lands in an explicit unclassified bucket rather than either honest one.
This section records the disposition of the population that made the split
necessary. It was first drafted against the lib campaign's final shard reports
archived under `/tmp`; those archives were transient and have since been
evicted, so the evidence of record below is the `.tasks` task files and their
deposited reports, which carry the same numbers. No count is carried over from
an earlier measurement without saying so.

### The population that raised the question

The population is the zero-coverage static timeout set: mutants with an empty
`coveredBy` list whose `Timeout` status has no `statusReason`. No test covers
them and the clock, not an assertion, ended them. The aggregate scores the same
condition an escape when Stryker reaches it by its `NoCoverage` route, so a
zero-coverage timeout is an unearned kill by the aggregate's own accounting.

Two measurements enumerated it, and they overlap on one file only, because the
July configuration excluded `src/lib/constants.ts` and every `.tsx` glob:

| Measurement | Members | Files |
|-------------|--------:|-------|
| Stored whole-surface report of 3 July, `mutation-results/postbatch/frontend/reports/mutation/mutation.json` (re-derived: 22 `Timeout` mutants with an empty `coveredBy`, all flagged `static`, all clock-kills) | 22 | `src/lib/preferences.ts` 14, `src/lib/puzzles-data.ts` 3, `src/lib/cache-version.ts` 2, `src/lib/hooks.ts` 1, `src/hooks/useHighlightState.ts` 1, `src/hooks/useSudokuGame.ts` 1 |
| Nightly run `33717792908` recount, 2026-09-03 (its 72 shard artifacts were transient and are no longer on disk; the enumeration below is the one recorded for that run in `.tasks/current/MUT-8-15-20260813-1455-classify-the-frontend-timeout-kills.md`, Work Log 2026-09-05) | 108 | `src/lib/constants.ts` 66, `src/lib/ThemeContext.tsx` 41, `src/lib/preferences.ts` 1 |

By the recount, 21 of the 22 July members had already left the zero-coverage
set: only one `preferences.ts` member remained, and the other twenty-one were
gone from it (the recount's `puzzles-data.ts` shard held two covered
loop-kills, consistent with that file's members having gained coverage in
between; for the six members without a final shard record the mechanism of the
exit is not traceable past the recount, the deviation named in the disposition
table). The recount's 107 constants and ThemeContext members were new to the
measurement, not new to the hazard: both files are dominated by static
module-level mutants that no test reached.

### Disposition of every member

The lib campaign's final shard records settle the population. Each disposition
below cites the `.tasks/current/` task file holding the shard's numbers and the
report deposited under that task's `.tasks/reports/` directory:

| Historical members | Disposition | Evidence |
|--------------------|-------------|----------|
| `constants.ts` 66 (recount) | killed by new tests | `.tasks/current/MUT-8-3-5-20260905-2348-close-the-constants-ts-coverage-gaps.md`, Work Log 2026-09-13 23:17 (report `01-constants-coverage-gaps-closed.md` under that task's `.tasks/reports/` directory): final shard 86/86 Killed, 0 Timeout, reconciled against the baseline's 66 static Timeouts |
| `ThemeContext.tsx` 41 (recount) | killed by new tests | `.tasks/current/MUT-8-3-2-20260905-2347-close-the-themecontext-escapes.md`, Work Logs 2026-09-14 11:51 and 2026-09-13 23:39 (report `03-m1-fix.md`): final shard 149 total / 148 Killed / 0 Timeout / 1 Ignored; the one Ignored is the `ArrayDeclaration` mutant at line 135 on a React dependency array carrying an equivalence justification (React compares dependency arrays with `Object.is`), so it is neither an escape nor a timeout |
| `preferences.ts` 14 (July) and 1 (recount) | killed by new tests | `.tasks/current/MUT-8-3-6-20260914-1227-close-the-remaining-small-file-lib-escapes.md`, Work Log 2026-09-14 14:42 (report `01-lib-tail-closure.md`): shard 36/36 Killed, 0 Timeout, all 14 statics killed |
| `cache-version.ts` 2 (July) | killed by new tests | same task file, Work Log 2026-09-14 14:35: shard 28/28 Killed, 0 Timeout |
| `puzzles-data.ts` 3, `hooks.ts` 1, `useHighlightState.ts` 1, `useSudokuGame.ts` 1 (July) | population-eliminated-without-node: a named deviation from the sanctioned disposition classes (converted-to-assertion-kill, killed-by-new-test, honest-escape-with-reason, population-eliminated-with-node), recorded because these six members left the zero-coverage set before the recount, whose exhaustive enumeration contains none of them, and no final shard record exists for these four files, so the exit mechanism of each is not traceable past the transient recount artifacts | the run `33717792908` enumeration recorded in `.tasks/current/MUT-8-15-20260813-1455-classify-the-frontend-timeout-kills.md` (Work Log 2026-09-05) |

No member of either historical set is recorded as an honest escape, and none
required one. The remaining lib-campaign records confirm the same shape on lib
files that never supplied a member: `.tasks/current/MUT-8-3-3-20260905-2347-cover-pwaregistration-with-jsdom-tests.md`
(Work Log 2026-09-13 21:57; report `01-final-report.md`), `pwaRegistration.ts`
29/29 Killed; `.tasks/current/MUT-8-3-6-20260914-1227-close-the-remaining-small-file-lib-escapes.md`
(Work Logs 2026-09-14 14:27-15:08 and the 15:16 closure digest; report
`01-lib-tail-closure.md`), `puzzleSetup.ts` 40/40, `BackgroundManagerContext.tsx`
7/7, `GameContext.tsx` 6/6, `TimerContext.tsx` 22/22 and `autoSaveSeedGuard.ts`
8/8, each Killed; and `.tasks/current/MUT-8-11-2-20260905-2350-make-the-theme-derivation-lazy-and-tested.md`
(Work Logs 2026-09-14 13:19 and 13:31; report `01-lazy-theme-adoption.md`),
`themeDerivation.ts` 48/48 and `themeSchema.ts` 123/123 Killed. Every one
reports zero timeouts.

### The class decision, on the measured count

The static question is decided at class level. In July, all 22 zero-coverage
timeouts were static and 35 of the surface's 63 static mutants died to the
clock; at the recount, all 108 members were static. Every file with a final
shard record reports zero timeouts, and the four files that supplied members
and have one (`constants.ts`, `ThemeContext.tsx`, `preferences.ts`,
`cache-version.ts`) each report 100 percent assertion-killed; the four
remainder July files without a record (`puzzles-data.ts`, `hooks.ts`,
`useHighlightState.ts`, `useSudokuGame.ts`) are carried on the 2026-09-03
recount citation above, whose exhaustive enumeration contains none of them. On
that evidence the measured count of the class is zero. Every member with a
traceable exit is therefore closed by conversion, not accepted as an escape,
and no per-mutant attribution is needed; the six artifact-less July members are
the one named deviation above (population-eliminated-without-node), not
conversions.
The standing rule for any future member is unchanged: a static mutant with an
empty `coveredBy` that dies to the clock is an unearned kill, and it must
either be converted by a covering assertion or recorded as an honest escape,
never left inside the caught total by default.

### Handoff to the gate-output decision

Whether `Timeout` should remain in the aggregate's `CAUGHT` set, and whether
any floor should move in consequence, is deliberately not decided here. That
question belongs to the gate-output work (MUT-8-15-6), which owns the
`--report-timeouts` wiring in the nightly workflow and the floor decision.
What this record hands it: the zero-coverage static population that made the
question urgent is now zero on the current evidence, so any remaining
clock-kill is a covered mutant (at the recount, exactly 6 of the 173 timeouts
were covered clock-kills, derived as follows: the 59 per-shard loop-kills have
no `preferences.ts` entry, so its single timeout is a clock-kill and all 108
zero-coverage members sit inside the 114 clock-kills; 114 - 108 = 6), and a
floor argument now turns on that residue alone.

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
- **Read the survivor's line number against the commit the shard measured.**
  Line numbers drift inside a campaign, and a report read against the working
  tree can name the wrong statement. The `scores.ts` survivor labeled `:247`
  was the forced-false mutant of `if (!data) return new Set()` on the tree the
  strip run measured; read two lines down onto the `isStringArray` guard, it
  became a phantom that resisted every hand-applied variant because the real
  guard's mutants were already dead. `git show <commit>:<file>` at the strip
  run's base resolves the attribution before any variant guessing starts.
- **Re-strip after the killer test lands.** Hand-applied kills never
  retroactively convert a Survived verdict: the verdict belongs to the run
  that produced it, under that run's test set. If the test that kills the
  variant was written after the shard ran, only a fresh directive-stripped
  shard demonstrates the kill; pinning first freezes the stale verdict and the
  site reads as irreconstructible forever. The `scores.ts` pin stood on
  exactly this gap for two weeks; the re-strip reported all four guard
  variants killed and the pin came out.
- **The HTML report adds rendering, not data.** Both reporters consume the one
  report object the core builds (`mutation-test-report-helper.js`); the HTML
  reporter embeds it verbatim (`html-reporter.js`, `app.report = ...`). A
  mutant's disclosed shape is its location extent plus the replacement code,
  nothing more: ConditionalExpression emits the same literal for an operand
  drop as for a whole-test replacement (`true` for `&&` operands, `false` for
  `||` operands; both literals for an `if` test), so the variants are told
  apart only by reading which span the viewer highlights. An Ignored mutant
  renders with no diff at all, so reconstruct the applied shape only from the
  report of the run whose verdict is being diagnosed.

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
