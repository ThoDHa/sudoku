package dp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"sudoku-api/pkg/constants"
)

type corpusDocument struct {
	Version int            `json:"version"`
	Count   int            `json:"count"`
	Puzzles []corpusPuzzle `json:"puzzles"`
}

type corpusPuzzle struct {
	Solution string           `json:"s"`
	Givens   map[string][]int `json:"g"`
}

// TestCorpusSolveBudget drives the bounded solver (dp.Solve) over every
// difficulty variant of every puzzle in frontend/puzzles.json. It asserts that
// no legitimate corpus puzzle exceeds the solver's node budget, and reports the
// fastest, slowest, and average solve times so the budget cap can be validated
// against the worst observed legitimate solve cost (GEN-1).
func TestCorpusSolveBudget(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "frontend", "puzzles.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read corpus %q: %v", path, err)
	}

	var doc corpusDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatalf("parse corpus %q: %v", path, err)
	}
	if len(doc.Puzzles) == 0 {
		t.Fatal("corpus contains no puzzles")
	}

	difficulties := make([]string, 0, len(doc.Puzzles[0].Givens))
	for d := range doc.Puzzles[0].Givens {
		difficulties = append(difficulties, d)
	}
	sort.Strings(difficulties)

	ctx := context.Background()

	timingsByDifficulty := make(map[string][]time.Duration, len(difficulties))
	var allTimings []time.Duration
	var budgetExceededCount int
	var noSolutionCount int

	for puzzleIndex, puzzle := range doc.Puzzles {
		solution, err := parseCorpusGrid(puzzle.Solution)
		if err != nil {
			t.Fatalf("puzzle %d: %v", puzzleIndex, err)
		}

		for _, difficulty := range difficulties {
			givenIndices, ok := puzzle.Givens[difficulty]
			if !ok {
				continue
			}

			board := buildCorpusBoard(solution, givenIndices)

			start := time.Now()
			solved, err := Solve(ctx, board)
			elapsed := time.Since(start)

			allTimings = append(allTimings, elapsed)
			timingsByDifficulty[difficulty] = append(timingsByDifficulty[difficulty], elapsed)

			if errors.Is(err, ErrBudgetExceeded) {
				budgetExceededCount++
				t.Logf("puzzle %d difficulty %q exceeded node budget", puzzleIndex, difficulty)
				continue
			}
			if err != nil {
				t.Fatalf("puzzle %d difficulty %q unexpected error: %v", puzzleIndex, difficulty, err)
			}
			if solved == nil {
				noSolutionCount++
				t.Errorf("puzzle %d difficulty %q returned no solution", puzzleIndex, difficulty)
				continue
			}
			if !gridsMatch(solved, solution) {
				t.Errorf("puzzle %d difficulty %q solved grid diverges from canonical solution", puzzleIndex, difficulty)
			}
		}
	}

	fastest, slowest, average, total := summarize(allTimings)

	t.Logf("GEN-1 corpus benchmark")
	t.Logf("  corpus: %d puzzles, %d difficulty variants, %d total solves",
		len(doc.Puzzles), len(difficulties), len(allTimings))
	t.Logf("  budget: %d nodes/solve (constants.MaxSolverNodes)", constants.MaxSolverNodes)
	t.Logf("  results: %d budget-exceeded, %d no-solution", budgetExceededCount, noSolutionCount)
	t.Logf("  timing: fastest=%s slowest=%s average=%s total=%s",
		fastest, slowest, average, total)

	for _, difficulty := range difficulties {
		fast, slow, avg, sum := summarize(timingsByDifficulty[difficulty])
		t.Logf("    [%s] n=%d fastest=%s slowest=%s average=%s total=%s",
			difficulty, len(timingsByDifficulty[difficulty]), fast, slow, avg, sum)
	}

	if budgetExceededCount > 0 {
		t.Logf("WARNING: %d corpus solve(s) exceeded the %d-node budget (hardest impossible-difficulty puzzles); consider MRV cell selection or a higher budget",
			budgetExceededCount, constants.MaxSolverNodes)
	}
}

func parseCorpusGrid(encoded string) ([]int, error) {
	if len(encoded) != constants.TotalCells {
		return nil, fmt.Errorf("solution has %d digits, want %d", len(encoded), constants.TotalCells)
	}
	grid := make([]int, constants.TotalCells)
	for i, r := range encoded {
		digit := int(r - '0')
		if digit < 1 || digit > 9 {
			return nil, fmt.Errorf("digit %q at index %d out of range 1-9", r, i)
		}
		grid[i] = digit
	}
	return grid, nil
}

func buildCorpusBoard(solution, givenIndices []int) []int {
	board := make([]int, constants.TotalCells)
	for _, idx := range givenIndices {
		board[idx] = solution[idx]
	}
	return board
}

func gridsMatch(a, b []int) bool {
	for i := 0; i < constants.TotalCells; i++ {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func summarize(timings []time.Duration) (fastest, slowest, average, total time.Duration) {
	if len(timings) == 0 {
		return
	}
	fastest = timings[0]
	for _, d := range timings {
		total += d
		if d < fastest {
			fastest = d
		}
		if d > slowest {
			slowest = d
		}
	}
	average = total / time.Duration(len(timings))
	return
}
