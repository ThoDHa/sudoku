package techniques

import (
	"testing"

	"sudoku-api/pkg/constants"
)

// overrideBoard wraps boardFromMap for the advanced-detector tests: empty cells
// start with all candidates, then the per-cell overrides are applied, so each
// test sculpts exactly the candidate geometry its technique requires.
func overrideBoard(overrides map[int][]int) *testBoard {
	var cells [constants.TotalCells]int
	return boardFromMap(cells, overrides)
}

// TestDetectXYWingEliminatesCommonCandidateOfTwoWings covers the XY-Wing
// detector: a bivalue pivot {x,y} with two bivalue wings {x,z} and {y,z} that
// both see the pivot eliminates z from any cell seeing both wings.
func TestDetectXYWingEliminatesCommonCandidateOfTwoWings(t *testing.T) {
	// Pivot R1C1 {1,2}; XZ-wing R1C2 {1,3} (sees pivot in row 1);
	// YZ-wing R2C1 {2,3} (sees pivot in column 1). R2C2 sees both wings
	// (column 2 and row 2) and carries candidate 3, so 3 is eliminated there.
	board := overrideBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {1, 3},
		idxOf(1, 0): {2, 3},
	})

	move := DetectXYWing(board)
	if move == nil {
		t.Fatal("expected XY-Wing to fire on a valid pivot+wings geometry")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if move.Digit != 3 {
		t.Errorf("expected eliminated digit 3, got %d", move.Digit)
	}
	if len(move.Eliminations) == 0 {
		t.Error("expected at least one elimination from the XY-Wing")
	}
	for _, e := range move.Eliminations {
		if e.Digit != 3 {
			t.Errorf("elimination digit must be 3, got %d", e.Digit)
		}
	}
}

// TestDetectXYZWingEliminatesCommonCandidateOfPivotAndWings covers the XYZ-Wing
// detector: a trivalue pivot {X,Y,Z} with two bivalue wings {X,Z} and {Y,Z}
// that both see the pivot eliminates Z from any cell seeing all three.
func TestDetectXYZWingEliminatesCommonCandidateOfPivotAndWings(t *testing.T) {
	// Pivot R1C1 {1,2,3}; XZ-wing R1C2 {1,3} (sees pivot in row 1);
	// YZ-wing R2C1 {2,3} (sees pivot in column 1). R2C2 sees all three
	// (box 0, column 2, row 2) and carries candidate 3, so 3 is eliminated.
	board := overrideBoard(map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(0, 1): {1, 3},
		idxOf(1, 0): {2, 3},
	})

	move := DetectXYZWing(board)
	if move == nil {
		t.Fatal("expected XYZ-Wing to fire on a valid pivot+wings geometry")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if move.Digit != 3 {
		t.Errorf("expected eliminated digit 3, got %d", move.Digit)
	}
	if len(move.Eliminations) == 0 {
		t.Error("expected at least one elimination from the XYZ-Wing")
	}
}
