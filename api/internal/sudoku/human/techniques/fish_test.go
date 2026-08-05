package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// Tests for fish.go: DetectXWing, DetectXYWing and DetectSimpleColoring.
//
// Every board here is built with filledExcept, so only the listed cells carry
// candidates at all. That is what makes the geometry exact: a detector that
// counts "exactly two cells of a unit hold this digit" sees only the cells the
// test names, and each conjugate pair, X-Wing line and wing is deliberate.
//
// The three detectors are pinned with assertMove (ur_test.go) rather than by
// spot-checking a digit or one elimination, because every coordinate in the
// returned Move is computed arithmetic and every one of them is observable.

// ============================================================================
// DetectXWing
// ============================================================================

// fishXWingRowBoard places digit 1 in exactly two columns (4 and 7) of three
// rows (3, 6 and 8). Rows 3 and 6 form the X-Wing; row 8 supplies the two
// eliminations. No column holds exactly two of the digit, so the column axis
// finds nothing and only the row axis can produce a move.
func fishXWingRowBoard() *testBoard {
	return filledExcept(map[int][]int{
		idxOf(2, 3): {1}, idxOf(2, 6): {1},
		idxOf(5, 3): {1}, idxOf(5, 6): {1},
		idxOf(7, 3): {1}, idxOf(7, 6): {1},
	})
}

// TestDetectXWingRowPairPinsWholeMove pins the complete row-axis Move: the four
// corner targets, both eliminations on the perpendicular columns, the row-form
// explanation and the eighteen secondary highlights covering the two source
// rows. The digit is 1 so a scan that starts at 2 finds nothing, and the lines
// are rows 3 and 6 (adjacent in the sorted line list) so a scan that pairs a
// line only with the line after next picks rows 3 and 8 instead.
func TestDetectXWingRowPairPinsWholeMove(t *testing.T) {
	move := DetectXWing(fishXWingRowBoard())

	assertMove(t, move, &core.Move{
		Action:      "eliminate",
		Digit:       1,
		Explanation: "X-Wing: 1 in rows 3,6 columns 4,7",
		Targets:     refs([2]int{2, 3}, [2]int{2, 6}, [2]int{5, 3}, [2]int{5, 6}),
		Eliminations: []core.Candidate{
			{Row: 7, Col: 3, Digit: 1},
			{Row: 7, Col: 6, Digit: 1},
		},
		Highlights: core.Highlights{
			Primary: refs([2]int{2, 3}, [2]int{2, 6}, [2]int{5, 3}, [2]int{5, 6}),
			Secondary: refs(
				[2]int{2, 0}, [2]int{5, 0}, [2]int{2, 1}, [2]int{5, 1},
				[2]int{2, 2}, [2]int{5, 2}, [2]int{2, 3}, [2]int{5, 3},
				[2]int{2, 4}, [2]int{5, 4}, [2]int{2, 5}, [2]int{5, 5},
				[2]int{2, 6}, [2]int{5, 6}, [2]int{2, 7}, [2]int{5, 7},
				[2]int{2, 8}, [2]int{5, 8},
			),
		},
	})
}

// fishXWingColumnBoard is the transpose of fishXWingRowBoard on digit 9: the
// digit sits in exactly two rows (2 and 5) of three columns (3, 7 and 9), so no
// row holds exactly two and only the column axis can produce a move.
func fishXWingColumnBoard() *testBoard {
	return filledExcept(map[int][]int{
		idxOf(1, 2): {9}, idxOf(4, 2): {9},
		idxOf(1, 6): {9}, idxOf(4, 6): {9},
		idxOf(1, 8): {9}, idxOf(4, 8): {9},
	})
}

// TestDetectXWingColumnPairPinsWholeMove pins the complete column-axis Move.
// It is the counterpart to the row test: the coordinate resolution, the
// column-form explanation and the secondary highlights all take their other
// branch here. The digit is 9 so a digit scan that stops one short of the grid
// size never reaches this pattern.
func TestDetectXWingColumnPairPinsWholeMove(t *testing.T) {
	move := DetectXWing(fishXWingColumnBoard())

	assertMove(t, move, &core.Move{
		Action:      "eliminate",
		Digit:       9,
		Explanation: "X-Wing: 9 in columns 3,7 rows 2,5",
		Targets:     refs([2]int{1, 2}, [2]int{1, 6}, [2]int{4, 2}, [2]int{4, 6}),
		Eliminations: []core.Candidate{
			{Row: 1, Col: 8, Digit: 9},
			{Row: 4, Col: 8, Digit: 9},
		},
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 2}, [2]int{1, 6}, [2]int{4, 2}, [2]int{4, 6}),
			Secondary: refs(
				[2]int{0, 2}, [2]int{0, 6}, [2]int{1, 2}, [2]int{1, 6},
				[2]int{2, 2}, [2]int{2, 6}, [2]int{3, 2}, [2]int{3, 6},
				[2]int{4, 2}, [2]int{4, 6}, [2]int{5, 2}, [2]int{5, 6},
				[2]int{6, 2}, [2]int{6, 6}, [2]int{7, 2}, [2]int{7, 6},
				[2]int{8, 2}, [2]int{8, 6},
			),
		},
	})
}

// TestDetectXWingRejectsLinesSharingOnlyOnePerpendicular pins that a line pair
// must agree on *both* perpendicular coordinates.
//
// Digit 1 sits in exactly two columns of four rows. Sorted, the pairing visits
// rows 3 and 6 first, which agree on column 4 only; then rows 3 and 7, which
// agree on column 7 only; and only then rows 3 and 8, which agree on both and
// are the real X-Wing. Accepting either near miss returns a different move,
// and abandoning the scan at the first mismatch returns none, so this covers
// the guard from three directions at once.
func TestDetectXWingRejectsLinesSharingOnlyOnePerpendicular(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(2, 3): {1}, idxOf(2, 6): {1}, // row 3: the X-Wing's upper line
		idxOf(5, 3): {1}, idxOf(5, 7): {1}, // row 6: shares only the first column
		idxOf(6, 4): {1}, idxOf(6, 6): {1}, // row 7: shares only the second column
		idxOf(7, 3): {1}, idxOf(7, 6): {1}, // row 8: the X-Wing's lower line
	})

	assertMove(t, DetectXWing(b), &core.Move{
		Action:      "eliminate",
		Digit:       1,
		Explanation: "X-Wing: 1 in rows 3,8 columns 4,7",
		Targets:     refs([2]int{2, 3}, [2]int{2, 6}, [2]int{7, 3}, [2]int{7, 6}),
		Eliminations: []core.Candidate{
			{Row: 5, Col: 3, Digit: 1},
			{Row: 6, Col: 6, Digit: 1},
		},
		Highlights: core.Highlights{
			Primary: refs([2]int{2, 3}, [2]int{2, 6}, [2]int{7, 3}, [2]int{7, 6}),
			Secondary: refs(
				[2]int{2, 0}, [2]int{7, 0}, [2]int{2, 1}, [2]int{7, 1},
				[2]int{2, 2}, [2]int{7, 2}, [2]int{2, 3}, [2]int{7, 3},
				[2]int{2, 4}, [2]int{7, 4}, [2]int{2, 5}, [2]int{7, 5},
				[2]int{2, 6}, [2]int{7, 6}, [2]int{2, 7}, [2]int{7, 7},
				[2]int{2, 8}, [2]int{7, 8},
			),
		},
	})
}

// TestDetectXWingNilWhenLinesDoNotShareColumns covers the rejection arm of the
// line pairing: both rows hold exactly two candidates, but at different column
// pairs, so no rectangle exists.
func TestDetectXWingNilWhenLinesDoNotShareColumns(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(2, 3): {1}, idxOf(2, 6): {1},
		idxOf(5, 4): {1}, idxOf(5, 7): {1},
	})

	if move := DetectXWing(b); move != nil {
		t.Errorf("expected nil: the two rows hold the digit in different columns, got %+v", move)
	}
}

// TestDetectXWingNilWhenRectangleHasNoEliminations covers the guard that a
// found rectangle still needs a victim: the two rows share their columns, but
// no other row carries the digit in either column.
func TestDetectXWingNilWhenRectangleHasNoEliminations(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(2, 3): {1}, idxOf(2, 6): {1},
		idxOf(5, 3): {1}, idxOf(5, 6): {1},
	})

	if move := DetectXWing(b); move != nil {
		t.Errorf("expected nil: the rectangle eliminates nothing, got %+v", move)
	}
}

// ============================================================================
// DetectXYWing
// ============================================================================

// TestDetectXYWingPinsWholeMove pins the complete XY-Wing Move. The pivot
// R4C5 {1,2} sees the XZ wing R4C7 {1,3} along row 4 and the YZ wing R7C5
// {2,3} down column 5, and R7C7 is the only cell seeing both wings while
// holding 3. Pivot, wings and victim all sit off row 1 and column 1, so a
// mutant that swaps the row and column arithmetic changes the output.
func TestDetectXYWingPinsWholeMove(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(3, 4): {1, 2},
		idxOf(3, 6): {1, 3},
		idxOf(6, 4): {2, 3},
		idxOf(6, 6): {3},
	})

	assertMove(t, DetectXYWing(b), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Explanation:  "XY-Wing: pivot at R4C5 with wings: eliminate 3.",
		Targets:      refs([2]int{3, 4}, [2]int{3, 6}, [2]int{6, 4}),
		Eliminations: []core.Candidate{{Row: 6, Col: 6, Digit: 3}},
		Highlights: core.Highlights{
			Primary: refs([2]int{3, 4}, [2]int{3, 6}, [2]int{6, 4}),
		},
	})
}

// TestDetectXYWingSkipsYZWingWithADifferentThirdDigit covers three arms the
// straightforward geometry above never reaches.
//
// The pivot R5C5 is {5,6}, so x=5 and y=6. Its XZ wing R5C2 is {3,5}, whose
// lower candidate is not x, so the shared digit is read from the other end of
// the wing. Two YZ wings see the pivot: R2C5 {4,6} carries 4, which does not
// match the XZ wing's 3, and R5C8 {3,6} does; the first must be passed over
// rather than ending the search. R5C1 is the only cell seeing both wings while
// holding 3.
func TestDetectXYWingSkipsYZWingWithADifferentThirdDigit(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(4, 4): {5, 6},
		idxOf(4, 1): {3, 5},
		idxOf(1, 4): {4, 6},
		idxOf(4, 7): {3, 6},
		idxOf(4, 0): {3},
	})

	assertMove(t, DetectXYWing(b), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Explanation:  "XY-Wing: pivot at R5C5 with wings: eliminate 3.",
		Targets:      refs([2]int{4, 4}, [2]int{4, 1}, [2]int{4, 7}),
		Eliminations: []core.Candidate{{Row: 4, Col: 0, Digit: 3}},
		Highlights: core.Highlights{
			Primary: refs([2]int{4, 4}, [2]int{4, 1}, [2]int{4, 7}),
		},
	})
}

// TestDetectXYWingNilWhenNoCellSeesBothWings covers the guard that a complete
// pivot-and-wings geometry still needs a victim. R7C7 is dropped from the
// board of TestDetectXYWingPinsWholeMove, leaving nothing that sees both wings
// and holds 3.
func TestDetectXYWingNilWhenNoCellSeesBothWings(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(3, 4): {1, 2},
		idxOf(3, 6): {1, 3},
		idxOf(6, 4): {2, 3},
	})

	if move := DetectXYWing(b); move != nil {
		t.Errorf("expected nil: no cell sees both wings and holds the shared digit, got %+v", move)
	}
}

// TestDetectXYWingSkipsWingsSharingNoDigitWithThePivot covers the same rule
// from its other side, with a decoy that would change the answer if it were
// admitted rather than merely being harmless.
//
// R3C5 {3,4} is a bivalue peer of the pivot R4C5 {1,2} holding neither of the
// pivot's digits, and it is scanned before either real wing. Admitted, it would
// be classed as a YZ wing whose shared digit is 3, matching the XZ wing R4C7,
// and the pair would eliminate 3 from R3C7 instead: a different move. Ending
// the wing scan at it instead of passing over it finds no wings at all. The
// correct answer is the XY-Wing on R4C7 and R7C5 eliminating 3 from R7C7.
func TestDetectXYWingSkipsWingsSharingNoDigitWithThePivot(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(2, 4): {3, 4}, // decoy: bivalue peer sharing no digit with the pivot
		idxOf(2, 6): {3},    // only the decoy pairing would eliminate here
		idxOf(3, 4): {1, 2},
		idxOf(3, 6): {1, 3},
		idxOf(6, 4): {2, 3},
		idxOf(6, 6): {3},
	})

	assertMove(t, DetectXYWing(b), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Explanation:  "XY-Wing: pivot at R4C5 with wings: eliminate 3.",
		Targets:      refs([2]int{3, 4}, [2]int{3, 6}, [2]int{6, 4}),
		Eliminations: []core.Candidate{{Row: 6, Col: 6, Digit: 3}},
		Highlights: core.Highlights{
			Primary: refs([2]int{3, 4}, [2]int{3, 6}, [2]int{6, 4}),
		},
	})
}

// TestDetectXYWingIgnoresWingsHoldingBothPivotDigits covers the rule that a
// wing must hold exactly one of the pivot's digits. R4C7 here is {1,2}, the
// same pair as the pivot, so it belongs to neither wing list and no XY-Wing
// exists even though R7C7 would otherwise be a victim.
func TestDetectXYWingIgnoresWingsHoldingBothPivotDigits(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(3, 4): {1, 2},
		idxOf(3, 6): {1, 2},
		idxOf(6, 4): {2, 3},
		idxOf(6, 6): {3},
	})

	if move := DetectXYWing(b); move != nil {
		t.Errorf("expected nil: the only row wing repeats the pivot's own pair, got %+v", move)
	}
}

// ============================================================================
// DetectSimpleColoring
// ============================================================================

// fishColoringCells is a four-cell conjugate net for one digit, plus the three
// uncolored cells that make the geometry exact.
//
// The net is R4C4 - R4C8 (row 4), R4C4 - R8C4 (column 4) and R4C8 - R5C9
// (box 6), one link of each unit type, so removing any one of the three unit
// scans disconnects it. Coloring from R4C4 gives color1 {R4C4, R5C9} and
// color2 {R4C8, R8C4}: R5C9 is reached two hops out, so it enters color1 only
// through the walk's own bookkeeping rather than as the starting cell.
//
// R8C9 is the victim: it sees R5C9 down column 9 and R8C4 along row 8, and it
// sees neither R4C4 nor R4C8. R8C2 and R1C9 are decoys that keep row 8 and
// column 9 at three cells each, so neither becomes a conjugate pair of its own;
// each sees only one color and is therefore not a victim itself.
func fishColoringCells(digit int) map[int][]int {
	return map[int][]int{
		idxOf(3, 3): {digit}, // R4C4
		idxOf(3, 7): {digit}, // R4C8
		idxOf(7, 3): {digit}, // R8C4
		idxOf(4, 8): {digit}, // R5C9
		idxOf(7, 1): {digit}, // R8C2 decoy
		idxOf(0, 8): {digit}, // R1C9 decoy
		idxOf(7, 8): {digit}, // R8C9 victim
	}
}

// TestDetectSimpleColoringPinsWholeMove pins the complete Move on digit 1: the
// single target, the single elimination, the explanation naming the victim's
// coordinates, and the secondary highlights listing color1 followed by color2
// in walk order. The digit is 1, so a scan that starts at 2 finds nothing.
func TestDetectSimpleColoringPinsWholeMove(t *testing.T) {
	b := filledExcept(fishColoringCells(1))

	assertMove(t, DetectSimpleColoring(b), &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Explanation:  "Simple Coloring: cell R8C9 sees both colors for 1",
		Targets:      refs([2]int{7, 8}),
		Eliminations: []core.Candidate{{Row: 7, Col: 8, Digit: 1}},
		Highlights: core.Highlights{
			Primary:   refs([2]int{7, 8}),
			Secondary: refs([2]int{3, 3}, [2]int{4, 8}, [2]int{3, 7}, [2]int{7, 3}),
		},
	})
}

// TestDetectSimpleColoringFiresOnTheHighestDigit runs the same net on digit 9,
// the last digit scanned. The eight digits before it hold no candidate at all,
// so this also covers a full pass over digits that build no conjugate pair.
func TestDetectSimpleColoringFiresOnTheHighestDigit(t *testing.T) {
	b := filledExcept(fishColoringCells(9))

	assertMove(t, DetectSimpleColoring(b), &core.Move{
		Action:       "eliminate",
		Digit:        9,
		Explanation:  "Simple Coloring: cell R8C9 sees both colors for 9",
		Targets:      refs([2]int{7, 8}),
		Eliminations: []core.Candidate{{Row: 7, Col: 8, Digit: 9}},
		Highlights: core.Highlights{
			Primary:   refs([2]int{7, 8}),
			Secondary: refs([2]int{3, 3}, [2]int{4, 8}, [2]int{3, 7}, [2]int{7, 3}),
		},
	})
}

// TestDetectSimpleColoringNilWhenNoCellSeesBothColors covers the fall-through:
// the conjugate net exists and is two-colored, but the victim and both decoys
// are removed, so nothing outside the net sees a cell of each color.
func TestDetectSimpleColoringNilWhenNoCellSeesBothColors(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(3, 3): {1}, idxOf(3, 7): {1}, idxOf(7, 3): {1}, idxOf(4, 8): {1},
	})

	if move := DetectSimpleColoring(b); move != nil {
		t.Errorf("expected nil: no uncolored cell sees both colors, got %+v", move)
	}
}

// TestLinkConjugatesRecordsBothDirections pins the extracted edge recorder that
// all three unit scans share. Both endpoints must gain the other, and a second
// edge on an endpoint must append rather than replace, since a cell belongs to
// a row, a column and a box at once and can be linked in each.
func TestLinkConjugatesRecordsBothDirections(t *testing.T) {
	conjugates := map[int][]int{}

	linkConjugates(conjugates, 30, 34)
	linkConjugates(conjugates, 30, 66)

	want := map[int][]int{
		30: {34, 66},
		34: {30},
		66: {30},
	}
	if !reflect.DeepEqual(conjugates, want) {
		t.Errorf("conjugates = %v, want %v", conjugates, want)
	}
}
