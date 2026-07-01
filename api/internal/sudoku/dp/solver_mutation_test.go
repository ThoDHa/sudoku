package dp

import (
	"reflect"
	"testing"
)

// Mutation-driven killing tests for internal/sudoku/dp.
// Each test asserts a specific observable property that an escaped mutant breaks.
// Targets the 79 escaped mutants from the 20260630-2110-go-dp-baseline run.

// --- FindConflicts: exact cell indices, dedup, and multi-pair generation ---

func TestMutation_FindConflicts_ExactRowCellIndices(t *testing.T) {
	grid := make([]int, 81)
	grid[28] = 5
	grid[32] = 5
	conflicts := FindConflicts(grid)

	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}
	c := conflicts[0]
	if c.Cell1 != 28 || c.Cell2 != 32 {
		t.Errorf("expected Cell1=28 Cell2=32, got Cell1=%d Cell2=%d", c.Cell1, c.Cell2)
	}
	if c.Value != 5 || c.Type != "row" {
		t.Errorf("expected Value=5 Type=row, got Value=%d Type=%s", c.Value, c.Type)
	}
}

func TestMutation_FindConflicts_ExactColumnCellIndices(t *testing.T) {
	grid := make([]int, 81)
	grid[4] = 3
	grid[49] = 3
	conflicts := FindConflicts(grid)

	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}
	c := conflicts[0]
	if c.Cell1 != 4 || c.Cell2 != 49 {
		t.Errorf("expected Cell1=4 Cell2=49, got Cell1=%d Cell2=%d", c.Cell1, c.Cell2)
	}
	if c.Value != 3 || c.Type != "column" {
		t.Errorf("expected Value=3 Type=column, got Value=%d Type=%s", c.Value, c.Type)
	}
}

func TestMutation_FindConflicts_ExactBoxCellIndices(t *testing.T) {
	grid := make([]int, 81)
	grid[30] = 7
	grid[41] = 7
	conflicts := FindConflicts(grid)

	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d: %+v", len(conflicts), conflicts)
	}
	c := conflicts[0]
	if c.Cell1 != 30 || c.Cell2 != 41 {
		t.Errorf("expected Cell1=30 Cell2=41, got Cell1=%d Cell2=%d", c.Cell1, c.Cell2)
	}
	if c.Value != 7 || c.Type != "box" {
		t.Errorf("expected Value=7 Type=box, got Value=%d Type=%s", c.Value, c.Type)
	}
}

func TestMutation_FindConflicts_DedupAndAllPairsFromTripleGroup(t *testing.T) {
	grid := make([]int, 81)
	grid[0] = 5
	grid[2] = 5
	grid[9] = 5

	conflicts := FindConflicts(grid)

	want := []Conflict{
		{Cell1: 0, Cell2: 2, Value: 5, Type: "row"},
		{Cell1: 0, Cell2: 9, Value: 5, Type: "column"},
		{Cell1: 2, Cell2: 9, Value: 5, Type: "box"},
	}
	if len(conflicts) != len(want) {
		t.Fatalf("expected %d deduped conflicts, got %d: %+v", len(want), len(conflicts), conflicts)
	}
	got := make(map[string]bool)
	for _, c := range conflicts {
		got[conflictKey(c.Cell1, c.Cell2, c.Value)+":"+c.Type] = true
	}
	for _, w := range want {
		key := conflictKey(w.Cell1, w.Cell2, w.Value) + ":" + w.Type
		if !got[key] {
			t.Errorf("missing expected conflict %+v in %+v", w, conflicts)
		}
	}
}

// --- CarveGivensWithSubset: exact givens count per difficulty ---

func TestMutation_CarveGivensWithSubset_ExactGivensPerDifficulty(t *testing.T) {
	fullGrid := GenerateFullGrid(12345)
	puzzles := CarveGivensWithSubset(fullGrid, 67890)

	expectedGivens := map[string]int{
		"easy":       40,
		"medium":     34,
		"hard":       28,
		"extreme":    24,
		"impossible": 24,
	}
	for diff, want := range expectedGivens {
		got := countGivens(puzzles[diff])
		if got != want {
			t.Errorf("%s: expected %d givens, got %d", diff, want, got)
		}
	}
}

func TestMutation_CarveGivensWithSubset_SubsetPropertyStrict(t *testing.T) {
	fullGrid := GenerateFullGrid(12345)
	puzzles := CarveGivensWithSubset(fullGrid, 67890)

	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}
	for i := 0; i < len(difficulties)-1; i++ {
		easier := puzzles[difficulties[i]]
		harder := puzzles[difficulties[i+1]]
		for pos := 0; pos < 81; pos++ {
			if harder[pos] != 0 && easier[pos] == 0 {
				t.Errorf("subset violated: %s has given at %d but %s doesn't",
					difficulties[i+1], pos, difficulties[i])
			}
		}
	}
}

// --- CarveGivens: exact givens count ---

func TestMutation_CarveGivens_ExactGivensCount(t *testing.T) {
	fullGrid := GenerateFullGrid(123)
	for _, target := range []int{30, 40} {
		puzzle := CarveGivens(fullGrid, target, 456)
		got := countGivens(puzzle)
		if got != target {
			t.Errorf("target=%d: expected %d givens, got %d", target, target, got)
		}
	}
}

// --- CountSolutions: boundary maxCount behavior ---

func TestMutation_CountSolutions_RespectsMaxCountBoundary(t *testing.T) {
	count := CountSolutions(emptyGrid, 2)
	if count != 2 {
		t.Errorf("empty grid with maxCount=2: expected 2, got %d", count)
	}
	count3 := CountSolutions(emptyGrid, 3)
	if count3 != 3 {
		t.Errorf("empty grid with maxCount=3: expected 3, got %d", count3)
	}
}

func TestMutation_CountSolutions_NearlyFullPuzzle(t *testing.T) {
	grid := make([]int, 81)
	copy(grid, solvedGrid)
	grid[80] = 0
	count := CountSolutions(grid, 2)
	if count != 1 {
		t.Errorf("nearly-full puzzle: expected 1 solution, got %d", count)
	}
}

// --- Solve: digit range with nearly-full puzzle ---

func TestMutation_Solve_NearlyFullPuzzle(t *testing.T) {
	grid := make([]int, 81)
	copy(grid, solvedGrid)
	grid[80] = 0
	solution := Solve(grid)
	if solution == nil {
		t.Fatal("expected solution for nearly-full puzzle")
	}
	if !reflect.DeepEqual(solution, solvedGrid) {
		t.Errorf("solution does not match expected solved grid")
	}
}
