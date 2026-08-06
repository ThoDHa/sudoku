package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// skyscraperBoard gives every listed cell the single candidate 5, which is the
// digit every test in this file works with. Cells left out hold no candidates,
// so they take no part in any link.
func skyscraperBoard(cells ...[2]int) *testBoard {
	b := &testBoard{}
	for _, rc := range cells {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{5})
	}
	return b
}

// ============================================================================
// collectSkyscraperLinks
// ============================================================================

// TestCollectSkyscraperLinksTakesOnlyExactPairs pins the link scan in its row
// orientation. A line with one, three or no candidates for the digit is not a
// conjugate pair and must not become a link; the pair's cell indices are
// returned in column order.
func TestCollectSkyscraperLinksTakesOnlyExactPairs(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 1}, [2]int{0, 6}, // row 0: a pair
		[2]int{2, 3},                             // row 2: a single
		[2]int{4, 0}, [2]int{4, 4}, [2]int{4, 8}, // row 4: three
		[2]int{7, 2}, [2]int{7, 5}, // row 7: a pair
	)

	got := collectSkyscraperLinks(b, 5, true)

	want := [][2]int{
		{idxOf(0, 1), idxOf(0, 6)},
		{idxOf(7, 2), idxOf(7, 5)},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("row links = %v, want %v", got, want)
	}
}

// TestCollectSkyscraperLinksScansColumnsWhenNotByRow pins the other orientation,
// where the same scan walks a column and returns cell indices in row order. The
// two orientations differ only in how the cell index is assembled, so a board
// whose rows and columns disagree is what separates them.
func TestCollectSkyscraperLinksScansColumnsWhenNotByRow(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 1}, [2]int{6, 1}, // column 1: a pair
		[2]int{3, 2},                             // column 2: a single
		[2]int{0, 7}, [2]int{4, 7}, [2]int{8, 7}, // column 7: three
	)

	got := collectSkyscraperLinks(b, 5, false)

	want := [][2]int{{idxOf(0, 1), idxOf(6, 1)}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("column links = %v, want %v", got, want)
	}
}

// ============================================================================
// sharedRowOrCol
// ============================================================================

// TestSharedRowOrColReportsTheSharedLine pins both hits and the miss. The row
// test comes first in the function, so a pair sharing only a column proves the
// column branch is reached rather than shadowed.
func TestSharedRowOrColReportsTheSharedLine(t *testing.T) {
	cases := []struct {
		name    string
		a, b    int
		wantIdx int
		wantOk  bool
	}{
		{"same row", idxOf(3, 1), idxOf(3, 7), 3, true},
		{"same column", idxOf(2, 6), idxOf(8, 6), 6, true},
		{"neither", idxOf(1, 2), idxOf(4, 5), -1, false},
	}
	for _, c := range cases {
		gotIdx, gotOk := sharedRowOrCol(c.a, c.b)
		if gotIdx != c.wantIdx || gotOk != c.wantOk {
			t.Errorf("%s: sharedRowOrCol = (%d, %t), want (%d, %t)",
				c.name, gotIdx, gotOk, c.wantIdx, c.wantOk)
		}
	}
}

// ============================================================================
// Base pairings
// ============================================================================
//
// buildSkyscraperMove tries the four ways of choosing one end of each link as
// the shared base, in the order {0,0}, {0,1}, {1,0}, {1,1}. Each of the four
// tests below is won by exactly one of those pairings and fails the ones before
// it, so together they pin the table and the order it is walked.

// TestDetectSkyscraperPairsTheFirstEndOfEachLink is won by the {0,0} pairing:
// the shared column sits left of both tops.
func TestDetectSkyscraperPairsTheFirstEndOfEachLink(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 0}, [2]int{0, 4}, // row 0 link, base at column 0
		[2]int{4, 0}, [2]int{4, 5}, // row 4 link, base at column 0
		[2]int{2, 5}, [2]int{3, 4}, // cells seeing both tops
	)

	assertMove(t, DetectSkyscraper(b), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 0}, [2]int{4, 5}),
		Eliminations: []core.Candidate{
			{Row: 2, Col: 5, Digit: 5},
			{Row: 3, Col: 4, Digit: 5},
		},
		Explanation: "Skyscraper: 5 with base in column 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 0}, [2]int{4, 5}),
		},
	})
}

// TestDetectSkyscraperPairsTheSecondEndOfTheSecondLink is won by the {0,1}
// pairing: the shared column lies between the two tops, so the first link
// contributes its left end and the second its right.
func TestDetectSkyscraperPairsTheSecondEndOfTheSecondLink(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 4}, [2]int{0, 5}, // row 0 link, base at column 4
		[2]int{4, 3}, [2]int{4, 4}, // row 4 link, base at column 4
		[2]int{1, 3}, [2]int{3, 5}, // cells seeing both tops
	)

	assertMove(t, DetectSkyscraper(b), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{0, 4}, [2]int{0, 5}, [2]int{4, 3}, [2]int{4, 4}),
		Eliminations: []core.Candidate{
			{Row: 1, Col: 3, Digit: 5},
			{Row: 3, Col: 5, Digit: 5},
		},
		Explanation: "Skyscraper: 5 with base in column 5",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 4}, [2]int{0, 5}, [2]int{4, 3}, [2]int{4, 4}),
		},
	})
}

// TestDetectSkyscraperPairsTheSecondEndOfTheFirstLink is won by the {1,0}
// pairing, the mirror of the case above.
func TestDetectSkyscraperPairsTheSecondEndOfTheFirstLink(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 3}, [2]int{0, 4}, // row 0 link, base at column 4
		[2]int{4, 4}, [2]int{4, 5}, // row 4 link, base at column 4
		[2]int{1, 5}, [2]int{3, 3}, // cells seeing both tops
	)

	assertMove(t, DetectSkyscraper(b), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{0, 3}, [2]int{0, 4}, [2]int{4, 4}, [2]int{4, 5}),
		Eliminations: []core.Candidate{
			{Row: 1, Col: 5, Digit: 5},
			{Row: 3, Col: 3, Digit: 5},
		},
		Explanation: "Skyscraper: 5 with base in column 5",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 3}, [2]int{0, 4}, [2]int{4, 4}, [2]int{4, 5}),
		},
	})
}

// TestDetectSkyscraperPairsTheSecondEndOfBothLinks is won by the {1,1} pairing,
// the last entry in the table: the shared column sits right of both tops, so
// the three earlier pairings all fail to find a shared line.
func TestDetectSkyscraperPairsTheSecondEndOfBothLinks(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 3}, [2]int{0, 5}, // row 0 link, base at column 5
		[2]int{4, 4}, [2]int{4, 5}, // row 4 link, base at column 5
		[2]int{1, 4}, [2]int{3, 3}, // cells seeing both tops
	)

	assertMove(t, DetectSkyscraper(b), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{0, 3}, [2]int{0, 5}, [2]int{4, 4}, [2]int{4, 5}),
		Eliminations: []core.Candidate{
			{Row: 1, Col: 4, Digit: 5},
			{Row: 3, Col: 3, Digit: 5},
		},
		Explanation: "Skyscraper: 5 with base in column 6",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 3}, [2]int{0, 5}, [2]int{4, 4}, [2]int{4, 5}),
		},
	})
}

// TestDetectSkyscraperFallsBackToColumnLinks pins the column-link half of the
// detector, where the base is a shared row and the explanation says so. Rows 0,
// 4 and 5 each carry a third candidate so no row is a conjugate pair, which is
// what forces the column pass to be the one that fires.
func TestDetectSkyscraperFallsBackToColumnLinks(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 0}, [2]int{4, 0}, // column 0 link, base at row 0
		[2]int{0, 4}, [2]int{5, 4}, // column 4 link, base at row 0
		[2]int{4, 3}, [2]int{5, 1}, // cells seeing both tops
		[2]int{0, 8}, [2]int{4, 8}, [2]int{5, 8}, // spoil the row pairs
	)

	assertMove(t, DetectSkyscraper(b), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{0, 0}, [2]int{4, 0}, [2]int{0, 4}, [2]int{5, 4}),
		Eliminations: []core.Candidate{
			{Row: 4, Col: 3, Digit: 5},
			{Row: 5, Col: 1, Digit: 5},
		},
		Explanation: "Skyscraper: 5 with base in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{4, 0}, [2]int{0, 4}, [2]int{5, 4}),
		},
	})
}

// ============================================================================
// Rejections
// ============================================================================

// TestDetectSkyscraperRejectsTopsSharingAColumn checks the guard that separates
// a skyscraper from an X-Wing: with both tops in one column the pattern is a
// fish, and its eliminations are not the skyscraper's.
func TestDetectSkyscraperRejectsTopsSharingAColumn(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 0}, [2]int{0, 4},
		[2]int{4, 0}, [2]int{4, 4},
		[2]int{2, 4}, [2]int{3, 4},
	)

	if move := DetectSkyscraper(b); move != nil {
		t.Errorf("expected nil when both tops share a column, got %+v", move)
	}
}

// TestDetectSkyscraperRejectsTopsSharingARow checks the other half of that
// guard, which the column-link pass reaches: two column links whose tops share
// a row are again a fish rather than a skyscraper.
func TestDetectSkyscraperRejectsTopsSharingARow(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 0}, [2]int{4, 0},
		[2]int{0, 4}, [2]int{4, 4},
		[2]int{4, 2}, [2]int{4, 6},
		[2]int{0, 8}, [2]int{4, 8},
	)

	if move := DetectSkyscraper(b); move != nil {
		t.Errorf("expected nil when both tops share a row, got %+v", move)
	}
}

// TestDetectSkyscraperRejectsTopsInOneBox checks the box guard: tops inside a
// single box see each other, so the either-or argument the elimination rests on
// does not hold. A cell seeing both tops does hold the digit, so a detector that
// let the pattern through would return a move rather than fall through to the
// empty-elimination guard.
func TestDetectSkyscraperRejectsTopsInOneBox(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 0}, [2]int{0, 4},
		[2]int{1, 0}, [2]int{1, 5},
		[2]int{2, 3},
	)

	if move := DetectSkyscraper(b); move != nil {
		t.Errorf("expected nil when the tops share a box, got %+v", move)
	}
}

// TestDetectSkyscraperSkipsPatternWithNothingToEliminate checks the elimination
// guard: a well-formed skyscraper whose tops have no common peer holding the
// digit yields no move rather than an empty one.
func TestDetectSkyscraperSkipsPatternWithNothingToEliminate(t *testing.T) {
	b := skyscraperBoard(
		[2]int{0, 0}, [2]int{0, 4},
		[2]int{4, 0}, [2]int{4, 5},
	)

	if move := DetectSkyscraper(b); move != nil {
		t.Errorf("expected nil with no common peer to eliminate from, got %+v", move)
	}
}

// TestDetectSkyscraperScansEveryDigit pins the bounds of the digit loop by
// placing the pattern on the highest digit, which a loop stopping one short
// would never reach.
func TestDetectSkyscraperScansEveryDigit(t *testing.T) {
	b := &testBoard{}
	for _, rc := range [][2]int{{0, 0}, {0, 4}, {4, 0}, {4, 5}, {2, 5}, {3, 4}} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{9})
	}

	assertMove(t, DetectSkyscraper(b), &core.Move{
		Action:  "eliminate",
		Digit:   9,
		Targets: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 0}, [2]int{4, 5}),
		Eliminations: []core.Candidate{
			{Row: 2, Col: 5, Digit: 9},
			{Row: 3, Col: 4, Digit: 9},
		},
		Explanation: "Skyscraper: 9 with base in column 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 0}, [2]int{4, 5}),
		},
	})
}

// TestDetectSkyscraperScansTheLowestDigit is the other end of that loop: a
// pattern on digit 1 is missed by a scan that starts at 2.
func TestDetectSkyscraperScansTheLowestDigit(t *testing.T) {
	b := &testBoard{}
	for _, rc := range [][2]int{{0, 0}, {0, 4}, {4, 0}, {4, 5}, {2, 5}, {3, 4}} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{1})
	}

	assertMove(t, DetectSkyscraper(b), &core.Move{
		Action:  "eliminate",
		Digit:   1,
		Targets: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 0}, [2]int{4, 5}),
		Eliminations: []core.Candidate{
			{Row: 2, Col: 5, Digit: 1},
			{Row: 3, Col: 4, Digit: 1},
		},
		Explanation: "Skyscraper: 1 with base in column 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 0}, [2]int{4, 5}),
		},
	})
}
