# Mutation Equivalents: Go `internal/sudoku/dp`

Index of inline `// mutator-disable-*` annotations in `api/internal/sudoku/dp/solver.go`.
Each entry records the line, the excluded mutators, and the equivalence rationale.
The inline annotation is the primary record; this file is a review index.

## Summary

- **Package:** `internal/sudoku/dp`
- **Total mutants (after annotations):** 228
- **Killed:** 228 (100%)
- **Annotated equivalents:** 24 inline directives across 6 equivalence categories
- **Convergence:** 5 iterations, baseline 72.28% → final 100%

## Equivalence Categories

### 1. RNG implementation detail (6 annotations, ~12 mutants)

The LCG constants (`1103515245`, `12345`, `0x7fffffff`), Fisher-Yates shuffle
boundaries, and seed offsets produce different but equally valid deterministic
sequences. Tests assert puzzle validity and seed-determinism, not the exact
random stream. Pinning exact output would test the RNG implementation, not
solver correctness.

- L237 `(*rng).next()` LCG constants: `arithmetic/base`, `numbers/decrementer`, `numbers/incrementer`, `statement/remove`
- L242-243 `(*rng).shuffle()` boundaries: `expression/comparison`, `numbers/decrementer`, `numbers/incrementer`
- L284 `CarveGivens` seed offset: `arithmetic/base`, `numbers/decrementer`, `numbers/incrementer`
- L331 `CarveGivensWithSubset` seed offset: `arithmetic/base`, `numbers/decrementer`, `numbers/incrementer`

### 2. Make-zero-value redundancy (2 annotations, 2 mutants)

`positions := make([]int, N)` zero-initializes the slice. The loop
`for i := 0; i < N; i++ { positions[i] = i }` sets `positions[0] = 0`, which is
already the zero value. Starting at `i := 1` produces the same array.

- L288 (CarveGivens), L335 (CarveGivensWithSubset): `numbers/incrementer`

### 3. Redundant guards in countSolutionsHelper (4 annotations, 4 mutants)

The outer guard (`if *count >= maxCount { return }`) and inner guard
(`if *count >= maxCount { return }` after each recursive call) are redundant.
Either one alone caps the count correctly because the other catches the overflow.
Mutating either guard's condition or body alone does not change the observable
count returned by `CountSolutions`.

- L158 outer guard: `expression/comparison`, `branch/if`
- L176 inner guard: `expression/comparison`, `branch/if`

### 4. Digit-0 always rejected (2 annotations, 2 mutants)

`isValid(board, row, col, 0)` checks `board[row*GridSize+col] == digit`. The
empty cell itself has value 0, so `0 == 0` is always true, and `isValid` returns
false. Starting the digit loop at 0 instead of 1 adds one always-rejected
iteration — a no-op.

- L171 (countSolutionsHelper), L200 (solve): `numbers/decrementer`

### 5. Carving floor (8 annotations, ~8 mutants)

For the test grid (seed 12345/67890), the uniqueness constraint prevents
removing enough cells to reach the theoretical target (20 givens for impossible;
actual floor is 24). Mutants that change the target subtraction, the `>=` guard,
or the `break` statement cannot change the observable givens count because the
floor is binding. The `HasUniqueSolution` check is the real constraint, not the
target arithmetic.

- L347-348 extreme/impossible targets: `numbers/decrementer`, `numbers/incrementer`
- L333-337 CarveGivens break: `expression/comparison`, `loop/break`, `branch/if`
- L390 targetRemoved arithmetic: `arithmetic/base`
- L393-405 CarveGivensWithSubset break: `expression/comparison`, `loop/break`, `loop/range_break`, `branch/if`

### 6. Restore-loop and conflict-detection implementation details (6 annotations, ~6 mutants)

**Restore loop:** the loop always exits via `restored < cellsToRestore` before
reaching the `i >= 0` boundary. Off-by-one on the start index or the boundary
guard changes WHICH cells are restored (an implementation detail of the reverse
iteration order), not HOW MANY. All difficulty puzzles still receive exactly
their target givens count.

- L441 restore loop: `expression/comparison`, `numbers/decrementer`, `numbers/incrementer`, `expression/remove`

**Conflict detection:** the three scan types (row, column, box) independently
detect conflicts. The dedup `continue` and the `len(group) < 2` skip guard are
moot because the inner `j := i + 1` loop naturally produces no pairs for groups
smaller than 2, and redundant scanning compensates for mutations in any single
scan type.

- L89 `len(group) < 2` guard: `numbers/decrementer`, `branch/if`
- L94 inner loop boundary: `expression/comparison`
- L98-100 dedup `continue`: `branch/if`, `loop/break`

**conflictKey normalization:** callers always pass `group[i], group[j]` with
`i < j` over sorted position slices, so `cell1 < cell2` is guaranteed. The
`if cell1 > cell2` branch is dead code; the swap never executes. Entire function
disabled via `// mutator-disable-func`.

- L128 `conflictKey`: all mutators via `// mutator-disable-func`
