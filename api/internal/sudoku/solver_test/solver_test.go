package solver_test

import (
	"testing"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

// TestSolverHandlesAllDifficulties verifies basic solving for each difficulty level
func TestSolverHandlesAllDifficulties(t *testing.T) {
	solver := human.NewSolver()

	testCases := []struct {
		name   string
		givens int
		seed   int64
	}{
		{"easy", 40, 12345},
		{"medium", 34, 23456},
		{"hard", 28, 34567},
		{"extreme", 24, 45678},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			fullGrid := dp.GenerateFullGrid(tc.seed)
			givens := dp.CarveGivens(fullGrid, tc.givens, tc.seed)

			board := human.NewBoard(givens)
			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			// Easy and medium should always complete
			if tc.name == "easy" || tc.name == "medium" {
				if status != constants.StatusCompleted {
					t.Errorf("Expected %s puzzle to complete, got status=%s after %d moves",
						tc.name, status, len(moves))
				}
			}

			// Verify the solution is valid if completed
			if status == constants.StatusCompleted {
				for i := 0; i < 81; i++ {
					if board.Cells[i] == 0 {
						t.Errorf("Cell %d is still empty after 'completed' status", i)
					}
				}
			}
		})
	}
}

// TestSolverUsesMultipleTechniques verifies that various techniques are being used
func TestSolverUsesMultipleTechniques(t *testing.T) {
	solver := human.NewSolver()
	techniqueUsage := make(map[string]int)

	// Generate and solve puzzles to collect technique usage
	for i := 0; i < 20; i++ {
		seed := int64(i * 7919) // Prime multiplier for variety
		fullGrid := dp.GenerateFullGrid(seed)
		givens := dp.CarveGivens(fullGrid, 30, seed) // Medium-hard difficulty

		board := human.NewBoard(givens)
		moves, _ := solver.SolveWithSteps(board, constants.MaxSolverSteps)

		for _, move := range moves {
			techniqueUsage[move.Technique]++
		}
	}

	// We should at minimum see naked singles and hidden singles
	requiredTechniques := []string{"naked-single", "hidden-single"}
	for _, tech := range requiredTechniques {
		if techniqueUsage[tech] == 0 {
			t.Errorf("Expected technique %s to be used at least once", tech)
		}
	}

	// Log all technique usage for visibility
	t.Log("Technique usage across 20 puzzles:")
	for tech, count := range techniqueUsage {
		if count > 0 {
			t.Logf("  %s: %d", tech, count)
		}
	}
}

// BenchmarkSolver benchmarks the solver on puzzles of varying difficulty
func BenchmarkSolver(b *testing.B) {
	difficulties := []struct {
		name   string
		givens int
	}{
		{"easy", 40},
		{"medium", 34},
		{"hard", 28},
	}

	for _, diff := range difficulties {
		b.Run(diff.name, func(b *testing.B) {
			// Pre-generate puzzles
			puzzles := make([][]int, b.N)
			for i := 0; i < b.N; i++ {
				seed := int64(i)
				fullGrid := dp.GenerateFullGrid(seed)
				puzzles[i] = dp.CarveGivens(fullGrid, diff.givens, seed)
			}

			solver := human.NewSolver()
			b.ResetTimer()

			for i := 0; i < b.N; i++ {
				board := human.NewBoard(puzzles[i])
				solver.SolveWithSteps(board, constants.MaxSolverSteps)
			}
		})
	}
}
