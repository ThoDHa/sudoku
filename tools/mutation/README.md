# Local mutation sweep instrument

Fast local iteration tooling for closing Go mutation escapes, built and
calibrated during the MUT-6 campaign that took `dp`, `human` and all 22
techniques shards to zero escapes. The honest, gating measurement remains
`make mutation-go` / CI; this directory exists because that measurement costs
~32s per mutant, which makes a 200-mutant file a two-hour wait per iteration.
The instrument here turns that into minutes without sacrificing soundness.

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

`runmut.sh` implements the exec contract: **exit 0 is recorded KILLED, exit 1
is recorded ESCAPED.** Never trust a harness variant without calibrating both
directions first:

- Run it on the unmutated file: it must report SURVIVED. A harness that
  cannot fail invents kills (see Hazards).
- Gut the scope's entry point (`return nil` first line) and run it: it must
  report KILLED. `--exec=/bin/true` also serves as a generation-only control
  and mutant counter (~6s for a whole file).

## Isolation

Mutation rewrites the target file in place for the entire sweep.

- Run every sweep and every confirm in a dedicated `git worktree`. Two sweeps
  need two worktrees. Never point the instrument at a checkout being edited.
- After any interrupted run, check `git status` before anything else. A stray
  mutated source file makes the suite fail for unrelated reasons, and a failing
  suite marks every subsequent mutant killed.

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
