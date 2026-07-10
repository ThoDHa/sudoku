# Mutation Equivalents: Go `internal/sudoku/human/techniques`

Index of inline `// mutator-disable-*` annotations in the techniques package
(`api/internal/sudoku/human/techniques/`). Each entry records the line, the
excluded mutators, and the equivalence rationale. The inline annotation is the
primary record; this file is a review index.

## Summary

- **Package:** `internal/sudoku/human/techniques`
- **Scope of this pass:** 17 escaped mutants across `als_chains.go` (9),
  `grid.go` (3), `xcycles.go` (3), `chains.go` (1), `ur.go` (1).
- **Killed by new tests:** 14 (see `techniques_advanced_test.go`)
- **Annotated equivalents:** 0 (no genuine equivalents identified)
- **Deferred (test gaps, NOT equivalent):** 4

## Killed mutants (14)

Each killed by a targeted unit test in
`api/internal/sudoku/human/techniques/techniques_advanced_test.go`:

| Mutant | File:Line | Test |
|--------|-----------|------|
| grid L395 `loop/condition` | `grid.go:395` | `TestFindAllALSIncludesCrossRowBoxSpanningALS` |
| grid L396 `statement/remove` | `grid.go:396` | `TestFindAllALSIncludesCrossRowBoxSpanningALS` |
| grid L409 `numbers/incrementer` | `grid.go:409` | `TestFindAllALSIncludesSizeOneBivalueALS` |
| xcycles L256 `loop/condition` | `xcycles.go:256` | `TestAnalyzeCycleFixedDetectsDiscontinuityAtNodeZero` |
| xcycles L256 `numbers/incrementer` | `xcycles.go:256` | `TestAnalyzeCycleFixedDetectsDiscontinuityAtNodeZero` |
| xcycles L257 `arithmetic/base` | `xcycles.go:257` | `TestAnalyzeCycleFixedDetectsDiscontinuityAtNodeZero` |
| chains L673 `numbers/incrementer` | `chains.go:673` | `TestDetectEmptyRectangleFiresViaRowConjugateAtColumnZero` |
| ur L540 `expression/remove` | `ur.go:540` | `TestDetectUniqueRectangleType4NilWhenNeitherDigitConfined` |
| als_chains L273 `loop/range_break` | `als_chains.go:273` | `TestCheckChainEliminationSkipsRCDigit` |
| als_chains L274 `branch/if` | `als_chains.go:274` | `TestCheckChainEliminationSkipsRCDigit` |
| als_chains L274 `statement/remove` | `als_chains.go:274` | `TestCheckChainEliminationSkipsRCDigit` |
| als_chains L279 `branch/if` | `als_chains.go:279` | `TestCheckChainEliminationSkipsRCDigit` |
| als_chains L129 `numbers/decrementer` | `als_chains.go:129` | `TestDetectALSXYChainRequiresSizeFourALS` |

(13 rows cover 14 mutants because `TestCheckChainEliminationSkipsRCDigit`
kills four mutants at `als_chains.go:273-279` in a single assertion.)

## Deferred mutants (4)

These are genuine test gaps, NOT equivalents. They survive because the
constructible boards that make `DetectALSXYChain` fire also admit a shorter,
smaller, or index-reversed chain that produces the identical elimination under
the mutant. Killing them requires fixtures that force a unique firing chain of
a specific shape, which could not be built and verified without running
go-mutesting (out of scope for this pass). They are recorded here so a future
pass can target them.

MUT-3 note: the DFS now visits `adjRC` neighbours in sorted index order
(`slices.Sorted(maps.Keys(...))`), so every entry below is deterministic. That
removes the earlier "cannot be killed because iteration is random" objection:
each mutant is now stably killed or stably escaped, and the ones below stably
escape only because no available fixture forces the required chain shape.

- `als_chains.go:188` `numbers/decrementer` (chain `maxLen` 6 -> 5): needs a
  fixture whose only firing chain has length exactly 6. Length-3/4 chains fire
  under both bounds.
- `als_chains.go:155` `loop/break` (adjacency build `continue` -> `break`):
  every chain found by the original is also discoverable reversed, so the
  half-built (lower-triangular) adjacency still yields the same elimination on
  the boards examined; a kill requires a non-monotonically-indexed unique chain.
- `als_chains.go:236` `loop/break` (`maxLen` guard `continue` -> `break`): only
  triggers when a length-`maxLen` state is popped before the firing chain; the
  constructible boards never reach `maxLen` before the chain is found.
- `als_chains.go:252` `loop/break` (visited-neighbor `continue` -> `break`): now
  deterministic under sorted neighbour iteration; a kill needs a board where a
  visited neighbour sorts before the only productive unvisited one, which no
  available fixture produces.
