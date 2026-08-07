package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// sdcAls builds the ALS shape Sue de Coq's helpers consume: the cells it covers
// and the digits it claims from the intersection.
func sdcAls(cells []int, digits ...int) ALS {
	return ALS{Cells: cells, Digits: digits}
}

// ============================================================================
// cellIndexInList
// ============================================================================

// TestCellIndexInListMatchesOnlyTheListedCells pins the membership test the box
// and line sweeps use to skip cells already spoken for.
func TestCellIndexInListMatchesOnlyTheListedCells(t *testing.T) {
	list := []int{idxOf(0, 0), idxOf(4, 4), idxOf(8, 8)}

	for _, idx := range list {
		if !cellIndexInList(idx, list) {
			t.Errorf("expected %d to be found in %v", idx, list)
		}
	}
	if cellIndexInList(idxOf(4, 5), list) {
		t.Error("expected an unlisted cell not to be found")
	}
	if cellIndexInList(idxOf(0, 0), nil) {
		t.Error("expected nothing to be found in an empty list")
	}
}

// ============================================================================
// Cell-group collection
// ============================================================================

// TestSdcIntersectionCellsTakesUnsolvedCandidateCells pins the intersection
// scan in both orientations: it walks the three cells the box and the line have
// in common, and takes only those still unsolved and still holding candidates.
func TestSdcIntersectionCellsTakesUnsolvedCandidateCells(t *testing.T) {
	b := &testBoard{}
	// Box 4 spans rows 3-5 and columns 3-5.
	b.candidates[idxOf(4, 3)] = NewCandidates([]int{1, 2})
	b.cells[idxOf(4, 4)] = 7 // solved
	b.candidates[idxOf(4, 5)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{5, 6})
	b.candidates[idxOf(5, 4)] = NewCandidates([]int{7, 8})

	gotRow := sdcIntersectionCells(b, 3, 3, 4, true)
	wantRow := []int{idxOf(4, 3), idxOf(4, 5)}
	if !reflect.DeepEqual(gotRow, wantRow) {
		t.Errorf("row intersection = %v, want %v", gotRow, wantRow)
	}

	gotCol := sdcIntersectionCells(b, 3, 3, 4, false)
	wantCol := []int{idxOf(3, 4), idxOf(5, 4)}
	if !reflect.DeepEqual(gotCol, wantCol) {
		t.Errorf("column intersection = %v, want %v", gotCol, wantCol)
	}
}

// TestSdcIntersectionCellsRejectsSolvedAndBareCells pins both halves of the
// intersection scan's guard in both orientations. A solved cell is passed over
// even when its candidates were never cleared, a cell stripped of every
// candidate is no use to the pattern, and a cell down to its last candidate
// still counts.
func TestSdcIntersectionCellsRejectsSolvedAndBareCells(t *testing.T) {
	// Box 4 spans rows 3-5 and columns 3-5. Along row 4, R5C4 is left bare.
	row := &testBoard{}
	row.cells[idxOf(4, 3)] = 7
	row.candidates[idxOf(4, 3)] = NewCandidates([]int{1, 2})
	row.candidates[idxOf(4, 5)] = NewCandidates([]int{9})

	if got, want := sdcIntersectionCells(row, 3, 3, 4, true), []int{idxOf(4, 5)}; !reflect.DeepEqual(got, want) {
		t.Errorf("row intersection = %v, want %v", got, want)
	}

	// The same three shapes down column 4, where R5C5 is the bare one.
	col := &testBoard{}
	col.cells[idxOf(3, 4)] = 7
	col.candidates[idxOf(3, 4)] = NewCandidates([]int{1, 2})
	col.candidates[idxOf(5, 4)] = NewCandidates([]int{9})

	if got, want := sdcIntersectionCells(col, 3, 3, 4, false), []int{idxOf(5, 4)}; !reflect.DeepEqual(got, want) {
		t.Errorf("column intersection = %v, want %v", got, want)
	}
}

// TestSdcBoxRemainderExcludesTheIntersection pins the other half of the box:
// the cells the pattern's box set may be drawn from are those of the box that
// are unsolved, still holding candidates, and not at the intersection.
func TestSdcBoxRemainderExcludesTheIntersection(t *testing.T) {
	b := &testBoard{}
	for _, rc := range [][2]int{{3, 3}, {3, 4}, {4, 3}, {4, 5}, {5, 3}, {5, 5}} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{1, 2})
	}
	// Solved, so not available, even though its candidates were never cleared.
	b.cells[idxOf(5, 4)] = 9
	b.candidates[idxOf(5, 4)] = NewCandidates([]int{1, 2})

	got := sdcBoxRemainder(b, 3, 3, []int{idxOf(4, 3), idxOf(4, 5)})

	want := []int{idxOf(3, 3), idxOf(3, 4), idxOf(5, 3), idxOf(5, 5)}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("box remainder = %v, want %v", got, want)
	}
}

// TestSdcLineRemainderSkipsTheBoxSpan pins the line scan in both orientations:
// it covers the line outside the box only, which is the span the line set's
// eliminations later run over.
func TestSdcLineRemainderSkipsTheBoxSpan(t *testing.T) {
	b := &testBoard{}
	for k := range 9 {
		b.candidates[idxOf(4, k)] = NewCandidates([]int{1, 2})
		b.candidates[idxOf(k, 4)] = NewCandidates([]int{1, 2})
	}
	b.cells[idxOf(4, 0)] = 9 // solved, so not available
	b.cells[idxOf(0, 4)] = 9

	gotRow := sdcLineRemainder(b, 3, 3, 4, true)
	wantRow := []int{idxOf(4, 1), idxOf(4, 2), idxOf(4, 6), idxOf(4, 7), idxOf(4, 8)}
	if !reflect.DeepEqual(gotRow, wantRow) {
		t.Errorf("row remainder = %v, want %v", gotRow, wantRow)
	}

	gotCol := sdcLineRemainder(b, 3, 3, 4, false)
	wantCol := []int{idxOf(1, 4), idxOf(2, 4), idxOf(6, 4), idxOf(7, 4), idxOf(8, 4)}
	if !reflect.DeepEqual(gotCol, wantCol) {
		t.Errorf("column remainder = %v, want %v", gotCol, wantCol)
	}
}

// TestSdcLineScansSkipTheBoxRowSpanForAColumn pins which stretch of the line the
// two column-orientation scans step over. Box 4's row and column origins are
// both 3, so a column scan reading the wrong one is invisible there; box 3 spans
// rows 3-5 and columns 0-2, where the two differ.
func TestSdcLineScansSkipTheBoxRowSpanForAColumn(t *testing.T) {
	b := &testBoard{}
	for k := range 9 {
		b.candidates[idxOf(k, 1)] = NewCandidates([]int{3, 9})
	}

	gotRemainder := sdcLineRemainder(b, 3, 0, 1, false)
	wantRemainder := []int{idxOf(0, 1), idxOf(1, 1), idxOf(2, 1), idxOf(6, 1), idxOf(7, 1), idxOf(8, 1)}
	if !reflect.DeepEqual(gotRemainder, wantRemainder) {
		t.Errorf("column remainder = %v, want %v", gotRemainder, wantRemainder)
	}

	gotElims := sdcLineEliminations(b, 3, 0, 1, false, sdcAls([]int{idxOf(0, 1)}, 3))
	wantElims := []core.Candidate{
		{Row: 1, Col: 1, Digit: 3},
		{Row: 2, Col: 1, Digit: 3},
		{Row: 6, Col: 1, Digit: 3},
		{Row: 7, Col: 1, Digit: 3},
		{Row: 8, Col: 1, Digit: 3},
	}
	if !reflect.DeepEqual(gotElims, wantElims) {
		t.Errorf("column eliminations = %+v, want %+v", gotElims, wantElims)
	}
}

// ============================================================================
// Almost locked sets
// ============================================================================

// TestAlsFromCellsRequiresTheSizeAndAnOverlap pins both conditions a candidate
// set must meet: N cells holding exactly N+1 digits, and at least one digit in
// common with the intersection. The returned Digits are the overlap alone, not
// the set's whole candidate list.
func TestAlsFromCellsRequiresTheSizeAndAnOverlap(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{7, 8})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 2, 3})

	got := alsFromCells(b, []int{idxOf(0, 0)}, NewCandidates([]int{2, 5}))
	want := []ALS{{
		Cells:   []int{idxOf(0, 0)},
		Digits:  []int{2},
		ByDigit: map[int][]int{1: {idxOf(0, 0)}, 2: {idxOf(0, 0)}},
	}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("single-cell set = %+v, want %+v", got, want)
	}

	if got := alsFromCells(b, []int{idxOf(0, 0), idxOf(0, 1)}, NewCandidates([]int{2})); len(got) != 1 {
		t.Errorf("expected two cells holding three digits to form a set, got %+v", got)
	}
	if got := alsFromCells(b, []int{idxOf(0, 0), idxOf(0, 2)}, NewCandidates([]int{2})); got != nil {
		t.Errorf("expected no set when two cells hold four digits between them, got %+v", got)
	}
	if got := alsFromCells(b, []int{idxOf(0, 2)}, NewCandidates([]int{2, 5})); got != nil {
		t.Errorf("expected no set when nothing overlaps the intersection, got %+v", got)
	}
}

// TestFindALSInCellsEnumeratesEverySizeUpToThree pins the search's breadth: it
// offers single cells, pairs and triples, in that order, and reports only those
// meeting the set property.
func TestFindALSInCellsEnumeratesEverySizeUpToThree(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{3, 4})

	got := findALSInCells(b, []int{idxOf(0, 0), idxOf(0, 1), idxOf(0, 2)}, []int{2})

	var sizes []int
	for _, als := range got {
		sizes = append(sizes, len(als.Cells))
	}
	// Two single cells (the third holds nothing the intersection wants), both
	// adjacent pairs, and the triple. The pair skipped is R1C1 with R1C3, which
	// holds four digits between two cells and so is no set at all.
	want := []int{1, 1, 2, 2, 3}
	if !reflect.DeepEqual(sizes, want) {
		t.Errorf("set sizes = %v, want %v (sets: %+v)", sizes, want, got)
	}
}

// TestFindALSInCellsNeverPairsACellWithItself pins where the pair enumeration
// starts. A cell holding three candidates is no set on its own, but taken twice
// it would pass for two cells holding three digits between them.
func TestFindALSInCellsNeverPairsACellWithItself(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{4, 5})

	got := findALSInCells(b, []int{idxOf(0, 0), idxOf(0, 1)}, []int{1, 4})

	want := []ALS{{
		Cells:   []int{idxOf(0, 1)},
		Digits:  []int{4},
		ByDigit: map[int][]int{4: {idxOf(0, 1)}, 5: {idxOf(0, 1)}},
	}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("sets = %+v, want %+v", got, want)
	}
}

// TestDigitsOverlapReportsAnySharedDigit pins the overlap test used to decide
// whether two sets can take part in the same pattern.
func TestDigitsOverlapReportsAnySharedDigit(t *testing.T) {
	if !digitsOverlap([]int{1, 2, 3}, []int{3, 9}) {
		t.Error("expected slices sharing 3 to overlap")
	}
	if digitsOverlap([]int{1, 2, 3}, []int{4, 5}) {
		t.Error("expected disjoint slices not to overlap")
	}
	if digitsOverlap([]int{1, 2}, nil) {
		t.Error("expected nothing to overlap an empty slice")
	}
}

// ============================================================================
// Highlights and eliminations
// ============================================================================

// TestSdcHighlightsSeparatesTheIntersectionFromTheSets pins which cells go
// where: targets carry the intersection followed by both sets, primary carries
// the intersection alone, and secondary the two sets in box-then-line order.
func TestSdcHighlightsSeparatesTheIntersectionFromTheSets(t *testing.T) {
	targets, primary, secondary := sdcHighlights(
		[]int{idxOf(4, 3), idxOf(4, 4)},
		sdcAls([]int{idxOf(3, 3)}, 1),
		sdcAls([]int{idxOf(4, 7), idxOf(4, 8)}, 2),
	)

	wantTargets := refs([2]int{4, 3}, [2]int{4, 4}, [2]int{3, 3}, [2]int{4, 7}, [2]int{4, 8})
	if !reflect.DeepEqual(targets, wantTargets) {
		t.Errorf("targets = %+v, want %+v", targets, wantTargets)
	}
	if want := refs([2]int{4, 3}, [2]int{4, 4}); !reflect.DeepEqual(primary, want) {
		t.Errorf("primary = %+v, want %+v", primary, want)
	}
	if want := refs([2]int{3, 3}, [2]int{4, 7}, [2]int{4, 8}); !reflect.DeepEqual(secondary, want) {
		t.Errorf("secondary = %+v, want %+v", secondary, want)
	}
}

// TestSdcBoxEliminationsSkipsTheIntersectionAndTheSet pins the box sweep: the
// set's digits leave every other cell of the box, but not the intersection
// cells and not the set's own cells. A solved cell partway along a row is
// stepped over rather than ending the row, and the sweep stops at the box's
// edge, so the cells just beyond it keep their candidates.
func TestSdcBoxEliminationsSkipsTheIntersectionAndTheSet(t *testing.T) {
	b := &testBoard{}
	for r := 3; r < 6; r++ {
		for c := 3; c < 6; c++ {
			b.candidates[idxOf(r, c)] = NewCandidates([]int{1, 2, 9})
		}
	}
	b.cells[idxOf(5, 3)] = 8 // solved, with two eliminable cells still to its right
	for _, rc := range [][2]int{{3, 6}, {4, 6}, {5, 6}, {6, 3}, {6, 4}, {6, 5}} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{1, 2}) // just outside the box
	}

	got := sdcBoxEliminations(b, 3, 3,
		[]int{idxOf(4, 3), idxOf(4, 4)},
		sdcAls([]int{idxOf(3, 3)}, 1, 2))

	want := []core.Candidate{
		{Row: 3, Col: 4, Digit: 1}, {Row: 3, Col: 4, Digit: 2},
		{Row: 3, Col: 5, Digit: 1}, {Row: 3, Col: 5, Digit: 2},
		{Row: 4, Col: 5, Digit: 1}, {Row: 4, Col: 5, Digit: 2},
		{Row: 5, Col: 4, Digit: 1}, {Row: 5, Col: 4, Digit: 2},
		{Row: 5, Col: 5, Digit: 1}, {Row: 5, Col: 5, Digit: 2},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("box eliminations = %+v, want %+v", got, want)
	}
}

// TestSdcLineEliminationsWalkTheLineOutsideTheBox pins the line sweep in both
// orientations: it covers the line beyond the box's span, skips the set's own
// cells and reports coordinates the right way round for each orientation.
func TestSdcLineEliminationsWalkTheLineOutsideTheBox(t *testing.T) {
	b := &testBoard{}
	for k := range 9 {
		b.candidates[idxOf(4, k)] = NewCandidates([]int{3, 9})
		b.candidates[idxOf(k, 4)] = NewCandidates([]int{3, 9})
	}
	b.cells[idxOf(4, 1)] = 7
	b.cells[idxOf(1, 4)] = 7

	gotRow := sdcLineEliminations(b, 3, 3, 4, true, sdcAls([]int{idxOf(4, 0)}, 3))
	wantRow := []core.Candidate{
		{Row: 4, Col: 2, Digit: 3},
		{Row: 4, Col: 6, Digit: 3},
		{Row: 4, Col: 7, Digit: 3},
		{Row: 4, Col: 8, Digit: 3},
	}
	if !reflect.DeepEqual(gotRow, wantRow) {
		t.Errorf("row eliminations = %+v, want %+v", gotRow, wantRow)
	}

	gotCol := sdcLineEliminations(b, 3, 3, 4, false, sdcAls([]int{idxOf(0, 4)}, 3))
	wantCol := []core.Candidate{
		{Row: 2, Col: 4, Digit: 3},
		{Row: 6, Col: 4, Digit: 3},
		{Row: 7, Col: 4, Digit: 3},
		{Row: 8, Col: 4, Digit: 3},
	}
	if !reflect.DeepEqual(gotCol, wantCol) {
		t.Errorf("column eliminations = %+v, want %+v", gotCol, wantCol)
	}
}

// TestCollectSDCEliminationsJoinsBoxThenLine pins the order the two sweeps are
// concatenated in, which is the order the move reports them.
func TestCollectSDCEliminationsJoinsBoxThenLine(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(3, 3)] = NewCandidates([]int{1, 9})
	b.candidates[idxOf(4, 8)] = NewCandidates([]int{2, 9})

	got := collectSDCEliminations(b, 3, 3, 4, true,
		[]int{idxOf(4, 3), idxOf(4, 4)},
		sdcAls([]int{idxOf(5, 5)}, 1),
		sdcAls([]int{idxOf(4, 0)}, 2))

	want := []core.Candidate{
		{Row: 3, Col: 3, Digit: 1},
		{Row: 4, Col: 8, Digit: 2},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("eliminations = %+v, want %+v", got, want)
	}
}

// ============================================================================
// Move assembly
// ============================================================================

// TestBuildSDCMoveNamesBothSetsAndTheLine pins the whole move, which is where
// the box number, the line's kind and number, the intersection digits and both
// sets' cells and digits all reach the explanation.
func TestBuildSDCMoveNamesBothSetsAndTheLine(t *testing.T) {
	elims := []core.Candidate{{Row: 3, Col: 3, Digit: 1}}

	assertMove(t, buildSDCMove(4, 4, true,
		[]int{idxOf(4, 3), idxOf(4, 4)}, []int{1, 2, 3},
		sdcAls([]int{idxOf(5, 5)}, 1, 2),
		sdcAls([]int{idxOf(4, 0)}, 3),
		elims), &core.Move{
		Action:       "eliminate",
		Targets:      refs([2]int{4, 3}, [2]int{4, 4}, [2]int{5, 5}, [2]int{4, 0}),
		Eliminations: elims,
		Explanation: "Sue de Coq: intersection of box 5 and row 5 with candidates {1, 2, 3}; " +
			"box ALS {R6C6} covers {1, 2}, row ALS {R5C1} covers {3}",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 3}, [2]int{4, 4}),
			Secondary: refs([2]int{5, 5}, [2]int{4, 0}),
		},
	})
}

// TestBuildSDCMoveNamesAColumnLine is the other orientation, where the same
// noun appears twice in the explanation and both must change together.
func TestBuildSDCMoveNamesAColumnLine(t *testing.T) {
	elims := []core.Candidate{{Row: 3, Col: 3, Digit: 1}}

	move := buildSDCMove(4, 4, false,
		[]int{idxOf(3, 4), idxOf(4, 4)}, []int{1, 2, 3},
		sdcAls([]int{idxOf(5, 5)}, 1, 2),
		sdcAls([]int{idxOf(0, 4)}, 3),
		elims)

	want := "Sue de Coq: intersection of box 5 and column 5 with candidates {1, 2, 3}; " +
		"box ALS {R6C6} covers {1, 2}, column ALS {R1C5} covers {3}"
	if move.Explanation != want {
		t.Errorf("Explanation = %q, want %q", move.Explanation, want)
	}
}

// ============================================================================
// Pair validation
// ============================================================================

// sdcPairBoard supplies everything a Sue de Coq needs around the box 5 / row 4
// intersection at R5C7 and R5C8: a box cell and a line cell each holding a digit
// an accepted pair would strip. Box 5 spans rows 3-5 and columns 6-8, so its row
// origin (3) and column origin (6) differ and neither can stand in for the other.
func sdcPairBoard() *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(4, 6)] = NewCandidates([]int{1, 2}) // intersection
	b.candidates[idxOf(4, 7)] = NewCandidates([]int{2, 3}) // intersection
	b.candidates[idxOf(3, 6)] = NewCandidates([]int{1, 2}) // box set
	b.candidates[idxOf(3, 7)] = NewCandidates([]int{1, 8}) // box elimination target
	b.candidates[idxOf(4, 0)] = NewCandidates([]int{3, 9}) // line set
	b.candidates[idxOf(4, 2)] = NewCandidates([]int{3, 7}) // line elimination target
	return b
}

var (
	sdcPairCells  = []int{idxOf(4, 6), idxOf(4, 7)}
	sdcPairDigits = []int{1, 2, 3}
	sdcPairCands  = NewCandidates(sdcPairDigits)
)

// TestTrySDCPairBuildsTheMoveFromTheBoxOrigin pins the whole move an accepted
// pair produces, and with it the box origin both elimination sweeps are
// anchored to.
func TestTrySDCPairBuildsTheMoveFromTheBoxOrigin(t *testing.T) {
	got := trySDCPair(sdcPairBoard(), 5, 4, true, sdcPairCells, sdcPairDigits, sdcPairCands,
		sdcAls([]int{idxOf(3, 6)}, 1, 2), sdcAls([]int{idxOf(4, 0)}, 3))

	assertMove(t, got, &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{4, 6}, [2]int{4, 7}, [2]int{3, 6}, [2]int{4, 0}),
		Eliminations: []core.Candidate{
			{Row: 3, Col: 7, Digit: 1},
			{Row: 4, Col: 2, Digit: 3},
		},
		Explanation: "Sue de Coq: intersection of box 6 and row 5 with candidates {1, 2, 3}; " +
			"box ALS {R4C7} covers {1, 2}, row ALS {R5C1} covers {3}",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 6}, [2]int{4, 7}),
			Secondary: refs([2]int{3, 6}, [2]int{4, 0}),
		},
	})
}

// TestTrySDCPairRefusesSetsSharingADigit pins the disjointness requirement: two
// sets that between them cover the intersection are still no pattern while a
// digit could fall to either of them.
func TestTrySDCPairRefusesSetsSharingADigit(t *testing.T) {
	got := trySDCPair(sdcPairBoard(), 5, 4, true, sdcPairCells, sdcPairDigits, sdcPairCands,
		sdcAls([]int{idxOf(3, 6)}, 1, 2), sdcAls([]int{idxOf(4, 0)}, 2, 3))

	if got != nil {
		t.Errorf("expected nil: both sets claim 2, got %+v", got)
	}
}

// TestTrySDCPairRefusesSetsThatMissADigit pins the coverage requirement: two
// disjoint sets are still no pattern while an intersection digit belongs to
// neither of them.
func TestTrySDCPairRefusesSetsThatMissADigit(t *testing.T) {
	got := trySDCPair(sdcPairBoard(), 5, 4, true, sdcPairCells, sdcPairDigits, sdcPairCands,
		sdcAls([]int{idxOf(3, 6)}, 1), sdcAls([]int{idxOf(4, 0)}, 3))

	if got != nil {
		t.Errorf("expected nil: nothing claims 2, got %+v", got)
	}
}

// ============================================================================
// Intersection guards
// ============================================================================

// sdcGuardBoard supplies everything around a box 4 / row 4 intersection that a
// Sue de Coq needs: a box set covering {1,2}, a line set covering {3}, and a
// cell in each of the box and the line holding a digit the pair would strip.
// The intersection itself is left to the caller, so its guards are the only
// thing that can refuse.
func sdcGuardBoard() *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(3, 3)] = NewCandidates([]int{1, 2}) // box set
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{1, 8}) // box elimination target
	b.candidates[idxOf(4, 0)] = NewCandidates([]int{3, 9}) // line set
	b.candidates[idxOf(4, 6)] = NewCandidates([]int{3, 7}) // line elimination target
	return b
}

// TestDetectSueDeCoqIntersectionRefusesASingleIntersectionCell pins the lower
// bound on the intersection. One cell cannot be divided between two sets, so the
// pattern is refused even though a disjoint, covering, eliminating pair is
// waiting in the box and the line.
func TestDetectSueDeCoqIntersectionRefusesASingleIntersectionCell(t *testing.T) {
	b := sdcGuardBoard()
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{1, 2, 3})

	if got := detectSueDeCoqIntersection(b, 4, 4, true); got != nil {
		t.Errorf("expected nil on a one-cell intersection, got %+v", got)
	}
}

// TestDetectSueDeCoqIntersectionRefusesTooFewIntersectionDigits pins the digit
// bound. Two cells need four candidates between them for two sets to divide;
// three leaves one set covering a single digit the other cell already holds, so
// the pattern is refused even though such a pair is waiting.
func TestDetectSueDeCoqIntersectionRefusesTooFewIntersectionDigits(t *testing.T) {
	b := sdcGuardBoard()
	b.candidates[idxOf(4, 3)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{2, 3})

	if got := detectSueDeCoqIntersection(b, 4, 4, true); got != nil {
		t.Errorf("expected nil on a two-cell intersection spanning three digits, got %+v", got)
	}
}

// ============================================================================
// Whole detector
// ============================================================================

// TestDetectSueDeCoqReportsTheRowPatternBehindNearMisses drives the whole
// detector to a row pattern in box 4, which the scan reaches only after stepping
// over intersections in box 3 and in box 4's own first row that span too few
// digits to divide, and over three pairings that leave an intersection digit
// uncovered. Box 4's row origin is 3, so a scan starting its rows anywhere else
// misses the pattern entirely.
func TestDetectSueDeCoqReportsTheRowPatternBehindNearMisses(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(4, 3)] = NewCandidates([]int{1, 2}) // intersection
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{3, 4}) // intersection
	b.candidates[idxOf(4, 5)] = NewCandidates([]int{1, 5}) // intersection
	b.candidates[idxOf(3, 3)] = NewCandidates([]int{1, 2}) // box set
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{1, 7}) // box elimination target
	b.candidates[idxOf(4, 0)] = NewCandidates([]int{3, 4}) // line set
	b.candidates[idxOf(4, 1)] = NewCandidates([]int{4, 5}) // line set
	b.candidates[idxOf(4, 6)] = NewCandidates([]int{3, 8}) // line elimination target

	assertMove(t, DetectSueDeCoq(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}, [2]int{3, 3}, [2]int{4, 0}, [2]int{4, 1}),
		Eliminations: []core.Candidate{
			{Row: 3, Col: 4, Digit: 1},
			{Row: 4, Col: 6, Digit: 3},
		},
		Explanation: "Sue de Coq: intersection of box 5 and row 5 with candidates {1, 2, 3, 4, 5}; " +
			"box ALS {R4C4} covers {1, 2}, row ALS {R5C1, R5C2} covers {3, 4, 5}",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}),
			Secondary: refs([2]int{3, 3}, [2]int{4, 0}, [2]int{4, 1}),
		},
	})
}

// TestDetectSueDeCoqReportsTheColumnPatternBehindNearMisses is the other
// orientation, reached only after every row of every box has been tried and
// found wanting, and after box 4's own first column. Box 4's column origin is 3,
// so a scan starting its columns anywhere else misses the pattern entirely.
func TestDetectSueDeCoqReportsTheColumnPatternBehindNearMisses(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{1, 2}) // intersection
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{3, 4}) // intersection
	b.candidates[idxOf(5, 4)] = NewCandidates([]int{1, 5}) // intersection
	b.candidates[idxOf(3, 3)] = NewCandidates([]int{1, 2}) // box set
	b.candidates[idxOf(3, 5)] = NewCandidates([]int{1, 7}) // box elimination target
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{3, 4}) // line set
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{4, 5}) // line set
	b.candidates[idxOf(6, 4)] = NewCandidates([]int{3, 8}) // line elimination target

	assertMove(t, DetectSueDeCoq(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{3, 4}, [2]int{4, 4}, [2]int{5, 4}, [2]int{3, 3}, [2]int{0, 4}, [2]int{1, 4}),
		Eliminations: []core.Candidate{
			{Row: 3, Col: 5, Digit: 1},
			{Row: 6, Col: 4, Digit: 3},
		},
		Explanation: "Sue de Coq: intersection of box 5 and column 5 with candidates {1, 2, 3, 4, 5}; " +
			"box ALS {R4C4} covers {1, 2}, column ALS {R1C5, R2C5} covers {3, 4, 5}",
		Highlights: core.Highlights{
			Primary:   refs([2]int{3, 4}, [2]int{4, 4}, [2]int{5, 4}),
			Secondary: refs([2]int{3, 3}, [2]int{0, 4}, [2]int{1, 4}),
		},
	})
}
