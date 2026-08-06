package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// finnedBoard gives every listed cell the single candidate digit.
func finnedBoard(digit int, cells ...[2]int) *testBoard {
	b := &testBoard{}
	for _, rc := range cells {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{digit})
	}
	return b
}

// finnedRowPattern is the board every row-orientation test works from: rows 0
// and 1 hold the digit in columns 1 and 4, row 1 carries a third position at
// column 5 as the fin, and columns 4 of rows 2 and 3 hold the digit as the
// candidates for elimination. Only row 2 lies in the fin's band of rows, so row
// 3 is there to prove the band's upper bound is exclusive.
func finnedRowPattern(digit int) *testBoard {
	return finnedBoard(digit,
		[2]int{0, 1}, [2]int{0, 4},
		[2]int{1, 1}, [2]int{1, 4}, [2]int{1, 5},
		[2]int{2, 4}, [2]int{3, 4},
	)
}

// ============================================================================
// Whole moves
// ============================================================================

// TestDetectFinnedXWingReturnsCompleteRowMove pins the whole move for the
// row orientation: which cells are targets, which one is the fin, the wording
// and coordinates of the explanation, and the single elimination the fin's box
// permits.
func TestDetectFinnedXWingReturnsCompleteRowMove(t *testing.T) {
	assertMove(t, DetectFinnedXWing(finnedRowPattern(5)), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{0, 1}, [2]int{0, 4}, [2]int{1, 1}, [2]int{1, 4}, [2]int{1, 5}),
		Eliminations: []core.Candidate{
			{Row: 2, Col: 4, Digit: 5},
		},
		Explanation: "Finned X-Wing: 5 in rows 1,2 with fin at R2C6",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 1}, [2]int{0, 4}, [2]int{1, 1}, [2]int{1, 4}),
			Secondary: refs([2]int{1, 5}),
		},
	})
}

// TestDetectFinnedXWingReturnsCompleteColumnMove pins the transposed pattern,
// which swaps every coordinate and the noun in the explanation. No row holds
// two positions here, so the column pass is the one that fires.
func TestDetectFinnedXWingReturnsCompleteColumnMove(t *testing.T) {
	b := finnedBoard(5,
		[2]int{1, 0}, [2]int{4, 0},
		[2]int{1, 1}, [2]int{4, 1}, [2]int{5, 1},
		[2]int{4, 2}, [2]int{4, 3},
	)

	assertMove(t, DetectFinnedXWing(b), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{1, 0}, [2]int{1, 1}, [2]int{4, 0}, [2]int{4, 1}, [2]int{5, 1}),
		Eliminations: []core.Candidate{
			{Row: 4, Col: 2, Digit: 5},
		},
		Explanation: "Finned X-Wing: 5 in columns 1,2 with fin at R6C2",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 0}, [2]int{1, 1}, [2]int{4, 0}, [2]int{4, 1}),
			Secondary: refs([2]int{5, 1}),
		},
	})
}

// TestDetectFinnedXWingScansTheHighestDigit places the same pattern on digit 9,
// which a scan stopping one digit short would never reach.
func TestDetectFinnedXWingScansTheHighestDigit(t *testing.T) {
	assertMove(t, DetectFinnedXWing(finnedRowPattern(9)), &core.Move{
		Action:  "eliminate",
		Digit:   9,
		Targets: refs([2]int{0, 1}, [2]int{0, 4}, [2]int{1, 1}, [2]int{1, 4}, [2]int{1, 5}),
		Eliminations: []core.Candidate{
			{Row: 2, Col: 4, Digit: 9},
		},
		Explanation: "Finned X-Wing: 9 in rows 1,2 with fin at R2C6",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 1}, [2]int{0, 4}, [2]int{1, 1}, [2]int{1, 4}),
			Secondary: refs([2]int{1, 5}),
		},
	})
}

// ============================================================================
// Line-pair admission
// ============================================================================

// TestDetectFinnedXWingRejectsATwoPositionFinLine checks the fin side of the
// admission check. A fin line holding only two positions, one of them outside
// the base, still passes the fin-extraction test, so without the count check the
// detector would claim a pattern from two ordinary lines.
func TestDetectFinnedXWingRejectsATwoPositionFinLine(t *testing.T) {
	b := finnedBoard(5,
		[2]int{0, 1}, [2]int{0, 4},
		[2]int{1, 1}, [2]int{1, 5},
		[2]int{2, 4},
	)

	if move := DetectFinnedXWing(b); move != nil {
		t.Errorf("expected nil when the fin line holds only two positions, got %+v", move)
	}
}

// TestDetectFinnedXWingRejectsAThreePositionBaseLine checks the base side. The
// fin extraction reads only the first two base positions, so a three-position
// base would silently be treated as its first two and produce an unsound
// elimination.
func TestDetectFinnedXWingRejectsAThreePositionBaseLine(t *testing.T) {
	b := finnedBoard(5,
		[2]int{0, 1}, [2]int{0, 4}, [2]int{0, 7},
		[2]int{1, 1}, [2]int{1, 4}, [2]int{1, 5},
		[2]int{2, 4},
	)

	if move := DetectFinnedXWing(b); move != nil {
		t.Errorf("expected nil when the base line holds three positions, got %+v", move)
	}
}

// TestDetectFinnedXWingSkipsPatternWithNothingToEliminate checks the elimination
// guard: a well-formed finned X-Wing whose fin box holds no other candidate
// yields no move rather than an empty one.
func TestDetectFinnedXWingSkipsPatternWithNothingToEliminate(t *testing.T) {
	b := finnedBoard(5,
		[2]int{0, 1}, [2]int{0, 4},
		[2]int{1, 1}, [2]int{1, 4}, [2]int{1, 5},
	)

	if move := DetectFinnedXWing(b); move != nil {
		t.Errorf("expected nil with nothing to eliminate, got %+v", move)
	}
}

// ============================================================================
// xwingFinnedLines
// ============================================================================

// TestXWingFinnedLinesTakesTwoAndThreePositionLines pins the line scan in its
// row orientation, including both ends of the position-count window and the
// perpendicular coordinates it records.
func TestXWingFinnedLinesTakesTwoAndThreePositionLines(t *testing.T) {
	b := finnedBoard(5,
		[2]int{0, 2}, [2]int{0, 6}, // two positions
		[2]int{1, 0},                             // one
		[2]int{3, 1}, [2]int{3, 4}, [2]int{3, 8}, // three
		[2]int{5, 0}, [2]int{5, 1}, [2]int{5, 2}, [2]int{5, 3}, // four
	)

	got := xwingFinnedLines(b, 5, true)

	want := []finnedLineInfo{
		{0, []int{2, 6}},
		{3, []int{1, 4, 8}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("row lines = %+v, want %+v", got, want)
	}
}

// TestXWingFinnedLinesScansColumnsWhenNotByRow pins the other orientation, where
// the same scan walks a column and records row coordinates.
func TestXWingFinnedLinesScansColumnsWhenNotByRow(t *testing.T) {
	b := finnedBoard(5,
		[2]int{2, 0}, [2]int{6, 0}, // column 0: two positions
		[2]int{0, 1},                             // column 1: one
		[2]int{1, 3}, [2]int{4, 3}, [2]int{8, 3}, // column 3: three
	)

	got := xwingFinnedLines(b, 5, false)

	want := []finnedLineInfo{
		{0, []int{2, 6}},
		{3, []int{1, 4, 8}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("column lines = %+v, want %+v", got, want)
	}
}

// ============================================================================
// findFinnedXWingFinPerp
// ============================================================================

// TestFindFinnedXWingFinPerpIsolatesTheSingleExtraPosition pins every way the
// fin extraction can answer: the one position outside the base, and a refusal
// when there is none or more than one. The last case is the one that shows the
// extraction alone is not enough, since a two-position fin line sharing one
// position with the base is accepted here and rejected only by the caller's
// count check.
func TestFindFinnedXWingFinPerpIsolatesTheSingleExtraPosition(t *testing.T) {
	cases := []struct {
		name      string
		base, fin []int
		wantPerp  int
		wantOK    bool
	}{
		{"one extra", []int{1, 4}, []int{1, 4, 5}, 5, true},
		{"extra first", []int{4, 7}, []int{0, 4, 7}, 0, true},
		{"two extras", []int{1, 4}, []int{1, 5, 6}, 0, false},
		{"no extra", []int{1, 4}, []int{1, 4}, 0, false},
		{"covers only one base position", []int{1, 4}, []int{1, 5}, 5, true},
	}
	for _, c := range cases {
		gotPerp, gotOK := findFinnedXWingFinPerp(c.base, c.fin)
		if gotPerp != c.wantPerp || gotOK != c.wantOK {
			t.Errorf("%s: findFinnedXWingFinPerp(%v, %v) = (%d, %t), want (%d, %t)",
				c.name, c.base, c.fin, gotPerp, gotOK, c.wantPerp, c.wantOK)
		}
	}
}

// ============================================================================
// xwingFinnedTargetPerp
// ============================================================================

// TestXWingFinnedTargetPerpPicksTheBasePositionSharingTheFinBox pins the box
// arithmetic that decides which of the two base positions the eliminations run
// down, and the refusal when neither shares the fin's band.
func TestXWingFinnedTargetPerpPicksTheBasePositionSharingTheFinBox(t *testing.T) {
	cases := []struct {
		name    string
		base    []int
		finPerp int
		want    int
	}{
		{"second position shares the band", []int{1, 4}, 5, 4},
		{"first position shares the band", []int{7, 1}, 8, 7},
		{"neither shares the band", []int{0, 1}, 8, -1},
	}
	for _, c := range cases {
		if got := xwingFinnedTargetPerp(c.base, c.finPerp); got != c.want {
			t.Errorf("%s: xwingFinnedTargetPerp(%v, %d) = %d, want %d",
				c.name, c.base, c.finPerp, got, c.want)
		}
	}
}

// ============================================================================
// collectFinnedXWingElims
// ============================================================================

// TestCollectFinnedXWingElimsWalksTheFinBoxBandOnly pins the elimination scan in
// its row orientation: it covers exactly the three lines of the fin's band, skips
// the base and fin lines within it, and reads the cell at the target column.
func TestCollectFinnedXWingElimsWalksTheFinBoxBandOnly(t *testing.T) {
	b := finnedBoard(5,
		[2]int{0, 4}, [2]int{1, 4}, [2]int{2, 4}, [2]int{3, 4},
	)

	got := collectFinnedXWingElims(b, 5, 0, 1, 4, 0, true)

	want := []core.Candidate{{Row: 2, Col: 4, Digit: 5}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("row eliminations = %+v, want %+v", got, want)
	}
}

// TestCollectFinnedXWingElimsTransposesForColumns pins the same scan for the
// column orientation, where the band runs across columns and the target is a row.
func TestCollectFinnedXWingElimsTransposesForColumns(t *testing.T) {
	b := finnedBoard(5,
		[2]int{4, 0}, [2]int{4, 1}, [2]int{4, 2}, [2]int{4, 3},
	)

	got := collectFinnedXWingElims(b, 5, 0, 1, 4, 0, false)

	want := []core.Candidate{{Row: 4, Col: 2, Digit: 5}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("column eliminations = %+v, want %+v", got, want)
	}
}

// TestCollectFinnedXWingElimsCoversABandAwayFromTheOrigin pins the band's start,
// which the first-band cases above leave at zero and so cannot distinguish from
// an arithmetic that ignores the box index.
func TestCollectFinnedXWingElimsCoversABandAwayFromTheOrigin(t *testing.T) {
	b := finnedBoard(5,
		[2]int{6, 2}, [2]int{7, 2}, [2]int{8, 2},
	)

	got := collectFinnedXWingElims(b, 5, 6, 7, 2, 2, true)

	want := []core.Candidate{{Row: 8, Col: 2, Digit: 5}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("eliminations = %+v, want %+v", got, want)
	}
}

// TestDetectFinnedXWingScansPastAnUnusableFinLine checks that a line pair the
// admission check rejects only costs that pairing: the scan carries on to the
// next line rather than abandoning the base's remaining pairings. Row 1 here
// holds two positions, which disqualifies it as a fin, and row 2 is the real
// fin behind it.
func TestDetectFinnedXWingScansPastAnUnusableFinLine(t *testing.T) {
	b := finnedBoard(5,
		[2]int{0, 1}, [2]int{0, 4},
		[2]int{1, 4}, [2]int{1, 7},
		[2]int{2, 1}, [2]int{2, 4}, [2]int{2, 5},
	)

	assertMove(t, DetectFinnedXWing(b), &core.Move{
		Action:  "eliminate",
		Digit:   5,
		Targets: refs([2]int{0, 1}, [2]int{0, 4}, [2]int{2, 1}, [2]int{2, 4}, [2]int{2, 5}),
		Eliminations: []core.Candidate{
			{Row: 1, Col: 4, Digit: 5},
		},
		Explanation: "Finned X-Wing: 5 in rows 1,3 with fin at R3C6",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 1}, [2]int{0, 4}, [2]int{2, 1}, [2]int{2, 4}),
			Secondary: refs([2]int{2, 5}),
		},
	})
}

// TestDetectFinnedXWingRejectsAFinLineWithTwoExtraPositions checks the refusal
// path out of the fin extraction. Two positions outside the base leave no single
// fin, and a detector that carried on regardless would read the fin as column 1
// and eliminate down it.
func TestDetectFinnedXWingRejectsAFinLineWithTwoExtraPositions(t *testing.T) {
	b := finnedBoard(5,
		[2]int{0, 1}, [2]int{0, 4},
		[2]int{1, 1}, [2]int{1, 5}, [2]int{1, 6},
		[2]int{2, 1},
	)

	if move := DetectFinnedXWing(b); move != nil {
		t.Errorf("expected nil when the fin line carries two extra positions, got %+v", move)
	}
}

// TestDetectFinnedXWingScansTheLowestDigit is the lower end of the digit loop: a
// pattern on digit 1 is missed by a scan that starts at 2.
func TestDetectFinnedXWingScansTheLowestDigit(t *testing.T) {
	assertMove(t, DetectFinnedXWing(finnedRowPattern(1)), &core.Move{
		Action:  "eliminate",
		Digit:   1,
		Targets: refs([2]int{0, 1}, [2]int{0, 4}, [2]int{1, 1}, [2]int{1, 4}, [2]int{1, 5}),
		Eliminations: []core.Candidate{
			{Row: 2, Col: 4, Digit: 1},
		},
		Explanation: "Finned X-Wing: 1 in rows 1,2 with fin at R2C6",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 1}, [2]int{0, 4}, [2]int{1, 1}, [2]int{1, 4}),
			Secondary: refs([2]int{1, 5}),
		},
	})
}
