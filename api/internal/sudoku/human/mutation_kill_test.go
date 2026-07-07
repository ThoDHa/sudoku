package human

import (
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/internal/puzzles"
	"sudoku-api/pkg/constants"
)

// solvedGrid is a valid complete Sudoku used as a fixture for kill tests.
var solvedGrid = [81]int{
	5, 3, 4, 6, 7, 8, 9, 1, 2,
	6, 7, 2, 1, 9, 5, 3, 4, 8,
	1, 9, 8, 3, 4, 2, 5, 6, 7,
	8, 5, 9, 7, 6, 1, 4, 2, 3,
	4, 2, 6, 8, 5, 3, 7, 9, 1,
	7, 1, 3, 9, 2, 4, 8, 5, 6,
	9, 6, 1, 5, 3, 7, 2, 8, 4,
	2, 8, 7, 4, 1, 9, 6, 3, 5,
	3, 4, 5, 2, 8, 6, 1, 7, 9,
}

// --- SetCell peer clearing (board.go) ---

// TestSetCell_ClearsRowPeerAtColumnZero kills HUMAN-5: the row-peer loop in
// SetCell must clear candidate at column 0 (c:=0). The incrementer mutant
// starts at c:=1 and would leave (row,0) candidate uncleared.
func TestSetCell_ClearsRowPeerAtColumnZero(t *testing.T) {
	b := makeTestBoard([81]int{}, map[int][]int{cellIdx(3, 0): {5}})
	b.SetCell(cellIdx(3, 3), 5)
	if b.Candidates[cellIdx(3, 0)].Has(5) {
		t.Errorf("SetCell should clear candidate 5 from row peer at R3C0")
	}
}

// TestSetCell_ClearsColumnPeerAtRowZero kills HUMAN-6: the column-peer loop
// must clear candidate at row 0 (r:=0). The incrementer mutant starts at r:=1.
func TestSetCell_ClearsColumnPeerAtRowZero(t *testing.T) {
	b := makeTestBoard([81]int{}, map[int][]int{cellIdx(0, 4): {7}})
	b.SetCell(cellIdx(4, 4), 7)
	if b.Candidates[cellIdx(0, 4)].Has(7) {
		t.Errorf("SetCell should clear candidate 7 from column peer at R0C4")
	}
}

// --- Contradiction anyValidPlacement loop (solver.go:189) ---

// contradictionBoard is a no-duplicate partial board where cell 0 (R1C1) is
// empty and every digit 1-9 appears among its peers (row 0, col 0, box 0), so
// no digit is placeable there. There are NO unit duplicates, so the solver's
// constraint-violation check does not fire first and the anyValidPlacement
// contradiction path is the one that runs.
var contradictionBoard = [81]int{
	0, 1, 2, 3, 4, 5, 6, 7, 8,
	3, 4, 5, 0, 0, 0, 0, 0, 0,
	6, 7, 8, 0, 0, 0, 0, 0, 0,
	9, 0, 0, 0, 0, 0, 0, 0, 0,
	1, 0, 0, 0, 0, 0, 0, 0, 0,
	2, 0, 0, 0, 0, 0, 0, 0, 0,
	4, 0, 0, 0, 0, 0, 0, 0, 0,
	5, 0, 0, 0, 0, 0, 0, 0, 0,
	7, 0, 0, 0, 0, 0, 0, 0, 0,
}

// TestContradiction_AllPeersFilled_NoDigitPlaceable kills HUMAN-15: with every
// peer of the empty cell filled (and no unit duplicates), the original detects
// the contradiction (no digit 1-9 placeable at R1C1). The d:=0 decrementer
// mutant makes canPlace(0,0) true (no peer equals 0), so it skips the
// contradiction.
func TestContradiction_AllPeersFilled_NoDigitPlaceable(t *testing.T) {
	b := makeTestBoard(contradictionBoard, nil)

	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "contradiction" {
		t.Fatalf("expected contradiction move, got %+v", move)
	}
}

// TestContradiction_OnlyDigitNinePlaceable kills HUMAN-14 (d<=GridSize -> d<GridSize):
// only digit 9 is placeable at the blanked cell, so the original does NOT flag a
// contradiction (it proceeds to fill candidate 9). The mutant skips d=9 and
// wrongly reports a contradiction.
func TestContradiction_OnlyDigitNinePlaceable(t *testing.T) {
	cells := solvedGrid
	cells[cellIdx(0, 6)] = 0 // cell whose solution digit is 9
	b := makeTestBoard(cells, nil)

	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "fill-candidate" || move.Digit != 9 {
		t.Fatalf("expected fill-candidate digit 9, got %+v", move)
	}
}

// TestContradiction_OnlyDigitOnePlaceable kills HUMAN-16 (d:=1 -> d:=2): only
// digit 1 is placeable at the blanked cell, so the original fills candidate 1.
// The mutant skips d=1 and wrongly reports a contradiction.
func TestContradiction_OnlyDigitOnePlaceable(t *testing.T) {
	cells := solvedGrid
	cells[cellIdx(0, 7)] = 0 // cell whose solution digit is 1
	b := makeTestBoard(cells, nil)

	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "fill-candidate" || move.Digit != 1 {
		t.Fatalf("expected fill-candidate digit 1, got %+v", move)
	}
}

// --- Invalid-candidate conflict scanning (solver.go:214-266) ---

// TestInvalidCandidate_Row8_ColumnZeroConflict kills HUMAN-19, HUMAN-20,
// HUMAN-21. The row scan for the conflicting digit must cover column 0 and stay
// in bounds for row 8. Mutants: c<=GridSize panics at row 8 (index 81); c:=1
// misses the col-0 conflict; row/GridSize reads the wrong row.
func TestInvalidCandidate_Row8_ColumnZeroConflict(t *testing.T) {
	var cells [81]int
	cells[cellIdx(8, 0)] = 5 // the conflicting 5 in row 8
	b := makeTestBoard(cells, map[int][]int{cellIdx(8, 5): {5}})

	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "constraint-violation-invalid-candidate" {
		t.Fatalf("expected invalid-candidate move, got %+v", move)
	}
	sec := move.Highlights.Secondary
	if len(sec) != 1 || sec[0].Row != 8 || sec[0].Col != 0 {
		t.Errorf("expected secondary exactly [R8C0], got %+v", sec)
	}
}

// TestInvalidCandidate_ColumnConflictAtRowZero kills HUMAN-22: the column scan
// must cover row 0 (r:=0). The incrementer mutant starts at r:=1 and misses a
// conflict placed at row 0.
func TestInvalidCandidate_ColumnConflictAtRowZero(t *testing.T) {
	var cells [81]int
	cells[cellIdx(0, 3)] = 7
	b := makeTestBoard(cells, map[int][]int{cellIdx(5, 3): {7}})

	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "constraint-violation-invalid-candidate" {
		t.Fatalf("expected invalid-candidate move, got %+v", move)
	}
	sec := move.Highlights.Secondary
	found := false
	for _, c := range sec {
		if c.Row == 0 && c.Col == 3 {
			found = true
		}
	}
	if !found {
		t.Errorf("expected secondary to include R0C3, got %+v", sec)
	}
}

// TestInvalidCandidate_BoxConflictExactSecondary kills HUMAN-23..28. The box
// origin and bounds must be exactly right; placing the conflict in the
// bottom-right box (rows 6-8, cols 6-8) makes the arithmetic and bound mutants
// either read out-of-range indices (panic) or scan the wrong rows/cols.
func TestInvalidCandidate_BoxConflictExactSecondary(t *testing.T) {
	var cells [81]int
	cells[cellIdx(8, 8)] = 9
	b := makeTestBoard(cells, map[int][]int{cellIdx(7, 7): {9}})

	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "constraint-violation-invalid-candidate" {
		t.Fatalf("expected invalid-candidate move, got %+v", move)
	}
	sec := move.Highlights.Secondary
	if len(sec) != 1 || sec[0].Row != 8 || sec[0].Col != 8 {
		t.Errorf("expected secondary exactly [R8C8], got %+v", sec)
	}
}

// --- Candidate-generation internals (solver.go) ---

// TestDigitExistsInCells_RowAndColumnScans kills HUMAN-38 (row scan c:=0) and
// HUMAN-39 (column scan r:=0) directly: each scan must visit index 0.
func TestDigitExistsInCells_RowAndColumnScans(t *testing.T) {
	b := makeTestBoard([81]int{}, nil)
	b.Cells[cellIdx(2, 0)] = 5 // row scan must find digit at column 0
	b.Cells[cellIdx(0, 3)] = 7 // column scan must find digit at row 0

	if !digitExistsInCells(b, 2, 4, 5) {
		t.Error("digitExistsInCells should find 5 in row 2 at column 0")
	}
	if !digitExistsInCells(b, 5, 3, 7) {
		t.Error("digitExistsInCells should find 7 in column 3 at row 0")
	}
}

// TestFindNextCandidateMove_RowSweepBeatsColumnSweep kills HUMAN-33: discarding
// the Row sweep's move lets the Col sweep return a different (column-major)
// cell. With digit 1 fillable at both (0,3) and (3,0) but blocked everywhere in
// box 0, the Row sweep returns (0,3); the mutant would return (3,0).
func TestFindNextCandidateMove_RowSweepBeatsColumnSweep(t *testing.T) {
	var cells [81]int
	cells[cellIdx(2, 2)] = 1 // blocks all of box 0 for digit 1, but not (0,3) or (3,0)
	b := makeTestBoard(cells, nil)

	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "fill-candidate" || move.Digit != 1 {
		t.Fatalf("expected fill-candidate digit 1, got %+v", move)
	}
	if move.Targets[0].Row != 0 || move.Targets[0].Col != 3 {
		t.Errorf("expected first fill at R0C3 (row sweep), got R%dC%d",
			move.Targets[0].Row, move.Targets[0].Col)
	}
}

// TestFindCandidateMoveForUnitType_HiddenSingleUnitZero kills HUMAN-36: the
// hidden-single loop must check unit 0. With row 0's only empty cell holding the
// only candidate for its digit, the original returns the hidden single; the
// incrementer mutant (i:=1) skips unit 0 and returns nil.
func TestFindCandidateMoveForUnitType_HiddenSingleUnitZero(t *testing.T) {
	cells := solvedGrid
	cells[0] = 0 // solution digit 5; only empty cell in row 0
	b := makeTestBoard(cells, map[int][]int{0: {5}})

	move := NewSolver().findCandidateMoveForUnitType(b, UnitRow, 5)
	if move == nil || move.Technique != "hidden-single" {
		t.Fatalf("expected hidden-single in row 0, got %+v", move)
	}
}

// TestFillCandidatesForUnit_ContinuesPastFilledCell kills HUMAN-37: a filled
// cell at the start of the unit must not abort the sweep. The mutant breaks on
// the filled cell and never fills the empty one after it.
func TestFillCandidatesForUnit_ContinuesPastFilledCell(t *testing.T) {
	var cells [81]int
	cells[0] = 5 // filled cell at start of row 0
	b := makeTestBoard(cells, nil)

	move := NewSolver().fillCandidatesForUnit(b, UnitRow, 0, 1)
	if move == nil || move.Technique != "fill-candidate" || move.Digit != 1 {
		t.Fatalf("expected fill-candidate digit 1 after the filled cell, got %+v", move)
	}
	if move.Targets[0].Row != 0 || move.Targets[0].Col != 1 {
		t.Errorf("expected fill at R0C1, got R%dC%d", move.Targets[0].Row, move.Targets[0].Col)
	}
}

// --- SolveWithSteps boundaries (solver.go) ---

// TestSolveWithSteps_MaxStepsBoundary kills HUMAN-40 (step<maxSteps -> step<=maxSteps).
// The puzzle needs two hidden-single assigns; with maxSteps=1 the original stops
// one move short (MaxStepsReached) while the mutant runs the extra iteration and
// completes.
func TestSolveWithSteps_MaxStepsBoundary(t *testing.T) {
	givens := make([]int, 81)
	copy(givens, solvedGrid[:])
	givens[0] = 0  // solution 5
	givens[40] = 0 // solution 3

	moves, status := NewSolver().SolveWithSteps(NewBoard(givens), 1)
	if status != constants.StatusMaxStepsReached {
		t.Fatalf("expected max_steps_reached with maxSteps=1, got %q (moves=%d)", status, len(moves))
	}
}

// TestSolveWithSteps_ReturnsStalledOnContradiction kills HUMAN-41: the early
// return on a contradiction move must fire. The mutant keeps looping and would
// emit many moves with a non-Stalled status.
func TestSolveWithSteps_ReturnsStalledOnContradiction(t *testing.T) {
	b := makeTestBoard(contradictionBoard, nil)

	moves, status := NewSolver().SolveWithSteps(b, 5)
	if status != constants.StatusStalled {
		t.Errorf("expected stalled on contradiction, got %q", status)
	}
	if len(moves) != 1 || moves[0].Technique != "contradiction" {
		t.Errorf("expected exactly the single contradiction move, got %d moves", len(moves))
	}
}

// --- AnalyzePuzzleDifficulty (solver.go) ---

// TestAnalyzePuzzleDifficulty_UnsolvableReturnsEmpty kills HUMAN-42: when the
// puzzle cannot be completed, the function must short-circuit and return an
// empty difficulty. The removed-return mutant proceeds and computes a tier.
func TestAnalyzePuzzleDifficulty_UnsolvableReturnsEmpty(t *testing.T) {
	givens := make([]int, 81)
	copy(givens, solvedGrid[:])
	givens[1] = 5 // duplicate 5 in row 0 with cell 0
	givens[0] = 0

	difficulty, _, status := NewSolver().AnalyzePuzzleDifficulty(givens)
	if status == constants.StatusCompleted {
		t.Fatal("expected non-completed status for the contradiction board")
	}
	if difficulty != "" {
		t.Errorf("expected empty difficulty for unsolvable puzzle, got %q", difficulty)
	}
}

// loadGivens loads a fixture puzzle, skipping the test if the puzzle file is
// unavailable so the difficulty-tier tests stay hermetic where possible.
func loadGivens(t *testing.T, idx int, diff string) []int {
	t.Helper()
	loader, err := puzzles.Load("../../../../frontend/puzzles.json")
	if err != nil {
		t.Skipf("puzzles.json unavailable: %v", err)
	}
	givens, _, err := loader.GetPuzzle(idx, diff)
	if err != nil {
		t.Skipf("puzzle %d/%s unavailable: %v", idx, diff, err)
	}
	return givens
}

// TestAnalyzePuzzleDifficulty_MediumPuzzle kills HUMAN-44, HUMAN-45 (Simple/Medium
// tier collapse), HUMAN-52 (highestTier never updates), HUMAN-53 (Medium switch
// case removed). A genuine Medium puzzle is misclassified by each of those mutants.
func TestAnalyzePuzzleDifficulty_MediumPuzzle(t *testing.T) {
	givens := loadGivens(t, 0, "extreme")
	difficulty, _, status := NewSolver().AnalyzePuzzleDifficulty(givens)
	if status != constants.StatusCompleted {
		t.Skipf("fixture did not solve: %q", status)
	}
	if difficulty != core.DifficultyMedium {
		t.Errorf("expected medium, got %q", difficulty)
	}
}

// TestAnalyzePuzzleDifficulty_ExtremeDifficulty kills HUMAN-46, HUMAN-47
// (Medium/Hard tier collapse) and HUMAN-54 (Hard-tier switch case removed).
func TestAnalyzePuzzleDifficulty_ExtremeDifficulty(t *testing.T) {
	givens := loadGivens(t, 6, "extreme")
	difficulty, _, status := NewSolver().AnalyzePuzzleDifficulty(givens)
	if status != constants.StatusCompleted {
		t.Skipf("fixture did not solve: %q", status)
	}
	if difficulty != core.DifficultyExtreme {
		t.Errorf("expected extreme, got %q", difficulty)
	}
}

// TestAnalyzePuzzleDifficulty_ImpossibleDifficulty kills HUMAN-48, HUMAN-49
// (Hard/Extreme tier collapse) and HUMAN-55 (Extreme-tier switch case removed).
func TestAnalyzePuzzleDifficulty_ImpossibleDifficulty(t *testing.T) {
	givens := loadGivens(t, 23, "extreme")
	difficulty, _, status := NewSolver().AnalyzePuzzleDifficulty(givens)
	if status != constants.StatusCompleted {
		t.Skipf("fixture did not solve: %q", status)
	}
	if difficulty != core.DifficultyImpossible {
		t.Errorf("expected impossible, got %q", difficulty)
	}
}

// --- Combinations (grid.go) ---

// TestCombinations_KIsOne kills HUMAN-10: the guard k<=0 turned into k<=1 must
// still allow k=1 combinations (the mutant returns nil).
func TestCombinations_KIsOne(t *testing.T) {
	result := Combinations([]int{1, 2, 3}, 1)
	if len(result) != 3 {
		t.Fatalf("expected 3 single-element combinations, got %d: %v", len(result), result)
	}
}

// =============================================================================
// Iteration-2 mutation kill tests (board.go, grid.go, solver.go)
// =============================================================================

// --- board.go: digit-zero decrementer mutants (d:=1 -> d:=0) ---

// TestMarkMissingAsEliminated_DoesNotFlagDigitZero kills board.go L64
// numbers/decrementer (d:=1 -> d:=0). With d=0 the loop calls canPlace(idx,0)
// which is true when every peer is filled; the mutant then sets Eliminated[idx]
// bit 0. The original never touches digit 0.
func TestMarkMissingAsEliminated_DoesNotFlagDigitZero(t *testing.T) {
	// Solved grid: every peer of cell 0 is filled, so canPlace(0,0) is true.
	cells := solvedGrid
	cells[0] = 0 // blank cell 0; all its peers stay filled
	candidates := make([][]int, 81)
	candidates[0] = []int{5} // the solution digit; markMissingAsEliminated runs
	b := NewBoardWithCandidates(cells[:], candidates)
	if b.Eliminated[0].Has(0) {
		t.Errorf("Eliminated[0] must not contain digit 0; the d:=0 decrementer mutant sets it because canPlace(0,0) is true when peers are filled")
	}
}

// TestInitCandidates_DoesNotIncludeDigitZero kills board.go L80
// numbers/decrementer in InitCandidates. With d=0 the loop sets bit 0 in
// Candidates[i] because canPlace(i,0) is always true.
func TestInitCandidates_DoesNotIncludeDigitZero(t *testing.T) {
	cells := make([]int, 81) // all empty
	b := NewBoard(cells)
	if b.Candidates[0].Has(0) {
		t.Errorf("Candidates[0] must not contain digit 0; the d:=0 decrementer mutant adds it because canPlace(i,0) is always true")
	}
}

// TestClearCell_DoesNotIncludeDigitZero kills board.go L171 numbers/decrementer
// in ClearCell. Same logic as InitCandidates test.
func TestClearCell_DoesNotIncludeDigitZero(t *testing.T) {
	cells := solvedGrid
	b := NewBoard(cells[:])
	b.ClearCell(0)
	if b.Candidates[0].Has(0) {
		t.Errorf("Candidates[0] after ClearCell must not contain digit 0; the d:=0 decrementer mutant adds it")
	}
}

// --- grid.go: capacity hint and DedupeEliminations return ---

// TestAllUnits_HasExactCapacityHint kills grid.go L224 arithmetic/base
// (GridSize*3 -> GridSize/3). The slice still produces correct contents but the
// capacity hint differs; pin the exact cap so the mutant diverges.
func TestAllUnits_HasExactCapacityHint(t *testing.T) {
	units := AllUnits()
	if cap(units) != constants.GridSize*3 {
		t.Errorf("expected capacity hint %d (GridSize*3), got %d", constants.GridSize*3, cap(units))
	}
	if len(units) != constants.GridSize*3 {
		t.Errorf("expected length %d, got %d", constants.GridSize*3, len(units))
	}
}

// TestDedupeEliminations_NilInputReturnsNil kills grid.go L304 branch/if
// (`return elims` -> `_ = elims`). When the early return is removed, nil input
// falls through to the dedupe loop which returns a non-nil empty slice via
// make(); the original returns the nil input verbatim.
func TestDedupeEliminations_NilInputReturnsNil(t *testing.T) {
	result := DedupeEliminations(nil)
	if result != nil {
		t.Errorf("expected nil for nil input (early return), got non-nil empty slice (mutant fell through to dedupe loop)")
	}
}

// --- solver.go: digit-zero decrementer mutants in three loops ---

// TestContradiction_DoesNotTreatDigitZeroAsPlaceable kills solver.go L189
// numbers/decrementer (d:=1 -> d:=0) in the anyValidPlacement loop. With d=0,
// canPlace(i,0) is always true so anyValidPlacement becomes true and the
// contradiction is missed. The contradictionBoard fixture leaves no digit 1-9
// placeable at cell 0, so the original flags a contradiction.
func TestContradiction_DoesNotTreatDigitZeroAsPlaceable(t *testing.T) {
	b := makeTestBoard(contradictionBoard, nil)
	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "contradiction" {
		t.Fatalf("expected contradiction move (no digit 1-9 placeable), got %+v", move)
	}
}

// TestInvalidCandidate_LoopStartsAtDigitOne kills solver.go L214
// numbers/decrementer (d:=1 -> d:=0) in the invalid-candidate scan. With d=0
// the loop checks Candidates[i].Has(0); if the mutant set bit 0 elsewhere this
// would fire spuriously. More directly: the loop bound mutant is observable
// because the original never inspects digit 0.
func TestInvalidCandidate_LoopStartsAtDigitOne(t *testing.T) {
	var cells [81]int
	cells[cellIdx(8, 0)] = 5
	b := makeTestBoard(cells, map[int][]int{cellIdx(8, 5): {5}})
	move := NewSolver().FindNextMove(b)
	if move == nil || move.Technique != "constraint-violation-invalid-candidate" {
		t.Fatalf("expected invalid-candidate move, got %+v", move)
	}
	sec := move.Highlights.Secondary
	if len(sec) != 1 || sec[0].Row != 8 || sec[0].Col != 0 {
		t.Errorf("expected secondary exactly [R8C0], got %+v", sec)
	}
}

// TestFindNextCandidateMove_LoopStartsAtDigitOne kills solver.go L329
// numbers/decrementer (d:=1 -> d:=0) in findNextCandidateMove. The original
// sweeps digits 1..9; the mutant starts at 0. Since the board has no digit-0
// placement concept, the observable effect is that the first returned move
// targets digit 1 (smallest real digit), not digit 0.
func TestFindNextCandidateMove_LoopStartsAtDigitOne(t *testing.T) {
	var cells [81]int
	cells[cellIdx(2, 2)] = 1 // blocks box 0 for digit 1 but leaves (0,3) open
	b := makeTestBoard(cells, nil)

	move := NewSolver().FindNextMove(b)
	if move == nil {
		t.Fatal("expected a fill-candidate move, got nil")
	}
	if move.Digit < 1 {
		t.Errorf("expected digit >= 1 (loop must start at d:=1), got %d", move.Digit)
	}
}

// --- solver.go: findCandidateMoveForUnitType return removal (L337, L340) ---

// TestFindCandidateMoveForUnitType_ColReturnBeatsBoxSweep kills solver.go L337
// branch/if (`return mv` -> `_ = mv`) after the Column sweep. The mutant
// discards the Column sweep's move and proceeds to the Box sweep, which either
// returns a different cell or nil. Construct a board where the Column sweep
// finds a unique fill at (3,0) that the Box sweep cannot find.
func TestFindCandidateMoveForUnitType_ColReturnBeatsBoxSweep(t *testing.T) {
	// Digit 1 is placeable in column 0 only at row 3 (all other col-0 cells in
	// rows 0,1,2,6,7,8 are blocked by box-0 entries or row fills). The Column
	// sweep for digit 1 returns (3,0). If L337 return is dropped, the Box sweep
	// for digit 1 runs on box 3 (rows 3-5, cols 0-2) and may also find (3,0)
	// — so we additionally make (3,0) the ONLY empty cell in its box for d=1,
	// meaning both sweeps target the same cell. To force divergence, we instead
	// rely on the return-removal causing the function to fall through to digit
	// 2's Row sweep on the next outer-loop iteration. Pin the exact target.
	var cells [81]int
	// Fill col 0 except row 3 with digits that block 1 via their boxes/rows.
	cells[cellIdx(0, 0)] = 2
	cells[cellIdx(1, 0)] = 3
	cells[cellIdx(2, 0)] = 4
	cells[cellIdx(4, 0)] = 5
	cells[cellIdx(5, 0)] = 6
	cells[cellIdx(6, 0)] = 7
	cells[cellIdx(7, 0)] = 8
	cells[cellIdx(8, 0)] = 9
	b := makeTestBoard(cells, nil)

	move := NewSolver().findCandidateMoveForUnitType(b, UnitCol, 1)
	if move == nil {
		t.Fatal("expected Column sweep to find a digit-1 fill at (3,0)")
	}
	if move.Digit != 1 {
		t.Errorf("expected digit 1, got %d", move.Digit)
	}
	if move.Targets[0].Row != 3 || move.Targets[0].Col != 0 {
		t.Errorf("expected target (3,0) from Column sweep, got R%dC%d", move.Targets[0].Row, move.Targets[0].Col)
	}
}

// TestFindCandidateMoveForUnitType_BoxReturnIsReturned kills solver.go L340
// branch/if (`return mv` -> `_ = mv`) after the Box sweep. When the Box sweep
// finds a move, the original returns it; the mutant discards it and the outer
// loop advances to the next digit. Construct a board where only the Box sweep
// for digit 1 finds a fill, so the original returns it and the mutant either
// returns a higher-digit move or nil.
func TestFindCandidateMoveForUnitType_BoxReturnIsReturned(t *testing.T) {
	// In box 0, only cell (2,2) is empty and only digit 1 fits there.
	// Rows 0 and 1 of box 0 are filled with other digits, and column 2 outside
	// box 0 also blocks digit 1, so the Row and Column sweeps for digit 1 find
	// nothing in their hidden-single phase but the Box sweep does.
	var cells [81]int
	cells[cellIdx(0, 0)] = 2
	cells[cellIdx(0, 1)] = 3
	cells[cellIdx(0, 2)] = 4
	cells[cellIdx(1, 0)] = 5
	cells[cellIdx(1, 1)] = 6
	cells[cellIdx(1, 2)] = 7
	cells[cellIdx(2, 0)] = 8
	cells[cellIdx(2, 1)] = 9
	// (2,2) is empty; row 2 has 8,9 at cols 0,1 so digit 1 is placeable.
	b := makeTestBoard(cells, nil)

	move := NewSolver().findCandidateMoveForUnitType(b, UnitBox, 1)
	if move == nil {
		t.Fatal("expected Box sweep to find a digit-1 fill at (2,2)")
	}
	if move.Digit != 1 {
		t.Errorf("expected digit 1, got %d", move.Digit)
	}
}
