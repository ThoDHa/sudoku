package techniques

import (
	"testing"

	"sudoku-api/internal/core"
)

// ============================================================================
// Naked pairs
// ============================================================================

// TestDetectNakedPairReturnsCompleteRowMove pins the whole move for a naked pair
// in a row, including the coordinates the explanation spells out and the whole
// unit it highlights. A two-candidate cell that matches nothing sits between the
// two halves of the pair, so the scan must reject that pairing and carry on to
// the next rather than take it or give up at it.
func TestDetectNakedPairReturnsCompleteRowMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1, 7})
	b.candidates[idxOf(0, 6)] = NewCandidates([]int{2, 9})

	assertMove(t, DetectNakedPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{0, 2}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 4, Digit: 1},
			{Row: 0, Col: 6, Digit: 2},
		},
		Explanation: "Naked Pair {1,2} in row 1 at R1C1 and R1C3",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 2}),
			Secondary: ToCellRefs(RowIndices[0]),
		},
	})
}

// TestDetectNakedPairReturnsCompleteColumnMove pins the column case. The two
// cells sit in different boxes, so no box unit can claim the pattern before the
// column is reached.
func TestDetectNakedPairReturnsCompleteColumnMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(2, 4)] = NewCandidates([]int{1, 7})
	b.candidates[idxOf(6, 4)] = NewCandidates([]int{2, 9})

	assertMove(t, DetectNakedPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 4}, [2]int{4, 4}),
		Eliminations: []core.Candidate{
			{Row: 2, Col: 4, Digit: 1},
			{Row: 6, Col: 4, Digit: 2},
		},
		Explanation: "Naked Pair {1,2} in column 5 at R1C5 and R5C5",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 4}, [2]int{4, 4}),
			Secondary: ToCellRefs(ColIndices[4]),
		},
	})
}

// TestDetectNakedPairReturnsCompleteBoxMove pins the box case, where the two
// cells share neither a row nor a column.
func TestDetectNakedPairReturnsCompleteBoxMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 7})
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{2, 9})

	assertMove(t, DetectNakedPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{1, 1}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 2, Digit: 1},
			{Row: 2, Col: 0, Digit: 2},
		},
		Explanation: "Naked Pair {1,2} in box 1 at R1C1 and R2C2",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{1, 1}),
			Secondary: ToCellRefs(BoxIndices[0]),
		},
	})
}

// TestDetectNakedPairIgnoresCellsWithOtherThanTwoCandidates checks the pool
// filter. A three-candidate cell holding both pair digits is not a pair member
// however well it matches, and it is eliminated from instead.
func TestDetectNakedPairIgnoresCellsWithOtherThanTwoCandidates(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 2})

	assertMove(t, DetectNakedPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 1}, [2]int{0, 2}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 1},
			{Row: 0, Col: 0, Digit: 2},
		},
		Explanation: "Naked Pair {1,2} in row 1 at R1C2 and R1C3",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 1}, [2]int{0, 2}),
			Secondary: ToCellRefs(RowIndices[0]),
		},
	})
}

// TestDetectNakedPairSkipsUnitWithNothingToEliminate checks the elimination
// guard: a pair whose unit holds no other cell with either digit is a fact about
// the board, not a move.
func TestDetectNakedPairSkipsUnitWithNothingToEliminate(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{7, 8})

	if move := DetectNakedPair(b); move != nil {
		t.Errorf("expected nil when the pair eliminates nothing, got %+v", move)
	}
}

// TestPairEliminationsOutsideSkipsThePairCells pins the elimination scan on its
// own, including that it leaves the two pair cells alone even though both hold
// the digits it is removing.
func TestPairEliminationsOutsideSkipsThePairCells(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 2, 5})
	b.candidates[idxOf(0, 8)] = NewCandidates([]int{2, 6})

	got := pairEliminationsOutside(b, idxOf(0, 0), idxOf(0, 1), []int{1, 2}, RowIndices[0])

	want := []core.Candidate{
		{Row: 0, Col: 2, Digit: 1},
		{Row: 0, Col: 2, Digit: 2},
		{Row: 0, Col: 8, Digit: 2},
	}
	if len(got) != len(want) {
		t.Fatalf("eliminations = %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("elimination %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// ============================================================================
// Hidden pairs
// ============================================================================

// TestDetectHiddenPairReturnsCompleteRowMove pins the whole move for a hidden
// pair in a row: two digits confined to two cells push every other candidate out
// of those cells.
func TestDetectHiddenPairReturnsCompleteRowMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2, 7})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2, 8})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{3, 4})

	assertMove(t, DetectHiddenPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{0, 1}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 7},
			{Row: 0, Col: 1, Digit: 8},
		},
		Explanation: "Hidden Pair {1,2} in row 1 at R1C1 and R1C2",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 1}),
			Secondary: ToCellRefs(RowIndices[0]),
		},
	})
}

// TestDetectHiddenPairReturnsCompleteColumnMove pins the column case, with the
// two cells in different boxes so the column is the first unit to hold the
// pattern.
func TestDetectHiddenPairReturnsCompleteColumnMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1, 2, 7})
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{1, 2, 8})
	b.candidates[idxOf(2, 4)] = NewCandidates([]int{3, 4})

	assertMove(t, DetectHiddenPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 4}, [2]int{4, 4}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 4, Digit: 7},
			{Row: 4, Col: 4, Digit: 8},
		},
		Explanation: "Hidden Pair {1,2} in column 5 at R1C5 and R5C5",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 4}, [2]int{4, 4}),
			Secondary: ToCellRefs(ColIndices[4]),
		},
	})
}

// TestDetectHiddenPairReturnsCompleteBoxMove pins the box case, on the two
// highest digits so a scan that stops one digit short never reaches the pattern.
func TestDetectHiddenPairReturnsCompleteBoxMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{8, 9, 7})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{8, 9, 6})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{3, 4})

	assertMove(t, DetectHiddenPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{1, 1}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 7},
			{Row: 1, Col: 1, Digit: 6},
		},
		Explanation: "Hidden Pair {8,9} in box 1 at R1C1 and R2C2",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{1, 1}),
			Secondary: ToCellRefs(BoxIndices[0]),
		},
	})
}

// TestDetectHiddenPairSkipsDigitsInDifferentCellPairs checks the position match:
// three digits each appearing twice, no two of them in the same two cells, close
// no hidden pair.
func TestDetectHiddenPairSkipsDigitsInDifferentCellPairs(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 3})

	if move := DetectHiddenPair(b); move != nil {
		t.Errorf("expected nil when no two digits share a cell pair, got %+v", move)
	}
}

// TestDetectHiddenPairSkipsPairWithNothingToEliminate checks the elimination
// guard: two digits alone in two cells are already a naked pair, so the hidden
// reading adds nothing and no move is returned.
func TestDetectHiddenPairSkipsPairWithNothingToEliminate(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2})

	if move := DetectHiddenPair(b); move != nil {
		t.Errorf("expected nil when the pair eliminates nothing, got %+v", move)
	}
}

// TestSamePositionsRequiresBothPairsToMatch pins the position comparison on its
// own, including the length guards that findHiddenPairInUnit never violates but
// that the function still promises.
func TestSamePositionsRequiresBothPairsToMatch(t *testing.T) {
	cases := []struct {
		name       string
		pos1, pos2 []int
		want       bool
	}{
		{"identical", []int{4, 9}, []int{4, 9}, true},
		{"first differs", []int{4, 9}, []int{5, 9}, false},
		{"second differs", []int{4, 9}, []int{4, 8}, false},
		{"first too short", []int{4}, []int{4, 9}, false},
		{"second too short", []int{4, 9}, []int{4}, false},
		{"first too long", []int{4, 9, 11}, []int{4, 9}, false},
		{"second too long", []int{4, 9}, []int{4, 9, 11}, false},
	}
	for _, c := range cases {
		if got := samePositions(c.pos1, c.pos2); got != c.want {
			t.Errorf("%s: samePositions(%v, %v) = %t, want %t", c.name, c.pos1, c.pos2, got, c.want)
		}
	}
}

// TestDetectHiddenPairScansPastDigitsInOtherCellPairs checks that a digit pair
// whose positions do not match only rejects that pairing: the scan carries on to
// the next digit rather than abandoning the first digit's remaining pairings.
func TestDetectHiddenPairScansPastDigitsInOtherCellPairs(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 3, 7})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 3, 8})
	// Digit 2 also appears exactly twice, but in a different cell pair, so the
	// pairing (1, 2) is tried and rejected before (1, 3) closes.
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 5})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{2, 6})

	assertMove(t, DetectHiddenPair(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{0, 1}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 7},
			{Row: 0, Col: 1, Digit: 8},
		},
		Explanation: "Hidden Pair {1,3} in row 1 at R1C1 and R1C2",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 1}),
			Secondary: ToCellRefs(RowIndices[0]),
		},
	})
}
