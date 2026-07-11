# Mutation Equivalents: Go `internal/sudoku/human/techniques`

Record of which test kills each go-mutesting mutant covered by this pass in the
techniques package (`api/internal/sudoku/human/techniques/`). As of MUT-4,
`als_chains.go` carries **no `// mutator-disable-*` annotations**: every mutant
this document tracks is now killed by a targeted test, so each entry below maps
a mutant to its killing test rather than to a suppression. (Other files in the
package, such as `chains.go` and `sdc.go`, carry their own suppressions from
separate passes, outside this document's scope.)

## Summary

- **Package:** `internal/sudoku/human/techniques`
- **Scope of this pass:** 17 escaped mutants across `als_chains.go` (9),
  `grid.go` (3), `xcycles.go` (3), `chains.go` (1), `ur.go` (1).
- **Killed by new tests:** 18 (see `techniques_advanced_test.go`)
- **Annotated equivalents:** 0 (no genuine equivalents identified)
- **Deferred (test gaps, NOT equivalent):** 0 (all four killed by MUT-4)

## Killed mutants (18)

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
| als_chains `i==j` `loop/break` (adjacency `continue`->`break`) | `detectALSXYChain` adjacency build | `TestDetectALSXYChainAdjacencyIsSymmetric` |
| als_chains `startIdx, 6` `numbers/decrementer` (`maxLen` 6->5) | `detectALSXYChain` DFS launch | `TestDetectALSXYChainMaxLenSixRequiredForLengthSixChain` |
| als_chains `maxLen`-guard `loop/break` (`continue`->`break`) | `searchALSChain` maxLen guard | `TestSearchALSChainMaxLenGuardSkipsSingleState` |
| als_chains visited `loop/break` (`continue`->`break`) | `searchALSChain` visited-neighbour skip | `TestSearchALSChainVisitedNeighbourSkipsOneNeighbour` |

(16 rows cover 18 mutants because `TestCheckChainEliminationSkipsRCDigit`
kills four mutants at `als_chains.go:273-279` in a single assertion.)

## Formerly deferred mutants (now killed by MUT-4)

The four DFS mutants below were deferred by MUT-2/MUT-3 as "test gaps" on the
belief that every constructible firing board admits a shorter, smaller, or
index-reversed chain reproducing the identical elimination. MUT-4 disproved
that: a randomized search over branchy and length-6 ALS-XY chains (rather than
the simple chains examined earlier) produced boards where the mutant diverges,
each minimized to a small all-givens fixture and verified against the real
source mutation. All four pragmas have been removed.

- adjacency build `continue` -> `break` (lower-triangular adjacency): killed by
  a 3-ALS chain that is not index-monotonic along its path, so no strictly
  decreasing traversal reconstructs it. The mutant finds no chain.
- chain `maxLen` 6 -> 5: killed by a board whose minimal firing chain has
  length 6; at `maxLen` 5 the DFS fires a different chain with an extra
  elimination.
- `maxLen`-guard `continue` -> `break`: killed by a board where a length-`maxLen`
  state is popped before the firing chain is examined, so `break` discards the
  firing chain.
- visited-neighbour `continue` -> `break`: killed by a board where breaking on a
  visited neighbour abandons the only productive extension, changing the
  eliminated digit.
