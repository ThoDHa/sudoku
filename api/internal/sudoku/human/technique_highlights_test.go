package human

import (
	"slices"
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/human/techniques"
	"sudoku-api/internal/sudoku/human/techniquetest"
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

// detectCuratedTechniqueMove loads the curated puzzle registered for the given
// technique slug and returns the move the technique's detector produces.
//
// It first asks the detector directly on the initial board (the fast path used
// by partial-solve-state fixtures that fire immediately). When that yields no
// move, it steps the solver until the target technique fires, disabling the
// preempting techniques listed in techniqueIsolationConfig so advanced
// detectors are not crowded out. This mirrors the proven pattern in
// technique_isolated_test.go and the TestDiagnosticTechniqueUsage run.
//
// A nil return means the detector did not fire on a known-good curated board,
// which is treated as a real failure by the caller (never silently skipped).
func detectCuratedTechniqueMove(t *testing.T, slug string) *core.Move {
	t.Helper()

	data, ok := techniquetest.Get(slug)
	if !ok {
		t.Fatalf("no curated puzzle registered for technique %q", slug)
	}

	givens, _ := loadTestPuzzle(t, data)
	board := NewBoard(givens)

	if move := DetectTechniqueDirect(board, slug); move != nil {
		// The bare detector does not stamp Technique (the solver does that in
		// FindNextMove). Since we invoked this slug's detector directly, the move
		// is unambiguously this technique's output.
		move.Technique = slug
		return move
	}

	solver := NewSolver()
	if disabled, has := techniqueIsolationConfig[slug]; has && len(disabled) > 0 {
		solver = CreateSolverWithDisabledTechniques(disabled)
	}

	for step := 0; step < constants.MaxSolverSteps; step++ {
		move := solver.FindNextMove(board)
		if move == nil {
			break
		}
		solver.ApplyMove(board, move)
		if move.Technique == slug {
			return move
		}
		if board.IsSolved() {
			break
		}
	}

	return nil
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

	if len(move.Highlights.Primary) != 1 {
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

	if len(move.Highlights.Primary) != 1 {
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

	if len(move.Highlights.Primary) != 2 {
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

	if len(move.Highlights.Primary) != 2 {
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

	if len(move.Highlights.Primary) < 2 {
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

	if len(move.Highlights.Primary) < 2 {
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

	if len(move.Highlights.Primary) != 4 {
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

	if len(move.Highlights.Primary) != 3 {
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
	move := detectCuratedTechniqueMove(t, "simple-coloring")
	if move == nil {
		t.Fatal("Expected simple-coloring to fire on its curated board")
	}
	if move.Technique != "simple-coloring" {
		t.Fatalf("Expected technique simple-coloring, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlight for the cell being eliminated")
	}
	if len(move.Highlights.Secondary) == 0 {
		t.Error("Expected secondary highlights showing the color chain")
	}
	if len(move.Eliminations) == 0 {
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

	if len(move.Highlights.Primary) != 3 {
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

	if len(move.Highlights.Primary) != 9 {
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

			if len(move.Highlights.Primary) == 0 {
				t.Errorf("%s: Expected at least one primary highlight", tc.name)
			}

			for _, p := range move.Highlights.Primary {
				if p.Row < 0 || p.Row >= constants.GridSize || p.Col < 0 || p.Col >= constants.GridSize {
					t.Errorf("%s: Invalid primary highlight position %v", tc.name, p)
				}
			}

			for _, s := range move.Highlights.Secondary {
				if s.Row < 0 || s.Row >= constants.GridSize || s.Col < 0 || s.Col >= constants.GridSize {
					t.Errorf("%s: Invalid secondary highlight position %v", tc.name, s)
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
	if len(move.Highlights.Primary) != 3 {
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
	if len(move.Highlights.Primary) != 4 {
		t.Errorf("Expected 4 primary, got %d", len(move.Highlights.Primary))
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations")
	}
}

func TestHiddenQuadHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "hidden-quad")
	if move == nil {
		t.Fatal("Expected hidden-quad to fire on its curated board")
	}
	if move.Technique != "hidden-quad" {
		t.Fatalf("Expected technique hidden-quad, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the hidden quad cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations of other candidates from the hidden quad cells")
	}
}

func TestXYZWingHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "xyz-wing")
	if move == nil {
		t.Fatal("Expected xyz-wing to fire on its curated board")
	}
	if move.Technique != "xyz-wing" {
		t.Fatalf("Expected technique xyz-wing, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the XYZ-Wing cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from cells seeing the XYZ-Wing")
	}
}

func TestBUGHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "bug")
	if move == nil {
		t.Fatal("Expected bug to fire on its curated board")
	}
	if move.Technique != "bug" {
		t.Fatalf("Expected technique bug, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlight for the BUG pivot cell")
	}
}

func TestUniqueRectangleType1Highlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "unique-rectangle")
	if move == nil {
		t.Fatal("Expected unique-rectangle to fire on its curated board")
	}
	if move.Technique != "unique-rectangle" {
		t.Fatalf("Expected technique unique-rectangle, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the unique rectangle cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations of the extra candidate breaking the deadly pattern")
	}
}

func TestJellyfishHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "jellyfish")
	if move == nil {
		t.Fatal("Expected jellyfish to fire on its curated board")
	}
	if move.Technique != "jellyfish" {
		t.Fatalf("Expected technique jellyfish, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Jellyfish base cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from cells outside the Jellyfish cover sets")
	}
}

func TestSkyscraperHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "skyscraper")
	if move == nil {
		t.Fatal("Expected skyscraper to fire on its curated board")
	}
	if move.Technique != "skyscraper" {
		t.Fatalf("Expected technique skyscraper, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Skyscraper bases")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from cells seeing both Skyscraper tips")
	}
}

func TestXChainHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "x-chain")
	if move == nil {
		t.Fatal("Expected x-chain to fire on its curated board")
	}
	if move.Technique != "x-chain" {
		t.Fatalf("Expected technique x-chain, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the X-Chain links")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the X-Chain contradiction")
	}
}

func TestXYChainHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "xy-chain")
	if move == nil {
		t.Fatal("Expected xy-chain to fire on its curated board")
	}
	if move.Technique != "xy-chain" {
		t.Fatalf("Expected technique xy-chain, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the XY-Chain links")
	}
}

func TestWWingHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "w-wing")
	if move == nil {
		t.Fatal("Expected w-wing to fire on its curated board")
	}
	if move.Technique != "w-wing" {
		t.Fatalf("Expected technique w-wing, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the W-Wing cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from cells seeing both W-Wing ends")
	}
}

func TestWXYZWingHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "wxyz-wing")
	if move == nil {
		t.Fatal("Expected wxyz-wing to fire on its curated board")
	}
	if move.Technique != "wxyz-wing" {
		t.Fatalf("Expected technique wxyz-wing, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the WXYZ-Wing cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the WXYZ-Wing")
	}
}

func TestEmptyRectangleHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "empty-rectangle")
	if move == nil {
		t.Fatal("Expected empty-rectangle to fire on its curated board")
	}
	if move.Technique != "empty-rectangle" {
		t.Fatalf("Expected technique empty-rectangle, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Empty Rectangle")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the Empty Rectangle deduction")
	}
}

func TestMedusa3DHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "medusa-3d")
	if move == nil {
		t.Fatal("Expected medusa-3d to fire on its curated board")
	}
	if move.Technique != "medusa-3d" {
		t.Fatalf("Expected technique medusa-3d, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the 3D Medusa coloring")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the 3D Medusa contradiction")
	}
}

func TestUniqueRectangleType2Highlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "unique-rectangle-type-2")
	if move == nil {
		t.Fatal("Expected unique-rectangle-type-2 to fire on its curated board")
	}
	if move.Technique != "unique-rectangle-type-2" {
		t.Fatalf("Expected technique unique-rectangle-type-2, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Unique Rectangle Type 2 cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations of the roof extra candidate")
	}
}

func TestUniqueRectangleType3Highlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "unique-rectangle-type-3")
	if move == nil {
		t.Fatal("Expected unique-rectangle-type-3 to fire on its curated board")
	}
	if move.Technique != "unique-rectangle-type-3" {
		t.Fatalf("Expected technique unique-rectangle-type-3, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Unique Rectangle Type 3 cells")
	}
}

func TestUniqueRectangleType4Highlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "unique-rectangle-type-4")
	if move == nil {
		t.Fatal("Expected unique-rectangle-type-4 to fire on its curated board")
	}
	if move.Technique != "unique-rectangle-type-4" {
		t.Fatalf("Expected technique unique-rectangle-type-4, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Unique Rectangle Type 4 cells")
	}
}

func TestFinnedXWingHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "finned-x-wing")
	if move == nil {
		t.Fatal("Expected finned-x-wing to fire on its curated board")
	}
	if move.Technique != "finned-x-wing" {
		t.Fatalf("Expected technique finned-x-wing, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Finned X-Wing cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the Finned X-Wing")
	}
}

func TestFinnedSwordfishHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "finned-swordfish")
	if move == nil {
		t.Fatal("Expected finned-swordfish to fire on its curated board")
	}
	if move.Technique != "finned-swordfish" {
		t.Fatalf("Expected technique finned-swordfish, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Finned Swordfish cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the Finned Swordfish")
	}
}

func TestGroupedXCyclesHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "grouped-x-cycles")
	if move == nil {
		t.Fatal("Expected grouped-x-cycles to fire on its curated board")
	}
	if move.Technique != "grouped-x-cycles" {
		t.Fatalf("Expected technique grouped-x-cycles, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Grouped X-Cycle links")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the Grouped X-Cycle contradiction")
	}
}

func TestAICHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "aic")
	if move == nil {
		t.Fatal("Expected aic to fire on its curated board")
	}
	if move.Technique != "aic" {
		t.Fatalf("Expected technique aic, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the AIC nodes")
	}
}

func TestALSXZHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "als-xz")
	if move == nil {
		t.Fatal("Expected als-xz to fire on its curated board")
	}
	if move.Technique != "als-xz" {
		t.Fatalf("Expected technique als-xz, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the ALS-XZ cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the ALS-XZ rule")
	}
}

func TestALSXYWingHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "als-xy-wing")
	if move == nil {
		t.Fatal("Expected als-xy-wing to fire on its curated board")
	}
	if move.Technique != "als-xy-wing" {
		t.Fatalf("Expected technique als-xy-wing, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the ALS-XY-Wing cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the ALS-XY-Wing")
	}
}

func TestALSXYChainHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "als-xy-chain")
	if move == nil {
		t.Fatal("Expected als-xy-chain to fire on its curated board")
	}
	if move.Technique != "als-xy-chain" {
		t.Fatalf("Expected technique als-xy-chain, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the ALS-XY-Chain cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the ALS-XY-Chain")
	}
}

func TestSueDeCoqHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "sue-de-coq")
	if move == nil {
		t.Fatal("Expected sue-de-coq to fire on its curated board")
	}
	if move.Technique != "sue-de-coq" {
		t.Fatalf("Expected technique sue-de-coq, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Sue de Coq cells")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the Sue de Coq intersection")
	}
}

func TestDeathBlossomHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "death-blossom")
	if move == nil {
		t.Fatal("Expected death-blossom to fire on its curated board")
	}
	if move.Technique != "death-blossom" {
		t.Fatalf("Expected technique death-blossom, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Death Blossom stem and petals")
	}
	if len(move.Eliminations) == 0 {
		t.Error("Expected eliminations from the Death Blossom")
	}
}

func TestDigitForcingChainHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "digit-forcing-chain")
	if move == nil {
		t.Fatal("Expected digit-forcing-chain to fire on its curated board")
	}
	if move.Technique != "digit-forcing-chain" {
		t.Fatalf("Expected technique digit-forcing-chain, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Digit Forcing Chain")
	}
}

func TestForcingChainHighlights(t *testing.T) {
	move := detectCuratedTechniqueMove(t, "forcing-chain")
	if move == nil {
		t.Fatal("Expected forcing-chain to fire on its curated board")
	}
	if move.Technique != "forcing-chain" {
		t.Fatalf("Expected technique forcing-chain, got %s", move.Technique)
	}
	if len(move.Highlights.Primary) == 0 {
		t.Error("Expected primary highlights for the Forcing Chain")
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
