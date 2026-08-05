package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// refs turns (row, col) pairs into the CellRef slice the Move carries.
func refs(rc ...[2]int) []core.CellRef {
	out := make([]core.CellRef, len(rc))
	for i, p := range rc {
		out[i] = core.CellRef{Row: p[0], Col: p[1]}
	}
	return out
}

// assertMove compares a detector's whole Move against the expected one. The
// detectors' coordinate arithmetic, digit field, explanation wording and
// highlight selection are all observable output, so the whole struct is pinned
// rather than a few fields.
func assertMove(t *testing.T, got, want *core.Move) {
	t.Helper()
	if got == nil {
		t.Fatal("expected a move, got nil")
	}
	if got.Action != want.Action {
		t.Errorf("Action = %q, want %q", got.Action, want.Action)
	}
	if got.Digit != want.Digit {
		t.Errorf("Digit = %d, want %d", got.Digit, want.Digit)
	}
	if got.Explanation != want.Explanation {
		t.Errorf("Explanation = %q, want %q", got.Explanation, want.Explanation)
	}
	if !reflect.DeepEqual(got.Targets, want.Targets) {
		t.Errorf("Targets = %+v, want %+v", got.Targets, want.Targets)
	}
	if !reflect.DeepEqual(got.Eliminations, want.Eliminations) {
		t.Errorf("Eliminations = %+v, want %+v", got.Eliminations, want.Eliminations)
	}
	if !reflect.DeepEqual(got.Highlights.Primary, want.Highlights.Primary) {
		t.Errorf("Highlights.Primary = %+v, want %+v", got.Highlights.Primary, want.Highlights.Primary)
	}
	if !reflect.DeepEqual(got.Highlights.Secondary, want.Highlights.Secondary) {
		t.Errorf("Highlights.Secondary = %+v, want %+v", got.Highlights.Secondary, want.Highlights.Secondary)
	}
}

// urCorners is the cell set urRectangleCorners builds: (0,0),(0,3),(1,0),(1,3).
var urCorners = refs([2]int{0, 0}, [2]int{0, 3}, [2]int{1, 0}, [2]int{1, 3})

// ============================================================================
// findURRectangles
// ============================================================================

// TestFindURRectanglesEnumeratesOnlyTwoBoxRectangles pins the full output of the
// shared rectangle enumerator against a board seeded with both valid rectangles
// and near-miss decoys. The decoys cover every rejection the enumerator makes:
// a pair that shares no row, a lower pair whose columns do not line up, a
// rectangle confined to a single box, and a rectangle straddling four boxes.
// The returned corner ordering is pinned too, since downstream floor/roof
// pairing indexes into it positionally.
func TestFindURRectanglesEnumeratesOnlyTwoBoxRectangles(t *testing.T) {
	b := &testBoard{}
	seeded := [][2]int{
		{0, 0}, {0, 1}, {0, 3}, {0, 5},
		{1, 0}, {1, 3}, {1, 5},
		{4, 0}, {4, 1}, {4, 4}, {4, 7},
	}
	for _, rc := range seeded {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{1, 2})
	}

	got := findURRectangles(b, 1, 2)

	want := []urRectangle{
		// Rows 0/4, columns 0/1: two bands, one stack.
		{d1: 1, d2: 2, corners: [4]int{idxOf(0, 0), idxOf(0, 1), idxOf(4, 0), idxOf(4, 1)}},
		// Rows 0/1, columns 0/3: one band, two stacks.
		{d1: 1, d2: 2, corners: [4]int{idxOf(0, 0), idxOf(0, 3), idxOf(1, 0), idxOf(1, 3)}},
		// Rows 0/1, columns 0/5: one band, two stacks.
		{d1: 1, d2: 2, corners: [4]int{idxOf(0, 0), idxOf(0, 5), idxOf(1, 0), idxOf(1, 5)}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("findURRectangles = %+v, want %+v", got, want)
	}
}

// TestFindURRectanglesIgnoresCellsMissingEitherDigit checks the candidate filter
// that seeds the enumeration: a corner holding only one of the two UR digits
// cannot take part, so a rectangle that would otherwise be complete is not
// reported.
func TestFindURRectanglesIgnoresCellsMissingEitherDigit(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{1, 2})
	// Fourth corner holds digit 1 but not digit 2.
	b.candidates[idxOf(1, 3)] = NewCandidates([]int{1, 7})

	if got := findURRectangles(b, 1, 2); got != nil {
		t.Errorf("expected no rectangle when a corner lacks digit 2, got %+v", got)
	}
}

// TestFindURRectanglesReturnsNilBelowFourCandidateCells checks the guard that
// stops the enumeration when too few cells carry both digits to form any
// rectangle.
func TestFindURRectanglesReturnsNilBelowFourCandidateCells(t *testing.T) {
	b := &testBoard{}
	for _, rc := range [][2]int{{0, 0}, {0, 3}, {1, 0}} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{1, 2})
	}

	if got := findURRectangles(b, 1, 2); got != nil {
		t.Errorf("expected nil with only three candidate cells, got %+v", got)
	}
}

// ============================================================================
// Type 1
// ============================================================================

// TestDetectUniqueRectangleType1EliminatesBothDigitsFromExtraCorner pins the
// whole Type 1 move: three bivalue corners plus one corner carrying an extra
// candidate means both UR digits must go from that fourth corner, or the puzzle
// would admit two solutions.
func TestDetectUniqueRectangleType1EliminatesBothDigitsFromExtraCorner(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2}, []int{1, 2, 3})

	assertMove(t, DetectUniqueRectangle(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 3, Digit: 1},
			{Row: 1, Col: 3, Digit: 2},
		},
		Explanation: "Unique Rectangle Type 1: 1/2 would form deadly pattern: eliminate from R2C4.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}, [2]int{1, 0}),
			Secondary: refs([2]int{1, 3}),
		},
	})
}

// TestDetectUniqueRectangleType1SkipsRectangleWithTwoExtraCorners checks the
// bivalue tally: with only two bivalue corners the pattern is not a Type 1, so
// no elimination is claimed.
func TestDetectUniqueRectangleType1SkipsRectangleWithTwoExtraCorners(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})

	if move := DetectUniqueRectangle(b); move != nil {
		t.Errorf("expected nil with two non-bivalue corners, got %+v", move)
	}
}

// TestDetectUniqueRectangleType1SkipsBareDeadlyRectangle checks that four
// bivalue corners produce no move: the tally reaches four, not three, and no
// corner is available to eliminate from.
func TestDetectUniqueRectangleType1SkipsBareDeadlyRectangle(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2}, []int{1, 2})

	if move := DetectUniqueRectangle(b); move != nil {
		t.Errorf("expected nil for a bare deadly rectangle, got %+v", move)
	}
}

// ============================================================================
// Type 2
// ============================================================================

// TestDetectUniqueRectangleType2EliminatesSharedExtraFromCommonPeers pins the
// whole Type 2 move: both roof corners carry the same single extra candidate,
// so that digit must occupy one of them and can be removed from every cell
// seeing both.
func TestDetectUniqueRectangleType2EliminatesSharedExtraFromCommonPeers(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 3})
	// Peer of both roof corners (row 1) holding the shared extra.
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{3, 7})

	assertMove(t, DetectUniqueRectangleType2(b), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Targets:      urCorners,
		Eliminations: []core.Candidate{{Row: 1, Col: 5, Digit: 3}},
		Explanation: "Unique Rectangle Type 2: 1/2 with extra 3: eliminate 3 from cells " +
			"seeing both R2C1 and R2C4.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}),
		},
	})
}

// TestDetectUniqueRectangleType2SkipsDifferingRoofExtras checks the extra-digit
// match: roof corners carrying different single extras cannot force either
// digit, so no elimination follows.
func TestDetectUniqueRectangleType2SkipsDifferingRoofExtras(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{3, 4, 7})

	if move := DetectUniqueRectangleType2(b); move != nil {
		t.Errorf("expected nil when roof extras differ, got %+v", move)
	}
}

// TestDetectUniqueRectangleType2SkipsRoofWithTwoExtras checks that a roof corner
// carrying two extra candidates disqualifies the pattern: Type 2 requires
// exactly one extra in each roof cell.
func TestDetectUniqueRectangleType2SkipsRoofWithTwoExtras(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 3})
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{3, 7})

	if move := DetectUniqueRectangleType2(b); move != nil {
		t.Errorf("expected nil when a roof corner has two extras, got %+v", move)
	}
}

// TestDetectUniqueRectangleType2SkipsWhenNoPeerHoldsTheExtra checks the
// elimination guard: a well-formed Type 2 pattern with nothing to remove
// produces no move rather than an empty one.
func TestDetectUniqueRectangleType2SkipsWhenNoPeerHoldsTheExtra(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 3})

	if move := DetectUniqueRectangleType2(b); move != nil {
		t.Errorf("expected nil when no peer holds the extra, got %+v", move)
	}
}

// ============================================================================
// Type 3
// ============================================================================

// TestDetectUniqueRectangleType3NakedPairProducesFullMove pins the whole Type 3
// move for the naked-pair branch: the roof corners' combined extras {3,4} pair
// with a third row cell holding exactly {3,4}, so 3 and 4 leave the rest of the
// row.
func TestDetectUniqueRectangleType3NakedPairProducesFullMove(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})
	// The naked-pair partner in row 1.
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	// Elimination target in row 1 holding one of the pair digits.
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      urCorners,
		Eliminations: []core.Candidate{{Row: 1, Col: 5, Digit: 3}},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell with [3 4] forms naked pair " +
			"with R2C2 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 1}),
		},
	})
}

// TestDetectUniqueRectangleType3NakedTripleProducesFullMove pins the whole Type
// 3 move for the naked-triple branch: the pseudo-cell's combined extras {3,4,5}
// close a triple with two further row cells, so all three digits leave the
// remaining unsolved cells of the row.
func TestDetectUniqueRectangleType3NakedTripleProducesFullMove(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{4, 5})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 5, 6})
	// A solved cell in the row must be skipped by the elimination scan.
	b.cells[idxOf(1, 5)] = 7

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 4, Digit: 3},
			{Row: 1, Col: 4, Digit: 5},
		},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell forms naked triple with " +
			"R2C2 and R2C3 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 1}, [2]int{1, 2}),
		},
	})
}

// TestDetectUniqueRectangleType3SkipsWhenCombinedExtrasExceedThree checks the
// upper bound on the pseudo-cell: four combined extras cannot close a naked
// pair or triple, so the rectangle is abandoned.
func TestDetectUniqueRectangleType3SkipsWhenCombinedExtrasExceedThree(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5, 6})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{5, 6})

	if move := DetectUniqueRectangleType3(b); move != nil {
		t.Errorf("expected nil with four combined extras, got %+v", move)
	}
}

// TestDetectUniqueRectangleType3SkipsNakedPairPartnerHoldingOtherDigits checks
// that a partner cell must match the pseudo-cell's extras exactly: a cell whose
// two candidates are not the pair digits does not close the pattern.
func TestDetectUniqueRectangleType3SkipsNakedPairPartnerHoldingOtherDigits(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})
	// Row-1 cell with two candidates, one of which is outside the extras.
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 9})
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{3, 4, 9})

	if move := DetectUniqueRectangleType3(b); move != nil {
		t.Errorf("expected nil when the partner holds a digit outside the extras, got %+v", move)
	}
}

// TestDetectUniqueRectangleType3SkipsWhenTripleLeavesNothingToEliminate checks
// the elimination guard on the naked-triple branch: a closed triple whose unit
// holds no other cell with those digits yields no move.
func TestDetectUniqueRectangleType3SkipsWhenTripleLeavesNothingToEliminate(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{4, 5})
	// Remaining row cell holds none of 3, 4 or 5.
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{6, 9})

	if move := DetectUniqueRectangleType3(b); move != nil {
		t.Errorf("expected nil when the triple eliminates nothing, got %+v", move)
	}
}

// ============================================================================
// Type 4
// ============================================================================

// TestDetectUniqueRectangleType4RowConfinedProducesFullMove pins the whole Type
// 4 move for the row-shared case: digit 1 appears nowhere else in the roof row,
// so it must occupy one of the roof corners, which forces digit 2 out of both.
func TestDetectUniqueRectangleType4RowConfinedProducesFullMove(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 3})
	// Row-1 leak of digit 2 only, so digit 1 stays confined to the UR cells.
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{2, 7})

	assertMove(t, DetectUniqueRectangleType4(b), &core.Move{
		Action:  "eliminate",
		Digit:   2,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 0, Digit: 2},
			{Row: 1, Col: 3, Digit: 2},
		},
		Explanation: "Unique Rectangle Type 4: 1/2: 1 confined to UR in row 2: eliminate 2.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}),
		},
	})
}

// TestDetectUniqueRectangleType4EliminatesConfinedPartnerDigit covers the
// mirror case of the confinement test: digit 2 is the confined digit, so digit
// 1 is the one eliminated and the explanation names them the other way round.
func TestDetectUniqueRectangleType4EliminatesConfinedPartnerDigit(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 3})
	// Row-1 leak of digit 1 only, so digit 2 stays confined to the UR cells.
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{1, 7})

	assertMove(t, DetectUniqueRectangleType4(b), &core.Move{
		Action:  "eliminate",
		Digit:   1,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 0, Digit: 1},
			{Row: 1, Col: 3, Digit: 1},
		},
		Explanation: "Unique Rectangle Type 4: 1/2: 2 confined to UR in row 2: eliminate 1.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}),
		},
	})
}

// TestDetectUniqueRectangleType4ColumnConfinedProducesFullMove covers the
// column-shared case, where the roof corners sit in one column and the
// confinement scan walks that column instead of a row.
func TestDetectUniqueRectangleType4ColumnConfinedProducesFullMove(t *testing.T) {
	// Rectangle at (0,0),(0,1),(4,0),(4,1): one stack, two bands. The roof pair
	// is the column {(0,1),(4,1)}.
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(4, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(4, 1)] = NewCandidates([]int{1, 2, 3})
	// Column-1 leak of digit 2 only, so digit 1 stays confined to the UR cells.
	b.candidates[idxOf(7, 1)] = NewCandidates([]int{2, 7})

	assertMove(t, DetectUniqueRectangleType4(b), &core.Move{
		Action:  "eliminate",
		Digit:   2,
		Targets: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{4, 0}, [2]int{4, 1}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 1, Digit: 2},
			{Row: 4, Col: 1, Digit: 2},
		},
		Explanation: "Unique Rectangle Type 4: 1/2: 1 confined to UR in column 2: eliminate 2.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{4, 0}),
			Secondary: refs([2]int{0, 1}, [2]int{4, 1}),
		},
	})
}

// TestDetectUniqueRectangleType4SkipsWhenBothDigitsConfined checks that the
// pattern needs exactly one confined digit: when neither digit leaks out of the
// line, no elimination is justified.
func TestDetectUniqueRectangleType4SkipsWhenBothDigitsConfined(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 3})
	// Row-1 leak of neither UR digit.
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{7, 8})

	if move := DetectUniqueRectangleType4(b); move != nil {
		t.Errorf("expected nil when both digits stay confined, got %+v", move)
	}
}

// TestDetectUniqueRectangleType4SkipsWhenRoofCornersLackTheDigit checks the
// elimination guard in the move builder: the confined digit's partner is only
// removed where it is actually present, and with nothing to remove no move is
// produced.
func TestDetectUniqueRectangleType4SkipsWhenRoofCornersLackTheDigit(t *testing.T) {
	// Roof corners carry digit 1 plus extras but not digit 2, so digit 2 has
	// nothing to be eliminated from even though digit 1 is confined.
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(1, 3)] = NewCandidates([]int{1, 2, 3})

	if move := DetectUniqueRectangleType4(b); move != nil {
		t.Errorf("expected nil when neither digit leaks from the roof line, got %+v", move)
	}
}

// ============================================================================
// Digit-pair enumeration
// ============================================================================

// TestURDigitPairsEnumeratesEveryAscendingPairOnce pins the exact pair sequence
// the four detectors scan. The sequence decides which UR is found first when a
// board holds several, so both its content and its order are observable.
func TestURDigitPairsEnumeratesEveryAscendingPairOnce(t *testing.T) {
	want := [][2]int{
		{1, 2}, {1, 3}, {1, 4}, {1, 5}, {1, 6}, {1, 7}, {1, 8}, {1, 9},
		{2, 3}, {2, 4}, {2, 5}, {2, 6}, {2, 7}, {2, 8}, {2, 9},
		{3, 4}, {3, 5}, {3, 6}, {3, 7}, {3, 8}, {3, 9},
		{4, 5}, {4, 6}, {4, 7}, {4, 8}, {4, 9},
		{5, 6}, {5, 7}, {5, 8}, {5, 9},
		{6, 7}, {6, 8}, {6, 9},
		{7, 8}, {7, 9},
		{8, 9},
	}

	var got [][2]int
	for d1, d2 := range urDigitPairs {
		got = append(got, [2]int{d1, d2})
	}

	if !reflect.DeepEqual(got, want) {
		t.Errorf("urDigitPairs yielded %v pairs\n got %v\nwant %v", len(got), got, want)
	}
}

// TestURDigitPairsStopsWhenConsumerBreaks checks that the iterator honors an
// early exit. The detectors return from inside the loop as soon as they find a
// move, so continuing to yield after that would be a runtime error.
func TestURDigitPairsStopsWhenConsumerBreaks(t *testing.T) {
	var got [][2]int
	for d1, d2 := range urDigitPairs {
		got = append(got, [2]int{d1, d2})
		if len(got) == 3 {
			break
		}
	}

	want := [][2]int{{1, 2}, {1, 3}, {1, 4}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("after breaking at three pairs got %v, want %v", got, want)
	}
}

// TestDetectUniqueRectangleFindsHighestDigitPair checks that the scan reaches
// the last digit pair: a UR on 8/9 is the only pattern on the board, so a scan
// that stops short of either digit finds nothing.
func TestDetectUniqueRectangleFindsHighestDigitPair(t *testing.T) {
	b := urRectangleCorners([]int{8, 9}, []int{8, 9}, []int{8, 9}, []int{8, 9, 3})

	assertMove(t, DetectUniqueRectangle(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 3, Digit: 8},
			{Row: 1, Col: 3, Digit: 9},
		},
		Explanation: "Unique Rectangle Type 1: 8/9 would form deadly pattern: eliminate from R2C4.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}, [2]int{1, 0}),
			Secondary: refs([2]int{1, 3}),
		},
	})
}

// TestDetectUniqueRectangleType1EliminatesFromFirstCorner covers the case where
// the corner carrying extras is the rectangle's first corner rather than its
// last, so the eliminations and the secondary highlight move with it.
func TestDetectUniqueRectangleType1EliminatesFromFirstCorner(t *testing.T) {
	b := urRectangleCorners([]int{1, 2, 3}, []int{1, 2}, []int{1, 2}, []int{1, 2})

	assertMove(t, DetectUniqueRectangle(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 1},
			{Row: 0, Col: 0, Digit: 2},
		},
		Explanation: "Unique Rectangle Type 1: 1/2 would form deadly pattern: eliminate from R1C1.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}, [2]int{1, 0}),
			Secondary: refs([2]int{0, 0}),
		},
	})
}

// ============================================================================
// Column-oriented rectangles
// ============================================================================

// verticalURCorners returns a board whose cells (0,0),(0,1),(4,0),(4,1) form a
// Unique Rectangle across boxes 0 and 3: one stack, two bands. Its floor/roof
// pairs are columns where the horizontal fixture's are rows.
func verticalURCorners(c00, c01, c40, c41 []int) *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates(c00)
	b.candidates[idxOf(0, 1)] = NewCandidates(c01)
	b.candidates[idxOf(4, 0)] = NewCandidates(c40)
	b.candidates[idxOf(4, 1)] = NewCandidates(c41)
	return b
}

// TestDetectUniqueRectangleType2SecondColumnFloorEliminates covers the last
// floor/roof pairing, where the right-hand column is the bivalue floor and the
// left-hand column is the roof. The three earlier pairings are all disqualified
// by a non-bivalue floor cell, so only this one can produce the move.
func TestDetectUniqueRectangleType2SecondColumnFloorEliminates(t *testing.T) {
	b := verticalURCorners([]int{1, 2, 3}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2})
	// Peer of both roof corners (column 0) holding the shared extra.
	b.candidates[idxOf(7, 0)] = NewCandidates([]int{3, 7})

	assertMove(t, DetectUniqueRectangleType2(b), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{4, 0}, [2]int{4, 1}),
		Eliminations: []core.Candidate{{Row: 7, Col: 0, Digit: 3}},
		Explanation: "Unique Rectangle Type 2: 1/2 with extra 3: eliminate 3 from cells " +
			"seeing both R1C1 and R5C1.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 1}, [2]int{4, 1}),
			Secondary: refs([2]int{0, 0}, [2]int{4, 0}),
		},
	})
}

// TestDetectUniqueRectangleType3ColumnUnitEliminates covers the shared-column
// branch of the Type 3 unit search: the roof corners sit in one column, so the
// pseudo-cell pairs with a cell from that column rather than a row.
func TestDetectUniqueRectangleType3ColumnUnitEliminates(t *testing.T) {
	b := verticalURCorners([]int{1, 2}, []int{1, 2, 3}, []int{1, 2}, []int{1, 2, 4})
	// Naked-pair partner and elimination target, both in column 1.
	b.candidates[idxOf(7, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(8, 1)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{4, 0}, [2]int{4, 1}),
		Eliminations: []core.Candidate{{Row: 8, Col: 1, Digit: 3}},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell with [3 4] forms naked pair " +
			"with R8C2 in column.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{4, 0}),
			Secondary: refs([2]int{0, 1}, [2]int{4, 1}, [2]int{7, 1}),
		},
	})
}

// TestDetectUniqueRectangleType3BoxUnitEliminates covers the shared-box branch
// of the Type 3 unit search. The roof corners share both a row and a box; the
// row holds no partner, so the search falls through to the box, which does.
func TestDetectUniqueRectangleType3BoxUnitEliminates(t *testing.T) {
	b := verticalURCorners([]int{1, 2, 3}, []int{1, 2, 4}, []int{1, 2}, []int{1, 2})
	// Naked-pair partner in box 0 but outside row 0, so only the box match fires.
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 4})
	// Elimination target, also in box 0 and outside row 0.
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{4, 0}, [2]int{4, 1}),
		Eliminations: []core.Candidate{{Row: 2, Col: 0, Digit: 3}},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell with [3 4] forms naked pair " +
			"with R2C3 in box.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 0}, [2]int{4, 1}),
			Secondary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{1, 2}),
		},
	})
}

// ============================================================================
// Type 3 scan details
// ============================================================================

// TestDetectUniqueRectangleType3ScansPastUnsuitablePartners checks that the
// naked-pair search keeps looking after a cell with the wrong candidate count:
// the partner sits behind such a cell in the unit, so a search that stopped at
// the first mismatch would miss it.
func TestDetectUniqueRectangleType3ScansPastUnsuitablePartners(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})
	// Three-candidate cell ahead of the partner in row 1.
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{5, 6, 7})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      urCorners,
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 3}},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell with [3 4] forms naked pair " +
			"with R2C3 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 2}),
		},
	})
}

// TestDetectUniqueRectangleType3SkipsNakedPairWithNothingToEliminate checks that
// a complete naked pair which removes nothing yields no move at all, rather than
// a move carrying an empty elimination list.
func TestDetectUniqueRectangleType3SkipsNakedPairWithNothingToEliminate(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})
	// Partner completes the pair, but no other row-1 cell holds 3 or 4.
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})

	if move := DetectUniqueRectangleType3(b); move != nil {
		t.Errorf("expected nil when the naked pair removes nothing, got %+v", move)
	}
}

// TestDetectUniqueRectangleType3IgnoresSolvedCellAsNakedPairPartner checks that
// the partner search skips cells that already hold a value. A solved cell whose
// leftover candidates happen to match the pseudo-cell must not be treated as a
// live partner.
func TestDetectUniqueRectangleType3IgnoresSolvedCellAsNakedPairPartner(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})
	// Solved cell whose stale candidates would otherwise complete the pair.
	b.cells[idxOf(1, 1)] = 5
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 9})

	if move := DetectUniqueRectangleType3(b); move != nil {
		t.Errorf("expected nil when the only partner is a solved cell, got %+v", move)
	}
}

// TestDetectUniqueRectangleType3SkipsSolvedCellsWhenEliminating checks that the
// naked-pair elimination scan leaves solved cells alone: a solved cell holding a
// stale candidate must not appear among the eliminations.
func TestDetectUniqueRectangleType3SkipsSolvedCellsWhenEliminating(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2, 4})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	// Solved cell in row 1 carrying a stale copy of a pair digit.
	b.cells[idxOf(1, 2)] = 5
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      urCorners,
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 3}},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell with [3 4] forms naked pair " +
			"with R2C2 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 1}),
		},
	})
}

// TestDetectUniqueRectangleType3TripleAcceptsThreeCandidatePartner checks that
// the naked-triple search admits partner cells with three candidates, not only
// bivalue ones: a triple closes on cells holding two or three of its digits.
func TestDetectUniqueRectangleType3TripleAcceptsThreeCandidatePartner(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	// First partner holds all three triple digits.
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4, 5})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 5, 6})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 4, Digit: 3},
			{Row: 1, Col: 4, Digit: 5},
		},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell forms naked triple with " +
			"R2C2 and R2C3 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 1}, [2]int{1, 2}),
		},
	})
}

// TestDetectUniqueRectangleType3TripleWithSingleElimination checks that one
// removed candidate is enough to report a triple: the elimination list does not
// have to hold more than a single entry.
func TestDetectUniqueRectangleType3TripleWithSingleElimination(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4, 5})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 4})
	// Only one triple digit survives outside the triple cells.
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      urCorners,
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 3}},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell forms naked triple with " +
			"R2C2 and R2C3 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 1}, [2]int{1, 2}),
		},
	})
}

// TestDetectUniqueRectangleType3TripleSkipsSolvedCells checks both solved-cell
// guards on the naked-triple path: a solved cell is neither collected as a
// triple partner nor written into the eliminations.
func TestDetectUniqueRectangleType3TripleSkipsSolvedCells(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	// Solved cell whose stale candidates would otherwise be a triple partner.
	b.cells[idxOf(1, 1)] = 8
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{4, 5})
	// Solved cell in row 1 carrying a stale triple digit.
	b.cells[idxOf(1, 6)] = 9
	b.candidates[idxOf(1, 6)] = NewCandidates([]int{3})
	b.candidates[idxOf(1, 7)] = NewCandidates([]int{3, 5, 6})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 7, Digit: 3},
			{Row: 1, Col: 7, Digit: 5},
		},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell forms naked triple with " +
			"R2C3 and R2C5 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 2}, [2]int{1, 4}),
		},
	})
}

// ============================================================================
// Type 4 roof eligibility
// ============================================================================

// TestDetectUniqueRectangleType4RejectsBivalueFirstRoof checks the roof guard on
// its first corner: a bivalue first roof corner means the rectangle is a bare
// deadly pattern on that side, and eliminating from it would be unsound even
// though the confinement test would otherwise succeed.
func TestDetectUniqueRectangleType4RejectsBivalueFirstRoof(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2}, []int{1, 2, 3})
	// Row-1 leak of digit 2 only, so digit 1 would read as confined.
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{2, 7})

	if move := DetectUniqueRectangleType4(b); move != nil {
		t.Errorf("expected nil when the first roof corner is bivalue, got %+v", move)
	}
}

// TestDetectUniqueRectangleType4RejectsBivalueSecondRoof checks the mirror case
// of the roof guard, where the second roof corner is the bivalue one.
func TestDetectUniqueRectangleType4RejectsBivalueSecondRoof(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3}, []int{1, 2})
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{2, 7})

	if move := DetectUniqueRectangleType4(b); move != nil {
		t.Errorf("expected nil when the second roof corner is bivalue, got %+v", move)
	}
}

// TestDetectUniqueRectangleType3BoxUnitAwayFromOrigin repeats the shared-box
// case with the rectangle placed away from row 0 and column 0, so the box index
// derived for each roof corner is a non-trivial value. A rectangle at the origin
// leaves that arithmetic reading zero whatever it computes.
func TestDetectUniqueRectangleType3BoxUnitAwayFromOrigin(t *testing.T) {
	// Rectangle at (3,4),(3,5),(7,4),(7,5): one stack, two bands, boxes 4 and 7.
	b := &testBoard{}
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(3, 5)] = NewCandidates([]int{1, 2, 4})
	b.candidates[idxOf(7, 4)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(7, 5)] = NewCandidates([]int{1, 2})
	// Naked-pair partner in box 4 but outside row 3, so only the box match fires.
	b.candidates[idxOf(4, 3)] = NewCandidates([]int{3, 4})
	// Elimination target, also in box 4 and outside row 3.
	b.candidates[idxOf(5, 3)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      refs([2]int{3, 4}, [2]int{3, 5}, [2]int{7, 4}, [2]int{7, 5}),
		Eliminations: []core.Candidate{{Row: 5, Col: 3, Digit: 3}},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell with [3 4] forms naked pair " +
			"with R5C4 in box.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{7, 4}, [2]int{7, 5}),
			Secondary: refs([2]int{3, 4}, [2]int{3, 5}, [2]int{4, 3}),
		},
	})
}

// TestDetectUniqueRectangleType3TripleExcludesSingleCandidateCells checks the
// lower bound on triple partners. A cell down to one candidate is a naked single
// and is not a triple member, so the search must step over it and keep going
// rather than take it or give up at it.
func TestDetectUniqueRectangleType3TripleExcludesSingleCandidateCells(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	// Single-candidate cell ahead of the real triple partners in row 1.
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{4, 5})
	b.candidates[idxOf(1, 6)] = NewCandidates([]int{3, 5, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 1, Digit: 3},
			{Row: 1, Col: 6, Digit: 3},
			{Row: 1, Col: 6, Digit: 5},
		},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell forms naked triple with " +
			"R2C3 and R2C5 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 2}, [2]int{1, 4}),
		},
	})
}

// TestDetectUniqueRectangleType3TripleTriesEveryPartnerPairing checks that the
// triple search keeps pairing after a combination that widens the digit set past
// three: the first partner's second pairing is the one that closes the triple,
// so abandoning the partner at its first miss would lose the move.
func TestDetectUniqueRectangleType3TripleTriesEveryPartnerPairing(t *testing.T) {
	b := urRectangleCorners([]int{1, 2}, []int{1, 2}, []int{1, 2, 3, 4}, []int{1, 2, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4})
	// Pairing (1,1) with this cell widens the set to four digits.
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 9})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{4, 5})
	b.candidates[idxOf(1, 6)] = NewCandidates([]int{3, 5, 9})

	assertMove(t, DetectUniqueRectangleType3(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: urCorners,
		Eliminations: []core.Candidate{
			{Row: 1, Col: 2, Digit: 3},
			{Row: 1, Col: 6, Digit: 3},
			{Row: 1, Col: 6, Digit: 5},
		},
		Explanation: "Unique Rectangle Type 3: 1/2: pseudo-cell forms naked triple with " +
			"R2C2 and R2C5 in row.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 3}),
			Secondary: refs([2]int{1, 0}, [2]int{1, 3}, [2]int{1, 1}, [2]int{1, 4}),
		},
	})
}
