package techniques

import "testing"

// urRectangleCorners returns a testBoard whose four cells (0,0),(0,3),(1,0),(1,3)
// form a Unique Rectangle for digits 1/2 across boxes 0 and 1. Callers supply the
// exact candidate set of each corner to sculpt the specific UR type under test.
func urRectangleCorners(c00, c03, c10, c13 []int) *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates(c00)
	b.candidates[idxOf(0, 3)] = NewCandidates(c03)
	b.candidates[idxOf(1, 0)] = NewCandidates(c10)
	b.candidates[idxOf(1, 3)] = NewCandidates(c13)
	return b
}

// TestURType2AsymmetricRoofReturnsNil exercises the roof-extra guard in
// DetectUniqueRectangleType2 for the asymmetric case: one roof corner carries an
// extra candidate while the other stays bivalue. The floor pair is bivalue, so
// the detector evaluates the second operand of the roof-count guard and skips the
// pair (no matching single extra shared by both roofs), producing no move.
func TestURType2AsymmetricRoofReturnsNil(t *testing.T) {
	// Roof corner (1,0) has extra 3; roof corner (1,3) is bivalue {1,2}.
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2})

	if move := DetectUniqueRectangleType2(b); move != nil {
		t.Errorf("expected nil (roofs lack a shared single extra), got %+v", move)
	}
}

// TestURType3BivalueRoofReturnsNil exercises the roof-extra guard in
// DetectUniqueRectangleType3 for the case where the first roof corner is bivalue.
// The detector evaluates the second operand of the AND guard, finds only a single
// combined extra (too few for a naked pair or triple), and produces no move.
func TestURType3BivalueRoofReturnsNil(t *testing.T) {
	// Roof corner (1,0) bivalue {1,2}; roof corner (1,3) carries extra 3.
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2}, []int{1, 2, 3})

	if move := DetectUniqueRectangleType3(b); move != nil {
		t.Errorf("expected nil (single combined extra cannot form a subset), got %+v", move)
	}
}

// TestURType3AllBivalueDeadlyPatternReturnsNil exercises the guard that skips a
// rectangle whose roof corners are both bivalue: a bare {1,2} deadly pattern
// carries no extras to form a pseudo-cell, so no Type 3 elimination is produced.
func TestURType3AllBivalueDeadlyPatternReturnsNil(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2}, []int{1, 2})

	if move := DetectUniqueRectangleType3(b); move != nil {
		t.Errorf("expected nil (bare deadly rectangle has no extras), got %+v", move)
	}
}

// TestURType3NakedTripleEliminates covers the naked-triple branch of
// DetectUniqueRectangleType3. The two roof corners in row 1 form a pseudo-cell
// whose combined extras {3,4,5} make a naked triple with two other row-1 cells
// ({3,4} and {4,5}), so 3/4/5 are eliminated from the remaining row-1 cells.
func TestURType3NakedTripleEliminates(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	// Two naked-triple partners in row 1 (candidates subset of {3,4,5}).
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{4, 5})
	// Elimination target in row 1: holds 3 and 5 (both in the triple) plus 6.
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 5, 6})
	// A solved cell in row 1 must be skipped by the elimination scan.
	b.cells[idxOf(1, 5)] = 7

	move := DetectUniqueRectangleType3(b)
	if move == nil {
		t.Fatal("expected UR Type 3 naked triple to fire")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	var elim3, elim5 bool
	for _, e := range move.Eliminations {
		if e.Row == 1 && e.Col == 4 && e.Digit == 3 {
			elim3 = true
		}
		if e.Row == 1 && e.Col == 4 && e.Digit == 5 {
			elim5 = true
		}
	}
	if !elim3 || !elim5 {
		t.Errorf("expected 3 and 5 eliminated at R2C5, got %+v", move.Eliminations)
	}
}

// TestURType4BivalueRoofReturnsNil exercises the roof-extra guard in
// DetectUniqueRectangleType4: a bivalue roof corner makes the pair ineligible, so
// the guard's continue branch runs for every pair and no move is produced.
func TestURType4BivalueRoofReturnsNil(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2}, []int{1, 2, 3})

	if move := DetectUniqueRectangleType4(b); move != nil {
		t.Errorf("expected nil (a roof corner is bivalue), got %+v", move)
	}
}

// TestURType4RowConfinedEliminatesOtherDigit covers the row-shared branch of
// DetectUniqueRectangleType4 together with the "d1 confined" case of
// tryURType4LineElimination. The roof corners share row 1; digit 1 is confined to
// the UR cells within that row while digit 2 leaks to another row-1 cell, so
// digit 2 is eliminated from both roof corners.
func TestURType4RowConfinedEliminatesOtherDigit(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 3})
	// Row-1 leak of digit 2 only (no digit 1), so d1 stays confined, d2 does not.
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{2, 7})

	move := DetectUniqueRectangleType4(b)
	if move == nil {
		t.Fatal("expected UR Type 4 (row-confined) to fire")
	}
	if move.Digit != 2 {
		t.Errorf("expected eliminated digit 2 (the non-confined digit), got %d", move.Digit)
	}
	var atRoof0, atRoof1 bool
	for _, e := range move.Eliminations {
		if e.Row == 1 && e.Col == 0 && e.Digit == 2 {
			atRoof0 = true
		}
		if e.Row == 1 && e.Col == 3 && e.Digit == 2 {
			atRoof1 = true
		}
	}
	if !atRoof0 || !atRoof1 {
		t.Errorf("expected 2 eliminated from both roof corners, got %+v", move.Eliminations)
	}
}
