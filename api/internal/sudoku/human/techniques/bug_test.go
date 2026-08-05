package techniques

import (
	"testing"

	"sudoku-api/internal/core"
)

// bugPlusOneBoard builds a true BUG+1: every empty cell is bi-value except the
// tri-value cell at R1C1, and digit 1 is the unique candidate appearing three
// times in that cell's row, column, and box.
func bugPlusOneBoard() *testBoard {
	return filledExcept(map[int][]int{
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
}

// TestDetectBUGFiresOnTrueBUGPlusOne drives a fully hand-built deadly pattern:
// every empty cell is bi-value, the lone tri-value cell (R1C1) sits one candidate
// away from a Bivalue Universal Grave, and digit 1 is the unique candidate that
// appears three times in its row, column, and box. The corrected detector must
// assign it.
func TestDetectBUGFiresOnTrueBUGPlusOne(t *testing.T) {
	b := bugPlusOneBoard()
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

// TestDetectBUGExplanationNamesTheBugCellInOneBasedCoordinates pins the move's
// explanation text. The row and column are reported one-based for the player,
// so R1C1 must appear for the zero-based bug cell at index 0.
func TestDetectBUGExplanationNamesTheBugCellInOneBasedCoordinates(t *testing.T) {
	move := DetectBUG(bugPlusOneBoard())
	if move == nil {
		t.Fatal("expected a BUG+1 assign move on a valid deadly-pattern board")
	}
	want := "BUG+1: All other cells are bi-value; R1C1 must be 1 to avoid multiple solutions"
	if move.Explanation != want {
		t.Errorf("explanation mismatch:\n got %q\nwant %q", move.Explanation, want)
	}
}

// TestDetectBUGNilWhenNoExtraCellExists covers the structural gate for a board
// that is already a full Bivalue Universal Grave: every empty cell is bi-value,
// so there is no "+1" cell to solve for and no cell to index into.
func TestDetectBUGNilWhenNoExtraCellExists(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(3, 0): {1, 5},
		idxOf(3, 4): {1, 5},
		idxOf(4, 0): {1, 5},
		idxOf(4, 4): {1, 5},
	})
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: a board with no extra cell is not a BUG+1, got %+v", move)
	}
}

// TestDetectBUGNilWhenLoneExtraCellHasOneCandidate covers the three-candidate
// requirement from below. The lone extra cell holds a single candidate, and the
// rest of the board is arranged so every other check would pass: the deadly
// pattern invariant holds and digit 1 appears three times in the cell's row,
// column, and box. Only the candidate-count gate rejects this board.
func TestDetectBUGNilWhenLoneExtraCellHasOneCandidate(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {1},
		idxOf(0, 1): {1, 4},
		idxOf(0, 2): {1, 4},
		idxOf(8, 1): {1, 4},
		idxOf(8, 2): {1, 4},
		idxOf(3, 0): {1, 5},
		idxOf(3, 4): {1, 5},
		idxOf(4, 0): {1, 5},
		idxOf(4, 4): {1, 5},
	})
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: a single-candidate extra cell is not a BUG+1, got %+v", move)
	}
}

// TestDetectBUGNilWhenEveryBugCandidateAppearsThrice covers the unique-restore
// gate. All three candidates of the extra cell appear three times in its row,
// column, and box, so the board admits no single restore digit. A digit reaches
// three in all three of the bug cell's units or in none of them, because every
// other unit of the same kind holds it an even number of times; there is
// therefore no board where the restore search finds exactly zero hits, and this
// three-hit shape is the only way the gate can reject.
func TestDetectBUGNilWhenEveryBugCandidateAppearsThrice(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(0, 1): {1, 2},
		idxOf(0, 2): {1, 2},
		idxOf(0, 3): {3, 4},
		idxOf(0, 4): {3, 4},
		idxOf(1, 1): {3, 5},
		idxOf(1, 2): {3, 5},
		idxOf(3, 0): {1, 2},
		idxOf(4, 0): {1, 3},
		idxOf(5, 0): {2, 3},
		idxOf(3, 6): {1, 2},
		idxOf(4, 6): {1, 3},
		idxOf(5, 6): {2, 3},
		idxOf(6, 1): {3, 5},
		idxOf(6, 2): {3, 5},
		idxOf(7, 3): {3, 4},
		idxOf(7, 4): {3, 4},
		idxOf(8, 1): {1, 2},
		idxOf(8, 2): {1, 2},
	})
	if !bugInvariantHolds(b, idxOf(0, 0)) {
		t.Fatal("fixture is wrong: the deadly-pattern invariant must hold for this board")
	}
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: three candidates each appear thrice, so no restore digit is unique, got %+v", move)
	}
}

// TestDetectBUGNilWhenInvariantFailsAwayFromTheBugCell covers the deadly-pattern
// gate. The board is the valid BUG+1 fixture plus one bi-value cell at R7C7
// whose two digits appear nowhere else in its row, column, or box. That cell
// breaks the invariant while leaving the bug cell's own units untouched, so the
// restore search still finds exactly one digit: only the invariant gate rejects
// this board.
func TestDetectBUGNilWhenInvariantFailsAwayFromTheBugCell(t *testing.T) {
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
		idxOf(6, 6): {8, 9},
	})
	if bugInvariantHolds(b, idxOf(0, 0)) {
		t.Fatal("fixture is wrong: R7C7 must break the deadly-pattern invariant")
	}
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: the board is not a pre-BUG deadly pattern, got %+v", move)
	}
}

// TestBugInvariantRejectsDigitNineViolation pins the top of the digit sweep.
// Digit 9 appears exactly once in R5C5's row, column, and box, which no unit may
// do, and it is the only digit on the board.
func TestBugInvariantRejectsDigitNineViolation(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {},
		idxOf(4, 4): {9},
	})
	if bugInvariantHolds(b, idxOf(0, 0)) {
		t.Error("expected false: digit 9 appears once in R5C5's units, which breaks the invariant")
	}
}

// TestBugInvariantRejectsDigitOneViolation pins the bottom of the digit sweep,
// mirroring the digit 9 case at the other end of the range.
func TestBugInvariantRejectsDigitOneViolation(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {},
		idxOf(4, 4): {1},
	})
	if bugInvariantHolds(b, idxOf(0, 0)) {
		t.Error("expected false: digit 1 appears once in R5C5's units, which breaks the invariant")
	}
}

// TestBugInvariantRejectsColumnOnlyViolation pins that column units are swept.
// Digit 9 sits twice in row 1 and twice in box 1, both legal, but once in each
// of columns 1 and 2. Only a column scan can see this.
func TestBugInvariantRejectsColumnOnlyViolation(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(8, 8): {},
		idxOf(0, 0): {9},
		idxOf(0, 1): {9},
	})
	if bugInvariantHolds(b, idxOf(8, 8)) {
		t.Error("expected false: digit 9 appears once in columns 1 and 2, which breaks the invariant")
	}
}

// TestBugInvariantRejectsBoxOnlyViolation pins that box units are swept. Digit 9
// sits twice in each of rows 1 to 3 and twice in each of columns 1 to 3, all
// legal, but six times in box 1. Only a box scan can see this.
func TestBugInvariantRejectsBoxOnlyViolation(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(8, 8): {},
		idxOf(0, 0): {9},
		idxOf(0, 1): {9},
		idxOf(1, 0): {9},
		idxOf(1, 2): {9},
		idxOf(2, 1): {9},
		idxOf(2, 2): {9},
	})
	if bugInvariantHolds(b, idxOf(8, 8)) {
		t.Error("expected false: digit 9 appears six times in box 1, which breaks the invariant")
	}
}

// TestBugInvariantRejectsLoneBugCandidateInBugUnit pins that the restore
// overshoot allowance is limited to a count of exactly three. A bug-cell
// candidate appearing once in the bug cell's own units is still a violation,
// even though the unit contains the bug cell and holds that candidate.
func TestBugInvariantRejectsLoneBugCandidateInBugUnit(t *testing.T) {
	b := filledExcept(map[int][]int{idxOf(0, 0): {7}})
	if bugInvariantHolds(b, idxOf(0, 0)) {
		t.Error("expected false: a bug candidate appearing once in its own units is not the restore overshoot")
	}
}

// TestCountDigitInUnitIgnoresFilledCells pins that only empty cells contribute.
// A solved cell may still carry stale candidate bits, and counting those would
// inflate every unit tally the BUG invariant rests on.
func TestCountDigitInUnitIgnoresFilledCells(t *testing.T) {
	b := &testBoard{}
	b.cells[idxOf(0, 0)] = 5
	b.candidates[idxOf(0, 0)] = b.candidates[idxOf(0, 0)].Set(7)
	b.candidates[idxOf(0, 1)] = b.candidates[idxOf(0, 1)].Set(7)

	if got := countDigitInUnit(b, RowIndices[0], 7); got != 1 {
		t.Errorf("expected 1 (only the empty cell counts), got %d", got)
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
