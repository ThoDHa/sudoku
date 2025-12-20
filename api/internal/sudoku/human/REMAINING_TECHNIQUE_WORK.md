# Remaining Technique Work

Last updated: 2025-12-20

## Summary

**Status: 34 techniques pass, 5 skip, 0 fail**

The following 5 techniques are currently skipped in tests. They either need implementation fixes or puzzle discovery.

---

## 1. WXYZ-Wing (Priority: Medium)

**File:** `techniques_wings.go` (lines 140-153)

**Current State:** Detector disabled, returns `nil`

**Problem:** The original implementation was causing incorrect eliminations. WXYZ-Wing is a "bent" pattern that requires careful structural verification.

**What WXYZ-Wing Should Do:**
- 4 cells with 4 candidates total (W, X, Y, Z)
- Forms a "bent" pattern: hinge + 3 wings spanning exactly 2 units
- The restricted common (Z) appears in cells that must all see each other
- Eliminate Z from cells that see ALL instances of Z in the pattern

**Implementation Notes:**
```
A proper WXYZ-Wing should:
1. Have a hinge cell (typically 3 candidates)
2. Have 3 wing cells that are bivalue or trivalue
3. Form a proper bent pattern spanning 2 units (e.g., row + box, or col + box)
4. Identify the restricted common digit Z
5. Only eliminate Z from cells that see ALL cells containing Z
```

**Test Puzzle Available:** Yes - see `technique_test_data.go`, variable `wxyzWingPuzzle`

**References:**
- https://www.sudokuwiki.org/WXYZ_Wing
- http://hodoku.sourceforge.net/en/tech_wings.php#wxyz

---

## 2. Sue-de-Coq (Priority: Medium)

**File:** `techniques_sdc.go`

**Current State:** Implementation appears correct, but no puzzle in our dataset triggers it

**What Sue-de-Coq Does:**
- Find an intersection (box-line overlap) with 2-3 empty cells
- Combined candidates in intersection = N digits
- Find an ALS in the remaining row/col cells (outside box) sharing some digits
- Find an ALS in the remaining box cells (outside row/col) sharing some digits
- The union of ALS digits must cover all intersection digits
- Eliminate candidates appropriately from cells seeing the ALS

**What's Needed:**
- Find a puzzle that specifically requires Sue-de-Coq to make progress
- External puzzle sources: SudokuWiki's "Sue de Coq" page has examples

**Test Puzzle:** None currently works - need to hunt for one

**References:**
- https://www.sudokuwiki.org/Sue_De_Coq

---

## 3. Unique Rectangle Type 2 (Priority: Low)

**File:** `techniques_advanced.go`

**Current State:** Implementation exists but no puzzle triggers it

**What UR Type 2 Does:**
- 4 cells in 2 rows, 2 columns, 2 boxes forming a rectangle
- 2 cells are bivalue with {X, Y} (the "floor")
- 2 cells have {X, Y} plus exactly ONE extra candidate Z (same in both)
- Since the UR would create multiple solutions if X and Y were the only candidates,
  Z must be true in at least one of the roof cells
- Eliminate Z from all cells that see BOTH roof cells

**What's Needed:**
- Find a puzzle that requires UR Type 2
- These are rare patterns

**Test Puzzle:** None currently works

**References:**
- https://www.sudokuwiki.org/Unique_Rectangles

---

## 4. Unique Rectangle Type 3 (Priority: Low)

**File:** `techniques_advanced.go`

**Current State:** Implementation exists but no puzzle triggers it

**What UR Type 3 Does:**
- Similar to Type 2, but the extra candidates form a "pseudo-cell"
- The roof cells have extra candidates that together with floor form a naked pair/triple
- Use the pseudo-cell logic to make eliminations

**What's Needed:**
- Find a puzzle that requires UR Type 3
- Even rarer than Type 2

**Test Puzzle:** None currently works

**References:**
- https://www.sudokuwiki.org/Unique_Rectangles

---

## 5. Death Blossom (Priority: Low)

**File:** `techniques_blossom.go`

**Current State:** Implementation exists but no puzzle triggers it

**What Death Blossom Does:**
- Find a "stem" cell with N candidates
- For each candidate in the stem, find an ALS that:
  - Contains that candidate
  - The candidate appears ONLY in cells of the ALS that see the stem
- All N ALS (petals) share a common digit Z (not the stem candidate)
- Eliminate Z from cells that see ALL Z-cells in ALL petals

**Implementation Notes:**
- Current implementation may require size-2+ ALS
- Size-1 ALS (single bivalue cell) support might find more patterns
- Death Blossom is very rare in practice

**What's Needed:**
- Find a puzzle that requires Death Blossom
- Possibly add size-1 ALS support

**Test Puzzle:** None currently works

**References:**
- https://www.sudokuwiki.org/Death_Blossom

---

## How to Find Test Puzzles

1. **SudokuWiki Solver:** https://www.sudokuwiki.org/sudoku.htm
   - Paste puzzle, click "Take Step" repeatedly
   - Note which techniques are used
   - Copy puzzles that use the target technique

2. **Hodoku:** http://hodoku.sourceforge.net/
   - Has puzzle generator with technique filters
   - Can generate puzzles requiring specific techniques

3. **Online Puzzle Collections:**
   - Search for "WXYZ-Wing sudoku puzzle" etc.
   - SudokuWiki forum has technique-specific puzzles

---

## Test Commands

```bash
# Run all isolated technique tests
cd /home/thodha/sudoku/api
go test -v -run "TestTechniqueIsolated" ./internal/sudoku/human/ -count=1

# Run specific technique test
go test -v -run "TestTechniqueIsolated_WXYZWing" ./internal/sudoku/human/ -count=1

# Run full solve tests (100 puzzles)
go test -run "TestFullSolve_First100" ./internal/sudoku/human/ -count=1 -timeout 120s

# Debug a specific puzzle
go test -v -run "TestDebugPuzzle" ./internal/sudoku/human/ -count=1
```

---

## Files Reference

- `technique_isolated_test.go` - All isolated technique tests
- `technique_fullsolve_test.go` - Full puzzle solve tests
- `technique_test_data.go` - Puzzle data for all techniques
- `technique_test_helpers.go` - Test utilities
- `technique_registry.go` - Technique enable/disable helpers
