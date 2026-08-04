package dp

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	"sudoku-api/pkg/constants"
)

// Test Data

// A valid puzzle with a unique solution (standard test case)
var validPuzzle = []int{
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

// The solution to validPuzzle
var validPuzzleSolution = []int{
	5, 3, 4, 6, 7, 8, 9, 1, 2,
	6, 7, 2, 1, 9, 5, 3, 4, 8,
	1, 9, 8, 3, 4, 2, 5, 6, 7,
	8, 5, 9, 7, 6, 1, 4, 2, 3,
	4, 2, 6, 8, 5, 3, 7, 9, 1,
	7, 1, 3, 9, 2, 4, 8, 5, 6,
	9, 6, 1, 5, 3, 7, 2, 8, 4,
	2, 8, 7, 4, 1, 9, 6, 3, 5,
	3, 4, 5, 2, 8, 6, 1, 7, 9,
}

// An empty grid (all zeros)
var emptyGrid = make([]int, 81)

// A completely solved valid grid
var solvedGrid = []int{
	1, 2, 3, 4, 5, 6, 7, 8, 9,
	4, 5, 6, 7, 8, 9, 1, 2, 3,
	7, 8, 9, 1, 2, 3, 4, 5, 6,
	2, 3, 4, 5, 6, 7, 8, 9, 1,
	5, 6, 7, 8, 9, 1, 2, 3, 4,
	8, 9, 1, 2, 3, 4, 5, 6, 7,
	3, 4, 5, 6, 7, 8, 9, 1, 2,
	6, 7, 8, 9, 1, 2, 3, 4, 5,
	9, 1, 2, 3, 4, 5, 6, 7, 8,
}

// A grid with row conflict (two 5s in first row)
var rowConflictGrid = []int{
	5, 3, 0, 0, 5, 0, 0, 0, 0, // two 5s in row 0
	6, 0, 0, 1, 9, 5, 0, 0, 0,
	0, 9, 8, 0, 0, 0, 0, 6, 0,
	8, 0, 0, 0, 6, 0, 0, 0, 3,
	4, 0, 0, 8, 0, 3, 0, 0, 1,
	7, 0, 0, 0, 2, 0, 0, 0, 6,
	0, 6, 0, 0, 0, 0, 2, 8, 0,
	0, 0, 0, 4, 1, 9, 0, 0, 5,
	0, 0, 0, 0, 8, 0, 0, 7, 9,
}

// A grid with column conflict (two 6s in first column)
var colConflictGrid = []int{
	5, 3, 0, 0, 7, 0, 0, 0, 0,
	6, 0, 0, 1, 9, 5, 0, 0, 0,
	0, 9, 8, 0, 0, 0, 0, 6, 0,
	8, 0, 0, 0, 6, 0, 0, 0, 3,
	4, 0, 0, 8, 0, 3, 0, 0, 1,
	7, 0, 0, 0, 2, 0, 0, 0, 6,
	6, 6, 0, 0, 0, 0, 2, 8, 0, // extra 6 at position [6][0], also row conflict
	0, 0, 0, 4, 1, 9, 0, 0, 5,
	0, 0, 0, 0, 8, 0, 0, 7, 9,
}

// A grid with box conflict (two 8s in top-left box)
var boxConflictGrid = []int{
	5, 3, 8, 0, 7, 0, 0, 0, 0, // 8 at position [0][2]
	6, 0, 0, 1, 9, 5, 0, 0, 0,
	8, 9, 0, 0, 0, 0, 0, 6, 0, // 8 at position [2][0] - same box as [0][2]
	8, 0, 0, 0, 6, 0, 0, 0, 3,
	4, 0, 0, 8, 0, 3, 0, 0, 1,
	7, 0, 0, 0, 2, 0, 0, 0, 6,
	0, 6, 0, 0, 0, 0, 2, 8, 0,
	0, 0, 0, 4, 1, 9, 0, 0, 5,
	0, 0, 0, 0, 8, 0, 0, 7, 9,
}

// multipleSolutionsPuzzle is a puzzle with multiple solutions (very sparse)
// Used by TestHasUniqueSolution to verify multiple solution detection
var multipleSolutionsPuzzle = []int{
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
}

var _ = multipleSolutionsPuzzle // silence unused warning - kept for documentation

// An unsolvable grid - partially filled puzzle with impossible constraints
// This is a valid-looking puzzle but has no solution due to constraint conflicts
var unsolvableGrid = []int{
	1, 2, 3, 4, 5, 6, 7, 8, 0, // needs 9 but...
	0, 0, 0, 0, 0, 0, 0, 0, 9, // 9 is here in same column
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0,
	9, 0, 0, 0, 0, 0, 0, 0, 0, // 9 also here in same box
}

// TestSolve

func TestSolve(t *testing.T) {
	tests := []struct {
		name       string
		input      []int
		wantNil    bool
		wantResult []int
	}{
		{
			name:       "valid puzzle returns correct solution",
			input:      validPuzzle,
			wantNil:    false,
			wantResult: validPuzzleSolution,
		},
		{
			name:       "already solved grid returns same grid",
			input:      solvedGrid,
			wantNil:    false,
			wantResult: solvedGrid,
		},
		{
			name:    "unsolvable grid returns nil",
			input:   unsolvableGrid,
			wantNil: true,
		},
		{
			name:    "empty grid is solvable",
			input:   emptyGrid,
			wantNil: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := Solve(context.Background(), tt.input)
			if err != nil {
				t.Fatalf("Solve returned error: %v", err)
			}

			if tt.wantNil {
				if result != nil {
					t.Errorf("expected nil, got solution")
				}
				return
			}

			if result == nil {
				t.Errorf("expected solution, got nil")
				return
			}

			// Check solution is valid
			if !IsValid(context.Background(), result) {
				t.Errorf("solution is not valid")
			}

			// Check no zeros remain
			for i, v := range result {
				if v == 0 {
					t.Errorf("solution has zero at position %d", i)
				}
			}

			// If we have an expected result, verify it matches
			if tt.wantResult != nil {
				for i := range result {
					if result[i] != tt.wantResult[i] {
						t.Errorf("position %d: got %d, want %d", i, result[i], tt.wantResult[i])
					}
				}
			}
		})
	}
}

func TestSolve_DoesNotModifyInput(t *testing.T) {
	original := make([]int, len(validPuzzle))
	copy(original, validPuzzle)

	_, _ = Solve(context.Background(), validPuzzle)

	for i := range validPuzzle {
		if validPuzzle[i] != original[i] {
			t.Errorf("Solve modified input at position %d: got %d, want %d",
				i, validPuzzle[i], original[i])
		}
	}
}

// TestHasUniqueSolution

func TestHasUniqueSolution(t *testing.T) {
	tests := []struct {
		name  string
		input []int
		want  bool
	}{
		{
			name:  "valid puzzle with unique solution returns true",
			input: validPuzzle,
			want:  true,
		},
		{
			name:  "empty grid has multiple solutions returns false",
			input: emptyGrid,
			want:  false,
		},
		{
			name:  "solved grid has unique solution (itself)",
			input: solvedGrid,
			want:  true,
		},
		{
			name:  "grid with initial conflicts returns false",
			input: rowConflictGrid,
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := HasUniqueSolution(context.Background(), tt.input)
			if err != nil {
				t.Fatalf("HasUniqueSolution returned error: %v", err)
			}
			if got != tt.want {
				t.Errorf("HasUniqueSolution(context.Background(), ) = %v, want %v", got, tt.want)
			}
		})
	}
}

// TestIsValid

func TestIsValid(t *testing.T) {
	tests := []struct {
		name  string
		input []int
		want  bool
	}{
		{
			name:  "valid puzzle returns true",
			input: validPuzzle,
			want:  true,
		},
		{
			name:  "solved grid returns true",
			input: solvedGrid,
			want:  true,
		},
		{
			name:  "empty grid returns true",
			input: emptyGrid,
			want:  true,
		},
		{
			name:  "row conflict returns false",
			input: rowConflictGrid,
			want:  false,
		},
		{
			name:  "column conflict returns false",
			input: colConflictGrid,
			want:  false,
		},
		{
			name:  "box conflict returns false",
			input: boxConflictGrid,
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValid(context.Background(), tt.input)
			if got != tt.want {
				t.Errorf("IsValid(context.Background(), ) = %v, want %v", got, tt.want)
			}
		})
	}
}

// TestFindConflicts

func TestFindConflicts(t *testing.T) {
	t.Run("valid grid has no conflicts", func(t *testing.T) {
		conflicts := FindConflicts(validPuzzle)
		if len(conflicts) != 0 {
			t.Errorf("expected 0 conflicts, got %d", len(conflicts))
		}
	})

	t.Run("empty grid has no conflicts", func(t *testing.T) {
		conflicts := FindConflicts(emptyGrid)
		if len(conflicts) != 0 {
			t.Errorf("expected 0 conflicts, got %d", len(conflicts))
		}
	})

	t.Run("row conflict is detected", func(t *testing.T) {
		conflicts := FindConflicts(rowConflictGrid)
		if len(conflicts) == 0 {
			t.Errorf("expected conflicts, got none")
			return
		}

		foundRowConflict := false
		for _, c := range conflicts {
			if c.Type == "row" && c.Value == 5 {
				foundRowConflict = true
				break
			}
		}
		if !foundRowConflict {
			t.Errorf("expected row conflict with value 5, not found in %+v", conflicts)
		}
	})

	t.Run("column conflict is detected", func(t *testing.T) {
		conflicts := FindConflicts(colConflictGrid)
		if len(conflicts) == 0 {
			t.Errorf("expected conflicts, got none")
			return
		}

		foundColConflict := false
		for _, c := range conflicts {
			if c.Type == "column" && c.Value == 6 {
				foundColConflict = true
				break
			}
		}
		if !foundColConflict {
			t.Errorf("expected column conflict with value 6, not found in %+v", conflicts)
		}
	})

	t.Run("box conflict is detected", func(t *testing.T) {
		conflicts := FindConflicts(boxConflictGrid)
		if len(conflicts) == 0 {
			t.Errorf("expected conflicts, got none")
			return
		}

		foundBoxConflict := false
		for _, c := range conflicts {
			if c.Type == "box" && c.Value == 8 {
				foundBoxConflict = true
				break
			}
		}
		if !foundBoxConflict {
			t.Errorf("expected box conflict with value 8, not found in %+v", conflicts)
		}
	})

	t.Run("conflict struct has correct fields", func(t *testing.T) {
		conflicts := FindConflicts(rowConflictGrid)
		if len(conflicts) == 0 {
			t.Fatal("expected conflicts")
		}

		c := conflicts[0]
		if c.Cell1 < 0 || c.Cell1 > 80 {
			t.Errorf("Cell1 out of range: %d", c.Cell1)
		}
		if c.Cell2 < 0 || c.Cell2 > 80 {
			t.Errorf("Cell2 out of range: %d", c.Cell2)
		}
		if c.Value < 1 || c.Value > 9 {
			t.Errorf("Value out of range: %d", c.Value)
		}
		if c.Type != "row" && c.Type != "column" && c.Type != "box" {
			t.Errorf("Invalid Type: %s", c.Type)
		}
	})
}

// TestCountSolutions

func TestCountSolutions(t *testing.T) {
	tests := []struct {
		name     string
		input    []int
		maxCount int
		want     int
	}{
		{
			name:     "unique solution puzzle counts 1",
			input:    validPuzzle,
			maxCount: 10,
			want:     1,
		},
		{
			name:     "solved grid counts 1",
			input:    solvedGrid,
			maxCount: 10,
			want:     1,
		},
		{
			name:     "unsolvable grid counts 0",
			input:    unsolvableGrid,
			maxCount: 10,
			want:     0,
		},
		{
			name:     "empty grid with maxCount 2 returns 2",
			input:    emptyGrid,
			maxCount: 2,
			want:     2,
		},
		{
			name:     "empty grid with maxCount 5 returns 5",
			input:    emptyGrid,
			maxCount: 5,
			want:     5,
		},
		{
			name:     "unique puzzle with maxCount 1 returns 1",
			input:    validPuzzle,
			maxCount: 1,
			want:     1,
		},
		{
			// maxCount 0 makes the helper short-circuit on its first-line
			// guard (*count >= maxCount) before searching, so even a solvable
			// grid reports 0 solutions.
			name:     "solvable grid with maxCount 0 returns 0",
			input:    validPuzzle,
			maxCount: 0,
			want:     0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CountSolutions(context.Background(), tt.input, tt.maxCount)
			if err != nil {
				t.Fatalf("CountSolutions returned error: %v", err)
			}
			if got != tt.want {
				t.Errorf("CountSolutions(context.Background(), ) = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestCountSolutions_DoesNotModifyInput(t *testing.T) {
	original := make([]int, len(validPuzzle))
	copy(original, validPuzzle)

	_, _ = CountSolutions(context.Background(), validPuzzle, 10)

	for i := range validPuzzle {
		if validPuzzle[i] != original[i] {
			t.Errorf("CountSolutions modified input at position %d", i)
		}
	}
}

// TestConflictKey verifies the dedup key builder, including its normalization
// of cell ordering so that a conflict is keyed identically regardless of which
// cell is passed first.
func TestConflictKey(t *testing.T) {
	tests := []struct {
		name  string
		cell1 int
		cell2 int
		val   int
		want  uint64
	}{
		{
			name:  "already ordered cells keep their order",
			cell1: 2,
			cell2: 5,
			val:   3,
			want:  2*810 + 5*10 + 3,
		},
		{
			name:  "reversed cells are normalized to ascending order",
			cell1: 5,
			cell2: 2,
			val:   3,
			want:  2*810 + 5*10 + 3,
		},
		{
			name:  "equal cells produce identical endpoints",
			cell1: 7,
			cell2: 7,
			val:   9,
			want:  7*810 + 7*10 + 9,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := conflictKey(tt.cell1, tt.cell2, tt.val); got != tt.want {
				t.Errorf("conflictKey(%d, %d, %d) = %d, want %d", tt.cell1, tt.cell2, tt.val, got, tt.want)
			}
		})
	}
}

func TestConflictKey_OrderIndependence(t *testing.T) {
	forward := conflictKey(4, 60, 8)
	reversed := conflictKey(60, 4, 8)
	if forward != reversed {
		t.Errorf("conflictKey is not order-independent: %d != %d", forward, reversed)
	}
}

// TestGenerateFullGrid

func TestGenerateFullGrid(t *testing.T) {
	t.Run("generates valid complete grid", func(t *testing.T) {
		grid := GenerateFullGrid(12345)

		// Check it's valid
		if !IsValid(context.Background(), grid) {
			t.Error("generated grid is not valid")
		}

		// Check all cells are filled
		for i, v := range grid {
			if v == 0 {
				t.Errorf("cell %d is empty", i)
			}
			if v < 1 || v > 9 {
				t.Errorf("cell %d has invalid value %d", i, v)
			}
		}
	})

	t.Run("same seed produces same grid", func(t *testing.T) {
		seed := int64(42)
		grid1 := GenerateFullGrid(seed)
		grid2 := GenerateFullGrid(seed)

		for i := range grid1 {
			if grid1[i] != grid2[i] {
				t.Errorf("position %d differs: %d vs %d", i, grid1[i], grid2[i])
			}
		}
	})

	t.Run("different seeds produce different grids", func(t *testing.T) {
		grid1 := GenerateFullGrid(1)
		grid2 := GenerateFullGrid(2)

		same := true
		for i := range grid1 {
			if grid1[i] != grid2[i] {
				same = false
				break
			}
		}
		if same {
			t.Error("different seeds produced identical grids")
		}
	})

	t.Run("generated grid has exactly one solution", func(t *testing.T) {
		grid := GenerateFullGrid(99999)
		unique, err := HasUniqueSolution(context.Background(), grid)
		if err != nil {
			t.Fatalf("HasUniqueSolution returned error: %v", err)
		}
		if !unique {
			t.Error("generated grid does not have unique solution")
		}
	})
}

// TestCarveGivens

func TestCarveGivens(t *testing.T) {
	t.Run("produces valid puzzle", func(t *testing.T) {
		fullGrid := GenerateFullGrid(123)
		puzzle := mustCarveGivens(t, fullGrid, 30, 456)

		if !IsValid(context.Background(), puzzle) {
			t.Error("carved puzzle is not valid")
		}
	})

	t.Run("puzzle has unique solution", func(t *testing.T) {
		fullGrid := GenerateFullGrid(789)
		puzzle := mustCarveGivens(t, fullGrid, 35, 101)

		unique, err := HasUniqueSolution(context.Background(), puzzle)
		if err != nil {
			t.Fatalf("HasUniqueSolution returned error: %v", err)
		}
		if !unique {
			t.Error("carved puzzle does not have unique solution")
		}
	})

	t.Run("puzzle solution matches original grid", func(t *testing.T) {
		fullGrid := GenerateFullGrid(111)
		puzzle := mustCarveGivens(t, fullGrid, 40, 222)

		solution, err := Solve(context.Background(), puzzle)
		if err != nil {
			t.Fatalf("Solve returned error: %v", err)
		}
		if solution == nil {
			t.Fatal("puzzle is unsolvable")
		}

		for i := range solution {
			if solution[i] != fullGrid[i] {
				t.Errorf("solution differs from original at position %d", i)
			}
		}
	})

	t.Run("preserves filled cells from original", func(t *testing.T) {
		fullGrid := GenerateFullGrid(333)
		puzzle := mustCarveGivens(t, fullGrid, 25, 444)

		for i := range puzzle {
			if puzzle[i] != 0 && puzzle[i] != fullGrid[i] {
				t.Errorf("cell %d has wrong value: puzzle=%d, original=%d",
					i, puzzle[i], fullGrid[i])
			}
		}
	})

	t.Run("same seeds produce same puzzle", func(t *testing.T) {
		fullGrid := GenerateFullGrid(555)
		puzzle1 := mustCarveGivens(t, fullGrid, 30, 666)
		puzzle2 := mustCarveGivens(t, fullGrid, 30, 666)

		for i := range puzzle1 {
			if puzzle1[i] != puzzle2[i] {
				t.Errorf("position %d differs: %d vs %d", i, puzzle1[i], puzzle2[i])
			}
		}
	})

	t.Run("fewer target givens produces harder puzzle", func(t *testing.T) {
		fullGrid := GenerateFullGrid(777)

		easyPuzzle := mustCarveGivens(t, fullGrid, 45, 888)
		hardPuzzle := mustCarveGivens(t, fullGrid, 25, 888)

		easyGivens := countGivens(easyPuzzle)
		hardGivens := countGivens(hardPuzzle)

		if hardGivens >= easyGivens {
			t.Errorf("hard puzzle should have fewer givens: easy=%d, hard=%d",
				easyGivens, hardGivens)
		}
	})
}

func countGivens(grid []int) int {
	count := 0
	for _, v := range grid {
		if v != 0 {
			count++
		}
	}
	return count
}

// mustCarveGivens wraps CarveGivens for tests using an uncancellable background
// context, failing the test if carving errors unexpectedly.
func mustCarveGivens(t *testing.T, fullGrid []int, targetGivens int, seed int64) []int {
	t.Helper()
	puzzle, err := CarveGivens(context.Background(), fullGrid, targetGivens, seed)
	if err != nil {
		t.Fatalf("CarveGivens errored: %v", err)
	}
	return puzzle
}

// mustCarveGivensWithSubset wraps CarveGivensWithSubset for tests using an
// uncancellable background context.
func mustCarveGivensWithSubset(t *testing.T, fullGrid []int, seed int64) map[string][]int {
	t.Helper()
	puzzles, err := CarveGivensWithSubset(context.Background(), fullGrid, seed)
	if err != nil {
		t.Fatalf("CarveGivensWithSubset errored: %v", err)
	}
	return puzzles
}

// TestCarveGivens_CancelledContextPropagatesError asserts that a canceled
// context surfaces as an error instead of being swallowed into a silently
// partially-carved board. HasUniqueSolution honors ctx cancellation; without
// error propagation the carve loop would treat (false, ctx.Err()) as "not
// unique, restore and continue", walking the rest of the cells and returning a
// wrong puzzle.
func TestCarveGivens_CancelledContextPropagatesError(t *testing.T) {
	fullGrid := GenerateFullGrid(20260731)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	puzzle, err := CarveGivens(ctx, fullGrid, 30, 456)
	if err == nil {
		t.Fatalf("expected error from canceled context, got nil (puzzle=%v)", puzzle)
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	// A usable partially-carved board must not be returned alongside the error.
	if puzzle != nil {
		t.Errorf("expected nil puzzle on error, got %d-cell board", len(puzzle))
	}
}

// TestCarveGivensWithSubset_CancelledContextPropagatesError is the subset
// variant of the cancellation regression above.
func TestCarveGivensWithSubset_CancelledContextPropagatesError(t *testing.T) {
	fullGrid := GenerateFullGrid(20260731)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	puzzles, err := CarveGivensWithSubset(ctx, fullGrid, 456)
	if err == nil {
		t.Fatalf("expected error from canceled context, got nil (puzzles=%v)", puzzles)
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
	if puzzles != nil {
		t.Errorf("expected nil puzzle map on error, got %d entries", len(puzzles))
	}
}

// TestCarveGivensWithSubset

func TestCarveGivensWithSubset(t *testing.T) {
	fullGrid := GenerateFullGrid(12345)
	puzzles := mustCarveGivensWithSubset(t, fullGrid, 67890)

	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}

	t.Run("generates all difficulty levels", func(t *testing.T) {
		for _, diff := range difficulties {
			if _, ok := puzzles[diff]; !ok {
				t.Errorf("missing difficulty level: %s", diff)
			}
		}
	})

	t.Run("all puzzles are valid", func(t *testing.T) {
		for diff, puzzle := range puzzles {
			if !IsValid(context.Background(), puzzle) {
				t.Errorf("%s puzzle is not valid", diff)
			}
		}
	})

	t.Run("all puzzles have unique solutions", func(t *testing.T) {
		for diff, puzzle := range puzzles {
			unique, err := HasUniqueSolution(context.Background(), puzzle)
			if err != nil {
				t.Errorf("%s puzzle: HasUniqueSolution error: %v", diff, err)
				continue
			}
			if !unique {
				t.Errorf("%s puzzle does not have unique solution", diff)
			}
		}
	})

	t.Run("all puzzles solve to same grid", func(t *testing.T) {
		for diff, puzzle := range puzzles {
			solution, err := Solve(context.Background(), puzzle)
			if err != nil {
				t.Errorf("%s puzzle: Solve error: %v", diff, err)
				continue
			}
			if solution == nil {
				t.Errorf("%s puzzle is unsolvable", diff)
				continue
			}
			for i := range solution {
				if solution[i] != fullGrid[i] {
					t.Errorf("%s solution differs from original at position %d", diff, i)
					break
				}
			}
		}
	})

	t.Run("easier puzzles have at least as many givens as harder ones", func(t *testing.T) {
		// Due to uniqueness constraint, harder puzzles may end up with same givens as easier
		prevGivens := 82 // Start higher than any possible givens count
		for _, diff := range difficulties {
			puzzle := puzzles[diff]
			givens := countGivens(puzzle)

			if givens > prevGivens {
				t.Errorf("%s should not have MORE givens than easier level: got %d, prev %d",
					diff, givens, prevGivens)
			}
			prevGivens = givens
		}
	})

	t.Run("subset property holds", func(t *testing.T) {
		// Each harder puzzle should have a subset of the easier puzzle's givens
		for i := range len(difficulties) - 1 {
			easier := difficulties[i]
			harder := difficulties[i+1]

			easierPuzzle := puzzles[easier]
			harderPuzzle := puzzles[harder]

			for pos := range 81 {
				if harderPuzzle[pos] != 0 && easierPuzzle[pos] == 0 {
					t.Errorf("subset property violated: %s has given at %d but %s doesn't",
						harder, pos, easier)
				}
			}
		}
	})
}

// Edge Cases and Boundary Tests

func TestEdgeCases(t *testing.T) {
	t.Run("nil-like behavior with wrong size grid", func(t *testing.T) {
		// Note: The implementation assumes 81-element grids
		// This test documents expected behavior with correct size
		grid := make([]int, 81)
		result, err := Solve(context.Background(), grid)
		if err != nil {
			t.Fatalf("Solve returned error: %v", err)
		}
		if result == nil {
			t.Error("empty 81-element grid should be solvable")
		}
	})

	t.Run("grid with single empty cell", func(t *testing.T) {
		// Create an almost-complete grid with one cell missing
		grid := make([]int, 81)
		copy(grid, solvedGrid)
		grid[0] = 0 // Remove first cell

		result, err := Solve(context.Background(), grid)
		if err != nil {
			t.Fatalf("Solve returned error: %v", err)
		}
		if result == nil {
			t.Error("grid with single empty cell should be solvable")
		}
		if result[0] != solvedGrid[0] {
			t.Errorf("expected %d at position 0, got %d", solvedGrid[0], result[0])
		}
	})

	t.Run("all cells same valid value in row causes conflict", func(t *testing.T) {
		grid := make([]int, 81)
		// Fill first row with all 1s
		for i := range 9 {
			grid[i] = 1
		}

		conflicts := FindConflicts(grid)
		if len(conflicts) == 0 {
			t.Error("expected conflicts for row of identical values")
		}
	})
}

// Benchmark Tests

func BenchmarkSolve(b *testing.B) {
	for range b.N {
		puzzle := make([]int, 81)
		copy(puzzle, validPuzzle)
		_, _ = Solve(context.Background(), puzzle)
	}
}

func BenchmarkHasUniqueSolution(b *testing.B) {
	for range b.N {
		_, _ = HasUniqueSolution(context.Background(), validPuzzle)
	}
}

func BenchmarkGenerateFullGrid(b *testing.B) {
	for i := range b.N {
		GenerateFullGrid(int64(i))
	}
}

func BenchmarkFindConflicts(b *testing.B) {
	for range b.N {
		FindConflicts(validPuzzle)
	}
}

// BenchmarkFindConflictsConflictCase exercises the conflict-emission path
// (with dedup map population and Conflict slice growth), in contrast to the
// clean-grid BenchmarkFindConflicts above which stays on the allocation-free
// fast path. Together the two benchmarks bound the cost of the rewrite across
// the realistic input range.
func BenchmarkFindConflictsConflictCase(b *testing.B) {
	// Sprinkle one duplicate per row/col/box region so every scan unit emits at
	// least one conflict and the dedup map is exercised.
	grid := make([]int, 81)
	for i := range 9 {
		grid[i*9] = i + 1
		grid[i*9+1] = i + 1
	}
	b.ReportAllocs()
	for range b.N {
		FindConflicts(grid)
	}
}

// TestFindConflictsCorpusEquivalence pins the exact conflict set produced by
// FindConflicts across a corpus of representative grids. It serves as the
// behavioral-equivalence proof for the allocation rewrite: any change to the
// output set (a new miss, a new duplicate, a wrong cell pair) is caught here
// regardless of how the implementation produces it. Set equality is checked by
// serializing each conflict to a "cell1-cell2-val:type" token and comparing
// sorted token slices, so per-unit digit ordering (which is now deterministic
// ascending where it used to be map-iteration random) does not affect the pass.
func TestFindConflictsCorpusEquivalence(t *testing.T) {
	tripleGrid := make([]int, 81)
	tripleGrid[0] = 5
	tripleGrid[2] = 5
	tripleGrid[9] = 5

	// Full row of identical values: 9 ones in row 0 produces C(9,2) = 36 pairs.
	rowOfOnes := make([]int, 81)
	for i := range 9 {
		rowOfOnes[i] = 1
	}

	// Two independent conflicts: a row pair and a column pair on different digits.
	twoConflictGrid := make([]int, 81)
	twoConflictGrid[0] = 7
	twoConflictGrid[8] = 7
	twoConflictGrid[9] = 3
	twoConflictGrid[72] = 3

	cases := []struct {
		name string
		grid []int
		want []string
	}{
		{
			name: "valid grid has empty conflict set",
			grid: validPuzzle,
			want: nil,
		},
		{
			name: "empty grid has empty conflict set",
			grid: emptyGrid,
			want: nil,
		},
		{
			name: "triple group dedups cross-unit and keeps the box-only pair",
			grid: tripleGrid,
			want: []string{
				"0-2-5:row",
				"0-9-5:column",
				"2-9-5:box",
			},
		},
		{
			name: "two independent pairs surface as two conflicts",
			grid: twoConflictGrid,
			want: []string{
				"0-8-7:row",
				"9-72-3:column",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := conflictTokens(FindConflicts(tc.grid))
			if tc.want == nil {
				if len(got) != 0 {
					t.Fatalf("expected no conflicts, got %v", got)
				}
				return
			}
			if len(got) != len(tc.want) {
				t.Fatalf("expected %d conflicts, got %d:\nwant=%v\ngot =%v", len(tc.want), len(got), tc.want, got)
			}
			// Both slices are produced deterministically and compared
			// position-by-position; mismatch here pinpoints which pair changed.
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("conflict %d: want %q, got %q", i, tc.want[i], got[i])
				}
			}
		})
	}

	// The row-of-ones case is checked separately: it emits C(9,2) = 36 pairs,
	// all of type "row" with value 1. The exact pairs are tedious to enumerate,
	// so this asserts the count and that every pair is a distinct row-0 cell
	// pair with value 1.
	t.Run("row of ones emits 36 distinct row pairs", func(t *testing.T) {
		conflicts := FindConflicts(rowOfOnes)
		if len(conflicts) != 36 {
			t.Fatalf("expected 36 row conflicts (9 choose 2), got %d", len(conflicts))
		}
		seen := make(map[uint64]bool, 36)
		for _, c := range conflicts {
			if c.Type != "row" || c.Value != 1 {
				t.Errorf("expected row/1, got %+v", c)
			}
			key := conflictKey(c.Cell1, c.Cell2, c.Value)
			if seen[key] {
				t.Errorf("duplicate conflict key %d for %+v", key, c)
			}
			seen[key] = true
		}
	})
}

// conflictTokens serializes a conflict slice into the deterministic
// "cell1-cell2-val:type" tokens used by the corpus equivalence test. The
// FindConflicts output ordering is already deterministic (rows, then columns,
// then boxes; ascending digit order within each unit; and ascending i,j pair
// order within each digit group), so no re-sorting is applied here.
func conflictTokens(cs []Conflict) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = fmt.Sprintf("%d-%d-%d:%s", c.Cell1, c.Cell2, c.Value, c.Type)
	}
	return out
}

// --- Mutation-driven behavioral tests (pinning exact observable properties) ---
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
	got := make(map[uint64]bool)
	for _, c := range conflicts {
		got[conflictKey(c.Cell1, c.Cell2, c.Value)] = true
	}
	for _, w := range want {
		key := conflictKey(w.Cell1, w.Cell2, w.Value)
		if !got[key] {
			t.Errorf("missing expected conflict %+v in %+v", w, conflicts)
		}
	}
}

// TestFindConflicts_DedupsPairSharedByRowAndBox asserts the cross-unit dedup is
// load-bearing: two cells at indices 0 and 1 share BOTH row 0 and box 0. Without
// the dedup map the row pass and the box pass each emit a Conflict for the same
// pair; with it, exactly one Conflict is emitted.
func TestFindConflicts_DedupsPairSharedByRowAndBox(t *testing.T) {
	grid := make([]int, 81)
	grid[0] = 5
	grid[1] = 5

	conflicts := FindConflicts(grid)

	if len(conflicts) != 1 {
		t.Fatalf("expected exactly 1 deduped conflict for a pair shared by row+box, got %d: %+v", len(conflicts), conflicts)
	}
	c := conflicts[0]
	if c.Cell1 != 0 || c.Cell2 != 1 || c.Value != 5 {
		t.Errorf("unexpected conflict: %+v", c)
	}
}

// --- CarveGivensWithSubset: exact givens count per difficulty ---

func TestMutation_CarveGivensWithSubset_ExactGivensPerDifficulty(t *testing.T) {
	fullGrid := GenerateFullGrid(12345)
	puzzles := mustCarveGivensWithSubset(t, fullGrid, 67890)

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
	puzzles := mustCarveGivensWithSubset(t, fullGrid, 67890)

	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}
	for i := range len(difficulties) - 1 {
		easier := puzzles[difficulties[i]]
		harder := puzzles[difficulties[i+1]]
		for pos := range 81 {
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
		puzzle := mustCarveGivens(t, fullGrid, target, 456)
		got := countGivens(puzzle)
		if got != target {
			t.Errorf("target=%d: expected %d givens, got %d", target, target, got)
		}
	}
}

// --- CarveGivens: seed must observably drive carve order ---
//
// rng is used only for rng.shuffle(positions). Kill the shuffle and positions is
// always [0..80], so the seed loses all effect and distinct seeds carve the same
// puzzle. Divergence between two seeds pins the shuffle as observable.

func TestMutation_CarveGivens_DifferentSeedsProduceDifferentPuzzles(t *testing.T) {
	fullGrid := GenerateFullGrid(2024)

	puzzleA := mustCarveGivens(t, fullGrid, 30, 100)
	puzzleB := mustCarveGivens(t, fullGrid, 30, 900)

	differ := false
	for i := range puzzleA {
		if puzzleA[i] != puzzleB[i] {
			differ = true
			break
		}
	}
	if !differ {
		t.Fatal("distinct seeds produced identical puzzles; carve-order shuffle is not observable")
	}
}

// --- CountSolutions: boundary maxCount behavior ---

func TestMutation_CountSolutions_RespectsMaxCountBoundary(t *testing.T) {
	count, err := CountSolutions(context.Background(), emptyGrid, 2)
	if err != nil {
		t.Fatalf("CountSolutions error: %v", err)
	}
	if count != 2 {
		t.Errorf("empty grid with maxCount=2: expected 2, got %d", count)
	}
	count3, err := CountSolutions(context.Background(), emptyGrid, 3)
	if err != nil {
		t.Fatalf("CountSolutions error: %v", err)
	}
	if count3 != 3 {
		t.Errorf("empty grid with maxCount=3: expected 3, got %d", count3)
	}
}

func TestMutation_CountSolutions_NearlyFullPuzzle(t *testing.T) {
	grid := make([]int, 81)
	copy(grid, solvedGrid)
	grid[80] = 0
	count, err := CountSolutions(context.Background(), grid, 2)
	if err != nil {
		t.Fatalf("CountSolutions error: %v", err)
	}
	if count != 1 {
		t.Errorf("nearly-full puzzle: expected 1 solution, got %d", count)
	}
}

// --- Solve: digit range with nearly-full puzzle ---

func TestMutation_Solve_NearlyFullPuzzle(t *testing.T) {
	grid := make([]int, 81)
	copy(grid, solvedGrid)
	grid[80] = 0
	solution, err := Solve(context.Background(), grid)
	if err != nil {
		t.Fatalf("Solve error: %v", err)
	}
	if solution == nil {
		t.Fatal("expected solution for nearly-full puzzle")
	}
	if !reflect.DeepEqual(solution, solvedGrid) {
		t.Errorf("solution does not match expected solved grid")
	}
}

// --- SEC-1: Budget enforcement on pathological sparse boards ---

func TestSolve_BudgetEnforcedDirectly(t *testing.T) {
	board := make([]int, constants.TotalCells)
	copy(board, validPuzzle)
	budget := &nodeBudget{max: 10}
	_, err := solve(context.Background(), board, budget)
	if !errors.Is(err, ErrBudgetExceeded) {
		t.Errorf("expected ErrBudgetExceeded with max=10, got %v", err)
	}
}

func TestCountSolutions_BudgetEnforcedDirectly(t *testing.T) {
	board := make([]int, constants.TotalCells)
	copy(board, validPuzzle)
	count := 0
	budget := &nodeBudget{max: 10}
	err := countSolutionsHelper(context.Background(), board, &count, 2, budget)
	if !errors.Is(err, ErrBudgetExceeded) {
		t.Errorf("expected ErrBudgetExceeded with max=10, got %v", err)
	}
}

func TestSolve_SparseBoardReturnsQuickly(t *testing.T) {
	board := make([]int, 81)
	board[0] = 1
	board[8] = 9

	start := time.Now()
	_, err := Solve(context.Background(), board)
	elapsed := time.Since(start)

	if elapsed > time.Second {
		t.Errorf("Solve took %v; expected under 1s", elapsed)
	}
	if err != nil && !errors.Is(err, ErrBudgetExceeded) {
		t.Errorf("expected nil or ErrBudgetExceeded, got %v", err)
	}
}

func TestSolve_ContextCancellationStopsBacktrack(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	board := make([]int, constants.TotalCells)
	copy(board, validPuzzle)
	budget := &nodeBudget{max: constants.MaxSolverNodes}
	_, err := solve(ctx, board, budget)
	if err == nil {
		t.Error("expected error from canceled context, got nil")
	}
}

func TestSolve_PublicReturnsErrorOnCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := Solve(ctx, validPuzzle)
	if err == nil {
		t.Error("expected error from Solve with canceled context")
	}
}

func TestHasUniqueSolution_ReturnsErrorOnCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := HasUniqueSolution(ctx, validPuzzle)
	if err == nil {
		t.Error("expected error from HasUniqueSolution with canceled context")
	}
}

func TestCountSolutions_ReturnsErrorOnCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := CountSolutions(ctx, validPuzzle, 2)
	if err == nil {
		t.Error("expected error from CountSolutions with canceled context")
	}
}

func TestSolve_ReturnsNilForUnsolvableBoard(t *testing.T) {
	board := make([]int, constants.TotalCells)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	solution, err := Solve(context.Background(), board)
	if err != nil {
		t.Errorf("expected nil error for unsolvable board, got %v", err)
	}
	if solution != nil {
		t.Errorf("expected nil solution for unsolvable board, got %v", solution)
	}
}

// --- BUG-15: invalid grids must not be blessed as solutions ---

// TestSolve_RejectsGridWithConflictingGivens pins the front validity guard:
// a board whose pre-filled givens conflict (two 5s in row 0) must return nil
// rather than backtracking from the conflicting givens and echoing the board.
func TestSolve_RejectsGridWithConflictingGivens(t *testing.T) {
	solution, err := Solve(context.Background(), rowConflictGrid)
	if err != nil {
		t.Fatalf("expected nil error for conflicting board, got %v", err)
	}
	if solution != nil {
		t.Errorf("expected nil solution for grid with conflicting givens, got %v", solution)
	}
}

// TestSolve_RejectsFullButInvalidGrid is the exact BUG-15 scenario: a
// completely-filled but invalid board (duplicate in row 0) used to reach
// findEmptyCell==-1 and be echoed verbatim as a "solution". The guard must
// reject it up front.
func TestSolve_RejectsFullButInvalidGrid(t *testing.T) {
	fullButInvalid := make([]int, constants.TotalCells)
	copy(fullButInvalid, solvedGrid)
	// Introduce a duplicate: overwrite cell 1 with solvedGrid[0]'s value,
	// creating two equal values in row 0.
	fullButInvalid[1] = fullButInvalid[0]
	if IsValid(context.Background(), fullButInvalid) {
		t.Fatal("test setup error: expected fullButInvalid to fail IsValid")
	}

	solution, err := Solve(context.Background(), fullButInvalid)
	if err != nil {
		t.Fatalf("expected nil error for full-but-invalid board, got %v", err)
	}
	if solution != nil {
		t.Errorf("expected nil solution for full-but-invalid board, got %v", solution)
	}
}

// TestSolve_ValidPuzzleStillSolvedAfterGuard confirms the new guard does not
// reject a legitimate sparse puzzle: the canonical validPuzzle must still
// solve to its known solution.
func TestSolve_ValidPuzzleStillSolvedAfterGuard(t *testing.T) {
	solution, err := Solve(context.Background(), validPuzzle)
	if err != nil {
		t.Fatalf("Solve error: %v", err)
	}
	if solution == nil {
		t.Fatal("expected solution for valid puzzle")
	}
	if !IsValid(context.Background(), solution) {
		t.Error("returned solution is not valid")
	}
}

// TestCountSolutions_RejectsConflictingGrid pins the matching guard in
// CountSolutions: a conflicting board reports 0 solutions instead of counting
// the spurious solutions reachable from invalid givens.
func TestCountSolutions_RejectsConflictingGrid(t *testing.T) {
	count, err := CountSolutions(context.Background(), rowConflictGrid, 2)
	if err != nil {
		t.Fatalf("expected nil error for conflicting board, got %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 solutions for conflicting grid, got %d", count)
	}
}

// TestCountSolutions_ConflictingFullGridReportsZero pins the full-but-invalid
// scenario for the counting path: an invalid complete board used to count as
// one solution (findEmptyCell==-1 increments the counter). The guard rejects it.
func TestCountSolutions_ConflictingFullGridReportsZero(t *testing.T) {
	fullButInvalid := make([]int, constants.TotalCells)
	copy(fullButInvalid, solvedGrid)
	fullButInvalid[1] = fullButInvalid[0]

	count, err := CountSolutions(context.Background(), fullButInvalid, 2)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 solutions for full-but-invalid grid, got %d", count)
	}
}

// --- MUT-6-3: kill tests for the 18 survivors of the honest (--exec-timeout 300)
// dp measurement in run 30899984529. Each test pins an observable property that
// one or more of those mutants changes.

// --- unitPositions: the "slot 0 stays empty" invariant appendUnitConflicts relies on ---

func TestUnitPositionsRecordSkipsEmptiesAndFilesDigitsUnderTheirValue(t *testing.T) {
	var unit unitPositions

	unit.record(0, 3)
	unit.record(0, 4)
	if unit.counts[0] != 0 {
		t.Fatalf("empty cells must not be recorded, got counts[0]=%d holding %v",
			unit.counts[0], unit.positions[0][:unit.counts[0]])
	}

	unit.record(1, 5)
	unit.record(9, 7)

	if unit.counts[1] != 1 || unit.positions[1][0] != 5 {
		t.Errorf("expected digit 1 filed at cell 5, got counts[1]=%d positions[1][0]=%d",
			unit.counts[1], unit.positions[1][0])
	}
	if unit.counts[9] != 1 || unit.positions[9][0] != 7 {
		t.Errorf("expected digit 9 filed at cell 7, got counts[9]=%d positions[9][0]=%d",
			unit.counts[9], unit.positions[9][0])
	}
	if unit.counts[0] != 0 {
		t.Errorf("recording digits must leave slot 0 empty, got counts[0]=%d", unit.counts[0])
	}
}

func TestAppendUnitConflictsIgnoresGroupsFiledUnderSlotZero(t *testing.T) {
	// record cannot populate slot 0, so it is written directly here: the scan must
	// start at digit 1 and report nothing for a group of would-be empty cells.
	var unit unitPositions
	unit.positions[0][0], unit.positions[0][1] = 4, 8
	unit.counts[0] = 2

	var seen map[uint64]bool
	conflicts := appendUnitConflicts(unit, "row", &seen, nil)

	if len(conflicts) != 0 {
		t.Fatalf("slot 0 must never yield a conflict, got %+v", conflicts)
	}
}

// --- FindConflicts: the digits at both ends of the 1-9 scan range ---

func TestFindConflictsReportsBoundaryDigitDuplicatesInEveryUnitType(t *testing.T) {
	for _, digit := range []int{1, 9} {
		t.Run(fmt.Sprintf("digit_%d", digit), func(t *testing.T) {
			// Cells 0 and 2 share row 0, cells 0 and 9 share column 0, and cells 2
			// and 9 share box 0, so one grid exercises all three unit types.
			grid := make([]int, 81)
			grid[0], grid[2], grid[9] = digit, digit, digit

			got := make(map[string]bool)
			for _, c := range FindConflicts(grid) {
				got[fmt.Sprintf("%d-%d-%d:%s", c.Cell1, c.Cell2, c.Value, c.Type)] = true
			}

			want := []string{
				fmt.Sprintf("0-2-%d:row", digit),
				fmt.Sprintf("0-9-%d:column", digit),
				fmt.Sprintf("2-9-%d:box", digit),
			}
			if len(got) != len(want) {
				t.Fatalf("expected %d conflicts for digit %d, got %d: %v", len(want), digit, len(got), got)
			}
			for _, w := range want {
				if !got[w] {
					t.Errorf("missing conflict %s for digit %d, got %v", w, digit, got)
				}
			}
		})
	}
}

func TestFindConflictsEmitsRemainingPairsAfterSkippingAnAlreadySeenPair(t *testing.T) {
	// Cells 0, 1 and 20 all sit in box 0, and 0 and 1 additionally share row 0.
	// The box pass therefore meets the already-seen pair (0,1) first; it must
	// carry on to (0,20) rather than abandoning the rest of cell 0's pairs.
	grid := make([]int, 81)
	grid[0], grid[1], grid[20] = 5, 5, 5

	got := make(map[string]bool)
	for _, c := range FindConflicts(grid) {
		got[fmt.Sprintf("%d-%d-%d:%s", c.Cell1, c.Cell2, c.Value, c.Type)] = true
	}

	want := []string{"0-1-5:row", "0-20-5:box", "1-20-5:box"}
	if len(got) != len(want) {
		t.Fatalf("expected %d conflicts, got %d: %v", len(want), len(got), got)
	}
	for _, w := range want {
		if !got[w] {
			t.Errorf("missing conflict %s, got %v", w, got)
		}
	}
}

// --- nodeBudget: where the periodic budget check falls, and its boundary ---

func TestNodeBudgetChecksTheBudgetOnEveryThousandthTick(t *testing.T) {
	// The tick counts are written as literals rather than as budgetCheckInterval so
	// that a mutated interval cannot move the expectation along with the code.
	budget := &nodeBudget{max: 0}
	ctx := context.Background()

	for tick := 1; tick < 1000; tick++ {
		if err := budget.tick(ctx); err != nil {
			t.Fatalf("tick %d ran a budget check before the 1000th, got %v", tick, err)
		}
	}
	if err := budget.tick(ctx); !errors.Is(err, ErrBudgetExceeded) {
		t.Fatalf("tick 1000 must be the first budget checkpoint, got %v", err)
	}
}

func TestNodeBudgetAllowsANodeCountEqualToItsMaximum(t *testing.T) {
	budget := &nodeBudget{max: 1000}
	ctx := context.Background()

	for tick := 1; tick <= 1000; tick++ {
		if err := budget.tick(ctx); err != nil {
			t.Fatalf("a budget of 1000 nodes must permit tick %d, got %v", tick, err)
		}
	}
}

// --- TargetGivensFor: the carving targets as a public contract ---

func TestTargetGivensForReturnsTheClueCountForEachDifficulty(t *testing.T) {
	tests := []struct {
		difficulty string
		want       int
	}{
		{"easy", 40},
		{"medium", 34},
		{"hard", 28},
		{"extreme", 24},
		{"impossible", 20},
	}

	for _, tt := range tests {
		t.Run(tt.difficulty, func(t *testing.T) {
			if got := TargetGivensFor(tt.difficulty); got != tt.want {
				t.Errorf("TargetGivensFor(%q) = %d, want %d", tt.difficulty, got, tt.want)
			}
		})
	}
}

func TestTargetGivensForReturnsZeroForAnUnrecognizedDifficulty(t *testing.T) {
	if got := TargetGivensFor("nonexistent"); got != 0 {
		t.Errorf("TargetGivensFor(%q) = %d, want 0", "nonexistent", got)
	}
}
