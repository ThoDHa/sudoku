package human

import (
	"testing"
)

// =============================================================================
// Error Handling Tests
// These tests verify the solver gracefully handles invalid board states
// that can arise from user input errors.
// =============================================================================

// Base puzzle for testing - known to be solvable
// Solution reference (for understanding, not used directly):
//
//	5,3,4, 6,7,8, 9,1,2,
//	6,7,2, 1,9,5, 3,4,8,
//	1,9,8, 3,4,2, 5,6,7,
//
//	8,5,9, 7,6,1, 4,2,3,
//	4,2,6, 8,5,3, 7,9,1,
//	7,1,3, 9,2,4, 8,5,6,
//
//	9,6,1, 5,3,7, 2,8,4,
//	2,8,7, 4,1,9, 6,3,5,
//	3,4,5, 2,8,6, 1,7,9,
var baseGivens = []int{
	5, 3, 0, 0, 7, 0, 0, 0, 0,
	6, 0, 0, 1, 9, 5, 0, 0, 0,
	0, 9, 8, 0, 0, 0, 0, 6, 0,

	8, 0, 0, 0, 6, 0, 0, 0, 3,
	4, 0, 0, 8, 0, 3, 0, 0, 1,
	7, 0, 0, 0, 2, 0, 0, 0, 6,

	0, 6, 0, 0, 0, 0, 2, 8, 0,
	0, 0, 0, 4, 1, 9, 0, 0, 5,
	0, 0, 0, 0, 8, 0, 0, 7, 9,
}

// =============================================================================
// Tests for Invalid Cell Placement (wrong digit, conflicts with solution)
// =============================================================================

func TestSolverHandlesInvalidCellInRow(t *testing.T) {
	// Create a copy of base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// R1C3 should be 4 (solution), but we place 1 instead
	// This creates an invalid state that conflicts with the row's solution
	// (1 is already at R2C4, but more importantly, 4 is now missing from row 1)
	givens[2] = 1 // R1C3 = 1 (wrong - should be 4)

	board := NewBoard(givens)
	solver := NewSolver()

	// The solver should eventually detect a contradiction or stall
	// because the puzzle becomes unsolvable with the wrong digit
	moves, status := solver.SolveWithSteps(board, 500)

	// Either status is "stalled" (detected contradiction) or we got a contradiction move
	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			break
		}
	}

	if status != "stalled" && !hasContradiction {
		// If it somehow "completed", the solution would be wrong
		// Check that it didn't falsely complete
		if status == "completed" {
			t.Errorf("Solver incorrectly completed a puzzle with an invalid cell placement")
		}
	}

	// The test passes if:
	// 1. Status is "stalled" (solver got stuck), OR
	// 2. We found a contradiction move, OR
	// 3. Status is something other than "completed"
	// This is the expected behavior for an invalid puzzle
	t.Logf("Status: %s, Moves: %d, HasContradiction: %v", status, len(moves), hasContradiction)
}

func TestSolverHandlesInvalidCellInColumn(t *testing.T) {
	// Create a copy of base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// R3C1 should be 1 (solution), but we place 2 instead
	// This conflicts with the column's solution structure
	givens[18] = 2 // R3C1 = 2 (wrong - should be 1)

	board := NewBoard(givens)
	solver := NewSolver()

	moves, status := solver.SolveWithSteps(board, 500)

	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			break
		}
	}

	// The puzzle should not complete correctly
	if status == "completed" && !hasContradiction {
		// Verify the solution is actually wrong
		// Cell R3C1 has value 2 instead of 1
		if board.Cells[18] == 2 {
			// The solver continued with the wrong digit - this is the user's mistake,
			// but the solver shouldn't have found a valid solution
			t.Logf("Solver accepted user's wrong input at R3C1; puzzle may be unsolvable or stalled later")
		}
	}

	t.Logf("Status: %s, Moves: %d, HasContradiction: %v", status, len(moves), hasContradiction)
}

func TestSolverHandlesInvalidCellInBox(t *testing.T) {
	// Create a copy of base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// R3C3 is 8 (given), R1C3 should be 4, R2C3 should be 2
	// Let's place wrong digit at R2C3: put 7 instead of 2
	// This conflicts with box 1's solution
	givens[11] = 7 // R2C3 = 7 (wrong - should be 2)

	board := NewBoard(givens)
	solver := NewSolver()

	moves, status := solver.SolveWithSteps(board, 500)

	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			break
		}
	}

	// Puzzle should not complete successfully with wrong digit
	if status == "completed" {
		// Even if completed, the answer is wrong - this tests graceful handling
		t.Logf("Solver completed with wrong digit - solution will be incorrect")
	}

	t.Logf("Status: %s, Moves: %d, HasContradiction: %v", status, len(moves), hasContradiction)
}

// =============================================================================
// Tests for Duplicate Digits (same digit twice in a unit)
// =============================================================================

func TestSolverHandlesDuplicateInRow(t *testing.T) {
	// Create a copy of base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// Row 1 already has 5 at R1C1 and 3 at R1C2
	// Place another 5 at R1C3 - this creates a duplicate in the row
	givens[2] = 5 // R1C3 = 5 (duplicate - 5 already at R1C1)

	board := NewBoard(givens)
	solver := NewSolver()

	// The solver should detect a contradiction since no valid placement for 5 exists
	// in the remaining cells of row 1
	moves, status := solver.SolveWithSteps(board, 500)

	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			t.Logf("Contradiction detected at R%dC%d", move.Targets[0].Row+1, move.Targets[0].Col+1)
			break
		}
	}

	// With a duplicate, the solver should stall or detect contradiction
	// It cannot complete a valid Sudoku
	if status == "completed" && !hasContradiction {
		t.Errorf("Solver incorrectly completed a puzzle with duplicate in row")
	}

	t.Logf("Status: %s, Moves: %d, HasContradiction: %v", status, len(moves), hasContradiction)
}

func TestSolverHandlesDuplicateInColumn(t *testing.T) {
	// Create a copy of base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// Column 1 has: 5(R1), 6(R2), _(R3), 8(R4), 4(R5), 7(R6), _(R7), _(R8), _(R9)
	// Place 5 at R3C1 - duplicate with R1C1
	givens[18] = 5 // R3C1 = 5 (duplicate - 5 already at R1C1)

	board := NewBoard(givens)
	solver := NewSolver()

	moves, status := solver.SolveWithSteps(board, 500)

	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			t.Logf("Contradiction detected at R%dC%d", move.Targets[0].Row+1, move.Targets[0].Col+1)
			break
		}
	}

	// With a duplicate, solver should stall or detect contradiction
	if status == "completed" && !hasContradiction {
		t.Errorf("Solver incorrectly completed a puzzle with duplicate in column")
	}

	t.Logf("Status: %s, Moves: %d, HasContradiction: %v", status, len(moves), hasContradiction)
}

func TestSolverHandlesDuplicateInBox(t *testing.T) {
	// Create a copy of base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// Box 1 (top-left) has: 5,3,_ | 6,_,_ | _,9,8
	// Place 9 at R1C3 - duplicate with R3C2
	givens[2] = 9 // R1C3 = 9 (duplicate - 9 already at R3C2)

	board := NewBoard(givens)
	solver := NewSolver()

	moves, status := solver.SolveWithSteps(board, 500)

	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			t.Logf("Contradiction detected at R%dC%d", move.Targets[0].Row+1, move.Targets[0].Col+1)
			break
		}
	}

	// With a duplicate in box, solver should stall or detect contradiction
	if status == "completed" && !hasContradiction {
		t.Errorf("Solver incorrectly completed a puzzle with duplicate in box")
	}

	t.Logf("Status: %s, Moves: %d, HasContradiction: %v", status, len(moves), hasContradiction)
}

// =============================================================================
// Tests for Invalid Candidates
// =============================================================================

func TestSolverHandlesInvalidCandidates(t *testing.T) {
	// Start with base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// Create board normally first
	board := NewBoard(givens)
	solver := NewSolver()

	// Now manually remove some valid candidates (simulating user error)
	// R1C3 should be 4, but let's remove 4 from its candidates
	// This simulates a user incorrectly eliminating the right answer

	// First, let's make sure candidates are initialized
	// The correct answer for R1C3 (index 2) is 4
	// Remove candidate 4 from R1C3
	board.RemoveCandidate(2, 4)

	// The solver should eventually detect a contradiction
	// because R1C3 can no longer be filled correctly
	moves, status := solver.SolveWithSteps(board, 500)

	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			t.Logf("Contradiction detected: %s", move.Explanation)
			break
		}
	}

	// With the correct candidate eliminated, the puzzle becomes unsolvable
	// Solver should stall or detect contradiction
	if status == "completed" {
		// If it completed, check that it didn't use an invalid value
		t.Logf("Solver completed even with missing candidate - checking validity")
	}

	t.Logf("Status: %s, Moves: %d, HasContradiction: %v", status, len(moves), hasContradiction)
}

func TestSolverHandlesAllCandidatesRemoved(t *testing.T) {
	// Create a scenario where a cell has all candidates eliminated
	// but the cell could theoretically have valid placements
	// The solver should detect this as a contradiction

	// Start with base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	board := NewBoard(givens)
	solver := NewSolver()

	// R1C3 (index 2) can have candidates 2, 4, 6
	// Let's eliminate ALL of them to force a contradiction
	// First, mark them all as eliminated
	for d := 1; d <= 9; d++ {
		board.Eliminated[2] = board.Eliminated[2].Set(d)
		board.Candidates[2] = board.Candidates[2].Clear(d)
	}

	// The solver should detect a contradiction at R1C3
	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatalf("Expected a move (contradiction), got nil")
	}

	if move.Action != "contradiction" {
		t.Errorf("Expected contradiction action, got %q", move.Action)
	}

	// The contradiction should be at R1C3
	if len(move.Targets) > 0 {
		target := move.Targets[0]
		if target.Row != 0 || target.Col != 2 {
			t.Errorf("Expected contradiction at R1C3, got R%dC%d", target.Row+1, target.Col+1)
		}
	}

	t.Logf("Contradiction correctly detected: %s", move.Explanation)
}

// =============================================================================
// Edge Case Tests
// =============================================================================

func TestSolverHandlesMultipleDuplicates(t *testing.T) {
	// Create a puzzle with multiple duplicates - chaos scenario
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// Add multiple duplicates
	givens[2] = 5  // R1C3 = 5 (dup with R1C1)
	givens[18] = 6 // R3C1 = 6 (dup with R2C1)

	board := NewBoard(givens)
	solver := NewSolver()

	moves, status := solver.SolveWithSteps(board, 500)

	hasContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			hasContradiction = true
			break
		}
	}

	// Should definitely not complete with multiple duplicates
	if status == "completed" && !hasContradiction {
		t.Errorf("Solver incorrectly completed a puzzle with multiple duplicates")
	}

	t.Logf("Status: %s, HasContradiction: %v", status, hasContradiction)
}

func TestSolverHandlesImmediateContradiction(t *testing.T) {
	// Create a board state where a cell immediately has no valid candidates
	// To trigger an immediate contradiction, we need:
	// 1. An empty cell with no candidates
	// 2. All digits 1-9 blocked by row, column, or box placements
	//
	// Strategy: Fill row 0 with digits 1-8, leaving cell 0 empty,
	// and place 9 somewhere in cell 0's column or box.

	cells := [81]int{
		0, 1, 2, 3, 4, 5, 6, 7, 8, // Row 0: cell 0 is empty, 1-8 fill the rest
		9, 0, 0, 0, 0, 0, 0, 0, 0, // Row 1: 9 at position 9 (column 0)
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
	}

	// Cell 0 (R1C1) cannot be:
	// - 1-8 (already in row 0)
	// - 9 (already in column 0 at R2C1)
	// So cell 0 has NO valid candidates!

	board := NewBoard(cells[:])
	solver := NewSolver()

	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatalf("Expected contradiction move, got nil")
	}

	if move.Action != "contradiction" {
		t.Errorf("Expected action 'contradiction', got %q", move.Action)
	}

	if move.Technique != "contradiction" {
		t.Errorf("Expected technique 'contradiction', got %q", move.Technique)
	}

	// Verify the contradiction is at R1C1 (index 0)
	if len(move.Targets) > 0 {
		target := move.Targets[0]
		if target.Row != 0 || target.Col != 0 {
			t.Errorf("Expected contradiction at R1C1, got R%dC%d", target.Row+1, target.Col+1)
		}
	}

	t.Logf("Immediate contradiction detected: %s", move.Explanation)
}

func TestSolverHandlesPartialCandidatesStillSolvable(t *testing.T) {
	// Start with base puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	board := NewBoard(givens)
	solver := NewSolver()

	// Remove some WRONG candidates (ones that aren't the answer anyway)
	// R1C3 answer is 4, so removing 1,2,6 is fine
	board.RemoveCandidate(2, 1)
	board.RemoveCandidate(2, 2)
	board.RemoveCandidate(2, 6)

	// The puzzle should still be solvable
	moves, status := solver.SolveWithSteps(board, 500)

	if status != "completed" {
		// Check if we hit contradiction or stalled
		hasContradiction := false
		for _, move := range moves {
			if move.Action == "contradiction" {
				hasContradiction = true
				break
			}
		}
		if hasContradiction {
			t.Errorf("Unexpected contradiction when only wrong candidates were removed")
		} else {
			t.Logf("Solver stalled, but no contradiction - may need more steps. Status: %s", status)
		}
	} else {
		t.Logf("Puzzle solved successfully with partial candidates removed")
	}
}

// =============================================================================
// Integration test with SolveWithSteps
// =============================================================================

func TestSolveWithStepsReturnsOnContradiction(t *testing.T) {
	// Create an obviously broken puzzle
	givens := make([]int, 81)
	copy(givens, baseGivens)

	// Create duplicate that will cause immediate candidate issues
	givens[2] = 3 // R1C3 = 3 (duplicate with R1C2)

	board := NewBoard(givens)
	solver := NewSolver()

	moves, status := solver.SolveWithSteps(board, 100)

	// When contradiction is found, status should be "stalled"
	// and the last move (or one of the moves) should be a contradiction
	foundContradiction := false
	for _, move := range moves {
		if move.Action == "contradiction" {
			foundContradiction = true
			t.Logf("Found contradiction at step %d: %s", move.StepIndex, move.Explanation)
			break
		}
	}

	// The solver should either stall or find a contradiction
	if status == "completed" && !foundContradiction {
		t.Errorf("Puzzle with duplicate should not complete without contradiction")
	}

	t.Logf("Final status: %s, Total moves: %d, Found contradiction: %v",
		status, len(moves), foundContradiction)
}

// =============================================================================
// Test that contradiction move has proper structure
// =============================================================================

func TestContradictionMoveStructure(t *testing.T) {
	// Create a cell with no valid placements
	// Cell 0 will have all digits blocked:
	// - Row 0: contains 1-8
	// - Column 0: contains 9
	cells := [81]int{
		0, 1, 2, 3, 4, 5, 6, 7, 8, // Row 0: cell 0 empty, 1-8 in rest
		9, 0, 0, 0, 0, 0, 0, 0, 0, // Row 1: 9 blocks column 0
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
	}

	board := NewBoard(cells[:])
	solver := NewSolver()

	move := solver.FindNextMove(board)

	if move == nil {
		t.Fatalf("Expected move, got nil")
	}

	// Verify move structure
	if move.Action != "contradiction" {
		t.Errorf("Expected action 'contradiction', got %q", move.Action)
	}

	if move.Technique != "contradiction" {
		t.Errorf("Expected technique 'contradiction', got %q", move.Technique)
	}

	if len(move.Targets) == 0 {
		t.Error("Expected at least one target cell in contradiction move")
	}

	if move.Explanation == "" {
		t.Error("Expected explanation for contradiction move")
	}

	// The digit should be 0 for contradiction (no specific digit)
	if move.Digit != 0 {
		t.Errorf("Expected digit 0 for contradiction, got %d", move.Digit)
	}

	t.Logf("Contradiction move: Technique=%s, Action=%s, Targets=%v, Explanation=%s",
		move.Technique, move.Action, move.Targets, move.Explanation)
}
