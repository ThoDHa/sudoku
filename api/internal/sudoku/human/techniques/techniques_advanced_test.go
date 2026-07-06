package techniques

import (
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// overrideBoard wraps boardFromMap for the advanced-detector tests: empty cells
// start with all candidates, then the per-cell overrides are applied, so each
// test sculpts exactly the candidate geometry its technique requires.
func overrideBoard(overrides map[int][]int) *testBoard {
	var cells [constants.TotalCells]int
	return boardFromMap(cells, overrides)
}

// TestDetectXYWingEliminatesCommonCandidateOfTwoWings covers the XY-Wing
// detector: a bivalue pivot {x,y} with two bivalue wings {x,z} and {y,z} that
// both see the pivot eliminates z from any cell seeing both wings.
func TestDetectXYWingEliminatesCommonCandidateOfTwoWings(t *testing.T) {
	// Pivot R1C1 {1,2}; XZ-wing R1C2 {1,3} (sees pivot in row 1);
	// YZ-wing R2C1 {2,3} (sees pivot in column 1). R2C2 sees both wings
	// (column 2 and row 2) and carries candidate 3, so 3 is eliminated there.
	board := overrideBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {1, 3},
		idxOf(1, 0): {2, 3},
	})

	move := DetectXYWing(board)
	if move == nil {
		t.Fatal("expected XY-Wing to fire on a valid pivot+wings geometry")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if move.Digit != 3 {
		t.Errorf("expected eliminated digit 3, got %d", move.Digit)
	}
	if len(move.Eliminations) == 0 {
		t.Error("expected at least one elimination from the XY-Wing")
	}
	for _, e := range move.Eliminations {
		if e.Digit != 3 {
			t.Errorf("elimination digit must be 3, got %d", e.Digit)
		}
	}
}

// TestDetectXYZWingEliminatesCommonCandidateOfPivotAndWings covers the XYZ-Wing
// detector: a trivalue pivot {X,Y,Z} with two bivalue wings {X,Z} and {Y,Z}
// that both see the pivot eliminates Z from any cell seeing all three.
func TestDetectXYZWingEliminatesCommonCandidateOfPivotAndWings(t *testing.T) {
	// Pivot R1C1 {1,2,3}; XZ-wing R1C2 {1,3} (sees pivot in row 1);
	// YZ-wing R2C1 {2,3} (sees pivot in column 1). R2C2 sees all three
	// (box 0, column 2, row 2) and carries candidate 3, so 3 is eliminated.
	board := overrideBoard(map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(0, 1): {1, 3},
		idxOf(1, 0): {2, 3},
	})

	move := DetectXYZWing(board)
	if move == nil {
		t.Fatal("expected XYZ-Wing to fire on a valid pivot+wings geometry")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if move.Digit != 3 {
		t.Errorf("expected eliminated digit 3, got %d", move.Digit)
	}
	if len(move.Eliminations) == 0 {
		t.Error("expected at least one elimination from the XYZ-Wing")
	}
}

// TestFindAllALSIncludesCrossRowBoxSpanningALS kills box-unit mutants in
// FindAllALS: two bivalue cells at (0,0) and (1,1) share only box 0 (they sit
// in different rows and different columns), so the size-2 ALS {0, 10} is
// discoverable solely via the box-unit scan.
func TestFindAllALSIncludesCrossRowBoxSpanningALS(t *testing.T) {
	b := &testBoard{}
	b.candidates[0] = NewCandidates([]int{1, 2})  // (0,0)
	b.candidates[10] = NewCandidates([]int{1, 3}) // (1,1)

	als := FindAllALS(b, 4)

	found := false
	for _, a := range als {
		if len(a.Cells) == 2 && a.Cells[0] == 0 && a.Cells[1] == 10 {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected size-2 ALS spanning (0,0)+(1,1), found only via box unit; got %d ALS", len(als))
	}
}

// TestFindAllALSIncludesSizeOneBivalueALS kills the size-loop start mutant in
// FindAllALS: a single bivalue cell is a valid size-1 ALS (1 cell, 2 candidates)
// and must appear in the result. Skipping size=1 drops it entirely.
func TestFindAllALSIncludesSizeOneBivalueALS(t *testing.T) {
	b := &testBoard{}
	b.candidates[0] = NewCandidates([]int{1, 2}) // (0,0) bivalue -> size-1 ALS

	als := FindAllALS(b, 4)

	found := false
	for _, a := range als {
		if len(a.Cells) == 1 && a.Cells[0] == 0 {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a size-1 ALS at bivalue cell 0; got %d ALS", len(als))
	}
}

// TestAnalyzeCycleFixedDetectsDiscontinuityAtNodeZero drives analyzeCycleFixed
// directly with a hand-built 5-node cycle whose only discontinuity is a Type 1
// (two strong links meet) at node 0. The original returns an assign at path[0];
// the loop-control and linkIn-index mutants either skip node 0 entirely or
// scramble which node is reported, diverging on the target cell.
func TestAnalyzeCycleFixedDetectsDiscontinuityAtNodeZero(t *testing.T) {
	b := &testBoard{}
	// Only the 5 path cells carry the digit; no external cell can be eliminated
	// by the nice-loop fallback, so mutants that skip the discontinuity fall
	// through to nil instead of an assign.
	for _, idx := range []int{0, 1, 2, 3, 4} {
		b.candidates[idx] = b.candidates[idx].Set(5)
	}

	// linkStrong[i] describes the link from path[i] to path[(i+1)%n].
	// Pattern [T,F,T,F,T] yields exactly one discontinuity: node 0, where both
	// the incoming (linkStrong[4]=T) and outgoing (linkStrong[0]=T) links are
	// strong -> Type 1 assign at path[0].
	path := []int{0, 1, 2, 3, 4}
	linkStrong := []bool{true, false, true, false, true}

	move := analyzeCycleFixed(b, 5, path, linkStrong)
	if move == nil {
		t.Fatal("expected Type 1 assign at node 0 of the cycle")
	}
	if move.Action != "assign" {
		t.Errorf("expected action 'assign', got %q", move.Action)
	}
	if len(move.Targets) != 1 || move.Targets[0] != (core.CellRef{Row: 0, Col: 0}) {
		t.Errorf("expected assign at R1C1 (path[0]), got %+v", move.Targets)
	}
}

// TestDetectEmptyRectangleFiresViaRowConjugateAtColumnZero kills the
// digitPositionsInLine start-index mutant: the Empty Rectangle conjugate pair
// lives in row 4 at columns {0, 5}, so the column-0 position (k=0) is the
// confined anchor. Dropping k=0 leaves a length-1 positions slice, no
// conjugate link is found, and the elimination vanishes. A third digit cell at
// (7,5) breaks the symmetric column-5 conjugate so the column strategy cannot
// mask the row-strategy mutation.
func TestDetectEmptyRectangleFiresViaRowConjugateAtColumnZero(t *testing.T) {
	b := &testBoard{}
	// digit 5 lives only at: ER box-0 cells (1,2)(2,0), row-4 conjugate
	// (4,0)(4,5), elimination target (1,5), and symmetry-breaker (7,5).
	for _, idx := range []int{11, 18, 36, 41, 14, 68} {
		b.candidates[idx] = b.candidates[idx].Set(5)
	}

	move := DetectEmptyRectangle(b)
	if move == nil {
		t.Fatal("expected Empty Rectangle elimination via row conjugate at column 0")
	}
	if move.Digit != 5 {
		t.Errorf("expected eliminated digit 5, got %d", move.Digit)
	}
	var hitTarget bool
	for _, e := range move.Eliminations {
		if e.Row == 1 && e.Col == 5 && e.Digit == 5 {
			hitTarget = true
		}
	}
	if !hitTarget {
		t.Errorf("expected an elimination at R2C6, got %+v", move.Eliminations)
	}
}

// TestDetectUniqueRectangleType4NilWhenNeitherDigitConfined kills the
// d2Confined short-circuit mutant in tryURType4LineElimination. The roof cells
// share row 1 where neither d1=1 nor d2=2 is confined (each appears at another
// row-1 cell), so no Type 4 elimination should fire. The mutant rewrites the
// second branch to `true && !d1Confined`, which builds a spurious move.
func TestDetectUniqueRectangleType4NilWhenNeitherDigitConfined(t *testing.T) {
	b := &testBoard{}
	b.candidates[0] = NewCandidates([]int{1, 2})     // floor (0,0)
	b.candidates[3] = NewCandidates([]int{1, 2})     // floor (0,3)
	b.candidates[9] = NewCandidates([]int{1, 2, 3})  // roof  (1,0)
	b.candidates[12] = NewCandidates([]int{1, 2, 3}) // roof  (1,3)
	b.candidates[10] = NewCandidates([]int{1, 4})    // row-1 leak of d1
	b.candidates[11] = NewCandidates([]int{2, 5})    // row-1 leak of d2

	if move := DetectUniqueRectangleType4(b); move != nil {
		t.Errorf("expected nil (neither digit confined to UR roof cells), got %+v", move)
	}
}

// TestCheckChainEliminationSkipsRCDigit kills the four isRC-skip mutants in
// checkChainElimination. The chain's only common digit z=3 between the first
// and last ALS is also listed in rcUsed, so it must be skipped and the function
// must return nil. Mutants that drop the isRC flag (or the skip continue)
// process z=3 and produce a spurious elimination at (0,2), which sees the 3 in
// both end ALSes.
func TestCheckChainEliminationSkipsRCDigit(t *testing.T) {
	b := &testBoard{}
	b.candidates[0] = NewCandidates([]int{1, 3}) // first ALS (0,0)
	b.candidates[9] = NewCandidates([]int{7, 8}) // middle ALS (1,0)
	b.candidates[4] = NewCandidates([]int{3, 5}) // last ALS (0,4)
	b.candidates[2] = NewCandidates([]int{3, 6}) // peer of both 3-cells in row 0

	allALS := []ALS{
		{Cells: []int{0}, Digits: []int{1, 3}, ByDigit: map[int][]int{1: {0}, 3: {0}}},
		{Cells: []int{9}, Digits: []int{7, 8}, ByDigit: map[int][]int{7: {9}, 8: {9}}},
		{Cells: []int{4}, Digits: []int{3, 5}, ByDigit: map[int][]int{3: {4}, 5: {4}}},
	}
	path := []int{0, 1, 2}
	rcUsed := []int{3} // z=3 is a restricted common along the chain

	if move := checkChainElimination(b, allALS, path, rcUsed); move != nil {
		t.Errorf("expected nil because common digit 3 is an RC and must be skipped, got %+v", move)
	}
}
