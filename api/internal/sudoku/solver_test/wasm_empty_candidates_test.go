package solver_test

import (
	"testing"

	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

// TestWASMEmptyCandidatesScenario verifies that FindNextMove works correctly
// when given a board with empty candidates (like frontend sends initially).
// This test simulates the exact WASM code path that was buggy.
func TestWASMEmptyCandidatesScenario(t *testing.T) {
	// Simulate frontend scenario: a puzzle with empty candidates
	cells := []int{
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

	// Empty candidates (exactly like frontend sends for new game)
	emptyCandidates := make([][]int, constants.TotalCells)
	for i := range emptyCandidates {
		emptyCandidates[i] = []int{} // Empty array, NOT nil
	}

	t.Run("WithoutInitCandidates", func(t *testing.T) {
		// Create board WITHOUT InitCandidates (old WASM behavior)
		board := human.NewBoardWithCandidates(cells, emptyCandidates)
		solver := human.NewSolver()

		move := solver.FindNextMove(board)

		if move == nil {
			t.Log("FindNextMove returned nil (stalled) - this was the old buggy behavior")
			// The solver's fill-candidate detection should still work
			// because it checks canPlace() directly
		} else if move.Technique == "contradiction" || move.Action == "contradiction" {
			t.Errorf("Got contradiction move when starting with empty candidates: %s", move.Explanation)
		} else {
			t.Logf("Move found: technique=%s, action=%s, digit=%d", move.Technique, move.Action, move.Digit)
		}
	})

	t.Run("WithInitCandidates", func(t *testing.T) {
		// Create board WITH InitCandidates (new fixed behavior)
		board := human.NewBoardWithCandidates(cells, emptyCandidates)
		board.InitCandidates()
		solver := human.NewSolver()

		move := solver.FindNextMove(board)

		if move == nil {
			t.Fatal("FindNextMove returned nil even after InitCandidates")
		}

		if move.Technique == "contradiction" || move.Action == "contradiction" {
			t.Errorf("Got contradiction move even after InitCandidates: %s", move.Explanation)
		}

		t.Logf("Move found: technique=%s, action=%s, digit=%d", move.Technique, move.Action, move.Digit)
	})

	t.Run("VerifyBothSolvePuzzle", func(t *testing.T) {
		// Both approaches should eventually solve the puzzle

		// Without InitCandidates (relies on solver's fill-candidate)
		board1 := human.NewBoardWithCandidates(cells, emptyCandidates)
		solver1 := human.NewSolver()

		moveCount1 := 0
		for moveCount1 < 500 {
			move := solver1.FindNextMove(board1)
			if move == nil {
				break
			}
			if move.Technique == "contradiction" {
				t.Errorf("Without InitCandidates: got contradiction at move %d", moveCount1+1)
				break
			}
			solver1.ApplyMove(board1, move)
			moveCount1++
		}

		if board1.IsSolved() {
			t.Logf("Without InitCandidates: solved in %d moves", moveCount1)
		} else {
			t.Errorf("Without InitCandidates: failed to solve, stuck after %d moves", moveCount1)
		}

		// With InitCandidates
		board2 := human.NewBoardWithCandidates(cells, emptyCandidates)
		board2.InitCandidates()
		solver2 := human.NewSolver()

		moveCount2 := 0
		for moveCount2 < 500 {
			move := solver2.FindNextMove(board2)
			if move == nil {
				break
			}
			if move.Technique == "contradiction" {
				t.Errorf("With InitCandidates: got contradiction at move %d", moveCount2+1)
				break
			}
			solver2.ApplyMove(board2, move)
			moveCount2++
		}

		if board2.IsSolved() {
			t.Logf("With InitCandidates: solved in %d moves", moveCount2)
		} else {
			t.Errorf("With InitCandidates: failed to solve, stuck after %d moves", moveCount2)
		}
	})
}
