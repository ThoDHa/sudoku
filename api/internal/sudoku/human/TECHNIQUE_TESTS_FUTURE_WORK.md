# Technique Test Status and Future Work

## Overview

This documents the current state of the Sudoku human-readable solver's technique testing system. The solver has ~38 techniques across 4 tiers (Simple, Medium, Hard, Extreme) and we're ensuring each technique has proper test coverage with valid puzzles.

**Last Updated:** December 2024

---

## Current Test Status Summary

| Category | Count | Status |
|----------|-------|--------|
| **PASSING** | 24 | Techniques with validated puzzles that work correctly |
| **WRONG TECHNIQUE** | 4 | Valid puzzles, but competing techniques fire first |
| **STALLED** | 2 | Puzzles that need more techniques to progress |
| **INVALID PUZZLE** | 3 | DP solver cannot solve (broken puzzles) |
| **NOT UNIQUE** | 5 | Puzzles have multiple solutions |

---

## PASSING Techniques (24)

These techniques have validated puzzles that:
1. Have exactly one solution
2. Complete with the human solver
3. Actually use the target technique during solving

### Simple Tier (8)
- `naked-single`
- `hidden-single`
- `pointing-pair`
- `box-line-reduction`
- `naked-pair`
- `hidden-pair`
- `naked-triple`
- `hidden-triple`

### Medium Tier (5)
- `naked-quad`
- `hidden-quad`
- `x-wing`
- `xy-wing`
- `simple-coloring`

### Hard Tier (7)
- `skyscraper`
- `w-wing`
- `empty-rectangle`
- `unique-rectangle` (Type 1)
- `x-chain`
- `xy-chain`
- `xyz-wing`

### Extreme Tier (4)
- `als-xz`
- `als-xy-wing`
- `als-xy-chain`
- `grouped-x-cycles`

---

## WRONG TECHNIQUE (4) - Valid puzzles, competing techniques fire first

These puzzles ARE valid (unique solution, solver completes), but another technique solves them before the target technique fires. This is correct solver behavior - it finds the solution using available techniques.

| Technique | What Solves It Instead | Notes |
|-----------|----------------------|-------|
| `finned-x-wing` | xy-chain | Works with `DisableAllExceptTargetAndBasics` but then stalls |
| `finned-swordfish` | ALS techniques | Even with all competing disabled, never fires |
| `forcing-chain` | digit-forcing-chain | Works when digit-forcing-chain is disabled |
| `sue-de-coq` | ALS techniques | Works when ALS techniques are disabled |

**Action Options:**
1. Accept these as "passing with isolation" - the puzzle IS valid, just needs technique isolation
2. Find puzzles where the target technique fires naturally (without disabling competitors)
3. Consider if detector logic needs improvement

---

## STALLED (2) - Solver gets stuck

These puzzles stall because they require techniques that are too advanced or not yet fully implemented.

| Technique | Issue | Action Needed |
|-----------|-------|---------------|
| `jellyfish` | Puzzle needs extreme techniques to progress | Find simpler jellyfish puzzle or mark as needing extreme support |
| `swordfish` | Puzzle needs extreme techniques to progress | Find simpler swordfish puzzle |

---

## INVALID PUZZLE (3) - DP solver cannot solve

These puzzles have no valid solution - they're broken or incorrectly transcribed.

| Technique | Issue | Action Needed |
|-----------|-------|---------------|
| `bug` | No valid solution exists | Find valid BUG+1 puzzle from SudokuWiki |
| `unique-rectangle-type-2` | No valid solution exists | Find valid UR Type 2 puzzle |
| `wxyz-wing` | No valid solution exists | Find valid WXYZ-Wing puzzle |

---

## NOT UNIQUE (5) - Multiple solutions

These puzzles have multiple solutions, which means they're not valid Sudoku puzzles.

| Technique | Issue | Action Needed |
|-----------|-------|---------------|
| `aic` | Multiple solutions | Find unique AIC puzzle |
| `death-blossom` | Multiple solutions | Find unique death-blossom puzzle |
| `digit-forcing-chain` | Multiple solutions | Find unique digit-forcing-chain puzzle |
| `remote-pairs` | Multiple solutions | **DEPRECATED** - subsumed by simple-coloring per SudokuWiki |
| `unique-rectangle-type-4` | Multiple solutions | Find unique UR Type 4 puzzle |

---

## Key Files

| File | Purpose |
|------|---------|
| `technique_puzzles_test.go` | Simple/Medium tier puzzles and tests |
| `technique_puzzles_hard_test.go` | Hard tier puzzles and tests |
| `technique_puzzles_extreme_test.go` | Extreme tier puzzles and tests |
| `technique_test_helpers.go` | Test helpers with isolation strategies |
| `puzzle_diagnostic_test.go` | Comprehensive diagnostic tests |
| `find_working_combos_test.go` | Finds working technique combinations |
| `technique_registry.go` | Master technique registry with ordering |

---

## Test Commands

```bash
# Run all diagnostics (main status check)
docker run --rm -v /home/thodha/sudoku/api:/app -w /app golang:1.23-alpine \
  go test ./internal/sudoku/human/ -run "TestPuzzleDiagnostics" -v

# Run combination finder (finds what works with isolation)
docker run --rm -v /home/thodha/sudoku/api:/app -w /app golang:1.23-alpine \
  go test ./internal/sudoku/human/ -run "TestFindWorkingCombinations" -v

# Search all puzzles for missing techniques
docker run --rm -v /home/thodha/sudoku/api:/app -w /app golang:1.23-alpine \
  go test ./internal/sudoku/human/ -run "TestSearchAllPuzzlesForMissing" -v

# Run all human solver tests
docker run --rm -v /home/thodha/sudoku/api:/app -w /app golang:1.23-alpine \
  go test ./internal/sudoku/human/ -v
```

---

## Strategy for Finding Valid Puzzles

### Key Insight from This Session

**Use the internal puzzle bank first!** Before searching external sources:

1. Run `TestSearchAllPuzzlesForMissing` to find puzzles in our bank that use the target technique
2. If a puzzle is "solved by another technique", try disabling the competing technique
3. Only search externally if no internal puzzle works

### Process for Adding New Puzzles

1. **Find candidate puzzle** from SudokuWiki, Hodoku, or internal bank
2. **Validate uniqueness**: DP solver must find exactly one solution
3. **Test with full solver**: Must complete (not stall)
4. **Verify technique usage**: Target technique must appear in move list
5. **Add to appropriate test file** and remove from skip list

### Test Helper Strategies

| Strategy | Use Case |
|----------|----------|
| `DisableHigherTiers` | Default for detection tests - allows same-tier competition |
| `DisableSameAndHigherOrder` | Tests with only simpler techniques enabled |
| `DisableAllExceptTargetAndBasics` | Focused testing - only target + singles |
| `DisableAllExceptTarget` | Unit testing detector in complete isolation |

---

## Future Work Priority

### High Priority
1. Remove `remote-pairs` from test files (deprecated technique)
2. Find valid puzzles for `bug`, `unique-rectangle-type-2`, `wxyz-wing`

### Medium Priority  
3. Find puzzles for `jellyfish`, `swordfish` that don't require extreme techniques
4. Find puzzles where `finned-x-wing`, `forcing-chain`, `sue-de-coq` fire naturally

### Low Priority
5. Find unique puzzles for `aic`, `death-blossom`, `digit-forcing-chain`
6. Consider if `finned-swordfish` detector needs improvement (never fires even isolated)

---

## Session History

### December 2024 - Major Progress
- Fixed 6 techniques by finding puzzles in internal bank: `w-wing`, `empty-rectangle`, `unique-rectangle`, `x-chain`, `xy-chain`, `xyz-wing`
- Fixed technique ordering so `skyscraper` fires before `x-chain`
- Created `find_working_combos_test.go` to find working technique combinations
- Created `TestSearchAllPuzzlesForMissing` to search internal puzzle bank
- Improved from 18 passing to 24 passing techniques

### Previous Sessions
- Removed deprecated `remote-pairs` technique
- Reorganized technique tiers based on SudokuWiki
- Created test helper infrastructure with isolation strategies
