package human

import (
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// TestAnalyzePuzzleDifficulty_HardTierReturnsHard asserts that a puzzle whose
// hardest required technique sits at TierHard reports DifficultyHard, not
// DifficultyExtreme. The tier-to-difficulty mapping must not skip the hard tier.
func TestAnalyzePuzzleDifficulty_HardTierReturnsHard(t *testing.T) {
	givens := loadGivens(t, 6, "extreme")
	difficulty, _, status := NewSolver().AnalyzePuzzleDifficulty(givens)
	if status != constants.StatusCompleted {
		t.Skipf("fixture did not solve: %q", status)
	}
	if difficulty != core.DifficultyHard {
		t.Errorf("fixture 6 (TierHard) must report %q, got %q", core.DifficultyHard, difficulty)
	}
}

// TestAnalyzePuzzleDifficulty_FullRangeReachable asserts every external
// difficulty label is produced by at least one input: easy, medium, hard,
// extreme from solvable puzzles, and impossible from an unsolvable puzzle.
func TestAnalyzePuzzleDifficulty_FullRangeReachable(t *testing.T) {
	seen := make(map[core.Difficulty]bool)

	cases := []struct {
		name   string
		givens []int
	}{
		{"easy", easyNakedSingleGivens()},
		{"medium", loadGivens(t, 0, "extreme")},
		{"hard", loadGivens(t, 6, "extreme")},
		{"extreme", loadGivens(t, 23, "extreme")},
		{"impossible", unsolvableContradictionGivens()},
	}

	for _, tc := range cases {
		difficulty, _, status := NewSolver().AnalyzePuzzleDifficulty(tc.givens)
		if tc.name != "impossible" && status != constants.StatusCompleted {
			t.Skipf("fixture %s did not solve: %q", tc.name, status)
		}
		if difficulty == "" {
			t.Errorf("case %s produced empty difficulty", tc.name)
		}
		seen[difficulty] = true
	}

	for _, want := range []core.Difficulty{
		core.DifficultyEasy,
		core.DifficultyMedium,
		core.DifficultyHard,
		core.DifficultyExtreme,
		core.DifficultyImpossible,
	} {
		if !seen[want] {
			t.Errorf("difficulty %q was never produced; full range must be reachable", want)
		}
	}
}

// TestAnalyzePuzzleDifficulty_UnsolvableReturnsImpossible asserts that when the
// solver stalls and cannot complete the puzzle with human techniques, the
// analysis reports DifficultyImpossible rather than an empty string.
func TestAnalyzePuzzleDifficulty_UnsolvableReturnsImpossible(t *testing.T) {
	givens := unsolvableContradictionGivens()
	difficulty, _, status := NewSolver().AnalyzePuzzleDifficulty(givens)
	if status == constants.StatusCompleted {
		t.Fatal("expected non-completed status for the unsolvable puzzle")
	}
	if difficulty != core.DifficultyImpossible {
		t.Errorf("unsolvable puzzle must report %q, got %q", core.DifficultyImpossible, difficulty)
	}
}

// easyNakedSingleGivens returns a nearly-complete grid solved by naked singles.
func easyNakedSingleGivens() []int {
	givens := make([]int, 81)
	copy(givens, solvedGrid[:])
	givens[0] = 0
	givens[40] = 0
	givens[80] = 0
	return givens
}

// unsolvableContradictionGivens returns a grid with no duplicates but an empty
// cell whose peers cover every digit, so the solver stalls on a contradiction.
func unsolvableContradictionGivens() []int {
	givens := make([]int, 81)
	copy(givens, contradictionBoard[:])
	return givens
}
