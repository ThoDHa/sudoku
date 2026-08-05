package techniques

import (
	"testing"

	"sudoku-api/internal/core"
)

// The boards below are built with filledExcept, so the only cells carrying
// candidates are the ones named. That keeps each detector's search space to the
// listed cells and makes the returned Move fully determined.
//
// Cells are kept off row 0 and column 0 wherever a coordinate is asserted,
// because index 0 makes idx/GridSize, idx%GridSize and idx*GridSize agree and
// would hide any coordinate arithmetic error.

// ============================================================================
// DetectXYZWing
// ============================================================================

// TestDetectXYZWingPinsWholeMoveWhenSharedDigitIsMiddleCandidate pins the whole
// Move for an XYZ-Wing whose shared digit is the pivot's middle candidate.
//
// The pivot R2C2 holds {1,2,3}; wing R2C5 {1,2} shares the row and wing R3C3
// {2,3} shares the box, so 2 sits in one of the three cells and R2C1 (which
// sees all three) cannot hold it.
//
// The whole struct is asserted rather than the digit alone: the row/column
// arithmetic feeding Targets, Highlights and the explanation text is observable
// output, and nothing else in the package pinned it. Choosing the middle
// candidate as the shared digit also pins the pivot's candidate unpacking,
// since a detector that lost the middle candidate would never try this pattern.
// The single elimination pins the "at least one elimination" threshold, and the
// pattern's own three cells are absent from Eliminations even though all three
// hold digit 2 and see each other.
func TestDetectXYZWingPinsWholeMoveWhenSharedDigitIsMiddleCandidate(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 2, 3},
		idxOf(1, 4): {1, 2},
		idxOf(2, 2): {2, 3},
		idxOf(1, 0): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        2,
		Targets:      refs([2]int{1, 1}, [2]int{1, 4}, [2]int{2, 2}),
		Eliminations: []core.Candidate{{Row: 1, Col: 0, Digit: 2}},
		Explanation:  "XYZ-Wing: pivot R2C2 {1,3,2} with wings R2C5 {1,2} and R3C3 {3,2}: eliminate 2.",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 1}, [2]int{1, 4}, [2]int{2, 2}),
		},
	}

	assertMove(t, DetectXYZWing(b), want)
}

// TestDetectXYZWingPinsWholeMoveWhenSharedDigitIsLowestCandidate covers the
// same pattern with the shared digit moved to the pivot's lowest candidate.
//
// This reverses the sorted order inside each wing: with the shared digit below
// both wing digits, a wing reads {shared, other} rather than {other, shared},
// so the pattern is recognized through the second half of each wing-matching
// test rather than the first. It also pins the pivot's lowest candidate, which
// a detector that dropped it would never try as the shared digit.
func TestDetectXYZWingPinsWholeMoveWhenSharedDigitIsLowestCandidate(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 2, 3},
		idxOf(1, 4): {1, 2},
		idxOf(2, 2): {1, 3},
		idxOf(1, 0): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Targets:      refs([2]int{1, 1}, [2]int{1, 4}, [2]int{2, 2}),
		Eliminations: []core.Candidate{{Row: 1, Col: 0, Digit: 1}},
		Explanation:  "XYZ-Wing: pivot R2C2 {2,3,1} with wings R2C5 {2,1} and R3C3 {3,1}: eliminate 1.",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 1}, [2]int{1, 4}, [2]int{2, 2}),
		},
	}

	assertMove(t, DetectXYZWing(b), want)
}

// ============================================================================
// DetectWXYZWing
// ============================================================================

// TestDetectWXYZWingPinsWholeMoveAcrossFourRows pins the whole Move for a
// WXYZ-Wing whose four cells sit in four different rows.
//
// R2C2 {1,4}, R3C2 {1,3} and R4C2 {1,2,3,4} share column 2; R5C3 {2,4} shares
// box 4 with R4C2. Digits 1, 2 and 3 are restricted (every cell holding them
// sees every other), while 4 lives in R2C2 and R5C3, which cannot see each
// other, so 4 is the single non-restricted digit and R5C2 (which sees all
// three cells holding 4) loses it.
//
// The four cells occupy four distinct rows so that every adjacent pair in the
// explanation carries a different row number: an explanation that reused a
// neighbor's row index would otherwise print the same text. The 4-candidate
// cell pins the upper bound on the candidate count a pattern cell may hold.
func TestDetectWXYZWingPinsWholeMoveAcrossFourRows(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 4},
		idxOf(2, 1): {1, 3},
		idxOf(3, 1): {1, 2, 3, 4},
		idxOf(4, 2): {2, 4},
		idxOf(4, 1): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      refs([2]int{1, 1}, [2]int{2, 1}, [2]int{3, 1}, [2]int{4, 2}),
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 4}},
		Explanation:  "WXYZ-Wing: cells {R2C2,R3C2,R4C2,R5C3} contain [1 2 3 4]: eliminate non-restricted 4.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 1}, [2]int{3, 1}, [2]int{4, 2}),
			Secondary: refs([2]int{2, 1}),
		},
	}

	assertMove(t, DetectWXYZWing(b), want)
}

// TestDetectWXYZWingPinsWholeMoveAcrossFourColumns is the column counterpart of
// the four-row case: the same digit layout transposed onto four distinct
// columns, so every adjacent pair in the explanation carries a different column
// number. Together the two boards pin both coordinate halves of every cell
// reference the explanation prints.
func TestDetectWXYZWingPinsWholeMoveAcrossFourColumns(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 4},
		idxOf(1, 2): {1, 3},
		idxOf(1, 3): {1, 2, 3, 4},
		idxOf(2, 4): {2, 4},
		idxOf(1, 4): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      refs([2]int{1, 1}, [2]int{1, 2}, [2]int{1, 3}, [2]int{2, 4}),
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 4}},
		Explanation:  "WXYZ-Wing: cells {R2C2,R2C3,R2C4,R3C5} contain [1 2 3 4]: eliminate non-restricted 4.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 1}, [2]int{1, 3}, [2]int{2, 4}),
			Secondary: refs([2]int{1, 2}),
		},
	}

	assertMove(t, DetectWXYZWing(b), want)
}

// TestDetectWXYZWingTreatsDigitHeldByOneQuadCellAsRestricted covers a quad in
// which digit 2 appears in a single cell.
//
// A digit held by one cell has no pair of cells that could fail to see each
// other, so it is restricted and 4 remains the only non-restricted digit. Were
// a lone digit counted as non-restricted instead, the quad would carry two of
// them and be rejected, so the move returned here is what pins the rule.
func TestDetectWXYZWingTreatsDigitHeldByOneQuadCellAsRestricted(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 4},
		idxOf(2, 1): {1, 3},
		idxOf(3, 1): {1, 3},
		idxOf(4, 2): {2, 4},
		idxOf(4, 1): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      refs([2]int{1, 1}, [2]int{2, 1}, [2]int{3, 1}, [2]int{4, 2}),
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 4}},
		Explanation:  "WXYZ-Wing: cells {R2C2,R3C2,R4C2,R5C3} contain [1 2 3 4]: eliminate non-restricted 4.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 1}, [2]int{4, 2}),
			Secondary: refs([2]int{2, 1}, [2]int{3, 1}),
		},
	}

	assertMove(t, DetectWXYZWing(b), want)
}

// TestDetectWXYZWingNilWhenOneCellSeesNoOther covers the connectivity
// requirement. R8C8 holds the only other copy of digit 3 and shares no row,
// column or box with the three cells in column 2, so the four cells do not form
// a connected pattern. Everything else about the shape is valid: four digits
// across four cells, exactly one non-restricted digit, and R4C8 would lose a 3
// were the quad accepted.
func TestDetectWXYZWingNilWhenOneCellSeesNoOther(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 2},
		idxOf(2, 1): {1, 2},
		idxOf(3, 1): {2, 3},
		idxOf(7, 7): {3, 4},
		idxOf(3, 7): {1, 2, 3, 4, 5},
	})

	if move := DetectWXYZWing(b); move != nil {
		t.Errorf("expected nil: the fourth cell sees none of the other three, got %+v", move)
	}
}

// TestDetectWXYZWingNilWhenACellHoldsOneCandidate covers the lower bound on a
// pattern cell's candidate count. R2C2 holds a single candidate, leaving only
// three cells eligible for a quad. The remaining shape would otherwise fire:
// admitting the single-candidate cell yields four digits across four cells with
// 4 non-restricted, and R5C2 would lose it.
func TestDetectWXYZWingNilWhenACellHoldsOneCandidate(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {4},
		idxOf(2, 1): {1, 3},
		idxOf(3, 1): {1, 2, 3, 4},
		idxOf(4, 2): {2, 4},
		idxOf(4, 1): {1, 2, 3, 4, 5},
	})

	if move := DetectWXYZWing(b); move != nil {
		t.Errorf("expected nil: only three cells hold between two and four candidates, got %+v", move)
	}
}

// ============================================================================
// DetectALSXZ
// ============================================================================

// TestDetectALSXZPinsWholeMoveForTwoBivalueSets pins the whole Move for the
// smallest ALS-XZ there is: two single-cell ALS, R2C2 {1,2} and R2C5 {1,2},
// sharing row 2. Digit 1 is the restricted common, so 2 must fall in one of the
// two cells and R2C1 loses it.
//
// The digits are shared in ascending order, so the restricted common is the
// lower of the two and the elimination digit is reached only after the loop
// skips the restricted common itself. A detector that stopped at that skip
// instead of continuing would report the pair the other way round.
func TestDetectALSXZPinsWholeMoveForTwoBivalueSets(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 2},
		idxOf(1, 4): {1, 2},
		idxOf(1, 0): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        2,
		Targets:      refs([2]int{1, 1}, [2]int{1, 4}),
		Eliminations: []core.Candidate{{Row: 1, Col: 0, Digit: 2}},
		Explanation:  "ALS-XZ: ALS A {R2C2} and ALS B {R2C5} with restricted common 1: eliminate 2.",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 1}, [2]int{1, 4}),
		},
	}

	assertMove(t, DetectALSXZ(b), want)
}

// TestDetectALSXZPairsEachSetWithItsImmediateSuccessor pins which pair of ALS
// the search reports first.
//
// Three cells in row 2 hold {1,2}, so each is an ALS on its own and any two of
// them make a valid pair: the reported move depends entirely on which pair the
// enumeration reaches first. R2C2 with R2C5 costs R2C1 and R2C8 their 2; R2C2
// with R2C8 costs R2C1 and R2C5 theirs instead. Pinning the whole Move fixes
// the first pair as the adjacent one, so an enumeration that skipped a step
// would report the other pair's cells, elimination coordinates and wording.
func TestDetectALSXZPairsEachSetWithItsImmediateSuccessor(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 1): {1, 2},
		idxOf(1, 4): {1, 2},
		idxOf(1, 7): {1, 2},
		idxOf(1, 0): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:  "eliminate",
		Digit:   2,
		Targets: refs([2]int{1, 1}, [2]int{1, 4}),
		Eliminations: []core.Candidate{
			{Row: 1, Col: 0, Digit: 2},
			{Row: 1, Col: 7, Digit: 2},
		},
		Explanation: "ALS-XZ: ALS A {R2C2} and ALS B {R2C5} with restricted common 1: eliminate 2.",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 1}, [2]int{1, 4}),
		},
	}

	assertMove(t, DetectALSXZ(b), want)
}

// TestDetectALSXZFiresWhenRestrictedCommonIsNotTheFirstSharedDigit covers a
// pair whose first shared digit fails the restricted-common test.
//
// ALS A is R2C1 {1,2}; ALS B is R2C2 {2,3} plus R5C2 {1,3}. They share 1 and 2.
// Digit 1 sits in R2C1 and R5C2, which see neither each other's row, column nor
// box, so 1 is not a restricted common. Digit 2 sits in R2C1 and R2C2, which
// share row 2, so it is. A detector that abandoned the pair on the first
// failing digit would never reach 2 and would return nothing here.
func TestDetectALSXZFiresWhenRestrictedCommonIsNotTheFirstSharedDigit(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 0): {1, 2},
		idxOf(1, 1): {2, 3},
		idxOf(4, 1): {1, 3},
		idxOf(4, 0): {1, 2, 3, 4, 5},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Targets:      refs([2]int{1, 0}, [2]int{1, 1}, [2]int{4, 1}),
		Eliminations: []core.Candidate{{Row: 4, Col: 0, Digit: 1}},
		Explanation:  "ALS-XZ: ALS A {R2C1} and ALS B {R2C2, R5C2} with restricted common 2: eliminate 1.",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 0}, [2]int{1, 1}, [2]int{4, 1}),
		},
	}

	assertMove(t, DetectALSXZ(b), want)
}

// TestDetectALSXZFiresOnAFourCellALS covers the upper bound on ALS size.
//
// Row 2 holds four cells carrying five digits between them, which is an ALS
// only when sets of four cells are searched. Every smaller ALS on this board
// contains R3C1, so every pair drawn from them overlaps and is rejected; the
// four-cell set is the only partner R3C1 has. Restricting the search to three
// cells therefore leaves nothing to pair.
func TestDetectALSXZFiresOnAFourCellALS(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 0): {1, 2, 3},
		idxOf(1, 1): {3, 4, 5},
		idxOf(1, 2): {1, 4, 5},
		idxOf(1, 3): {2, 4, 5},
		idxOf(2, 0): {1, 3},
		idxOf(2, 1): {3, 6, 7, 8, 9},
	})

	want := &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Targets:      refs([2]int{1, 0}, [2]int{1, 1}, [2]int{1, 2}, [2]int{1, 3}, [2]int{2, 0}),
		Eliminations: []core.Candidate{{Row: 2, Col: 1, Digit: 3}},
		Explanation:  "ALS-XZ: ALS A {R2C1, R2C2, R2C3, R2C4} and ALS B {R3C1} with restricted common 1: eliminate 3.",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 0}, [2]int{1, 1}, [2]int{1, 2}, [2]int{1, 3}, [2]int{2, 0}),
		},
	}

	assertMove(t, DetectALSXZ(b), want)
}

// TestDetectALSXZNilWhenTheOnlyPairNeedsAFiveCellALS covers the same bound from
// the other side. Row 2 holds five cells carrying six digits, which is an ALS
// only when sets of five cells are searched. Were it found, it would pair with
// R3C1 {3,5} on restricted common 3 and cost R3C2 its 5. Every ALS the search
// does find contains R3C1, so every pair overlaps and detection returns nil.
func TestDetectALSXZNilWhenTheOnlyPairNeedsAFiveCellALS(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(1, 0): {1, 4, 5},
		idxOf(1, 1): {3, 5, 6},
		idxOf(1, 2): {1, 2, 3},
		idxOf(1, 3): {2, 4, 6},
		idxOf(1, 4): {1, 2, 4},
		idxOf(2, 0): {3, 5},
		idxOf(2, 1): {5, 7, 8, 9},
	})

	if move := DetectALSXZ(b); move != nil {
		t.Errorf("expected nil: the only usable partner needs a five-cell ALS, got %+v", move)
	}
}

// TestDetectALSXZNilWhenEveryALSPairSharesACell covers the requirement that the
// two ALS be disjoint.
//
// Box 1 holds five candidate cells whose every three-cell subset carries four
// digits, so each is an ALS. Three cells cannot be drawn twice from five
// without repetition, so every pair of these sets shares a cell and detection
// returns nil. The overlap is the only thing stopping a move: R1C1 R1C2 R1C3
// and R1C1 R2C1 R2C2 share only R1C1, digit 1 is a restricted common between
// them, and R3C3 would lose its 2.
func TestDetectALSXZNilWhenEveryALSPairSharesACell(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {2, 3, 4},
		idxOf(0, 1): {1, 2, 3},
		idxOf(0, 2): {1, 2, 4},
		idxOf(1, 0): {1, 3, 4},
		idxOf(1, 1): {1, 2, 3, 4},
		idxOf(2, 2): {2, 5, 6, 7, 8},
	})

	if move := DetectALSXZ(b); move != nil {
		t.Errorf("expected nil: every pair of ALS on this board shares a cell, got %+v", move)
	}
}
