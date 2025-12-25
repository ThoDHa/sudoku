package dp

import (
	"testing"
)

// ============================================================================
// Test Data
// ============================================================================

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

// ============================================================================
// TestSolve
// ============================================================================

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
			result := Solve(tt.input)

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
			if !IsValid(result) {
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

	Solve(validPuzzle)

	for i := range validPuzzle {
		if validPuzzle[i] != original[i] {
			t.Errorf("Solve modified input at position %d: got %d, want %d",
				i, validPuzzle[i], original[i])
		}
	}
}

// ============================================================================
// TestHasUniqueSolution
// ============================================================================

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
			got := HasUniqueSolution(tt.input)
			if got != tt.want {
				t.Errorf("HasUniqueSolution() = %v, want %v", got, tt.want)
			}
		})
	}
}

// ============================================================================
// TestIsValid
// ============================================================================

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
			got := IsValid(tt.input)
			if got != tt.want {
				t.Errorf("IsValid() = %v, want %v", got, tt.want)
			}
		})
	}
}

// ============================================================================
// TestFindConflicts
// ============================================================================

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

// ============================================================================
// TestCountSolutions
// ============================================================================

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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CountSolutions(tt.input, tt.maxCount)
			if got != tt.want {
				t.Errorf("CountSolutions() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestCountSolutions_DoesNotModifyInput(t *testing.T) {
	original := make([]int, len(validPuzzle))
	copy(original, validPuzzle)

	CountSolutions(validPuzzle, 10)

	for i := range validPuzzle {
		if validPuzzle[i] != original[i] {
			t.Errorf("CountSolutions modified input at position %d", i)
		}
	}
}

// ============================================================================
// TestGenerateFullGrid
// ============================================================================

func TestGenerateFullGrid(t *testing.T) {
	t.Run("generates valid complete grid", func(t *testing.T) {
		grid := GenerateFullGrid(12345)

		// Check it's valid
		if !IsValid(grid) {
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
		if !HasUniqueSolution(grid) {
			t.Error("generated grid does not have unique solution")
		}
	})
}

// ============================================================================
// TestCarveGivens
// ============================================================================

func TestCarveGivens(t *testing.T) {
	t.Run("produces valid puzzle", func(t *testing.T) {
		fullGrid := GenerateFullGrid(123)
		puzzle := CarveGivens(fullGrid, 30, 456)

		if !IsValid(puzzle) {
			t.Error("carved puzzle is not valid")
		}
	})

	t.Run("puzzle has unique solution", func(t *testing.T) {
		fullGrid := GenerateFullGrid(789)
		puzzle := CarveGivens(fullGrid, 35, 101)

		if !HasUniqueSolution(puzzle) {
			t.Error("carved puzzle does not have unique solution")
		}
	})

	t.Run("puzzle solution matches original grid", func(t *testing.T) {
		fullGrid := GenerateFullGrid(111)
		puzzle := CarveGivens(fullGrid, 40, 222)

		solution := Solve(puzzle)
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
		puzzle := CarveGivens(fullGrid, 25, 444)

		for i := range puzzle {
			if puzzle[i] != 0 && puzzle[i] != fullGrid[i] {
				t.Errorf("cell %d has wrong value: puzzle=%d, original=%d",
					i, puzzle[i], fullGrid[i])
			}
		}
	})

	t.Run("same seeds produce same puzzle", func(t *testing.T) {
		fullGrid := GenerateFullGrid(555)
		puzzle1 := CarveGivens(fullGrid, 30, 666)
		puzzle2 := CarveGivens(fullGrid, 30, 666)

		for i := range puzzle1 {
			if puzzle1[i] != puzzle2[i] {
				t.Errorf("position %d differs: %d vs %d", i, puzzle1[i], puzzle2[i])
			}
		}
	})

	t.Run("fewer target givens produces harder puzzle", func(t *testing.T) {
		fullGrid := GenerateFullGrid(777)

		easyPuzzle := CarveGivens(fullGrid, 45, 888)
		hardPuzzle := CarveGivens(fullGrid, 25, 888)

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

// ============================================================================
// TestCarveGivensWithSubset
// ============================================================================

func TestCarveGivensWithSubset(t *testing.T) {
	fullGrid := GenerateFullGrid(12345)
	puzzles := CarveGivensWithSubset(fullGrid, 67890)

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
			if !IsValid(puzzle) {
				t.Errorf("%s puzzle is not valid", diff)
			}
		}
	})

	t.Run("all puzzles have unique solutions", func(t *testing.T) {
		for diff, puzzle := range puzzles {
			if !HasUniqueSolution(puzzle) {
				t.Errorf("%s puzzle does not have unique solution", diff)
			}
		}
	})

	t.Run("all puzzles solve to same grid", func(t *testing.T) {
		for diff, puzzle := range puzzles {
			solution := Solve(puzzle)
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
		for i := 0; i < len(difficulties)-1; i++ {
			easier := difficulties[i]
			harder := difficulties[i+1]

			easierPuzzle := puzzles[easier]
			harderPuzzle := puzzles[harder]

			for pos := 0; pos < 81; pos++ {
				if harderPuzzle[pos] != 0 && easierPuzzle[pos] == 0 {
					t.Errorf("subset property violated: %s has given at %d but %s doesn't",
						harder, pos, easier)
				}
			}
		}
	})
}

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

func TestEdgeCases(t *testing.T) {
	t.Run("nil-like behavior with wrong size grid", func(t *testing.T) {
		// Note: The implementation assumes 81-element grids
		// This test documents expected behavior with correct size
		grid := make([]int, 81)
		result := Solve(grid)
		if result == nil {
			t.Error("empty 81-element grid should be solvable")
		}
	})

	t.Run("grid with single empty cell", func(t *testing.T) {
		// Create an almost-complete grid with one cell missing
		grid := make([]int, 81)
		copy(grid, solvedGrid)
		grid[0] = 0 // Remove first cell

		result := Solve(grid)
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
		for i := 0; i < 9; i++ {
			grid[i] = 1
		}

		conflicts := FindConflicts(grid)
		if len(conflicts) == 0 {
			t.Error("expected conflicts for row of identical values")
		}
	})
}

// ============================================================================
// Benchmark Tests
// ============================================================================

func BenchmarkSolve(b *testing.B) {
	for i := 0; i < b.N; i++ {
		puzzle := make([]int, 81)
		copy(puzzle, validPuzzle)
		Solve(puzzle)
	}
}

func BenchmarkHasUniqueSolution(b *testing.B) {
	for i := 0; i < b.N; i++ {
		HasUniqueSolution(validPuzzle)
	}
}

func BenchmarkGenerateFullGrid(b *testing.B) {
	for i := 0; i < b.N; i++ {
		GenerateFullGrid(int64(i))
	}
}

func BenchmarkFindConflicts(b *testing.B) {
	for i := 0; i < b.N; i++ {
		FindConflicts(validPuzzle)
	}
}
