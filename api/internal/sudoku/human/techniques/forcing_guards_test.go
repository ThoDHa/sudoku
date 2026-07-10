package techniques

import (
	"testing"

	"sudoku-api/pkg/constants"
)

// TestTryDigitForcingChainRejectsSinglePosition covers the len(positions) < 2
// guard: a single starting position cannot form a forcing chain, so the helper
// returns nil without propagating.
func TestTryDigitForcingChainRejectsSinglePosition(t *testing.T) {
	b := emptyCandidateBoard()
	if move := tryDigitForcingChain(b, 1, []int{0}, "row", 0); move != nil {
		t.Fatalf("expected nil for single position, got %+v", move)
	}
}

// TestFindCommonPlacementEmptyResults covers the len(results) == 0 guard.
func TestFindCommonPlacementEmptyResults(t *testing.T) {
	b := emptyCandidateBoard()
	if move := findCommonPlacement(b, 1, []int{0, 1}, nil, "row", 0); move != nil {
		t.Fatalf("expected nil for empty results, got %+v", move)
	}
}

// TestFindCommonPlacementSkipsFilledCell covers the branch where a common
// placement lands on a cell already filled on the board: such a placement must
// be skipped, yielding no move.
func TestFindCommonPlacementSkipsFilledCell(t *testing.T) {
	b := emptyCandidateBoard()
	b.cells[40] = 5 // R5C5 already filled

	r1 := newDigitForcingResult()
	r1.addPlacement(40, 5)
	r2 := newDigitForcingResult()
	r2.addPlacement(40, 5)

	if move := findCommonPlacement(b, 1, []int{0, 1}, []*digitForcingResult{r1, r2}, "row", 0); move != nil {
		t.Fatalf("expected nil when common placement targets a filled cell, got %+v", move)
	}
}

// TestFindCommonEliminationEmptyResults covers the len(results) == 0 guard.
func TestFindCommonEliminationEmptyResults(t *testing.T) {
	b := emptyCandidateBoard()
	if move := findCommonElimination(b, 1, []int{0, 1}, nil, "row", 0); move != nil {
		t.Fatalf("expected nil for empty results, got %+v", move)
	}
}

// TestFindCommonEliminationSkipsAbsentCandidate covers the branch where a
// recorded elimination targets a digit the board no longer lists as a
// candidate: it must be skipped, yielding no move.
func TestFindCommonEliminationSkipsAbsentCandidate(t *testing.T) {
	b := emptyCandidateBoard() // no cell has any candidate

	r1 := newDigitForcingResult()
	r1.addElimination(40, 3)
	r2 := newDigitForcingResult()
	r2.addElimination(40, 3)

	if move := findCommonElimination(b, 1, []int{0, 1}, []*digitForcingResult{r1, r2}, "row", 0); move != nil {
		t.Fatalf("expected nil when eliminated digit is not a live candidate, got %+v", move)
	}
}

// TestTryUnitForcingChainAllPositionsInvalid covers the branch where more than
// one position is contradicted (validCount < len and != 1): on an
// empty-candidate board, propagating from either position immediately hits an
// empty cell, so both branches are invalid and the helper returns nil.
func TestTryUnitForcingChainAllPositionsInvalid(t *testing.T) {
	b := emptyCandidateBoard()
	if move := tryUnitForcingChain(b, 5, []int{0, 1}, "row 1"); move != nil {
		t.Fatalf("expected nil when all positions are contradicted, got %+v", move)
	}
}

// TestDetectCellForcingChainSkipsInvalidTrivalue covers the validCount < len
// continue for a trivalue cell: R1C1 has candidates {1,3,9} and is the only home
// for 9 in row 0, so placing 1 or 3 there leaves 9 homeless (contradiction)
// while only 9 survives. Because the cell has three candidates, the bivalue
// contradiction shortcut does not apply, the partially-invalid cell is skipped,
// and no move is produced.
func TestDetectCellForcingChainSkipsInvalidTrivalue(t *testing.T) {
	var cells [constants.TotalCells]int
	overrides := map[int][]int{
		0: {1, 3, 9}, // R1C1 trivalue; only cell in row 0 that can hold 9
	}
	for c := 1; c <= 8; c++ {
		overrides[c] = []int{2, 3, 4, 5, 6, 7, 8}
	}
	b := boardFromMap(cells, overrides)

	if move := detectCellForcingChain(b); move != nil {
		t.Fatalf("expected nil (trivalue cell with contradiction branches is skipped), got %+v", move)
	}
}

// TestPropagateSinglesHiddenSingleContradiction covers the hidden-single
// contradiction path in propagateSingles: after the assumed placement fills the
// only cell where digit 9 could go in row 0, that digit has nowhere left to go
// in the row, so propagation reports an invalid (contradicted) result.
func TestPropagateSinglesHiddenSingleContradiction(t *testing.T) {
	var cells [constants.TotalCells]int
	overrides := map[int][]int{
		0: {1, 9}, // R1C1: only cell in row 0 that can hold 9
	}
	// Remaining row-0 cells cannot hold 9 (and are not naked singles).
	for c := 1; c <= 8; c++ {
		overrides[c] = []int{2, 3, 4, 5, 6, 7, 8}
	}
	b := boardFromMap(cells, overrides)

	res := propagateSingles(b, 0, 1, maxPropagationDepth)
	if res.valid {
		t.Fatal("expected contradiction (valid == false) when digit 9 loses its only home in row 0")
	}
}
