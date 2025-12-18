package human

import (
	"testing"

	"sudoku-api/internal/core"
)

// makeTestBoard creates a board with specific cells and candidates for testing.
// candidateMap maps cell index (0-80) to a slice of candidate digits.
func makeTestBoard(cells [81]int, candidateMap map[int][]int) *Board {
	b := &Board{}
	for i := 0; i < 81; i++ {
		b.Cells[i] = cells[i]
		b.Candidates[i] = make(map[int]bool)
	}
	for idx, cands := range candidateMap {
		for _, d := range cands {
			b.Candidates[idx][d] = true
		}
	}
	return b
}

// cellIdx converts row,col (0-indexed) to linear index
func cellIdx(row, col int) int {
	return row*9 + col
}

// makeFullCandidateBoard creates a board where every empty cell has all 9 candidates.
// Then overrides specific cells with the provided candidateMap.
// This ensures no false positives from empty candidate sets.
func makeFullCandidateBoard(cells [81]int, candidateMap map[int][]int) *Board {
	b := &Board{}
	for i := 0; i < 81; i++ {
		b.Cells[i] = cells[i]
		b.Candidates[i] = make(map[int]bool)
		// If cell is empty, populate with all 9 candidates by default
		if cells[i] == 0 {
			for d := 1; d <= 9; d++ {
				b.Candidates[i][d] = true
			}
		}
	}
	// Override with specific candidate sets from the map
	for idx, cands := range candidateMap {
		b.Candidates[idx] = make(map[int]bool)
		for _, d := range cands {
			b.Candidates[idx][d] = true
		}
	}
	return b
}

// =============================================================================
// Naked Single Tests
// =============================================================================

func TestDetectNakedSingle(t *testing.T) {
	tests := []struct {
		name           string
		cells          [81]int
		candidates     map[int][]int
		expectFound    bool
		expectRow      int
		expectCol      int
		expectDigit    int
	}{
		{
			name:  "single candidate in first cell",
			cells: [81]int{}, // all empty
			candidates: map[int][]int{
				0: {5}, // R1C1 has only candidate 5
				1: {1, 2, 3},
				2: {4, 6, 7},
			},
			expectFound: true,
			expectRow:   0,
			expectCol:   0,
			expectDigit: 5,
		},
		{
			name:  "single candidate in middle of board",
			cells: [81]int{},
			candidates: map[int][]int{
				0:  {1, 2},
				1:  {3, 4},
				40: {9}, // R5C5 (center) has only candidate 9
			},
			expectFound: true,
			expectRow:   4,
			expectCol:   4,
			expectDigit: 9,
		},
		{
			name:  "no naked single - all cells have multiple candidates",
			cells: [81]int{},
			candidates: map[int][]int{
				0: {1, 2},
				1: {3, 4},
				2: {5, 6},
			},
			expectFound: false,
		},
		{
			name:  "filled cell is skipped",
			cells: func() [81]int {
				var c [81]int
				c[0] = 5 // cell is filled
				return c
			}(),
			candidates: map[int][]int{
				0: {5}, // Even though it has one candidate, cell is filled
				1: {1, 2},
			},
			expectFound: false,
		},
		{
			name:  "returns first naked single by index",
			cells: [81]int{},
			candidates: map[int][]int{
				5: {3}, // R1C6
				2: {7}, // R1C3 - should be found first
			},
			expectFound: true,
			expectRow:   0,
			expectCol:   2,
			expectDigit: 7,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			board := makeTestBoard(tt.cells, tt.candidates)
			move := detectNakedSingle(board)

			if tt.expectFound {
				if move == nil {
					t.Fatal("expected move but got nil")
				}
				if move.Action != "assign" {
					t.Errorf("expected action 'assign', got %q", move.Action)
				}
				if move.Digit != tt.expectDigit {
					t.Errorf("expected digit %d, got %d", tt.expectDigit, move.Digit)
				}
				if len(move.Targets) != 1 {
					t.Fatalf("expected 1 target, got %d", len(move.Targets))
				}
				if move.Targets[0].Row != tt.expectRow || move.Targets[0].Col != tt.expectCol {
					t.Errorf("expected target R%dC%d, got R%dC%d",
						tt.expectRow+1, tt.expectCol+1,
						move.Targets[0].Row+1, move.Targets[0].Col+1)
				}
			} else {
				if move != nil {
					t.Errorf("expected no move, got %+v", move)
				}
			}
		})
	}
}

// =============================================================================
// Hidden Single Tests
// =============================================================================

func TestDetectHiddenSingle(t *testing.T) {
	tests := []struct {
		name        string
		cells       [81]int
		candidates  map[int][]int
		useFullBoard bool // if true, use makeFullCandidateBoard instead of makeTestBoard
		expectFound bool
		expectRow   int
		expectCol   int
		expectDigit int
		expectUnit  string // "row", "column", or "box"
	}{
		{
			name:  "hidden single in row",
			cells: [81]int{},
			useFullBoard: true,
			candidates: map[int][]int{
				// Row 0: remove 7 from all cells except column 3
				// Start with full board, then override row 0 to have 7 only in col 3
				cellIdx(0, 0): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
				cellIdx(0, 1): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
				cellIdx(0, 2): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
				cellIdx(0, 3): {1, 2, 3, 4, 5, 6, 7, 8, 9},  // has 7 - hidden single!
				cellIdx(0, 4): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
				cellIdx(0, 5): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
				cellIdx(0, 6): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
				cellIdx(0, 7): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
				cellIdx(0, 8): {1, 2, 3, 4, 5, 6, 8, 9},     // no 7
			},
			expectFound: true,
			expectRow:   0,
			expectCol:   3,
			expectDigit: 7,
			expectUnit:  "row",
		},
		{
			name:  "hidden single in column",
			cells: [81]int{},
			useFullBoard: true,
			candidates: map[int][]int{
				// Column 0: remove 8 from all rows except row 5
				cellIdx(0, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
				cellIdx(1, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
				cellIdx(2, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
				cellIdx(3, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
				cellIdx(4, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
				cellIdx(5, 0): {1, 2, 3, 4, 5, 6, 7, 8, 9},  // has 8 - hidden single!
				cellIdx(6, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
				cellIdx(7, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
				cellIdx(8, 0): {1, 2, 3, 4, 5, 6, 7, 9},     // no 8
			},
			expectFound: true,
			expectRow:   5,
			expectCol:   0,
			expectDigit: 8,
			expectUnit:  "column",
		},
		{
			name:  "hidden single in box",
			cells: [81]int{},
			useFullBoard: true,
			candidates: map[int][]int{
				// Box 0: remove 9 from all cells except (2,2)
				cellIdx(0, 0): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(0, 1): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(0, 2): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(1, 0): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(1, 1): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(1, 2): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(2, 0): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(2, 1): {1, 2, 3, 4, 5, 6, 7, 8},     // no 9
				cellIdx(2, 2): {1, 2, 3, 4, 5, 6, 7, 8, 9},  // has 9 - hidden single!
			},
			expectFound: true,
			expectRow:   2,
			expectCol:   2,
			expectDigit: 9,
			expectUnit:  "box",
		},
		{
			name:  "no hidden single - all digits in multiple places",
			cells: [81]int{},
			useFullBoard: true,
			candidates: map[int][]int{}, // empty override = all cells have all candidates
			expectFound: false,
		},
		{
			name: "skip if digit already placed in unit",
			cells: func() [81]int {
				var c [81]int
				c[cellIdx(0, 5)] = 7 // 7 is already placed in row 0
				return c
			}(),
			useFullBoard: true,
			candidates: map[int][]int{
				// Row 0: remove 7 from all empty cells (7 is already at 0,5)
				// This should NOT be detected as hidden single since 7 is already placed
				cellIdx(0, 0): {1, 2, 3, 4, 5, 6, 8, 9},
				cellIdx(0, 1): {1, 2, 3, 4, 5, 6, 8, 9},
				cellIdx(0, 2): {1, 2, 3, 4, 5, 6, 8, 9},
				cellIdx(0, 3): {1, 2, 3, 4, 5, 6, 7, 8, 9}, // has 7 candidate
				cellIdx(0, 4): {1, 2, 3, 4, 5, 6, 8, 9},
				// cellIdx(0, 5) is filled with 7
				cellIdx(0, 6): {1, 2, 3, 4, 5, 6, 8, 9},
				cellIdx(0, 7): {1, 2, 3, 4, 5, 6, 8, 9},
				cellIdx(0, 8): {1, 2, 3, 4, 5, 6, 8, 9},
			},
			expectFound: false,
		},
		{
			name:  "skip naked single - only report if cell has multiple candidates",
			cells: [81]int{},
			candidates: map[int][]int{
				// Digit 7 appears only in one cell, but that cell has ONLY 7
				// This is a naked single, not a hidden single
				cellIdx(0, 3): {7},
			},
			expectFound: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var board *Board
			if tt.useFullBoard {
				board = makeFullCandidateBoard(tt.cells, tt.candidates)
			} else {
				board = makeTestBoard(tt.cells, tt.candidates)
			}
			move := detectHiddenSingle(board)

			if tt.expectFound {
				if move == nil {
					t.Fatal("expected move but got nil")
				}
				if move.Action != "assign" {
					t.Errorf("expected action 'assign', got %q", move.Action)
				}
				if move.Digit != tt.expectDigit {
					t.Errorf("expected digit %d, got %d", tt.expectDigit, move.Digit)
				}
				if len(move.Targets) != 1 {
					t.Fatalf("expected 1 target, got %d", len(move.Targets))
				}
				if move.Targets[0].Row != tt.expectRow || move.Targets[0].Col != tt.expectCol {
					t.Errorf("expected target R%dC%d, got R%dC%d",
						tt.expectRow+1, tt.expectCol+1,
						move.Targets[0].Row+1, move.Targets[0].Col+1)
				}
			} else {
				if move != nil {
					t.Errorf("expected no move, got: digit=%d at R%dC%d",
						move.Digit, move.Targets[0].Row+1, move.Targets[0].Col+1)
				}
			}
		})
	}
}

// =============================================================================
// Naked Pair Tests
// =============================================================================

func TestDetectNakedPair(t *testing.T) {
	tests := []struct {
		name                 string
		cells                [81]int
		candidates           map[int][]int
		expectFound          bool
		expectPairCells      []core.CellRef // the two cells forming the pair
		expectEliminatedFrom []core.CellRef // cells that should have eliminations
	}{
		{
			name:  "naked pair in row",
			cells: [81]int{},
			candidates: map[int][]int{
				// Row 0: R1C1 and R1C3 both have only {2,5}
				cellIdx(0, 0): {2, 5},    // pair cell 1
				cellIdx(0, 1): {1, 2, 5}, // should eliminate 2,5
				cellIdx(0, 2): {2, 5},    // pair cell 2
				cellIdx(0, 3): {1, 3, 5}, // should eliminate 5
				cellIdx(0, 4): {3, 4},
				cellIdx(0, 5): {6, 7},
				cellIdx(0, 6): {8, 9},
				cellIdx(0, 7): {1, 4},
				cellIdx(0, 8): {6, 7},
			},
			expectFound: true,
			expectPairCells: []core.CellRef{
				{Row: 0, Col: 0},
				{Row: 0, Col: 2},
			},
			expectEliminatedFrom: []core.CellRef{
				{Row: 0, Col: 1}, // has 2 and 5 to eliminate
				{Row: 0, Col: 3}, // has 5 to eliminate
			},
		},
		{
			name:  "naked pair in column",
			cells: [81]int{},
			candidates: map[int][]int{
				// Column 0: R1C1 and R4C1 both have only {3,7}
				cellIdx(0, 0): {3, 7},    // pair cell 1
				cellIdx(1, 0): {1, 3, 7}, // should eliminate 3,7
				cellIdx(2, 0): {2, 4},
				cellIdx(3, 0): {3, 7}, // pair cell 2
				cellIdx(4, 0): {5, 6},
				cellIdx(5, 0): {1, 7}, // should eliminate 7
				cellIdx(6, 0): {8, 9},
				cellIdx(7, 0): {2, 4},
				cellIdx(8, 0): {5, 6},
			},
			expectFound: true,
			expectPairCells: []core.CellRef{
				{Row: 0, Col: 0},
				{Row: 3, Col: 0},
			},
			expectEliminatedFrom: []core.CellRef{
				{Row: 1, Col: 0},
				{Row: 5, Col: 0},
			},
		},
		{
			name:  "naked pair in box",
			cells: [81]int{},
			candidates: map[int][]int{
				// Box 4 (center): R4C4 and R5C5 both have only {1,9}
				cellIdx(3, 3): {1, 9},    // pair cell 1
				cellIdx(3, 4): {2, 3},
				cellIdx(3, 5): {4, 5},
				cellIdx(4, 3): {1, 6, 9}, // should eliminate 1,9
				cellIdx(4, 4): {1, 9},    // pair cell 2
				cellIdx(4, 5): {7, 8},
				cellIdx(5, 3): {2, 3},
				cellIdx(5, 4): {4, 5},
				cellIdx(5, 5): {6, 9}, // should eliminate 9
			},
			expectFound: true,
			expectPairCells: []core.CellRef{
				{Row: 3, Col: 3},
				{Row: 4, Col: 4},
			},
			expectEliminatedFrom: []core.CellRef{
				{Row: 4, Col: 3},
				{Row: 5, Col: 5},
			},
		},
		{
			name:  "no naked pair - cells have different candidates",
			cells: [81]int{},
			candidates: map[int][]int{
				cellIdx(0, 0): {2, 5},
				cellIdx(0, 1): {3, 5}, // different pair
			},
			expectFound: false,
		},
		{
			name:  "naked pair exists but no eliminations possible",
			cells: [81]int{},
			candidates: map[int][]int{
				// Pair {2,5} in row 0, but no other cells have 2 or 5
				cellIdx(0, 0): {2, 5},
				cellIdx(0, 2): {2, 5},
				cellIdx(0, 1): {1, 3}, // no 2 or 5
				cellIdx(0, 3): {4, 6},
				cellIdx(0, 4): {7, 8},
				cellIdx(0, 5): {1, 9},
				cellIdx(0, 6): {3, 4},
				cellIdx(0, 7): {6, 7},
				cellIdx(0, 8): {8, 9},
			},
			expectFound: false, // no eliminations means no move returned
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			board := makeTestBoard(tt.cells, tt.candidates)
			move := detectNakedPair(board)

			if tt.expectFound {
				if move == nil {
					t.Fatal("expected move but got nil")
				}
				if move.Action != "eliminate" {
					t.Errorf("expected action 'eliminate', got %q", move.Action)
				}
				if len(move.Targets) != 2 {
					t.Errorf("expected 2 target cells (the pair), got %d", len(move.Targets))
				}
				if len(move.Eliminations) == 0 {
					t.Error("expected eliminations but got none")
				}

				// Verify eliminations are from expected cells
				eliminatedCells := make(map[core.CellRef]bool)
				for _, elim := range move.Eliminations {
					eliminatedCells[core.CellRef{Row: elim.Row, Col: elim.Col}] = true
				}
				for _, expectedCell := range tt.expectEliminatedFrom {
					if !eliminatedCells[expectedCell] {
						t.Errorf("expected elimination from R%dC%d but none found",
							expectedCell.Row+1, expectedCell.Col+1)
					}
				}
			} else {
				if move != nil {
					t.Errorf("expected no move, got: %+v", move)
				}
			}
		})
	}
}

// =============================================================================
// Hidden Pair Tests
// =============================================================================

func TestDetectHiddenPair(t *testing.T) {
	tests := []struct {
		name        string
		cells       [81]int
		candidates  map[int][]int
		expectFound bool
		expectDigits []int // the two digits forming the hidden pair
	}{
		{
			name:  "hidden pair in row",
			cells: [81]int{},
			candidates: map[int][]int{
				// Row 0: digits 3 and 8 only appear in columns 2 and 5
				cellIdx(0, 0): {1, 2},
				cellIdx(0, 1): {4, 5},
				cellIdx(0, 2): {1, 3, 6, 8}, // 3 and 8 here
				cellIdx(0, 3): {2, 4},
				cellIdx(0, 4): {5, 7},
				cellIdx(0, 5): {2, 3, 7, 8}, // 3 and 8 here too - hidden pair!
				cellIdx(0, 6): {1, 4},
				cellIdx(0, 7): {5, 6},
				cellIdx(0, 8): {7, 9},
			},
			expectFound:  true,
			expectDigits: []int{3, 8},
		},
		{
			name:  "hidden pair in column",
			cells: [81]int{},
			candidates: map[int][]int{
				// Column 0: digits 2 and 6 only appear in rows 1 and 7
				cellIdx(0, 0): {1, 3},
				cellIdx(1, 0): {2, 4, 5, 6}, // 2 and 6 here
				cellIdx(2, 0): {3, 5},
				cellIdx(3, 0): {1, 4},
				cellIdx(4, 0): {7, 8},
				cellIdx(5, 0): {3, 9},
				cellIdx(6, 0): {4, 5},
				cellIdx(7, 0): {1, 2, 6, 8}, // 2 and 6 here too - hidden pair!
				cellIdx(8, 0): {7, 9},
			},
			expectFound:  true,
			expectDigits: []int{2, 6},
		},
		{
			name:  "no hidden pair - digits in more than 2 cells",
			cells: [81]int{},
			candidates: map[int][]int{
				cellIdx(0, 0): {1, 3},
				cellIdx(0, 1): {2, 3}, // 3 here
				cellIdx(0, 2): {3, 5}, // 3 here too
				cellIdx(0, 3): {3, 6}, // 3 in 3 places - no hidden pair
			},
			expectFound: false,
		},
		{
			name:  "hidden pair exists but already naked - no eliminations",
			cells: [81]int{},
			candidates: map[int][]int{
				// Digits 3 and 8 only in two cells, but those cells only have {3,8}
				// This is already a naked pair, no other candidates to eliminate
				cellIdx(0, 0): {1, 2},
				cellIdx(0, 1): {3, 8}, // already only 3,8
				cellIdx(0, 2): {3, 8}, // already only 3,8
				cellIdx(0, 3): {4, 5},
			},
			expectFound: false, // no eliminations needed
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			board := makeTestBoard(tt.cells, tt.candidates)
			move := detectHiddenPair(board)

			if tt.expectFound {
				if move == nil {
					t.Fatal("expected move but got nil")
				}
				if move.Action != "eliminate" {
					t.Errorf("expected action 'eliminate', got %q", move.Action)
				}
				if len(move.Targets) != 2 {
					t.Errorf("expected 2 target cells, got %d", len(move.Targets))
				}
				// Verify eliminations remove candidates OTHER than the hidden pair digits
				for _, elim := range move.Eliminations {
					isHiddenDigit := false
					for _, d := range tt.expectDigits {
						if elim.Digit == d {
							isHiddenDigit = true
							break
						}
					}
					if isHiddenDigit {
						t.Errorf("should not eliminate hidden pair digit %d", elim.Digit)
					}
				}
			} else {
				if move != nil {
					t.Errorf("expected no move, got: %+v", move)
				}
			}
		})
	}
}

// =============================================================================
// Pointing Pair Tests
// =============================================================================

func TestDetectPointingPair(t *testing.T) {
	tests := []struct {
		name        string
		cells       [81]int
		candidates  map[int][]int
		expectFound bool
		expectDigit int
	}{
		{
			name:  "pointing pair in row - eliminates from rest of row",
			cells: [81]int{},
			candidates: map[int][]int{
				// Box 0: digit 5 only appears in row 0, cols 0 and 1
				cellIdx(0, 0): {1, 5},
				cellIdx(0, 1): {2, 5},
				cellIdx(0, 2): {3, 4},   // no 5
				cellIdx(1, 0): {1, 2},   // no 5 in rest of box
				cellIdx(1, 1): {3, 4},
				cellIdx(1, 2): {6, 7},
				cellIdx(2, 0): {8, 9},
				cellIdx(2, 1): {1, 2},
				cellIdx(2, 2): {3, 4},
				// Rest of row 0 outside box has 5 to eliminate
				cellIdx(0, 5): {5, 6}, // should eliminate 5
				cellIdx(0, 8): {5, 9}, // should eliminate 5
			},
			expectFound: true,
			expectDigit: 5,
		},
		{
			name:  "pointing pair in column - eliminates from rest of column",
			cells: [81]int{},
			candidates: map[int][]int{
				// Box 0: digit 7 only appears in col 0, rows 0 and 2
				cellIdx(0, 0): {1, 7},
				cellIdx(0, 1): {2, 3},   // no 7
				cellIdx(0, 2): {4, 5},
				cellIdx(1, 0): {1, 2},   // no 7
				cellIdx(1, 1): {3, 4},
				cellIdx(1, 2): {5, 6},
				cellIdx(2, 0): {7, 8},
				cellIdx(2, 1): {1, 2},
				cellIdx(2, 2): {3, 4},
				// Rest of col 0 outside box has 7 to eliminate
				cellIdx(5, 0): {6, 7}, // should eliminate 7
				cellIdx(8, 0): {7, 9}, // should eliminate 7
			},
			expectFound: true,
			expectDigit: 7,
		},
		{
			name:  "no pointing pair - digit in multiple rows/cols in box",
			cells: [81]int{},
			candidates: map[int][]int{
				cellIdx(0, 0): {1, 5},
				cellIdx(0, 1): {2, 5},
				cellIdx(1, 0): {3, 5}, // 5 is in multiple rows - no pointing pair
			},
			expectFound: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			board := makeTestBoard(tt.cells, tt.candidates)
			move := detectPointingPair(board)

			if tt.expectFound {
				if move == nil {
					t.Fatal("expected move but got nil")
				}
				if move.Action != "eliminate" {
					t.Errorf("expected action 'eliminate', got %q", move.Action)
				}
				if move.Digit != tt.expectDigit {
					t.Errorf("expected digit %d, got %d", tt.expectDigit, move.Digit)
				}
			} else {
				if move != nil {
					t.Errorf("expected no move, got: digit=%d", move.Digit)
				}
			}
		})
	}
}

// =============================================================================
// Box-Line Reduction Tests
// =============================================================================

func TestDetectBoxLineReduction(t *testing.T) {
	tests := []struct {
		name        string
		cells       [81]int
		candidates  map[int][]int
		expectFound bool
		expectDigit int
	}{
		{
			name:  "box-line reduction in row - eliminates from rest of box",
			cells: [81]int{},
			candidates: map[int][]int{
				// Row 0: digit 4 only appears in cols 0,1,2 (box 0)
				cellIdx(0, 0): {1, 4},
				cellIdx(0, 1): {2, 4},
				cellIdx(0, 2): {3, 4},
				cellIdx(0, 3): {5, 6}, // no 4 in rest of row
				cellIdx(0, 4): {7, 8},
				cellIdx(0, 5): {1, 9},
				cellIdx(0, 6): {2, 3},
				cellIdx(0, 7): {5, 6},
				cellIdx(0, 8): {7, 8},
				// Rest of box 0 has 4 to eliminate
				cellIdx(1, 1): {4, 5}, // should eliminate 4
				cellIdx(2, 2): {4, 9}, // should eliminate 4
			},
			expectFound: true,
			expectDigit: 4,
		},
		{
			name:  "box-line reduction in column - eliminates from rest of box",
			cells: [81]int{},
			candidates: map[int][]int{
				// Col 0: digit 6 only appears in rows 0,1,2 (box 0)
				cellIdx(0, 0): {1, 6},
				cellIdx(1, 0): {2, 6},
				cellIdx(2, 0): {3, 6},
				cellIdx(3, 0): {4, 5}, // no 6 in rest of col
				cellIdx(4, 0): {7, 8},
				cellIdx(5, 0): {1, 9},
				cellIdx(6, 0): {2, 3},
				cellIdx(7, 0): {4, 5},
				cellIdx(8, 0): {7, 8},
				// Rest of box 0 has 6 to eliminate
				cellIdx(1, 1): {5, 6}, // should eliminate 6
				cellIdx(2, 2): {6, 9}, // should eliminate 6
			},
			expectFound: true,
			expectDigit: 6,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			board := makeTestBoard(tt.cells, tt.candidates)
			move := detectBoxLineReduction(board)

			if tt.expectFound {
				if move == nil {
					t.Fatal("expected move but got nil")
				}
				if move.Action != "eliminate" {
					t.Errorf("expected action 'eliminate', got %q", move.Action)
				}
				if move.Digit != tt.expectDigit {
					t.Errorf("expected digit %d, got %d", tt.expectDigit, move.Digit)
				}
				if len(move.Eliminations) == 0 {
					t.Error("expected eliminations but got none")
				}
			} else {
				if move != nil {
					t.Errorf("expected no move, got: digit=%d", move.Digit)
				}
			}
		})
	}
}
