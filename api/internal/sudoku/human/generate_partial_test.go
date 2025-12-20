package human

import (
	"fmt"
	"testing"

	"sudoku-api/internal/puzzles"
	"sudoku-api/pkg/constants"
)

// TestGeneratePartialPuzzles finds board states just before technique fires
func TestGeneratePartialPuzzles(t *testing.T) {
	// Techniques we want to optimize - get the current test data puzzle
	targets := []struct {
		slug               string
		disabledTechniques []string
	}{
		{"forcing-chain", []string{"aic"}},
		{"digit-forcing-chain", []string{"aic"}},
		{"als-xz", []string{"aic"}},
		{"als-xy-chain", []string{"aic"}},
		{"finned-swordfish", nil},
		{"als-xy-wing", []string{"aic"}},
		{"unique-rectangle-type-3", []string{"aic", "medusa-3d", "x-chain", "xy-chain", "grouped-x-cycles", "simple-coloring", "skyscraper", "empty-rectangle", "w-wing", "finned-x-wing", "finned-swordfish"}},
	}

	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	for _, target := range targets {
		t.Run(target.slug, func(t *testing.T) {
			// Get current puzzle data
			data, ok := GetTechniquePuzzle(target.slug)
			if !ok {
				t.Fatalf("No puzzle data for %s", target.slug)
			}

			var givens []int
			if data.PuzzleIndex >= 0 {
				var err error
				givens, _, err = loader.GetPuzzle(data.PuzzleIndex, data.Difficulty)
				if err != nil {
					t.Fatalf("Failed to load puzzle: %v", err)
				}
			} else {
				givens = make([]int, 81)
				for i, c := range data.PuzzleString {
					if c >= '1' && c <= '9' {
						givens[i] = int(c - '0')
					}
				}
			}

			// Create solver
			registry := NewTechniqueRegistry()
			for _, slug := range target.disabledTechniques {
				registry.SetEnabled(slug, false)
			}
			solver := NewSolverWithRegistry(registry)
			board := NewBoard(givens)

			for step := 0; step < constants.MaxSolverSteps; step++ {
				// Save current state BEFORE calling FindNextMove
				currentState := boardToPuzzleString(board)

				move := solver.FindNextMove(board)
				if move == nil {
					break
				}

				if move.Technique == target.slug {
					t.Logf("%s fires at step %d", target.slug, step)
					// currentState is the board state BEFORE FindNextMove was called
					// Using this as PuzzleString means the technique will fire at step 0
					t.Logf("Use this PuzzleString (fires at step 0): \"%s\"", currentState)
					break
				}

				solver.ApplyMove(board, move)
			}
		})
	}
}

// boardToPuzzleString converts a board state to a puzzle string
func boardToPuzzleString(board *Board) string {
	result := ""
	for i := 0; i < 81; i++ {
		if board.Cells[i] != 0 {
			result += fmt.Sprintf("%d", board.Cells[i])
		} else {
			result += "0"
		}
	}
	return result
}
