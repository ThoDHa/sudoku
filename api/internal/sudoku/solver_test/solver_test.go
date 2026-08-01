package solver_test

import (
	"context"
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
			givens, err := dp.CarveGivens(context.Background(), fullGrid, tc.givens, tc.seed)
			if err != nil {
				t.Fatalf("CarveGivens: %v", err)
			}

			board := human.NewBoard(givens)
			moves, status := solver.SolveWithSteps(context.Background(), board, constants.MaxSolverSteps)

			// Easy and medium should always complete
			if tc.name == "easy" || tc.name == "medium" {
				if status != constants.StatusCompleted {
					t.Errorf("Expected %s puzzle to complete, got status=%s after %d moves",
						tc.name, status, len(moves))
				}
			}

			// Verify the solution is valid if completed
			if status == constants.StatusCompleted {
				for i := range 81 {
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
	for i := range 20 {
		seed := int64(i * 7919) // Prime multiplier for variety
		fullGrid := dp.GenerateFullGrid(seed)
		givens, err := dp.CarveGivens(context.Background(), fullGrid, 30, seed) // Medium-hard difficulty
		if err != nil {
			t.Fatalf("CarveGivens: %v", err)
		}

		board := human.NewBoard(givens)
		moves, _ := solver.SolveWithSteps(context.Background(), board, constants.MaxSolverSteps)

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
			for i := range b.N {
				seed := int64(i)
				fullGrid := dp.GenerateFullGrid(seed)
				var err error
				puzzles[i], err = dp.CarveGivens(context.Background(), fullGrid, diff.givens, seed)
				if err != nil {
					b.Fatalf("CarveGivens: %v", err)
				}
			}

			solver := human.NewSolver()
			b.ResetTimer()

			for i := range b.N {
				board := human.NewBoard(puzzles[i])
				solver.SolveWithSteps(context.Background(), board, constants.MaxSolverSteps)
			}
		})
	}
}
