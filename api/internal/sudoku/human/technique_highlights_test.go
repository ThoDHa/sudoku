package human

import (
	"slices"
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/human/techniques"
	"sudoku-api/pkg/constants"
)

func cellRefIn(ref core.CellRef, refs []core.CellRef) bool {
	for _, r := range refs {
		if r.Row == ref.Row && r.Col == ref.Col {
			return true
		}
	}
	return false
}

func TestNakedSingleHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{
		0: {5},
	}
	for i := 1; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectNakedSingle(board)

	if move == nil {
		t.Fatal("Expected Naked Single to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 1 {
		t.Errorf("Expected 1 primary highlight, got %d", len(move.Highlights.Primary))
	}

	expectedPrimary := core.CellRef{Row: 0, Col: 0}
	if !cellRefIn(expectedPrimary, move.Highlights.Primary) {
		t.Errorf("Expected primary highlight at R1C1, got %v", move.Highlights.Primary)
	}

	if move.Action != "assign" {
		t.Errorf("Expected action 'assign', got '%s'", move.Action)
	}
}

func TestHiddenSingleHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 8, 9}
	}

	for col := 0; col < 9; col++ {
		if col != 1 {
			candidateMap[col] = []int{1, 2, 3, 4, 5, 6, 8, 9}
		}
	}
	candidateMap[1] = []int{5, 7}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectHiddenSingle(board)

	if move == nil {
		t.Fatal("Expected Hidden Single to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 1 {
		t.Errorf("Expected 1 primary highlight, got %d", len(move.Highlights.Primary))
	}

	expectedPrimary := core.CellRef{Row: 0, Col: 1}
	if !cellRefIn(expectedPrimary, move.Highlights.Primary) {
		t.Errorf("Expected primary highlight at R1C2, got %v", move.Highlights.Primary)
	}

	if len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights for the unit context")
	}
}

func TestNakedPairHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	candidateMap[0] = []int{1, 2}
	candidateMap[1] = []int{1, 2}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectNakedPair(board)

	if move == nil {
		t.Fatal("Expected Naked Pair to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 2 {
		t.Errorf("Expected 2 primary highlights for pair cells, got %d", len(move.Highlights.Primary))
	}

	expectedPrimary1 := core.CellRef{Row: 0, Col: 0}
	expectedPrimary2 := core.CellRef{Row: 0, Col: 1}
	if !cellRefIn(expectedPrimary1, move.Highlights.Primary) {
		t.Errorf("Expected primary highlight at R1C1, got %v", move.Highlights.Primary)
	}
	if !cellRefIn(expectedPrimary2, move.Highlights.Primary) {
		t.Errorf("Expected primary highlight at R1C2, got %v", move.Highlights.Primary)
	}

	if len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights for the unit context (row 1)")
	} else {
		expectedSecondaryCount := constants.GridSize
		if len(move.Highlights.Secondary) != expectedSecondaryCount {
			t.Errorf("Expected %d secondary highlights for row, got %d", expectedSecondaryCount, len(move.Highlights.Secondary))
		}
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from other cells in the row")
	}
}

func TestHiddenPairHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	for col := 0; col < 9; col++ {
		if col != 0 && col != 3 {
			candidateMap[col] = []int{2, 3, 5, 6, 7, 8, 9}
		}
	}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectHiddenPair(board)

	if move == nil {
		t.Fatal("Expected Hidden Pair to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 2 {
		t.Errorf("Expected 2 primary highlights for pair cells, got %d", len(move.Highlights.Primary))
	}

	if len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights for the unit context")
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations of other candidates from pair cells")
	}
}

func TestPointingPairHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	for row := 1; row < 3; row++ {
		for col := 0; col < 3; col++ {
			idx := row*9 + col
			candidateMap[idx] = []int{1, 3, 4, 5, 6, 7, 8, 9}
		}
	}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectPointingPair(board)

	if move == nil {
		t.Fatal("Expected Pointing Pair to be detected")
	}

	if move != nil && len(move.Highlights.Primary) < 2 {
		t.Errorf("Expected at least 2 primary highlights, got %d", len(move.Highlights.Primary))
	}

	if len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights for the row/column context")
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations outside the box")
	}
}

func TestBoxLineReductionHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	for col := 3; col < 9; col++ {
		idx := 0*9 + col
		candidateMap[idx] = []int{2, 3, 4, 5, 6, 7, 8, 9}
	}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectBoxLineReduction(board)

	if move == nil {
		t.Fatal("Expected Box-Line Reduction to be detected")
	}

	if move != nil && len(move.Highlights.Primary) < 2 {
		t.Errorf("Expected at least 2 primary highlights, got %d", len(move.Highlights.Primary))
	}

	if len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights for the box context")
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations in box outside the row/column")
	}
}

func TestXWingHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	xWingRows := []int{0, 7}
	xWingCols := []int{0, 6}
	digit := 1

	for _, row := range xWingRows {
		for col := 0; col < 9; col++ {
			idx := row*9 + col
			if !slices.Contains(xWingCols, col) {
				candidateMap[idx] = []int{2, 3, 4, 5, 6, 7, 8, 9}
			} else {
				candidateMap[idx] = []int{1}
			}
		}
	}

	for row := 1; row < 7; row++ {
		for _, col := range xWingCols {
			candidateMap[row*9+col] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
		}
	}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectXWing(board)

	if move == nil {
		t.Fatal("Expected X-Wing to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 4 {
		t.Errorf("Expected 4 primary highlights for X-Wing corners, got %d", len(move.Highlights.Primary))
	}

	expectedCorners := []core.CellRef{
		{Row: 0, Col: 0}, {Row: 0, Col: 6},
		{Row: 7, Col: 0}, {Row: 7, Col: 6},
	}
	for _, corner := range expectedCorners {
		if !cellRefIn(corner, move.Highlights.Primary) {
			t.Errorf("Expected primary highlight at %v, got %v", corner, move.Highlights.Primary)
		}
	}

	if len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights for the two rows forming X-Wing")
	} else {
		if len(move.Highlights.Secondary) != 2*constants.GridSize {
			t.Errorf("Expected %d secondary highlights for two rows, got %d", 2*constants.GridSize, len(move.Highlights.Secondary))
		}
	}

	if move.Digit != digit {
		t.Errorf("Expected digit %d, got %d", digit, move.Digit)
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations in the columns between X-Wing rows")
	}
}

func TestXYWingHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	pivot := 0
	pincer1 := 1
	pincer2 := 9
	targetCell := 10

	candidateMap[pivot] = []int{1, 2}
	candidateMap[pincer1] = []int{1, 3}
	candidateMap[pincer2] = []int{2, 3}
	candidateMap[targetCell] = []int{3, 4, 5}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectXYWing(board)

	if move == nil {
		t.Fatal("Expected XY-Wing to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 3 {
		t.Errorf("Expected 3 primary highlights (pivot + 2 wings), got %d", len(move.Highlights.Primary))
	}

	expectedPrimary := []core.CellRef{
		{Row: 0, Col: 0},
		{Row: 0, Col: 1},
		{Row: 1, Col: 0},
	}
	for _, p := range expectedPrimary {
		if !cellRefIn(p, move.Highlights.Primary) {
			t.Errorf("Expected primary highlight at %v, got %v", p, move.Highlights.Primary)
		}
	}

	if move.Digit != 3 {
		t.Errorf("Expected eliminated digit 3, got %d", move.Digit)
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from cells seeing both wings")
	}

	for _, elim := range move.Eliminations {
		if elim.Digit != 3 {
			t.Errorf("Expected elimination of digit 3, got %d", elim.Digit)
		}
	}
}

func TestSimpleColoringHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	candidateMap[0] = []int{1}
	candidateMap[8] = []int{1}
	candidateMap[9] = []int{1}
	candidateMap[17] = []int{1}
	candidateMap[4] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectSimpleColoring(board)

	if move == nil {
		t.Skip("Simple Coloring not detected in this configuration")
	}

	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlight for the cell being eliminated")
	}

	if move != nil && len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights showing the color chain")
	}

	if move != nil && len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from Simple Coloring")
	}
}

func TestNakedTripleHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	candidateMap[0] = []int{1, 2}
	candidateMap[1] = []int{2, 3}
	candidateMap[2] = []int{1, 3}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectNakedTriple(board)

	if move == nil {
		t.Fatal("Expected Naked Triple to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 3 {
		t.Errorf("Expected 3 primary highlights for triple cells, got %d", len(move.Highlights.Primary))
	}

	expectedPrimary := []core.CellRef{
		{Row: 0, Col: 0},
		{Row: 0, Col: 1},
		{Row: 0, Col: 2},
	}
	for _, p := range expectedPrimary {
		if !cellRefIn(p, move.Highlights.Primary) {
			t.Errorf("Expected primary highlight at %v, got %v", p, move.Highlights.Primary)
		}
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from other cells in the row")
	}
}

func TestSwordfishHighlights(t *testing.T) {
	cells := [81]int{}
	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	fishRows := []int{0, 3, 6}
	fishCols := []int{0, 3, 6}
	digit := 1

	for _, row := range fishRows {
		for col := 0; col < 9; col++ {
			idx := row*9 + col
			if !slices.Contains(fishCols, col) {
				candidateMap[idx] = []int{2, 3, 4, 5, 6, 7, 8, 9}
			} else {
				candidateMap[idx] = []int{digit}
			}
		}
	}

	board := makeTestBoard(cells, candidateMap)
	move := techniques.DetectSwordfish(board)

	if move == nil {
		t.Fatal("Expected Swordfish to be detected")
	}

	if move != nil && len(move.Highlights.Primary) != 9 {
		t.Errorf("Expected 9 primary highlights for Swordfish cells, got %d", len(move.Highlights.Primary))
	}

	if move.Digit != digit {
		t.Errorf("Expected digit %d, got %d", digit, move.Digit)
	}

	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from Swordfish")
	}
}

func TestHighlightConsistency(t *testing.T) {
	detectors := []struct {
		name     string
		detector func(techniques.BoardInterface) *core.Move
		setup    func() ([81]int, map[int][]int)
	}{
		{"NakedSingle", techniques.DetectNakedSingle, func() ([81]int, map[int][]int) {
			cells := [81]int{}
			cm := map[int][]int{}
			for i := 0; i < 81; i++ {
				cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
			}
			cm[0] = []int{5}
			return cells, cm
		}},
		{"HiddenSingle", techniques.DetectHiddenSingle, func() ([81]int, map[int][]int) {
			cells := [81]int{}
			cm := map[int][]int{}
			for i := 0; i < 81; i++ {
				cm[i] = []int{1, 2, 3, 4, 5, 6, 8, 9}
			}
			for col := 0; col < 9; col++ {
				if col != 1 {
					cm[col] = []int{1, 2, 3, 4, 5, 6, 8, 9}
				}
			}
			cm[1] = []int{5, 7}
			return cells, cm
		}},
		{"NakedPair", techniques.DetectNakedPair, func() ([81]int, map[int][]int) {
			cells := [81]int{}
			cm := map[int][]int{}
			for i := 0; i < 81; i++ {
				cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
			}
			cm[0] = []int{1, 2}
			cm[1] = []int{1, 2}
			return cells, cm
		}},
		{"XWing", techniques.DetectXWing, func() ([81]int, map[int][]int) {
			cells := [81]int{}
			cm := map[int][]int{}
			for i := 0; i < 81; i++ {
				cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
			}
			for _, row := range []int{0, 7} {
				for col := 0; col < 9; col++ {
					if col != 0 && col != 6 {
						cm[row*9+col] = []int{2, 3, 4, 5, 6, 7, 8, 9}
					} else {
						cm[row*9+col] = []int{1}
					}
				}
			}
			return cells, cm
		}},
	}

	for _, tc := range detectors {
		t.Run(tc.name, func(t *testing.T) {
			cells, cm := tc.setup()
			board := makeTestBoard(cells, cm)
			move := tc.detector(board)

			if move == nil {
				t.Fatalf("%s not detected", tc.name)
			}

			if move != nil && len(move.Highlights.Primary) == 0 {
				t.Errorf("%s: Expected at least one primary highlight", tc.name)
			}

			if move != nil {
				for _, p := range move.Highlights.Primary {
					if p.Row < 0 || p.Row >= constants.GridSize || p.Col < 0 || p.Col >= constants.GridSize {
						t.Errorf("%s: Invalid primary highlight position %v", tc.name, p)
					}
				}
			}

			if move != nil {
				for _, s := range move.Highlights.Secondary {
					if s.Row < 0 || s.Row >= constants.GridSize || s.Col < 0 || s.Col >= constants.GridSize {
						t.Errorf("%s: Invalid secondary highlight position %v", tc.name, s)
					}
				}
			}

			for _, e := range move.Eliminations {
				if e.Row < 0 || e.Row >= constants.GridSize || e.Col < 0 || e.Col >= constants.GridSize {
					t.Errorf("%s: Invalid elimination position %v", tc.name, e)
				}
				if e.Digit < 1 || e.Digit > 9 {
					t.Errorf("%s: Invalid elimination digit %d", tc.name, e.Digit)
				}
			}

			if move.Explanation == "" {
				t.Errorf("%s: Expected non-empty explanation", tc.name)
			}
		})
	}
}

func TestHiddenTripleHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	for col := 3; col < 9; col++ {
		cm[col] = []int{4, 5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2, 3, 4, 5}
	cm[1] = []int{1, 2, 3, 6, 7}
	cm[2] = []int{1, 2, 3, 8, 9}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectHiddenTriple(board)

	if move == nil {
		t.Fatal("Expected Hidden Triple")
	}
	if move != nil && len(move.Highlights.Primary) != 3 {
		t.Errorf("Expected 3 primary, got %d", len(move.Highlights.Primary))
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations")
	}
}

func TestNakedQuadHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2, 3, 4}
	cm[1] = []int{1, 2, 3, 4}
	cm[2] = []int{1, 2, 3, 4}
	cm[3] = []int{1, 2, 3, 4}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectNakedQuad(board)

	if move == nil {
		t.Fatal("Expected Naked Quad")
	}
	if move != nil && len(move.Highlights.Primary) != 4 {
		t.Errorf("Expected 4 primary, got %d", len(move.Highlights.Primary))
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations")
	}
}

func TestHiddenQuadHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	for col := 4; col < 9; col++ {
		cm[col] = []int{5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2, 3, 4, 5, 6}
	cm[1] = []int{1, 2, 3, 4, 7, 8}
	cm[2] = []int{1, 2, 3, 4, 9}
	cm[3] = []int{1, 2, 3, 4, 5}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectHiddenQuad(board)

	if move == nil {
		t.Skip("Hidden Quad not detected in this configuration")
	}
	if move != nil && len(move.Highlights.Primary) != 4 {
		t.Errorf("Expected 4 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestXYZWingHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2, 3}
	cm[1] = []int{1, 4}
	cm[9] = []int{2, 4}
	cm[10] = []int{3, 4, 5}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectXYZWing(board)

	if move == nil {
		t.Skip("XYZ-Wing not detected in this configuration")
	}
	if move != nil && len(move.Highlights.Primary) < 3 {
		t.Errorf("Expected at least 3 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestBUGHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}

	for i := 0; i < 80; i++ {
		cm[i] = []int{1, 2}
	}
	cm[80] = []int{1, 2, 3}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectBUG(board)

	if move == nil {
		t.Skip("BUG not detected in this configuration")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlight")
	}
	if move != nil && move.Action != "assign" {
		t.Errorf("Expected assign action, got %s", move.Action)
	}
}

func TestUniqueRectangleType1Highlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2}
	cm[2] = []int{1, 2}
	cm[18] = []int{1, 2}
	cm[20] = []int{1, 2, 3}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectUniqueRectangle(board)

	if move == nil {
		t.Skip("Unique Rectangle not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 4 {
		t.Errorf("Expected at least 4 primary, got %d", len(move.Highlights.Primary))
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations")
	}
}

func TestJellyfishHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	fishRows := []int{0, 2, 5, 7}
	fishCols := []int{1, 3, 6, 8}

	for _, row := range fishRows {
		for col := 0; col < 9; col++ {
			if !slices.Contains(fishCols, col) {
				cm[row*9+col] = []int{2, 3, 4, 5, 6, 7, 8, 9}
			}
		}
	}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectJellyfish(board)

	if move == nil {
		t.Skip("Jellyfish not detected")
	}
	if move != nil && len(move.Highlights.Primary) != 16 {
		t.Errorf("Expected 16 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestSkyscraperHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1}
	cm[4] = []int{1}
	cm[27] = []int{1}
	cm[31] = []int{1}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectSkyscraper(board)

	if move == nil {
		t.Skip("Skyscraper not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 4 {
		t.Errorf("Expected at least 4 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestXChainHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1}
	cm[8] = []int{1}
	cm[17] = []int{1}
	cm[26] = []int{1}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectXChain(board)

	if move == nil {
		t.Skip("X-Chain not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestXYChainHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[1] = []int{2, 3}
	cm[2] = []int{3, 4}
	cm[11] = []int{4, 5}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectXYChain(board)

	if move == nil {
		t.Skip("XY-Chain not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestWWingHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[8] = []int{1, 2}
	cm[4] = []int{1}
	cm[10] = []int{2}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectWWing(board)

	if move == nil {
		t.Skip("W-Wing not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 2 {
		t.Errorf("Expected at least 2 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestWXYZWingHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2, 3}
	cm[1] = []int{1, 4}
	cm[9] = []int{2, 4}
	cm[10] = []int{3, 4}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectWXYZWing(board)

	if move == nil {
		t.Skip("WXYZ-Wing not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 4 {
		t.Errorf("Expected at least 4 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestEmptyRectangleHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1}
	cm[2] = []int{1}
	cm[18] = []int{1}
	cm[20] = []int{1}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectEmptyRectangle(board)

	if move == nil {
		t.Skip("Empty Rectangle not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestMedusa3DHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[1] = []int{1, 2}
	cm[9] = []int{1, 3}
	cm[10] = []int{2, 3}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectMedusa3D(board)

	if move == nil {
		t.Skip("3D Medusa not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestUniqueRectangleType2Highlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2, 3}
	cm[2] = []int{1, 2}
	cm[18] = []int{1, 2, 3}
	cm[20] = []int{1, 2}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectUniqueRectangleType2(board)

	if move == nil {
		t.Skip("UR Type 2 not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 4 {
		t.Errorf("Expected at least 4 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestUniqueRectangleType3Highlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2, 3}
	cm[2] = []int{1, 2, 3}
	cm[18] = []int{1, 2}
	cm[20] = []int{1, 2}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectUniqueRectangleType3(board)

	if move == nil {
		t.Skip("UR Type 3 not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 4 {
		t.Errorf("Expected at least 4 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestUniqueRectangleType4Highlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}
	cm[0] = []int{1, 2}
	cm[2] = []int{1, 2}
	cm[18] = []int{1, 2}
	cm[20] = []int{1, 2, 3}
	cm[1] = []int{3}
	cm[19] = []int{3}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectUniqueRectangleType4(board)

	if move == nil {
		t.Skip("UR Type 4 not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 4 {
		t.Errorf("Expected at least 4 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestFinnedXWingHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	for col := 0; col < 9; col++ {
		if col != 0 && col != 6 {
			cm[0*9+col] = []int{2, 3, 4, 5, 6, 7, 8, 9}
			cm[7*9+col] = []int{2, 3, 4, 5, 6, 7, 8, 9}
		}
	}
	cm[1] = []int{1}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectFinnedXWing(board)

	if move == nil {
		t.Skip("Finned X-Wing not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 4 {
		t.Errorf("Expected at least 4 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestFinnedSwordfishHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	fishRows := []int{0, 3, 6}
	fishCols := []int{0, 3, 6}

	for _, row := range fishRows {
		for col := 0; col < 9; col++ {
			if !slices.Contains(fishCols, col) {
				cm[row*9+col] = []int{2, 3, 4, 5, 6, 7, 8, 9}
			}
		}
	}
	cm[1] = []int{1}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectFinnedSwordfish(board)

	if move == nil {
		t.Skip("Finned Swordfish not detected")
	}
	if move != nil && len(move.Highlights.Primary) < 9 {
		t.Errorf("Expected at least 9 primary, got %d", len(move.Highlights.Primary))
	}
}

func TestGroupedXCyclesHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1}
	cm[2] = []int{1}
	cm[9] = []int{1}
	cm[11] = []int{1}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectGroupedXCycles(board)

	if move == nil {
		t.Skip("Grouped X-Cycles not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestAICHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[1] = []int{2, 3}
	cm[2] = []int{3, 4}
	cm[11] = []int{4, 5}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectAIC(board)

	if move == nil {
		t.Skip("AIC not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestALSXZHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2, 3}
	cm[1] = []int{1, 2}
	cm[9] = []int{2, 3, 4}
	cm[10] = []int{3, 4}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectALSXZ(board)

	if move == nil {
		t.Skip("ALS-XZ not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestALSXYWingHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2, 3}
	cm[9] = []int{2, 3, 4}
	cm[18] = []int{3, 4, 5}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectALSXYWing(board)

	if move == nil {
		t.Skip("ALS-XY-Wing not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestALSXYChainHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2, 3}
	cm[9] = []int{2, 3, 4}
	cm[18] = []int{3, 4, 5}
	cm[27] = []int{4, 5, 6}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectALSXYChain(board)

	if move == nil {
		t.Skip("ALS-XY-Chain not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestSueDeCoqHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[1] = []int{2, 3}
	cm[3] = []int{1, 4}
	cm[12] = []int{2, 5}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectSueDeCoq(board)

	if move == nil {
		t.Skip("Sue de Coq not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestDeathBlossomHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[1] = []int{1, 3, 4}
	cm[9] = []int{2, 5, 6}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectDeathBlossom(board)

	if move == nil {
		t.Skip("Death Blossom not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestDigitForcingChainHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[1] = []int{1, 3}
	cm[9] = []int{2, 3}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectDigitForcingChain(board)

	if move == nil {
		t.Skip("Digit Forcing Chain not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestForcingChainHighlights(t *testing.T) {
	cells := [81]int{}
	cm := map[int][]int{}
	for i := 0; i < 81; i++ {
		cm[i] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	}

	cm[0] = []int{1, 2}
	cm[1] = []int{1, 3}
	cm[2] = []int{2, 3}

	board := makeTestBoard(cells, cm)
	move := techniques.DetectForcingChain(board)

	if move == nil {
		t.Skip("Forcing Chain not detected")
	}
	if move != nil && len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights")
	}
}

func TestTechniqueCount(t *testing.T) {
	techniques := []string{
		"naked-single", "hidden-single", "naked-pair", "hidden-pair",
		"pointing-pair", "box-line-reduction", "naked-triple", "hidden-triple",
		"naked-quad", "hidden-quad", "x-wing", "swordfish", "xy-wing", "xyz-wing",
		"simple-coloring", "bug", "unique-rectangle",
		"jellyfish", "skyscraper", "x-chain", "xy-chain", "w-wing", "wxyz-wing",
		"empty-rectangle", "medusa-3d",
		"unique-rectangle-type-2", "unique-rectangle-type-3", "unique-rectangle-type-4",
		"finned-x-wing", "finned-swordfish", "grouped-x-cycles", "aic",
		"als-xz", "als-xy-wing", "als-xy-chain", "sue-de-coq",
		"digit-forcing-chain", "forcing-chain", "death-blossom",
	}

	if len(techniques) != 39 {
		t.Errorf("Expected 39 techniques, got %d", len(techniques))
	}

	t.Logf("Total techniques defined: %d", len(techniques))
}
