package techniques

import (
	"testing"

	"sudoku-api/internal/core"
)

// TestDetectBUGFiresOnTrueBUGPlusOne drives a fully hand-built deadly pattern:
// every empty cell is bi-value, the lone tri-value cell (R1C1) sits one candidate
// away from a Bivalue Universal Grave, and digit 1 is the unique candidate that
// appears three times in its row, column, and box. The corrected detector must
// assign it.
func TestDetectBUGFiresOnTrueBUGPlusOne(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(0, 1): {1, 4},
		idxOf(0, 2): {1, 4},
		idxOf(0, 3): {2, 3},
		idxOf(1, 0): {2, 3},
		idxOf(1, 3): {2, 3},
		idxOf(8, 1): {1, 4},
		idxOf(8, 2): {1, 4},
		idxOf(3, 0): {1, 5},
		idxOf(3, 4): {1, 5},
		idxOf(4, 0): {1, 5},
		idxOf(4, 4): {1, 5},
	})
	move := DetectBUG(b)
	if move == nil {
		t.Fatal("expected a BUG+1 assign move on a valid deadly-pattern board")
	}
	if move.Action != "assign" || move.Digit != 1 {
		t.Errorf("expected assign digit 1, got %+v", move)
	}
	if len(move.Targets) != 1 || move.Targets[0] != (core.CellRef{Row: 0, Col: 0}) {
		t.Errorf("expected target R1C1, got %+v", move.Targets)
	}
}

// TestDetectBUGNilOnSingleUnitRowCoincidence is the OR->AND regression. A bug
// candidate appears three times in one unit (the row) but not in its column or
// box, and the rest of the board is not a deadly pattern. The previous OR-based
// detector fired here; the corrected detector must return nil because the
// pre-BUG invariant fails.
func TestDetectBUGNilOnSingleUnitRowCoincidence(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(4, 4): {1, 2, 3},
		idxOf(4, 0): {1, 5},
		idxOf(4, 8): {1, 6},
	})
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: single-unit row coincidence is not a BUG+1, got %+v", move)
	}
}

// TestDetectBUGNilOnSingleUnitBoxCoincidence mirrors the row-coincidence guard
// for a box coincidence: digit 1 reaches three appearances in the box but not in
// the bug cell's row or column, so no true restore digit exists.
func TestDetectBUGNilOnSingleUnitBoxCoincidence(t *testing.T) {
	bug := idxOf(4, 4)
	boxTopRow := (bug / 27) * 3
	boxTopCol := ((bug % 9) / 3) * 3
	b := filledExcept(map[int][]int{
		bug:                             {1, 2, 3},
		idxOf(boxTopRow, boxTopCol):     {1, 5},
		idxOf(boxTopRow+2, boxTopCol+2): {1, 6},
	})
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: single-unit box coincidence is not a BUG+1, got %+v", move)
	}
}
