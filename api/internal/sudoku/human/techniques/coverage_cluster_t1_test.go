package techniques

import (
	"strings"
	"testing"

	"sudoku-api/pkg/constants"
)

// This file drives the last uncovered branches in a cluster of solver files:
// board.go, simple.go, triples.go, chains.go, and fish.go. Each test asserts
// real behavior (an elimination, a placement being skipped, or the exact
// output of a formatting/helper function).

// ============================================================================
// board.go
// ============================================================================

// Clear on an out-of-range digit must be a no-op, mirroring Set's guard.
func TestCandidatesClearIgnoresOutOfRangeDigit(t *testing.T) {
	full := AllCandidates()
	if full.Clear(0) != full {
		t.Error("Clear(0) must be a no-op")
	}
	if full.Clear(constants.GridSize+1) != full {
		t.Errorf("Clear(%d) must be a no-op", constants.GridSize+1)
	}
	// Sanity: an in-range clear still works.
	if full.Clear(1) == full {
		t.Error("Clear(1) should remove digit 1")
	}
}

// UnitType.String returns the empty string for a value outside the row/col/box
// enumeration.
func TestUnitTypeStringUnknownValueIsEmpty(t *testing.T) {
	if got := UnitType(99).String(); got != "" {
		t.Errorf("UnitType(99).String() = %q, want empty string", got)
	}
}

// ============================================================================
// simple.go
// ============================================================================

// findHiddenSingleInUnit must skip a digit whose only candidate position is a
// cell that is already a naked single (Count() <= 1), since that placement is
// the province of naked-single detection.
func TestFindHiddenSingleInUnitSkipsNakedSingleCell(t *testing.T) {
	b := &testBoard{}
	// In row 0, digit 5 is a candidate in exactly one cell (R1C1), and that
	// cell has only digit 5 as a candidate: a naked single, not a hidden one.
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{5})

	if move := findHiddenSingleInUnit(b, 0, RowIndices[0], "row"); move != nil {
		t.Errorf("expected no hidden single for a naked-single cell, got %+v", move)
	}
}

// ============================================================================
// triples.go
// ============================================================================

// combinationsSizeK yields nothing when k is negative or larger than the item
// count.
func TestCombinationsSizeKGuardsInvalidK(t *testing.T) {
	items := []int{1, 2, 3}

	calls := 0
	combinationsSizeK(items, len(items)+1, func([]int) bool { calls++; return false })
	if calls != 0 {
		t.Errorf("k > n should yield no combinations, got %d", calls)
	}

	calls = 0
	combinationsSizeK(items, -1, func([]int) bool { calls++; return false })
	if calls != 0 {
		t.Errorf("k < 0 should yield no combinations, got %d", calls)
	}

	// Sanity: a valid k still enumerates.
	calls = 0
	combinationsSizeK(items, 2, func([]int) bool { calls++; return false })
	if calls != 3 {
		t.Errorf("expected 3 pairs, got %d", calls)
	}
}

// ============================================================================
// chains.go: direction helpers
// ============================================================================

// cellCoordsForDirection maps (primary, secondary) to (row, col) differently for
// rows and columns.
func TestCellCoordsForDirectionBothAxes(t *testing.T) {
	if r, c := cellCoordsForDirection(UnitRow, 2, 6); r != 2 || c != 6 {
		t.Errorf("UnitRow: got (%d,%d), want (2,6)", r, c)
	}
	if r, c := cellCoordsForDirection(UnitCol, 2, 6); r != 6 || c != 2 {
		t.Errorf("UnitCol: got (%d,%d), want (6,2)", r, c)
	}
}

// directionNamePlural names the axis for explanation strings.
func TestDirectionNamePluralBothAxes(t *testing.T) {
	if got := directionNamePlural(UnitRow); got != "rows" {
		t.Errorf("UnitRow plural = %q, want rows", got)
	}
	if got := directionNamePlural(UnitCol); got != "columns" {
		t.Errorf("UnitCol plural = %q, want columns", got)
	}
}

// ============================================================================
// chains.go: DetectJellyfish column direction
// ============================================================================

// DetectJellyfish must find a Jellyfish oriented along columns when no row-based
// Jellyfish exists for the digit. Four columns hold digit 7 across exactly four
// rows (a valid cover set), and a fifth column carries digit 7 inside one of
// those rows, which is the elimination. The stray candidate expands the row-view
// cover set to five columns, so the row direction cannot fire first.
func TestDetectJellyfishFiresInColumnDirection(t *testing.T) {
	b := &testBoard{}
	set := func(row, col int) { b.candidates[idxOf(row, col)] = NewCandidates([]int{7}) }
	// Column cover: col0 rows{0,1}, col1 rows{1,2}, col2 rows{2,3}, col3 rows{0,3}.
	set(0, 0)
	set(1, 0)
	set(1, 1)
	set(2, 1)
	set(2, 2)
	set(3, 2)
	set(0, 3)
	set(3, 3)
	// Elimination cell: digit 7 in a covered row (row 0) but a non-base column.
	set(0, 4)

	move := DetectJellyfish(b)
	if move == nil {
		t.Fatal("expected a column-oriented Jellyfish, got nil")
	}
	if !strings.Contains(move.Explanation, "columns") {
		t.Errorf("expected column Jellyfish, explanation = %q", move.Explanation)
	}
	if move.Digit != 7 {
		t.Errorf("expected digit 7, got %d", move.Digit)
	}
	// The stray candidate at R1C5 is the elimination.
	found := false
	for _, e := range move.Eliminations {
		if e.Row == 0 && e.Col == 4 && e.Digit == 7 {
			found = true
		}
	}
	if !found {
		t.Errorf("expected elimination of 7 at R1C5, got %+v", move.Eliminations)
	}
}

// ============================================================================
// chains.go: internal chain-helper guards
// ============================================================================

// findChainEndpointElimination returns nil for a degenerate path with fewer than
// two endpoints.
func TestFindChainEndpointEliminationRejectsShortPath(t *testing.T) {
	b := emptyCandidateBoard()
	if move := findChainEndpointElimination(b, 5, []int{0}, "eliminate %d from R%dC%d"); move != nil {
		t.Errorf("expected nil for a single-cell path, got %+v", move)
	}
}

// findXYChainFrom returns nil when the start cell is not bivalue.
func TestFindXYChainFromRejectsNonBivalueStart(t *testing.T) {
	b := &testBoard{}
	// Start cell has three candidates, so it cannot anchor an XY-Chain.
	b.candidates[0] = NewCandidates([]int{1, 2, 3})
	if move := findXYChainFrom(b, 0, nil); move != nil {
		t.Errorf("expected nil for a non-bivalue start, got %+v", move)
	}
}
