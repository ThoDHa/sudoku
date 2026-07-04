package human

import (
	"fmt"
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

func TestUnitTypeName_AllTypes(t *testing.T) {
	if got := unitTypeName(UnitRow); got != "row" {
		t.Errorf("unitTypeName(UnitRow) = %q, want \"row\"", got)
	}
	if got := unitTypeName(UnitCol); got != "column" {
		t.Errorf("unitTypeName(UnitCol) = %q, want \"column\"", got)
	}
	if got := unitTypeName(UnitBox); got != "box" {
		t.Errorf("unitTypeName(UnitBox) = %q, want \"box\"", got)
	}
}

func TestBuildHiddenSingleMove_ExactFields(t *testing.T) {
	cell := core.CellRef{Row: 3, Col: 4}
	tests := []struct {
		name         string
		unitType     UnitType
		unitIndex    int
		digit        int
		wantUnitWord string
	}{
		{"row unit", UnitRow, 2, 7, "row"},
		{"column unit", UnitCol, 5, 3, "column"},
		{"box unit", UnitBox, 7, 9, "box"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			move := buildHiddenSingleMove(cell, tt.unitType, tt.unitIndex, tt.digit)
			if move == nil {
				t.Fatal("expected move, got nil")
			}
			if move.Technique != "hidden-single" {
				t.Errorf("Technique = %q, want \"hidden-single\"", move.Technique)
			}
			if move.Action != constants.ActionAssign {
				t.Errorf("Action = %q, want %q", move.Action, constants.ActionAssign)
			}
			if move.Digit != tt.digit {
				t.Errorf("Digit = %d, want %d", move.Digit, tt.digit)
			}
			if len(move.Targets) != 1 || move.Targets[0] != cell {
				t.Errorf("Targets = %+v, want [%+v]", move.Targets, cell)
			}
			wantExplanation := fmt.Sprintf("R%dC%d must be %d: only cell in %s %d that can contain %d",
				cell.Row+1, cell.Col+1, tt.digit, tt.wantUnitWord, tt.unitIndex+1, tt.digit)
			if move.Explanation != wantExplanation {
				t.Errorf("Explanation = %q, want %q", move.Explanation, wantExplanation)
			}
			if len(move.Highlights.Primary) != 1 || move.Highlights.Primary[0] != cell {
				t.Errorf("Primary = %+v, want [%+v]", move.Highlights.Primary, cell)
			}
			if len(move.Highlights.Secondary) != constants.GridSize {
				t.Errorf("Secondary len = %d, want %d", len(move.Highlights.Secondary), constants.GridSize)
			}
			if move.Refs.Title != "Hidden Single" {
				t.Errorf("Refs.Title = %q, want \"Hidden Single\"", move.Refs.Title)
			}
			if move.Refs.Slug != "hidden-single" {
				t.Errorf("Refs.Slug = %q, want \"hidden-single\"", move.Refs.Slug)
			}
			if move.Refs.URL != "/technique/hidden-single" {
				t.Errorf("Refs.URL = %q, want \"/technique/hidden-single\"", move.Refs.URL)
			}
		})
	}
}

func TestCreateDuplicateViolationMove_ExactFields(t *testing.T) {
	s := &Solver{}
	tests := []struct {
		name         string
		unitType     UnitType
		unitIndex    int
		idx1, idx2   int
		digit        int
		wantTech     string
		wantUnitWord string
	}{
		{"row", UnitRow, 0, 0, 4, 5, "constraint-violation-duplicate-row", "row"},
		{"column", UnitCol, 1, 1, 19, 3, "constraint-violation-duplicate-col", "column"},
		{"box", UnitBox, 0, 0, 10, 7, "constraint-violation-duplicate-box", "box"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			move := s.createDuplicateViolationMove(tt.digit, tt.idx1, tt.idx2, tt.unitType, tt.unitIndex)
			if move == nil {
				t.Fatal("expected move, got nil")
			}
			if move.Technique != tt.wantTech {
				t.Errorf("Technique = %q, want %q", move.Technique, tt.wantTech)
			}
			if move.Action != "contradiction" {
				t.Errorf("Action = %q, want \"contradiction\"", move.Action)
			}
			if move.Digit != tt.digit {
				t.Errorf("Digit = %d, want %d", move.Digit, tt.digit)
			}
			r1, c1 := RowOf(tt.idx1), ColOf(tt.idx1)
			r2, c2 := RowOf(tt.idx2), ColOf(tt.idx2)
			wantTargets := []core.CellRef{{Row: r1, Col: c1}, {Row: r2, Col: c2}}
			if len(move.Targets) != 2 {
				t.Fatalf("Targets len = %d, want 2", len(move.Targets))
			}
			for i, wt := range wantTargets {
				if move.Targets[i] != wt {
					t.Errorf("Targets[%d] = %+v, want %+v", i, move.Targets[i], wt)
				}
			}
			if len(move.Highlights.Primary) != 2 {
				t.Errorf("Primary len = %d, want 2", len(move.Highlights.Primary))
			} else {
				for i, wt := range wantTargets {
					if move.Highlights.Primary[i] != wt {
						t.Errorf("Primary[%d] = %+v, want %+v", i, move.Highlights.Primary[i], wt)
					}
				}
			}
			if len(move.Highlights.Secondary) != constants.GridSize {
				t.Errorf("Secondary len = %d, want %d", len(move.Highlights.Secondary), constants.GridSize)
			}
			if move.Refs.Title != "Constraint Violation" {
				t.Errorf("Refs.Title = %q, want \"Constraint Violation\"", move.Refs.Title)
			}
			if move.Refs.Slug != "constraint-violation" {
				t.Errorf("Refs.Slug = %q, want \"constraint-violation\"", move.Refs.Slug)
			}
			wantExplSub := fmt.Sprintf("%d appears twice in %s %d", tt.digit, tt.wantUnitWord, tt.unitIndex+1)
			if !strings.Contains(move.Explanation, wantExplSub) {
				t.Errorf("Explanation = %q, want substring %q", move.Explanation, wantExplSub)
			}
		})
	}
}

func TestSolver_FillCandidateMove_RefsExact(t *testing.T) {
	board := NewBoardWithCandidates(make([]int, 81), nil)
	solver := NewSolver()
	move := solver.FindNextMove(board)
	if move == nil {
		t.Fatal("expected fill-candidate move, got nil")
	}
	if move.Refs.Title != "Fill Candidate" {
		t.Errorf("Refs.Title = %q, want \"Fill Candidate\"", move.Refs.Title)
	}
	if move.Refs.Slug != "fill-candidate" {
		t.Errorf("Refs.Slug = %q, want \"fill-candidate\"", move.Refs.Slug)
	}
	if move.Refs.URL != "/technique/fill-candidate" {
		t.Errorf("Refs.URL = %q, want \"/technique/fill-candidate\"", move.Refs.URL)
	}
}

func TestBoard_SetCell_MarksPeersEliminated(t *testing.T) {
	board := NewBoard(make([]int, 81))
	board.SetCell(0, 5)
	for _, peer := range Peers[0] {
		if !board.Eliminated[peer].Has(5) {
			t.Errorf("peer cell %d (R%dC%d): expected digit 5 in Eliminated after SetCell(0,5)",
				peer, RowOf(peer), ColOf(peer))
		}
	}
	if board.Eliminated[0] != 0 {
		t.Errorf("cell 0: expected Eliminated cleared after fill, got %v", board.Eliminated[0].ToSlice())
	}
	if board.Eliminated[40].Has(5) {
		t.Error("non-peer cell 40: should not have 5 in Eliminated")
	}
	if board.Candidates[0] != 0 {
		t.Error("cell 0: candidates should be cleared after fill")
	}
}

func TestBoard_ClearCell_RecalculatesCandidates(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 5
	board := NewBoard(givens)
	if board.Candidates[1].Has(5) {
		t.Fatal("setup: cell 1 (peer of cell 0) should not have candidate 5")
	}
	board.ClearCell(0)
	if board.Cells[0] != 0 {
		t.Errorf("after ClearCell(0): Cells[0] = %d, want 0", board.Cells[0])
	}
	if board.Eliminated[0] != 0 {
		t.Errorf("after ClearCell(0): Eliminated[0] should be cleared")
	}
	if !board.Candidates[0].Has(5) {
		t.Error("after ClearCell(0): candidate 5 should be available again (no 5 in peers)")
	}
	board.ClearCell(-1)
	board.ClearCell(constants.TotalCells + 5)
}

func TestBoard_Clone_IsDeepCopy(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 5
	original := NewBoard(givens)
	clone := original.Clone()
	clone.Cells[0] = 9
	clone.Candidates[1] = NewCandidates([]int{1, 2, 3})
	clone.Eliminated[2] = NewCandidates([]int{7})
	if original.Cells[0] != 5 {
		t.Errorf("original Cells[0] = %d, want 5 (clone mutated parent)", original.Cells[0])
	}
	if original.Candidates[1].Equals(NewCandidates([]int{1, 2, 3})) {
		t.Error("original Candidates[1] affected by clone mutation")
	}
	if original.Eliminated[2].Has(7) {
		t.Error("original Eliminated[2] affected by clone mutation")
	}
	boardClone, ok := clone.CloneBoard().(*Board)
	if !ok {
		t.Fatal("CloneBoard() should return *Board")
	}
	if boardClone.Cells[0] != 9 {
		t.Errorf("CloneBoard copy Cells[0] = %d, want 9 (clone was mutated)", boardClone.Cells[0])
	}
	boardClone.Cells[1] = 4
	if clone.Cells[1] == 4 {
		t.Error("CloneBoard must return an independent copy, not the receiver")
	}
}

func TestBoard_IsValid_AndIsSolved(t *testing.T) {
	empty := NewBoard(make([]int, 81))
	if !empty.IsValid() {
		t.Error("empty board should be valid")
	}
	if empty.IsSolved() {
		t.Error("empty board should not be solved")
	}

	dupRow := make([]int, 81)
	dupRow[0] = 5
	dupRow[3] = 5
	dupBoard := NewBoard(dupRow)
	if dupBoard.IsValid() {
		t.Error("board with duplicate in row should be invalid")
	}
	if dupBoard.IsSolved() {
		t.Error("board with duplicate should not be solved")
	}

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
	solvedBoard := NewBoard(solved)
	if !solvedBoard.IsValid() {
		t.Error("fully solved board should be valid")
	}
	if !solvedBoard.IsSolved() {
		t.Error("fully filled valid board should be solved")
	}

	bad := make([]int, 81)
	copy(bad, solved)
	bad[0] = 3
	badBoard := NewBoard(bad)
	if badBoard.IsValid() {
		t.Error("fully filled board with duplicate should be invalid")
	}
	if badBoard.IsSolved() {
		t.Error("fully filled invalid board should not be solved")
	}
}

func TestBoard_markMissingAsEliminated_Exact(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	cands := make([][]int, 81)
	cands[1] = []int{2}
	board := NewBoardWithCandidates(cells, cands)
	for _, d := range []int{1, 3, 4, 6, 7, 8, 9} {
		if !board.Eliminated[1].Has(d) {
			t.Errorf("cell 1: legal digit %d missing from persisted candidates should be eliminated", d)
		}
	}
	if board.Eliminated[1].Has(2) {
		t.Error("cell 1: digit 2 is in persisted candidates, should not be eliminated")
	}
	if board.Eliminated[1].Has(5) {
		t.Error("cell 1: digit 5 is blocked by row peer (canPlace=false), should not be marked eliminated")
	}
}

func TestBoard_Accessors_Exact(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 5
	board := NewBoard(givens)

	if board.GetCell(0) != 5 {
		t.Errorf("GetCell(0) = %d, want 5", board.GetCell(0))
	}
	if board.GetCell(1) != 0 {
		t.Errorf("GetCell(1) = %d, want 0", board.GetCell(1))
	}
	if board.GetCandidatesAt(1) != board.Candidates[1] {
		t.Error("GetCandidatesAt(1) should mirror Candidates[1]")
	}

	cells := board.GetCells()
	if len(cells) != constants.TotalCells || cells[0] != 5 {
		t.Errorf("GetCells() incorrect: len=%d cells[0]=%d", len(cells), cells[0])
	}
	cells[0] = 99
	if board.Cells[0] != 5 {
		t.Error("GetCells() should return a defensive copy, mutating it must not affect the board")
	}

	asCands := board.GetCandidates()
	if len(asCands) != constants.TotalCells {
		t.Fatalf("GetCandidates() len = %d, want %d", len(asCands), constants.TotalCells)
	}
	if len(asCands[1]) == 0 {
		t.Error("GetCandidates()[1] should list candidates for the empty peer cell")
	}
}

func TestSolver_FillCandidate_ExactExplanation(t *testing.T) {
	board := NewBoardWithCandidates(make([]int, 81), nil)
	solver := NewSolver()
	move := solver.FindNextMove(board)
	if move == nil {
		t.Fatal("expected fill-candidate move on empty board, got nil")
	}
	wantExplanation := "Added 1 as a candidate to R1C1"
	if move.Explanation != wantExplanation {
		t.Errorf("Explanation = %q, want %q (row+1/col+1 arithmetic in format string)", move.Explanation, wantExplanation)
	}
}

func TestSolver_ConstraintViolation_DuplicateDigitOne(t *testing.T) {
	givens := make([]int, 81)
	givens[0] = 1
	givens[1] = 1
	board := NewBoard(givens)
	solver := NewSolver()
	move := solver.FindNextMove(board)
	if move == nil {
		t.Fatal("expected constraint-violation move for duplicate 1s in row 0, got nil")
	}
	if move.Action != "contradiction" {
		t.Errorf("Action = %q, want \"contradiction\"", move.Action)
	}
	if !strings.Contains(move.Technique, "constraint-violation") {
		t.Errorf("Technique = %q, want substring \"constraint-violation\" (digit==0 guard mutant skips digit 1)", move.Technique)
	}
	if move.Digit != 1 {
		t.Errorf("Digit = %d, want 1", move.Digit)
	}
}

func TestSolver_InvalidCandidate_ConflictCellsCoverAllUnits(t *testing.T) {
	for _, digit := range []int{1, 9} {
		t.Run(fmt.Sprintf("digit-%d", digit), func(t *testing.T) {
			var cells [81]int
			cells[8] = digit  // R0C8: row peer of R0C0, box 2
			cells[72] = digit // R8C0: column peer of R0C0, box 6
			cells[20] = digit // R2C2: box peer of R0C0, outside row 0 and col 0
			candidateMap := map[int][]int{0: {digit}}
			board := makeTestBoard(cells, candidateMap)
			solver := NewSolver()

			move := solver.FindNextMove(board)
			if move == nil {
				t.Fatal("expected invalid-candidate move at cell 0")
			}
			if move.Technique != "constraint-violation-invalid-candidate" {
				t.Fatalf("Technique = %q, want constraint-violation-invalid-candidate", move.Technique)
			}
			if move.Digit != digit {
				t.Errorf("Digit = %d, want %d", move.Digit, digit)
			}
			wantSecondary := []core.CellRef{
				{Row: 0, Col: 8},
				{Row: 8, Col: 0},
				{Row: 2, Col: 2},
			}
			if len(move.Highlights.Secondary) != len(wantSecondary) {
				t.Fatalf("Secondary len = %d, want %d (%+v)", len(move.Highlights.Secondary), len(wantSecondary), move.Highlights.Secondary)
			}
			for i, ws := range wantSecondary {
				if move.Highlights.Secondary[i] != ws {
					t.Errorf("Secondary[%d] = %+v, want %+v", i, move.Highlights.Secondary[i], ws)
				}
			}
		})
	}
}

func TestSolver_ApplyMove_CandidateAction_ExactCell(t *testing.T) {
	solver := NewSolver()
	board := NewBoardWithCandidates(make([]int, 81), nil)
	target := core.CellRef{Row: 3, Col: 4}
	solver.ApplyMove(board, &core.Move{
		Action:  "candidate",
		Digit:   6,
		Targets: []core.CellRef{target},
	})
	idx := target.Row*constants.GridSize + target.Col
	if !board.Candidates[idx].Has(6) {
		t.Errorf("candidate action should add digit 6 at cell %d (R3C4), got Candidates[%d]=%v", idx, idx, board.Candidates[idx].ToSlice())
	}
	wrongSub := target.Row*constants.GridSize - target.Col
	if wrongSub != idx && board.Candidates[wrongSub].Has(6) {
		t.Errorf("candidate leaked into wrong cell %d (row*GridSize-col arithmetic mutant)", wrongSub)
	}
	wrongDiv := target.Row/constants.GridSize + target.Col
	if wrongDiv != idx && board.Candidates[wrongDiv].Has(6) {
		t.Errorf("candidate leaked into wrong cell %d (row/GridSize+col arithmetic mutant)", wrongDiv)
	}
}

func TestSolver_SolveWithSteps_StepIndexSequence(t *testing.T) {
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

	board := NewBoard(givens)
	solver := NewSolver()
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)
	if status != constants.StatusCompleted {
		t.Fatalf("status = %q, want completed", status)
	}
	if len(moves) == 0 {
		t.Fatal("expected at least one move")
	}
	if moves[0].StepIndex != 0 {
		t.Errorf("first move StepIndex = %d, want 0 (step initializer mutant shifts the whole sequence)", moves[0].StepIndex)
	}
	maxStepIndex := -1
	for _, m := range moves {
		if m.StepIndex > maxStepIndex {
			maxStepIndex = m.StepIndex
		}
	}
	if maxStepIndex < 1 {
		t.Errorf("expected at least one move with StepIndex >= 1, max = %d (StepIndex-assignment mutant leaves all at 0)", maxStepIndex)
	}
}

func TestSolver_CandidateSweep_IncludesBoundaryDigits(t *testing.T) {
	board := NewBoardWithCandidates(make([]int, 81), nil)
	solver := NewSolver()
	seen := map[int]bool{}
	for i := 0; i < 1500; i++ {
		move := solver.FindNextMove(board)
		if move == nil {
			break
		}
		if move.Technique == "fill-candidate" {
			seen[move.Digit] = true
		}
		solver.ApplyMove(board, move)
	}
	if !seen[1] {
		t.Error("expected a fill-candidate move for digit 1 (sweep must start at d=1)")
	}
	if !seen[9] {
		t.Error("expected a fill-candidate move for digit 9 (sweep must include d=GridSize)")
	}
}

func TestSolver_Reset_ClearsGenerationState(t *testing.T) {
	solver := NewSolver()
	solver.generationState = StateCandidatesComplete
	solver.Reset()
	if solver.generationState != StateNotStarted {
		t.Errorf("after Reset, generationState = %v, want StateNotStarted", solver.generationState)
	}
	board := NewBoardWithCandidates(make([]int, 81), nil)
	move := solver.FindNextMove(board)
	if move == nil || move.Technique != "fill-candidate" {
		t.Errorf("after Reset, FindNextMove on empty board should return fill-candidate, got %+v", move)
	}
}

func TestSolver_HiddenSingle_AlreadyPresentReturnsNil(t *testing.T) {
	var cells [81]int
	cells[1] = 5
	candidateMap := map[int][]int{5: {5}}
	board := makeTestBoard(cells, candidateMap)
	s := &Solver{}
	move := s.checkHiddenSingleInUnit(board, UnitRow, 0, 5)
	if move != nil {
		t.Errorf("checkHiddenSingleInUnit should return nil when digit already placed in unit, got %+v", move)
	}
}

func TestSolver_HiddenSingle_RequiresBothEmptyAndCandidateChecks(t *testing.T) {
	var cells [81]int
	cells[0] = 9
	candidateMap := map[int][]int{0: {5}, 1: {5}}
	board := makeTestBoard(cells, candidateMap)
	s := &Solver{}
	move := s.checkHiddenSingleInUnit(board, UnitRow, 0, 5)
	if move == nil {
		t.Fatal("expected hidden-single move for R0C1 (only empty cell with candidate 5), got nil")
	}
	if len(move.Targets) != 1 || move.Targets[0].Row != 0 || move.Targets[0].Col != 1 {
		t.Errorf("target = %+v, want R0C1", move.Targets)
	}
}

func TestBoard_IsSolved_FirstCellEmpty(t *testing.T) {
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
	if board.IsSolved() {
		t.Error("board with cell 0 empty should not be solved (i:=1 mutant skips cell 0 and misses the gap)")
	}
}

func TestBoard_IsValid_ColumnAndBoxDuplicates(t *testing.T) {
	colDup := make([]int, 81)
	colDup[0] = 5
	colDup[36] = 5
	if NewBoard(colDup).IsValid() {
		t.Error("board with duplicate in column 0 (R0C0, R4C0; distinct rows and boxes) should be invalid")
	}
	boxDup := make([]int, 81)
	boxDup[0] = 5
	boxDup[10] = 5
	if NewBoard(boxDup).IsValid() {
		t.Error("board with duplicate in box 0 (R0C0, R1C1; distinct rows and cols) should be invalid")
	}
}

func TestBoard_QueryFunctions_IncludesFirstCell(t *testing.T) {
	board := NewBoard(make([]int, 81))
	if got := board.CellsWithNCandidates(9); len(got) != 81 {
		t.Errorf("CellsWithNCandidates(9) on empty board = %d cells, want 81 (i:=1 mutant skips cell 0)", len(got))
	}
	if got := board.CellsWithCandidateRange(9, 9); len(got) != 81 {
		t.Errorf("CellsWithCandidateRange(9,9) on empty board = %d cells, want 81", len(got))
	}
	asCands := board.GetCandidates()
	if len(asCands[0]) == 0 {
		t.Error("GetCandidates()[0] on empty board should be non-empty (i:=1 mutant leaves result[0] nil)")
	}
}

func TestBoard_CellsWithCandidateRange_RespectsMax(t *testing.T) {
	board := NewBoard(make([]int, 81))
	got := board.CellsWithCandidateRange(1, 5)
	if len(got) != 0 {
		t.Errorf("CellsWithCandidateRange(1,5) on all-9-candidate board = %d, want 0 (count<=max->true mutant drops the upper bound)", len(got))
	}
}

func TestBoard_ClearCell_BoundaryAndCandidateRecompute(t *testing.T) {
	board := NewBoard(make([]int, 81))
	board.ClearCell(0)
	cands := board.Candidates[0]
	if !cands.Has(1) {
		t.Error("ClearCell(0) should recompute candidate 1 (loop must start at d=1)")
	}
	if !cands.Has(9) {
		t.Error("ClearCell(0) should recompute candidate 9 (loop must include d=GridSize)")
	}
	board.ClearCell(constants.TotalCells)
	board.ClearCell(-1)
}

func TestBoard_NewBoardWithCandidates_ShortSlice(t *testing.T) {
	cells := make([]int, 81)
	candidates := make([][]int, 5)
	candidates[0] = []int{1, 2, 3}
	board := NewBoardWithCandidates(cells, candidates)
	if !board.Candidates[0].Has(1) {
		t.Errorf("Candidates[0] should contain 1, got %v", board.Candidates[0].ToSlice())
	}
}

func TestBoard_markMissingAsEliminated_FilledCell(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	candidates := make([][]int, 81)
	candidates[0] = []int{1, 2, 3}
	board := NewBoardWithCandidates(cells, candidates)
	if board.Eliminated[0].Count() != 0 {
		t.Errorf("filled cell 0 should have no eliminated digits, got %v (cell!=0 guard mutant proceeds to eliminate)", board.Eliminated[0].ToSlice())
	}
}

func TestCombinations_K2_NonEmpty(t *testing.T) {
	got := Combinations([]int{1, 2, 3}, 2)
	if len(got) == 0 {
		t.Fatal("Combinations([1,2,3], 2) should return pairs, got empty (k>len->k>1 mutant rejects valid k=2)")
	}
	if len(got) != 3 {
		t.Errorf("expected 3 pairs, got %d: %+v", len(got), got)
	}
}

func TestDedupeEliminations_TwoDuplicatesCollapsed(t *testing.T) {
	dup := []core.Candidate{
		{Row: 0, Col: 0, Digit: 5},
		{Row: 0, Col: 0, Digit: 5},
	}
	got := DedupeEliminations(dup)
	if len(got) != 1 {
		t.Errorf("expected 1 unique elimination, got %d: %+v (len<=1->len<=2 mutant skips dedupe for pairs)", len(got), got)
	}
}

func TestDigitExistsInCells_OutOfBoxPeers(t *testing.T) {
	rowBoard := NewBoard(func() []int {
		g := make([]int, 81)
		g[5] = 5
		return g
	}())
	if !digitExistsInCells(rowBoard, 0, 0, 5) {
		t.Error("digitExistsInCells(0,0,5): 5 sits at R0C5 (row peer, outside box 0 and col 0); row scan must detect it")
	}

	colBoard := NewBoard(func() []int {
		g := make([]int, 81)
		g[45] = 3
		return g
	}())
	if !digitExistsInCells(colBoard, 0, 0, 3) {
		t.Error("digitExistsInCells(0,0,3): 3 sits at R5C0 (col peer, outside box 0 and row 0); col scan must detect it")
	}

	boxBoard := NewBoard(func() []int {
		g := make([]int, 81)
		g[40] = 7
		return g
	}())
	if !digitExistsInCells(boxBoard, 3, 3, 7) {
		t.Error("digitExistsInCells(3,3,7): 7 sits at R4C4 (box peer of R3C3, outside row 3 and col 3); box scan must detect it")
	}
}

func TestCreateSolverUpToTier_ExcludesHigherTiers(t *testing.T) {
	simpleOnly := CreateSolverUpToTier(constants.TierSimple)
	if got := simpleOnly.GetRegistry().GetByTier(constants.TierMedium); len(got) != 0 {
		t.Errorf("CreateSolverUpToTier(TierSimple) should disable all Medium techniques, got %d enabled: %+v (Simple:0->1 or Medium:1->0 mutant leaks Medium)", len(got), got)
	}
	if got := simpleOnly.GetRegistry().GetByTier(constants.TierExtreme); len(got) != 0 {
		t.Errorf("CreateSolverUpToTier(TierSimple) should disable all Extreme techniques, got %d enabled", len(got))
	}

	hardInclusive := CreateSolverUpToTier(constants.TierHard)
	if got := hardInclusive.GetRegistry().GetByTier(constants.TierExtreme); len(got) != 0 {
		t.Errorf("CreateSolverUpToTier(TierHard) should disable all Extreme techniques, got %d enabled: %+v (Hard:2->3 or Extreme:3->2 mutant leaks Extreme)", len(got), got)
	}
}
