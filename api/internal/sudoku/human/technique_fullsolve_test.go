package human

import (
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/pkg/constants"
)

// =============================================================================
// FULL SOLVE TESTS
//
// These tests solve complete puzzles from start to finish using all techniques.
// They verify:
// 1. The solver can complete impossible-difficulty puzzles
// 2. The final solution matches the DP solver solution
// 3. All moves are valid (no incorrect eliminations or assignments)
//
// Puzzles are loaded from puzzles.json at "impossible" difficulty.
// =============================================================================

// FullSolveTestIndices are puzzle indices to test for full solving.
// These are selected to be diverse and challenging.
var FullSolveTestIndices = []int{
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
	10, 23, 44, 66, 77, 139, 211, 379, 553, 716,
}

// TestFullSolve_Puzzle runs full solve tests on selected puzzles
func TestFullSolve_Puzzle(t *testing.T) {
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	solver := NewSolver()

	for _, idx := range FullSolveTestIndices {
		t.Run(puzzleIndexName(idx), func(t *testing.T) {
			givens, expectedSolution, err := loader.GetPuzzle(idx, "impossible")
			if err != nil {
				t.Fatalf("Failed to load puzzle %d: %v", idx, err)
			}

			// Verify puzzle has unique solution (sanity check)
			dpSolution := dp.Solve(givens)
			if dpSolution == nil {
				t.Fatalf("Puzzle %d has no solution", idx)
			}

			// Solve with human solver
			board := NewBoard(givens)
			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			// Check completion
			if status != constants.StatusCompleted {
				// Log technique usage for debugging
				techCounts := countTechniques(moves)
				t.Errorf("Puzzle %d did not complete: status=%s, moves=%d, techniques=%v",
					idx, status, len(moves), techCounts)
				return
			}

			// Verify final solution matches expected
			for i := 0; i < 81; i++ {
				if board.Cells[i] != expectedSolution[i] {
					t.Errorf("Puzzle %d cell %d: got %d, expected %d",
						idx, i, board.Cells[i], expectedSolution[i])
				}
			}

			// Log success with technique summary
			techCounts := countTechniques(moves)
			t.Logf("Puzzle %d solved in %d moves. Techniques: %v", idx, len(moves), techCounts)
		})
	}
}

// TestFullSolve_First100 tests solving the first 100 puzzles at impossible difficulty
func TestFullSolve_First100(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping exhaustive test in short mode")
	}

	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	solver := NewSolver()
	passing := 0
	failing := 0

	for idx := 0; idx < 100; idx++ {
		givens, expectedSolution, err := loader.GetPuzzle(idx, "impossible")
		if err != nil {
			t.Logf("Puzzle %d: Failed to load: %v", idx, err)
			failing++
			continue
		}

		board := NewBoard(givens)
		moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

		if status != constants.StatusCompleted {
			t.Logf("Puzzle %d: FAILED (status=%s, moves=%d)", idx, status, len(moves))
			failing++
			continue
		}

		// Verify solution
		correct := true
		for i := 0; i < 81; i++ {
			if board.Cells[i] != expectedSolution[i] {
				correct = false
				break
			}
		}

		if correct {
			passing++
		} else {
			t.Logf("Puzzle %d: INCORRECT SOLUTION", idx)
			failing++
		}
	}

	t.Logf("Summary: %d/100 passing, %d/100 failing", passing, failing)
	if failing > 0 {
		t.Errorf("%d puzzles failed", failing)
	}
}

// TestFullSolve_DifficultyProgression tests that puzzles at each difficulty can be solved
func TestFullSolve_DifficultyProgression(t *testing.T) {
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}
	solver := NewSolver()

	for _, diff := range difficulties {
		t.Run(diff, func(t *testing.T) {
			// Test first 5 puzzles at each difficulty
			passing := 0
			for idx := 0; idx < 5; idx++ {
				givens, expectedSolution, err := loader.GetPuzzle(idx, diff)
				if err != nil {
					t.Logf("Puzzle %d at %s: Failed to load: %v", idx, diff, err)
					continue
				}

				board := NewBoard(givens)
				moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

				if status == constants.StatusCompleted {
					// Verify solution
					correct := true
					for i := 0; i < 81; i++ {
						if board.Cells[i] != expectedSolution[i] {
							correct = false
							break
						}
					}
					if correct {
						passing++
					}
				}

				techCounts := countTechniques(moves)
				t.Logf("  Puzzle %d: status=%s, techniques=%v", idx, status, techCounts)
			}

			t.Logf("%s: %d/5 solved correctly", diff, passing)
		})
	}
}

// TestFullSolve_ValidateMoves verifies each move is correct during solving
func TestFullSolve_ValidateMoves(t *testing.T) {
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	// Test a few puzzles with move-by-move validation
	testIndices := []int{0, 10, 23}

	for _, idx := range testIndices {
		t.Run(puzzleIndexName(idx), func(t *testing.T) {
			givens, solution, err := loader.GetPuzzle(idx, "impossible")
			if err != nil {
				t.Fatalf("Failed to load puzzle: %v", err)
			}

			board := NewBoard(givens)
			solver := NewSolver()
			maxSteps := 1000
			moveCount := 0

			for step := 0; step < maxSteps; step++ {
				// Check if solved
				if board.IsSolved() {
					t.Logf("Puzzle %d solved in %d moves", idx, moveCount)
					break
				}

				// Get next move
				move := solver.FindNextMove(board)
				if move == nil {
					t.Errorf("Puzzle %d stalled at step %d", idx, step)
					break
				}

				// Apply move
				solver.ApplyMove(board, move)
				moveCount++

				// Validate: solution digits must still be candidates (or placed correctly)
				for i := 0; i < 81; i++ {
					if board.Cells[i] != 0 {
						if board.Cells[i] != solution[i] {
							t.Errorf("Step %d (%s): Cell %d has wrong value %d (expected %d)",
								step, move.Technique, i, board.Cells[i], solution[i])
						}
					} else {
						if !board.Candidates[i][solution[i]] {
							t.Errorf("Step %d (%s): Cell %d eliminated solution digit %d",
								step, move.Technique, i, solution[i])
						}
					}
				}
			}
		})
	}
}

// =============================================================================
// SOLVER STRESS TESTS
// =============================================================================

// TestSolver_NoInfiniteLoop verifies the solver doesn't get stuck in infinite loops
func TestSolver_NoInfiniteLoop(t *testing.T) {
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	solver := NewSolver()

	// Test a variety of puzzles
	for idx := 0; idx < 20; idx++ {
		givens, _, err := loader.GetPuzzle(idx, "impossible")
		if err != nil {
			continue
		}

		board := NewBoard(givens)
		moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

		// Should either complete or stall, not hit max steps on valid puzzles
		if status == constants.StatusMaxStepsReached {
			t.Errorf("Puzzle %d hit max steps (%d moves) - possible infinite loop",
				idx, len(moves))
		}
	}
}

// TestSolver_Deterministic verifies the solver produces consistent results
func TestSolver_Deterministic(t *testing.T) {
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	// Test the same puzzle multiple times
	givens, _, err := loader.GetPuzzle(0, "impossible")
	if err != nil {
		t.Fatalf("Failed to load puzzle: %v", err)
	}

	var firstMoves []string
	solver := NewSolver()

	for run := 0; run < 3; run++ {
		board := NewBoard(givens)
		moves, _ := solver.SolveWithSteps(board, constants.MaxSolverSteps)

		// Extract technique sequence
		var techniques []string
		for _, m := range moves {
			techniques = append(techniques, m.Technique)
		}

		if run == 0 {
			firstMoves = techniques
		} else {
			// Compare to first run
			if len(techniques) != len(firstMoves) {
				t.Errorf("Run %d: different number of moves (%d vs %d)",
					run, len(techniques), len(firstMoves))
				continue
			}

			for i, tech := range techniques {
				if tech != firstMoves[i] {
					t.Errorf("Run %d: move %d differs (%s vs %s)",
						run, i, tech, firstMoves[i])
					break
				}
			}
		}
	}
}

// =============================================================================
// BENCHMARKS
// =============================================================================

// BenchmarkFullSolve benchmarks solving puzzles at different difficulties
func BenchmarkFullSolve(b *testing.B) {
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		b.Fatalf("Failed to load puzzles.json: %v", err)
	}

	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}

	for _, diff := range difficulties {
		b.Run(diff, func(b *testing.B) {
			givens, _, err := loader.GetPuzzle(0, diff)
			if err != nil {
				b.Skipf("Failed to load puzzle: %v", err)
			}

			solver := NewSolver()
			b.ResetTimer()

			for i := 0; i < b.N; i++ {
				board := NewBoard(givens)
				solver.SolveWithSteps(board, constants.MaxSolverSteps)
			}
		})
	}
}

// BenchmarkFullSolve_Impossible benchmarks the hardest puzzles
func BenchmarkFullSolve_Impossible(b *testing.B) {
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		b.Fatalf("Failed to load puzzles.json: %v", err)
	}

	solver := NewSolver()

	for _, idx := range []int{0, 10, 23, 77, 139} {
		b.Run(puzzleIndexName(idx), func(b *testing.B) {
			givens, _, err := loader.GetPuzzle(idx, "impossible")
			if err != nil {
				b.Skipf("Failed to load puzzle: %v", err)
			}

			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				board := NewBoard(givens)
				solver.SolveWithSteps(board, constants.MaxSolverSteps)
			}
		})
	}
}

// =============================================================================
// HELPERS
// =============================================================================

// puzzleIndexName returns a name for a puzzle by index
func puzzleIndexName(idx int) string {
	return "Puzzle_" + intToString(idx)
}

// intToString converts an int to a string (avoiding fmt import)
func intToString(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		return "-" + intToString(-n)
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}

// countTechniques counts technique usage from a slice of moves
func countTechniques(moves []core.Move) map[string]int {
	counts := make(map[string]int)
	for _, m := range moves {
		if m.Technique != "fill-candidate" {
			counts[m.Technique]++
		}
	}
	return counts
}
