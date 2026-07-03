package human

import (
	"strings"
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

func TestCandidates_Basic(t *testing.T) {
	// Test empty candidates
	var c Candidates
	if !c.IsEmpty() {
		t.Error("New Candidates should be empty")
	}
	if c.Count() != 0 {
		t.Error("Empty Candidates should have count 0")
	}

	// Test setting and checking candidates
	c = c.Set(1)
	if !c.Has(1) {
		t.Error("Should have digit 1 after setting")
	}
	if c.Count() != 1 {
		t.Error("Should have count 1")
	}

	// Test multiple digits
	c = c.Set(5).Set(9)
	if !c.Has(5) || !c.Has(9) {
		t.Error("Should have digits 5 and 9")
	}
	if c.Count() != 3 {
		t.Error("Should have count 3")
	}
}

func TestCandidates_Clear(t *testing.T) {
	c := AllCandidates()
	if c.Count() != 9 {
		t.Error("AllCandidates should have count 9")
	}

	c = c.Clear(5)
	if c.Has(5) {
		t.Error("Should not have digit 5 after clearing")
	}
	if c.Count() != 8 {
		t.Error("Should have count 8 after clearing one")
	}
}

func TestCandidates_Only(t *testing.T) {
	// Test empty
	var c Candidates
	if digit, ok := c.Only(); ok {
		t.Errorf("Empty candidates should not return Only, got %d", digit)
	}

	// Test single digit
	c = c.Set(7)
	if digit, ok := c.Only(); !ok || digit != 7 {
		t.Errorf("Expected Only() to return (7, true), got (%d, %v)", digit, ok)
	}

	// Test multiple digits
	c = c.Set(3)
	if digit, ok := c.Only(); ok {
		t.Errorf("Multiple candidates should not return Only, got %d", digit)
	}
}

func TestCandidates_ToSlice(t *testing.T) {
	c := NewCandidates([]int{1, 3, 7, 9})
	slice := c.ToSlice()
	expected := []int{1, 3, 7, 9}

	if len(slice) != len(expected) {
		t.Errorf("Expected slice length %d, got %d", len(expected), len(slice))
	}

	for i, v := range expected {
		if i >= len(slice) || slice[i] != v {
			t.Errorf("Expected slice[%d] = %d, got %v", i, v, slice)
			break
		}
	}
}

func TestCandidates_Operations(t *testing.T) {
	c1 := NewCandidates([]int{1, 3, 5})
	c2 := NewCandidates([]int{3, 5, 7})

	// Test intersect
	intersect := c1.Intersect(c2)
	expected := NewCandidates([]int{3, 5})
	if !intersect.Equals(expected) {
		t.Errorf("Intersect failed: expected %v, got %v", expected.ToSlice(), intersect.ToSlice())
	}

	// Test union
	union := c1.Union(c2)
	expected = NewCandidates([]int{1, 3, 5, 7})
	if !union.Equals(expected) {
		t.Errorf("Union failed: expected %v, got %v", expected.ToSlice(), union.ToSlice())
	}

	// Test subtract
	subtract := c1.Subtract(c2)
	expected = NewCandidates([]int{1})
	if !subtract.Equals(expected) {
		t.Errorf("Subtract failed: expected %v, got %v", expected.ToSlice(), subtract.ToSlice())
	}
}

func TestCandidates_BoundaryConditions(t *testing.T) {
	var c Candidates

	// Test invalid digits
	c = c.Set(0).Set(10).Set(-1)
	if c.Count() != 0 {
		t.Error("Invalid digits should not be set")
	}

	// Test Has with invalid digits
	if c.Has(0) || c.Has(10) || c.Has(-1) {
		t.Error("Invalid digits should not be present")
	}

	// Test Clear with invalid digits (should not panic)
	c = NewCandidates([]int{1, 2, 3})
	original := c
	c = c.Clear(0).Clear(10).Clear(-1)
	if !c.Equals(original) {
		t.Error("Clearing invalid digits should not change candidates")
	}
}

func TestNewCandidates(t *testing.T) {
	// Test with valid digits
	c := NewCandidates([]int{1, 5, 9})
	if !c.Has(1) || !c.Has(5) || !c.Has(9) || c.Count() != 3 {
		t.Error("NewCandidates with valid digits failed")
	}

	// Test with invalid digits (should be ignored)
	c = NewCandidates([]int{0, 1, 10, 5})
	if !c.Has(1) || !c.Has(5) || c.Has(0) || c.Has(10) || c.Count() != 2 {
		t.Error("NewCandidates should ignore invalid digits")
	}

	// Test with empty slice
	c = NewCandidates([]int{})
	if !c.IsEmpty() {
		t.Error("NewCandidates with empty slice should be empty")
	}
}

func TestBoard_InitCandidates_ExactState(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 5
	board := NewBoard(givens)

	expected := NewCandidates([]int{1, 2, 3, 4, 6, 7, 8, 9})
	if !board.Candidates[1].Equals(expected) {
		t.Errorf("cell 1 (row peer of 5): expected %v, got %v", expected.ToSlice(), board.Candidates[1].ToSlice())
	}
	if !board.Candidates[9].Equals(expected) {
		t.Errorf("cell 9 (col peer of 5): expected %v, got %v", expected.ToSlice(), board.Candidates[9].ToSlice())
	}
	if !board.Candidates[10].Equals(expected) {
		t.Errorf("cell 10 (box peer of 5): expected %v, got %v", expected.ToSlice(), board.Candidates[10].ToSlice())
	}

	allNine := AllCandidates()
	if !board.Candidates[40].Equals(allNine) {
		t.Errorf("cell 40 (not a peer of cell 0): expected all 9 candidates, got %v", board.Candidates[40].ToSlice())
	}

	if board.Candidates[0] != 0 {
		t.Errorf("cell 0 (filled): expected empty candidates, got %v", board.Candidates[0].ToSlice())
	}
}

func TestBoard_SetCell_EliminatesPeerCandidates(t *testing.T) {
	board := NewBoard(make([]int, 81))
	board.SetCell(0, 5)

	removed := NewCandidates([]int{1, 2, 3, 4, 6, 7, 8, 9})
	for _, peerIdx := range []int{1, 2, 3, 4, 5, 6, 7, 8} {
		if board.Candidates[peerIdx].Has(5) {
			t.Errorf("row peer cell %d should have 5 eliminated", peerIdx)
		}
		if !board.Candidates[peerIdx].Equals(removed) {
			t.Errorf("row peer cell %d: expected %v, got %v", peerIdx, removed.ToSlice(), board.Candidates[peerIdx].ToSlice())
		}
	}

	for _, peerIdx := range []int{9, 18, 27, 36, 45, 54, 63, 72} {
		if board.Candidates[peerIdx].Has(5) {
			t.Errorf("col peer cell %d should have 5 eliminated", peerIdx)
		}
	}

	for _, peerIdx := range []int{1, 2, 10, 11, 19, 20} {
		if board.Candidates[peerIdx].Has(5) {
			t.Errorf("box peer cell %d should have 5 eliminated", peerIdx)
		}
	}

	full := AllCandidates()
	if !board.Candidates[40].Equals(full) {
		t.Errorf("cell 40 (not a peer): expected all candidates, got %v", board.Candidates[40].ToSlice())
	}
}

func TestBoard_canPlace_Exact(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 5
	board := NewBoard(givens)

	if board.canPlace(1, 5) {
		t.Error("canPlace(1, 5): cell 1 is in same row as cell 0 (which has 5)")
	}
	if board.canPlace(9, 5) {
		t.Error("canPlace(9, 5): cell 9 is in same column as cell 0 (which has 5)")
	}
	if board.canPlace(10, 5) {
		t.Error("canPlace(10, 5): cell 10 is in same box as cell 0 (which has 5)")
	}
	if !board.canPlace(40, 5) {
		t.Error("canPlace(40, 5): cell 40 is not a peer of cell 0, should be placeable")
	}
	if !board.canPlace(1, 6) {
		t.Error("canPlace(1, 6): digit 6 is not blocked anywhere")
	}
}

func TestSolver_ApplyMove_ExactBoardState(t *testing.T) {
	solver := NewSolver()
	board := NewBoard(make([]int, 81))

	solver.ApplyMove(board, &core.Move{
		Action: "assign",
		Digit:  3,
		Targets: []core.CellRef{
			{Row: 0, Col: 0},
		},
	})
	if board.Cells[0] != 3 {
		t.Errorf("after assign: cell 0 = %d, want 3", board.Cells[0])
	}
	if board.Candidates[0] != 0 {
		t.Error("after assign: cell 0 should have empty candidates")
	}
	for _, peer := range []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 27, 36, 45, 54, 63, 72, 10, 11, 19, 20} {
		if board.Candidates[peer].Has(3) {
			t.Errorf("after assign: peer cell %d should have 3 eliminated", peer)
		}
	}

	solver.ApplyMove(board, &core.Move{
		Action: "eliminate",
		Eliminations: []core.Candidate{
			{Row: 4, Col: 4, Digit: 7},
		},
	})
	if board.Candidates[40].Has(7) {
		t.Error("after eliminate: cell 40 should not have candidate 7")
	}
	if !board.Eliminated[40].Has(7) {
		t.Error("after eliminate: cell 40 should have 7 in Eliminated set")
	}

	solver.ApplyMove(board, &core.Move{
		Action: "candidate",
		Digit:  2,
		Targets: []core.CellRef{
			{Row: 8, Col: 8},
		},
	})
	if !board.Candidates[80].Has(2) {
		t.Error("after candidate: cell 80 should have candidate 2")
	}
}

func TestSolver_FindNextMove_ExactCandidateMove(t *testing.T) {
	givens := make([]int, 81)
	givens[1] = 1
	givens[2] = 2
	givens[3] = 3
	givens[4] = 4
	givens[9] = 6
	givens[10] = 9
	givens[18] = 7
	givens[27] = 8

	board := NewBoard(givens)
	solver := NewSolver()

	if board.Candidates[0].Count() != 1 || !board.Candidates[0].Has(5) {
		t.Fatalf("setup: cell 0 should be a naked single (only candidate 5), got %v", board.Candidates[0].ToSlice())
	}

	for i := 0; i < constants.TotalCells; i++ {
		move := solver.FindNextMove(board)
		if move != nil && move.Action == "assign" && move.Digit == 5 {
			if len(move.Targets) != 1 {
				t.Fatalf("expected 1 target, got %d", len(move.Targets))
			}
			if move.Targets[0].Row != 0 || move.Targets[0].Col != 0 {
				t.Errorf("expected target R0C0, got R%dC%d", move.Targets[0].Row, move.Targets[0].Col)
			}
			return
		}
		if move == nil {
			t.Fatal("solver stalled before finding naked single")
		}
		solver.ApplyMove(board, move)
	}
	t.Fatal("solver did not find naked single for cell 0")
}

func TestBoard_QueryFunctions_ExactResults(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 5
	board := NewBoard(givens)

	eight := board.CellsWithNCandidates(8)
	if len(eight) != 20 {
		t.Errorf("CellsWithNCandidates(8): expected 20 (peers of cell 0), got %d", len(eight))
	}
	for _, idx := range eight {
		if idx == 0 {
			t.Errorf("cell 0 is filled, should not be in candidate list")
		}
	}

	nine := board.CellsWithNCandidates(9)
	if len(nine) != 60 {
		t.Errorf("CellsWithNCandidates(9): expected 60 (non-peers of cell 0), got %d", len(nine))
	}

	range89 := board.CellsWithCandidateRange(8, 9)
	if len(range89) != 80 {
		t.Errorf("CellsWithCandidateRange(8,9): expected 80 (all empty cells), got %d", len(range89))
	}

	boxSix := board.CellsWithDigitInUnit(Unit{Type: UnitBox, Index: 0, Cells: BoxIndices[0]}, 6)
	if len(boxSix) != 8 {
		t.Errorf("CellsWithDigitInUnit(box 0, digit 6): expected 8, got %d", len(boxSix))
	}
}

func TestAnalyzePuzzleDifficulty_EasyPuzzle(t *testing.T) {
	solved := []int{
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

	givens := make([]int, 81)
	copy(givens, solved)
	givens[0] = 0
	givens[40] = 0
	givens[80] = 0

	solver := NewSolver()
	difficulty, techniqueCounts, status := solver.AnalyzePuzzleDifficulty(givens)

	if status != constants.StatusCompleted {
		t.Errorf("expected status 'completed', got %q", status)
	}
	if difficulty != core.DifficultyEasy {
		t.Errorf("expected difficulty 'easy', got %q", difficulty)
	}
	totalTechniques := 0
	for _, count := range techniqueCounts {
		totalTechniques += count
	}
	if totalTechniques == 0 {
		t.Error("expected at least 1 solving technique in counts")
	}
}

func TestSolver_HiddenSingleDetection_ExactMove(t *testing.T) {
	solved := []int{
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
	givens := make([]int, 81)
	copy(givens, solved)
	givens[0] = 0

	board := NewBoard(givens)
	solver := NewSolver()

	for i := 0; i < 100; i++ {
		move := solver.FindNextMove(board)
		if move == nil {
			t.Fatal("solver stalled")
		}
		if move.Action == "assign" {
			if move.Digit != 5 {
				t.Errorf("expected digit 5 (cell 0's value in solved grid), got %d", move.Digit)
			}
			if len(move.Targets) != 1 || move.Targets[0].Row != 0 || move.Targets[0].Col != 0 {
				t.Errorf("expected target R0C0, got %+v", move.Targets)
			}
			return
		}
		solver.ApplyMove(board, move)
	}
	t.Fatal("solver did not produce an assign move for cell 0")
}

func TestSolver_FillCandidateMove_ExactContent(t *testing.T) {
	board := NewBoardWithCandidates(make([]int, 81), nil)
	solver := NewSolver()

	move := solver.FindNextMove(board)
	if move == nil {
		t.Fatal("expected a fill-candidate move on empty board, got nil")
	}
	if move.Technique != "fill-candidate" {
		t.Fatalf("expected 'fill-candidate', got %q", move.Technique)
	}
	if move.Action != "candidate" {
		t.Errorf("expected action 'candidate', got %q", move.Action)
	}
	if move.Digit != 1 {
		t.Errorf("expected digit 1 (first digit swept), got %d", move.Digit)
	}
	if len(move.Targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(move.Targets))
	}
	if move.Targets[0].Row != 0 || move.Targets[0].Col != 0 {
		t.Errorf("expected first cell R0C0, got R%dC%d", move.Targets[0].Row, move.Targets[0].Col)
	}
	if !strings.Contains(move.Explanation, "Added 1 as a candidate") {
		t.Errorf("explanation should mention adding candidate 1, got: %s", move.Explanation)
	}
}

func TestSolver_InvalidCandidateDetection_ExactMove(t *testing.T) {
	cells := [81]int{}
	cells[1] = 5

	candidateMap := map[int][]int{}
	for i := 0; i < 81; i++ {
		candidateMap[i] = []int{1, 2, 3, 4, 6, 7, 8, 9}
	}
	candidateMap[0] = []int{3, 5}

	board := makeTestBoard(cells, candidateMap)
	solver := NewSolver()

	for i := 0; i < 200; i++ {
		move := solver.FindNextMove(board)
		if move == nil {
			t.Fatal("solver stalled")
		}
		if move.Technique == "constraint-violation-invalid-candidate" {
			if move.Action != "eliminate" {
				t.Errorf("expected action 'eliminate', got %q", move.Action)
			}
			if move.Digit != 5 {
				t.Errorf("expected digit 5 (the invalid candidate), got %d", move.Digit)
			}
			if len(move.Targets) != 1 || move.Targets[0].Row != 0 || move.Targets[0].Col != 0 {
				t.Errorf("expected target R0C0, got %+v", move.Targets)
			}
			if len(move.Eliminations) != 1 {
				t.Fatalf("expected 1 elimination, got %d", len(move.Eliminations))
			}
			el := move.Eliminations[0]
			if el.Row != 0 || el.Col != 0 || el.Digit != 5 {
				t.Errorf("expected elimination R0C0 d5, got R%dC%d d%d", el.Row, el.Col, el.Digit)
			}
			if !strings.Contains(move.Explanation, "R1C1") {
				t.Errorf("explanation should mention the conflict cell R1C1, got: %s", move.Explanation)
			}
			return
		}
		solver.ApplyMove(board, move)
	}
	t.Fatal("solver did not detect invalid candidate")
}

func TestSolver_HiddenSingleAtMidGrid_ExactTarget(t *testing.T) {
	solved := []int{
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
	givens := make([]int, 81)
	copy(givens, solved)
	givens[40] = 0

	board := NewBoard(givens)
	solver := NewSolver()

	for i := 0; i < 200; i++ {
		move := solver.FindNextMove(board)
		if move == nil {
			t.Fatal("solver stalled")
		}
		if move.Action == "assign" && move.Digit == 5 {
			if len(move.Targets) != 1 {
				t.Fatalf("expected 1 target, got %d", len(move.Targets))
			}
			if move.Targets[0].Row != 4 || move.Targets[0].Col != 4 {
				t.Errorf("expected target R4C4 (cell 40), got R%dC%d",
					move.Targets[0].Row, move.Targets[0].Col)
			}
			if len(move.Highlights.Primary) != 1 {
				t.Errorf("expected 1 primary highlight, got %d", len(move.Highlights.Primary))
			} else if move.Highlights.Primary[0].Row != 4 || move.Highlights.Primary[0].Col != 4 {
				t.Errorf("expected primary highlight R4C4, got R%dC%d",
					move.Highlights.Primary[0].Row, move.Highlights.Primary[0].Col)
			}
			if len(move.Highlights.Secondary) != 9 {
				t.Errorf("expected 9 secondary highlights (full unit), got %d", len(move.Highlights.Secondary))
			}
			if !strings.Contains(move.Explanation, "R5C5") {
				t.Errorf("explanation should contain R5C5 (cell 40 = row 4+1, col 4+1), got: %s", move.Explanation)
			}
			if !strings.Contains(move.Explanation, "must be 5") {
				t.Errorf("explanation should contain 'must be 5', got: %s", move.Explanation)
			}
			return
		}
		solver.ApplyMove(board, move)
	}
	t.Fatal("solver did not produce assign move for cell 40")
}

func TestDigitExistsInCells_Exact(t *testing.T) {
	givens := make([]int, 81)
	givens[1] = 5
	givens[9] = 3
	givens[10] = 7
	board := NewBoard(givens)

	if !digitExistsInCells(board, 0, 0, 5) {
		t.Error("digitExistsInCells(0,0,5): 5 is in row 0 at cell 1")
	}
	if !digitExistsInCells(board, 0, 0, 3) {
		t.Error("digitExistsInCells(0,0,3): 3 is in col 0 at cell 9")
	}
	if !digitExistsInCells(board, 0, 0, 7) {
		t.Error("digitExistsInCells(0,0,7): 7 is in box 0 at cell 10")
	}
	if digitExistsInCells(board, 0, 0, 4) {
		t.Error("digitExistsInCells(0,0,4): 4 is not in row 0, col 0, or box 0")
	}
	if digitExistsInCells(board, 4, 4, 5) {
		t.Error("digitExistsInCells(4,4,5): 5 is not in row 4, col 4, or box 4")
	}
}

func TestUnitCellIndices_AllTypes(t *testing.T) {
	rowCells := unitCellIndices(UnitRow, 3)
	if len(rowCells) != 9 || rowCells[0] != 27 || rowCells[8] != 35 {
		t.Errorf("UnitRow 3: expected [27..35], got %v", rowCells)
	}

	colCells := unitCellIndices(UnitCol, 5)
	if len(colCells) != 9 || colCells[0] != 5 || colCells[8] != 77 {
		t.Errorf("UnitCol 5: expected [5,14,...,77], got %v", colCells)
	}

	boxCells := unitCellIndices(UnitBox, 4)
	if len(boxCells) != 9 || boxCells[0] != 30 || boxCells[8] != 50 {
		t.Errorf("UnitBox 4: expected [30,31,32,39,40,41,48,49,50], got %v", boxCells)
	}
}
