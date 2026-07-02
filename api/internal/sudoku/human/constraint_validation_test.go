package human

import (
	"strings"
	"testing"
)

// TestConstraintViolation_DuplicateInRow tests detection of duplicate values in the same row
func TestConstraintViolation_DuplicateInRow(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 5
	givens[4] = 5

	solver := NewSolver()
	board := NewBoard(givens)
	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected constraint violation move, got nil")
	}
	if move.Technique != "constraint-violation-duplicate-row" {
		t.Errorf("technique: got %q", move.Technique)
	}
	if move.Digit != 5 {
		t.Errorf("digit: got %d", move.Digit)
	}
	if len(move.Targets) != 2 {
		t.Fatalf("targets: got %d", len(move.Targets))
	}
	if move.Targets[0].Row != 0 || move.Targets[0].Col != 0 {
		t.Errorf("target[0]: expected R0C0, got R%dC%d", move.Targets[0].Row, move.Targets[0].Col)
	}
	if move.Targets[1].Row != 0 || move.Targets[1].Col != 4 {
		t.Errorf("target[1]: expected R0C4, got R%dC%d", move.Targets[1].Row, move.Targets[1].Col)
	}
	if len(move.Highlights.Primary) != 2 {
		t.Errorf("primary highlights: expected 2, got %d", len(move.Highlights.Primary))
	}
	if len(move.Highlights.Secondary) != 9 {
		t.Errorf("secondary highlights: expected 9 (full row), got %d", len(move.Highlights.Secondary))
	}
	if !strings.Contains(move.Explanation, "row 1") {
		t.Errorf("explanation should mention 'row 1', got: %s", move.Explanation)
	}
	if !strings.Contains(move.Explanation, "R1C1") {
		t.Errorf("explanation should contain R1C1, got: %s", move.Explanation)
	}
	if !strings.Contains(move.Explanation, "R1C5") {
		t.Errorf("explanation should contain R1C5, got: %s", move.Explanation)
	}
}

// TestConstraintViolation_DuplicateInColumn tests detection of duplicate values in the same column
func TestConstraintViolation_DuplicateInColumn(t *testing.T) {
	givens := make([]int, 81)
	givens[1] = 3
	givens[19] = 3

	solver := NewSolver()
	board := NewBoard(givens)
	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected constraint violation move, got nil")
	}
	if move.Technique != "constraint-violation-duplicate-col" {
		t.Errorf("technique: got %q", move.Technique)
	}
	if move.Digit != 3 {
		t.Errorf("digit: got %d", move.Digit)
	}
	if len(move.Targets) != 2 {
		t.Fatalf("targets: got %d", len(move.Targets))
	}
	if move.Targets[0].Row != 0 || move.Targets[0].Col != 1 {
		t.Errorf("target[0]: expected R0C1, got R%dC%d", move.Targets[0].Row, move.Targets[0].Col)
	}
	if move.Targets[1].Row != 2 || move.Targets[1].Col != 1 {
		t.Errorf("target[1]: expected R2C1, got R%dC%d", move.Targets[1].Row, move.Targets[1].Col)
	}
	if len(move.Highlights.Secondary) != 9 {
		t.Errorf("secondary highlights: expected 9 (full column), got %d", len(move.Highlights.Secondary))
	}
	if !strings.Contains(move.Explanation, "column 2") {
		t.Errorf("explanation should mention 'column 2', got: %s", move.Explanation)
	}
	if !strings.Contains(move.Explanation, "R1C2") {
		t.Errorf("explanation should contain R1C2, got: %s", move.Explanation)
	}
	if !strings.Contains(move.Explanation, "R3C2") {
		t.Errorf("explanation should contain R3C2, got: %s", move.Explanation)
	}
}

func TestConstraintViolation_DuplicateInBox(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 7
	givens[10] = 7

	solver := NewSolver()
	board := NewBoard(givens)
	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatal("Expected constraint violation move, got nil")
	}
	if move.Technique != "constraint-violation-duplicate-box" {
		t.Errorf("technique: got %q", move.Technique)
	}
	if move.Digit != 7 {
		t.Errorf("digit: got %d", move.Digit)
	}
	if len(move.Targets) != 2 {
		t.Fatalf("targets: got %d", len(move.Targets))
	}
	if move.Targets[0].Row != 0 || move.Targets[0].Col != 0 {
		t.Errorf("target[0]: expected R0C0, got R%dC%d", move.Targets[0].Row, move.Targets[0].Col)
	}
	if move.Targets[1].Row != 1 || move.Targets[1].Col != 1 {
		t.Errorf("target[1]: expected R1C1, got R%dC%d", move.Targets[1].Row, move.Targets[1].Col)
	}
	if len(move.Highlights.Secondary) != 9 {
		t.Errorf("secondary highlights: expected 9 (full box), got %d", len(move.Highlights.Secondary))
	}
	secondaryExpected := map[[2]int]bool{{0, 0}: true, {0, 1}: true, {0, 2}: true, {1, 0}: true, {1, 1}: true, {1, 2}: true, {2, 0}: true, {2, 1}: true, {2, 2}: true}
	for _, ref := range move.Highlights.Secondary {
		key := [2]int{ref.Row, ref.Col}
		if !secondaryExpected[key] {
			t.Errorf("unexpected secondary highlight R%dC%d (box 0 should only contain rows 0-2, cols 0-2)", ref.Row, ref.Col)
		}
	}
	if !strings.Contains(move.Explanation, "box 1") {
		t.Errorf("explanation should mention 'box 1', got: %s", move.Explanation)
	}
	if !strings.Contains(move.Explanation, "R1C1") {
		t.Errorf("explanation should contain R1C1, got: %s", move.Explanation)
	}
	if !strings.Contains(move.Explanation, "R2C2") {
		t.Errorf("explanation should contain R2C2, got: %s", move.Explanation)
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
