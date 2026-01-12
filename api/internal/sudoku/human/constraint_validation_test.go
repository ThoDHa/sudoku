package human

import (
	"testing"
)

// TestConstraintViolation_DuplicateInRow tests detection of duplicate values in the same row
func TestConstraintViolation_DuplicateInRow(t *testing.T) {
	// Create a board with duplicate 5's in row 1
	givens := make([]int, 81)
	givens[0] = 5 // R1C1 = 5
	givens[4] = 5 // R1C5 = 5 (DUPLICATE!)

	solver := NewSolver()
	board := NewBoard(givens)

	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected constraint violation move, got nil")
	}

	if move.Technique != "constraint-violation-duplicate-row" {
		t.Errorf("Expected technique 'constraint-violation-duplicate-row', got '%s'", move.Technique)
	}

	if move.Action != "contradiction" {
		t.Errorf("Expected action 'contradiction', got '%s'", move.Action)
	}

	if move.Digit != 5 {
		t.Errorf("Expected digit 5, got %d", move.Digit)
	}

	if len(move.Targets) != 2 {
		t.Errorf("Expected 2 target cells, got %d", len(move.Targets))
	}
}

// TestConstraintViolation_DuplicateInColumn tests detection of duplicate values in the same column
func TestConstraintViolation_DuplicateInColumn(t *testing.T) {
	// Create a board with duplicate 3's in column 2
	givens := make([]int, 81)
	givens[1] = 3  // R1C2 = 3
	givens[19] = 3 // R3C2 = 3 (DUPLICATE!)

	solver := NewSolver()
	board := NewBoard(givens)

	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected constraint violation move, got nil")
	}

	if move.Technique != "constraint-violation-duplicate-col" {
		t.Errorf("Expected technique 'constraint-violation-duplicate-col', got '%s'", move.Technique)
	}

	if move.Action != "contradiction" {
		t.Errorf("Expected action 'contradiction', got '%s'", move.Action)
	}

	if move.Digit != 3 {
		t.Errorf("Expected digit 3, got %d", move.Digit)
	}

	if len(move.Targets) != 2 {
		t.Errorf("Expected 2 target cells, got %d", len(move.Targets))
	}
}

// TestConstraintViolation_DuplicateInBox tests detection of duplicate values in the same box
func TestConstraintViolation_DuplicateInBox(t *testing.T) {
	// Create a board with duplicate 7's in box 1 (top-left 3x3)
	givens := make([]int, 81)
	givens[0] = 7  // R1C1 = 7
	givens[10] = 7 // R2C2 = 7 (DUPLICATE in same box!)

	solver := NewSolver()
	board := NewBoard(givens)

	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected constraint violation move, got nil")
	}

	if move.Technique != "constraint-violation-duplicate-box" {
		t.Errorf("Expected technique 'constraint-violation-duplicate-box', got '%s'", move.Technique)
	}

	if move.Action != "contradiction" {
		t.Errorf("Expected action 'contradiction', got '%s'", move.Action)
	}

	if move.Digit != 7 {
		t.Errorf("Expected digit 7, got %d", move.Digit)
	}

	if len(move.Targets) != 2 {
		t.Errorf("Expected 2 target cells, got %d", len(move.Targets))
	}
}

// TestConstraintViolation_InvalidCandidate tests detection of invalid candidates
func TestConstraintViolation_InvalidCandidate(t *testing.T) {
	// Create a board where a candidate conflicts with an existing value
	givens := make([]int, 81)
	givens[0] = 5 // R1C1 = 5

	// Create board with existing candidates
	candidates := make([][]int, 81)
	for i := range candidates {
		candidates[i] = []int{}
	}
	// Add invalid candidate: R1C2 has candidate 5, but 5 is already in R1C1 (same row)
	candidates[1] = []int{5, 6, 7}

	solver := NewSolver()
	board := NewBoardWithCandidates(givens, candidates)

	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected constraint violation move, got nil")
	}

	if move.Technique != "constraint-violation-invalid-candidate" {
		t.Errorf("Expected technique 'constraint-violation-invalid-candidate', got '%s'", move.Technique)
	}

	if move.Action != "eliminate" {
		t.Errorf("Expected action 'eliminate', got '%s'", move.Action)
	}

	if move.Digit != 5 {
		t.Errorf("Expected digit 5, got %d", move.Digit)
	}

	if len(move.Eliminations) != 1 {
		t.Errorf("Expected 1 elimination, got %d", len(move.Eliminations))
	}
}

// TestNoConstraintViolation_ValidBoard tests that a valid board doesn't trigger false positives
func TestNoConstraintViolation_ValidBoard(t *testing.T) {
	// Create a simple valid board with a simple puzzle
	// This puzzle string is intentionally simple and valid
	puzzleString := "530070000600195000098000060800060003400803001700020006060000280000419005000080079"

	givens := make([]int, 81)
	for i, c := range puzzleString {
		if c >= '1' && c <= '9' {
			givens[i] = int(c - '0')
		}
	}

	solver := NewSolver()
	board := NewBoard(givens)

	move := solver.FindNextMove(board)

	// A valid puzzle should return SOME move (candidate filling, singles, etc.)
	// It just shouldn't be a constraint violation
	if move != nil {
		// Should NOT be a constraint violation
		if move.Technique == "constraint-violation-duplicate-row" ||
			move.Technique == "constraint-violation-duplicate-col" ||
			move.Technique == "constraint-violation-duplicate-box" ||
			move.Technique == "constraint-violation-invalid-candidate" {
			t.Errorf("Valid board should not trigger constraint violation, got technique '%s'", move.Technique)
		}
	}
	// If move is nil, that's also acceptable - it means the puzzle is solved or stalled
}

// TestConstraintViolation_PriorityOverOtherMoves tests that constraint violations are detected FIRST
func TestConstraintViolation_PriorityOverOtherMoves(t *testing.T) {
	// Create a board with both a constraint violation AND a valid move
	givens := make([]int, 81)
	givens[0] = 5 // R1C1 = 5
	givens[4] = 5 // R1C5 = 5 (DUPLICATE!)
	// Add other numbers that would create valid moves
	givens[9] = 1
	givens[18] = 2

	solver := NewSolver()
	board := NewBoard(givens)

	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected move, got nil")
	}

	// The FIRST move should be the constraint violation
	if move.Technique != "constraint-violation-duplicate-row" {
		t.Errorf("Constraint violation should be detected first, but got technique '%s'", move.Technique)
	}
}
