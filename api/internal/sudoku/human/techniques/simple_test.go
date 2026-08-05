package techniques

import (
	"fmt"
	"reflect"
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// simpleBoard builds a board with every cell empty and no candidates anywhere,
// then applies the listed candidate sets. Starting from nothing rather than
// from a full candidate grid keeps each fixture's unit contents exactly what
// the test names, so a detector that fires does so for the stated reason.
func simpleBoard(overrides map[int][]int) *testBoard {
	b := &testBoard{}
	for idx, cands := range overrides {
		b.candidates[idx] = NewCandidates(cands)
	}
	return b
}

// simpleCands is the Eliminations slice shorthand: each triple is row, column,
// digit.
func simpleCands(rcd ...[3]int) []core.Candidate {
	out := make([]core.Candidate, len(rcd))
	for i, t := range rcd {
		out[i] = core.Candidate{Row: t[0], Col: t[1], Digit: t[2]}
	}
	return out
}

// ============================================================================
// DetectNakedSingle
// ============================================================================

// TestDetectNakedSingleReturnsCompleteMove pins every field of the naked-single
// move. The target sits at R5C7 rather than R1C1 so that the explanation's row
// and column arithmetic is observable: at row 0 column 0 the +1 offsets are
// indistinguishable from their neighbors.
func TestDetectNakedSingleReturnsCompleteMove(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2}, // two candidates: skipped
		idxOf(4, 6): {7},    // the sole candidate
	})

	assertMove(t, DetectNakedSingle(b), &core.Move{
		Action:      constants.ActionAssign,
		Digit:       7,
		Targets:     refs([2]int{4, 6}),
		Explanation: "Cell R5C7 has only one candidate: 7",
		Highlights: core.Highlights{
			Primary: refs([2]int{4, 6}),
		},
	})
}

// TestDetectNakedSingleIgnoresFilledCellWithOneCandidate covers the emptiness
// half of the guard. R1C1 already holds 9 while still carrying a stale single
// candidate, so only the genuinely empty R5C7 may be assigned.
func TestDetectNakedSingleIgnoresFilledCellWithOneCandidate(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {3},
		idxOf(4, 6): {7},
	})
	b.cells[idxOf(0, 0)] = 9

	move := DetectNakedSingle(b)
	if move == nil {
		t.Fatal("expected a naked-single move")
	}
	if move.Digit != 7 || !reflect.DeepEqual(move.Targets, refs([2]int{4, 6})) {
		t.Errorf("expected assign 7 at R5C7, got digit %d at %+v", move.Digit, move.Targets)
	}
}

// ============================================================================
// DetectHiddenSingle: unit scan order
// ============================================================================

// TestDetectHiddenSingleReturnsCompleteRowMove pins the whole move for the row
// scan, including the eliminations of the target cell's other candidates and
// the row highlight, none of which any existing test asserts. Digits 1, 3 and 9
// each occupy several cells of row 4, leaving 7 as the one confined digit.
func TestDetectHiddenSingleReturnsCompleteRowMove(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 0): {1, 3},
		idxOf(4, 1): {1, 3},
		idxOf(4, 6): {1, 3, 7, 9},
		idxOf(4, 7): {1, 9},
		idxOf(4, 8): {1, 9},
	})

	assertMove(t, DetectHiddenSingle(b), &core.Move{
		Action:       constants.ActionAssign,
		Digit:        7,
		Targets:      refs([2]int{4, 6}),
		Eliminations: simpleCands([3]int{4, 6, 1}, [3]int{4, 6, 3}, [3]int{4, 6, 9}),
		Explanation:  "In row 5, 7 can only go in R5C7",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 6}),
			Secondary: ToCellRefs(RowIndices[4]),
		},
	})
}

// TestDetectHiddenSingleReturnsCompleteColumnMove forces the column scan to be
// the one that fires. Rows 3 and 4 each hold digit 7 twice, so no row is
// confined, while column 3 holds it once. Box 4 would also fire, so a detector
// that dropped the column result would return the box move instead of nil.
func TestDetectHiddenSingleReturnsCompleteColumnMove(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(3, 3): {1, 2, 7},
		idxOf(3, 7): {1, 2, 7},
		idxOf(4, 3): {1, 2},
		idxOf(4, 7): {1, 2},
	})

	assertMove(t, DetectHiddenSingle(b), &core.Move{
		Action:       constants.ActionAssign,
		Digit:        7,
		Targets:      refs([2]int{3, 3}),
		Eliminations: simpleCands([3]int{3, 3, 1}, [3]int{3, 3, 2}),
		Explanation:  "In column 4, 7 can only go in R4C4",
		Highlights: core.Highlights{
			Primary:   refs([2]int{3, 3}),
			Secondary: ToCellRefs(ColIndices[3]),
		},
	})
}

// TestDetectHiddenSingleReturnsCompleteBoxMove forces the box scan to be the
// one that fires. Digit 7 appears twice in row 3, twice in row 6, twice in
// column 3 and twice in column 7, so neither line scan is confined, but box 4
// holds it exactly once.
func TestDetectHiddenSingleReturnsCompleteBoxMove(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(3, 3): {1, 2, 7},
		idxOf(3, 4): {1, 2},
		idxOf(4, 3): {1, 2},
		idxOf(4, 4): {1, 2},
		idxOf(3, 7): {1, 2, 7},
		idxOf(6, 3): {1, 2, 7},
		idxOf(6, 7): {1, 2, 7},
	})

	assertMove(t, DetectHiddenSingle(b), &core.Move{
		Action:       constants.ActionAssign,
		Digit:        7,
		Targets:      refs([2]int{3, 3}),
		Eliminations: simpleCands([3]int{3, 3, 1}, [3]int{3, 3, 2}),
		Explanation:  "In box 5, 7 can only go in R4C4",
		Highlights: core.Highlights{
			Primary:   refs([2]int{3, 3}),
			Secondary: ToCellRefs(BoxIndices[4]),
		},
	})
}

// ============================================================================
// findHiddenSingleInUnit
// ============================================================================

// TestFindHiddenSingleInUnitScansEveryDigit covers both ends of the digit
// range. Digit 1 is the first value scanned and digit 9 the last, so a loop
// that started one digit late or stopped one digit early would miss one of
// these two units entirely.
func TestFindHiddenSingleInUnitScansEveryDigit(t *testing.T) {
	for _, tc := range []struct {
		name  string
		digit int
	}{
		{"first digit", 1},
		{"last digit", constants.GridSize},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := simpleBoard(map[int][]int{
				idxOf(4, 0): {3, 4},
				idxOf(4, 1): {3, 4},
				idxOf(4, 6): {tc.digit, 3},
			})

			assertMove(t, findHiddenSingleInUnit(b, 4, RowIndices[4], "row"), &core.Move{
				Action:       constants.ActionAssign,
				Digit:        tc.digit,
				Targets:      refs([2]int{4, 6}),
				Eliminations: simpleCands([3]int{4, 6, 3}),
				Explanation:  fmt.Sprintf("In row 5, %d can only go in R5C7", tc.digit),
				Highlights: core.Highlights{
					Primary:   refs([2]int{4, 6}),
					Secondary: ToCellRefs(RowIndices[4]),
				},
			})
		})
	}
}

// TestFindHiddenSingleInUnitSkipsDigitAlreadyPlacedInUnit covers the placed
// guard. Digit 5 is a candidate in exactly one empty cell of row 4, which would
// look like a hidden single, except that R5C2 already holds 5. A detector that
// forgot the placement, or that stopped scanning without recording it, would
// assign 5 a second time in the same row.
func TestFindHiddenSingleInUnitSkipsDigitAlreadyPlacedInUnit(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 0): {2, 5},
		idxOf(4, 2): {2, 3},
		idxOf(4, 3): {3, 4},
		idxOf(4, 4): {4, 6},
		idxOf(4, 5): {6, 7},
		idxOf(4, 6): {7, 8},
		idxOf(4, 7): {8, 9},
		idxOf(4, 8): {9, 2},
	})
	b.cells[idxOf(4, 1)] = 5

	if move := findHiddenSingleInUnit(b, 4, RowIndices[4], "row"); move != nil {
		t.Errorf("digit 5 already sits at R5C2, so row 5 has no hidden single, got %+v", move)
	}
}

// TestFindHiddenSingleInUnitContinuesPastNakedSingleTarget covers the guard
// that hands a single-candidate cell to naked-single detection. Digit 5's only
// position R5C1 is such a cell, so the scan must skip that digit and go on to
// find the genuine hidden single on digit 7 later in the same unit.
func TestFindHiddenSingleInUnitContinuesPastNakedSingleTarget(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 0): {5},
		idxOf(4, 1): {3, 4},
		idxOf(4, 2): {3, 4},
		idxOf(4, 6): {3, 7},
	})

	assertMove(t, findHiddenSingleInUnit(b, 4, RowIndices[4], "row"), &core.Move{
		Action:       constants.ActionAssign,
		Digit:        7,
		Targets:      refs([2]int{4, 6}),
		Eliminations: simpleCands([3]int{4, 6, 3}),
		Explanation:  "In row 5, 7 can only go in R5C7",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 6}),
			Secondary: ToCellRefs(RowIndices[4]),
		},
	})
}

// TestUnitDigitPositionsStopsAtAPlacedDigit pins the scan that backs the hidden
// single search. A unit already holding the digit yields no positions at all,
// so the caller cannot mistake the candidates seen before that cell for a
// confined digit.
func TestUnitDigitPositionsStopsAtAPlacedDigit(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 0): {2, 5},
		idxOf(4, 2): {5, 7},
		idxOf(4, 6): {5, 8},
	})

	positions, placed := unitDigitPositions(b, RowIndices[4], 5)
	if placed {
		t.Fatalf("digit 5 sits in no cell of row 5, got placed=true")
	}
	if want := []int{idxOf(4, 0), idxOf(4, 2), idxOf(4, 6)}; !reflect.DeepEqual(positions, want) {
		t.Errorf("positions = %v, want %v", positions, want)
	}

	b.cells[idxOf(4, 2)] = 5
	positions, placed = unitDigitPositions(b, RowIndices[4], 5)
	if !placed {
		t.Errorf("digit 5 sits at R5C3, want placed=true")
	}
	if positions != nil {
		t.Errorf("positions = %v, want none once the digit is placed", positions)
	}
}

// ============================================================================
// buildHiddenSingleMove
// ============================================================================

// TestBuildHiddenSingleMoveEliminatesEveryOtherCandidate pins the elimination
// list directly. The target carries candidates at both ends of the digit range
// plus the assigned digit itself, so an elimination loop that started late,
// stopped early, kept the assigned digit, or ignored candidacy is visible.
func TestBuildHiddenSingleMoveEliminatesEveryOtherCandidate(t *testing.T) {
	got := buildHiddenSingleMove(4, 6, 7, 4, "row", RowIndices[4],
		NewCandidates([]int{1, 3, 7, constants.GridSize}))

	assertMove(t, got, &core.Move{
		Action:  constants.ActionAssign,
		Digit:   7,
		Targets: refs([2]int{4, 6}),
		Eliminations: simpleCands(
			[3]int{4, 6, 1}, [3]int{4, 6, 3}, [3]int{4, 6, constants.GridSize}),
		Explanation: "In row 5, 7 can only go in R5C7",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 6}),
			Secondary: ToCellRefs(RowIndices[4]),
		},
	})
}

// ============================================================================
// DetectPointingPair
// ============================================================================

// pointingPairBoard confines digit to the row-4 cells of box 4 and leaves one
// victim for it at R5C2, outside the box but on the same row.
func pointingPairBoard(digit int) *testBoard {
	return simpleBoard(map[int][]int{
		idxOf(4, 3): {digit, 5},
		idxOf(4, 4): {digit, 5},
		idxOf(4, 1): {digit, 2},
	})
}

// TestDetectPointingPairScansEveryDigit covers both ends of the digit range:
// digit 1 is scanned first and digit 9 last, so a loop starting late or
// stopping early misses one of these two boards.
func TestDetectPointingPairScansEveryDigit(t *testing.T) {
	for _, digit := range []int{1, constants.GridSize} {
		t.Run(fmt.Sprintf("digit %d", digit), func(t *testing.T) {
			move := DetectPointingPair(pointingPairBoard(digit))
			if move == nil {
				t.Fatalf("expected a pointing pair on digit %d", digit)
			}
			if move.Digit != digit {
				t.Errorf("Digit = %d, want %d", move.Digit, digit)
			}
		})
	}
}

// ============================================================================
// findPointingPairMove
// ============================================================================

// TestFindPointingPairMoveRequiresTwoOrThreePositions pins the arity contract.
// A single position is a hidden single rather than a pointing pair, and four
// positions cannot be confined to one line of a box, so both are rejected even
// though the line walk would happily produce eliminations for them.
func TestFindPointingPairMoveRequiresTwoOrThreePositions(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 1): {6},
		idxOf(4, 3): {6},
		idxOf(4, 4): {6},
		idxOf(4, 5): {6},
		idxOf(4, 6): {6},
	})

	for _, tc := range []struct {
		name      string
		positions []core.CellRef
		want      bool
	}{
		{"one position", refs([2]int{4, 3}), false},
		{"two positions", refs([2]int{4, 3}, [2]int{4, 4}), true},
		{"three positions", refs([2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}), true},
		{"four positions", refs([2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}, [2]int{4, 6}), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			move := findPointingPairMove(b, 4, 6, tc.positions)
			admitted := len(tc.positions) >= 2 && len(tc.positions) <= 3
			if admitted && move == nil {
				t.Fatalf("expected a move for %d positions", len(tc.positions))
			}
			if !admitted && move != nil {
				t.Fatalf("expected nil for %d positions, got %+v", len(tc.positions), move)
			}
		})
	}
}

// ============================================================================
// sharedLine
// ============================================================================

// TestSharedLineReportsTheCommonLine pins both arms of the row/column switch
// and the rejected case's zero return, which every caller discards and so no
// end-to-end test can observe.
func TestSharedLineReportsTheCommonLine(t *testing.T) {
	for _, tc := range []struct {
		name      string
		positions []core.CellRef
		byRow     bool
		wantLine  int
		wantOK    bool
	}{
		{"common row", refs([2]int{5, 1}, [2]int{5, 4}, [2]int{5, 8}), true, 5, true},
		{"common column", refs([2]int{1, 6}, [2]int{4, 6}, [2]int{7, 6}), false, 6, true},
		{"single position", refs([2]int{5, 1}), true, 5, true},
		{"differing row", refs([2]int{5, 1}, [2]int{5, 4}, [2]int{6, 8}), true, 0, false},
		{"differing column", refs([2]int{1, 6}, [2]int{4, 6}, [2]int{7, 7}), false, 0, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			line, ok := sharedLine(tc.positions, tc.byRow)
			if line != tc.wantLine || ok != tc.wantOK {
				t.Errorf("sharedLine = (%d, %t), want (%d, %t)", line, ok, tc.wantLine, tc.wantOK)
			}
		})
	}
}

// ============================================================================
// buildPointingLineMove
// ============================================================================

// TestBuildPointingLineMoveWalksTheRowOutsideTheBox pins the row arm's whole
// move. Victims sit both before the box (column 1) and after it (columns 6 and
// 8), so a walk that skipped either side of the box is visible, as is one that
// swallowed the first column past it.
func TestBuildPointingLineMoveWalksTheRowOutsideTheBox(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 1): {6},
		idxOf(4, 6): {6},
		idxOf(4, 8): {6},
	})
	positions := refs([2]int{4, 3}, [2]int{4, 4})

	assertMove(t, buildPointingLineMove(b, 4, 6, positions, 4, 3, true), &core.Move{
		Action:  constants.ActionEliminate,
		Digit:   6,
		Targets: positions,
		Eliminations: simpleCands(
			[3]int{4, 1, 6}, [3]int{4, 6, 6}, [3]int{4, 8, 6}),
		Explanation: "In box 5, 6 is confined to row 5: eliminate 6 from rest of row 5.",
		Highlights: core.Highlights{
			Primary:   positions,
			Secondary: ToCellRefs(RowIndices[4]),
		},
	})
}

// TestBuildPointingLineMoveWalksTheColumnOutsideTheBox pins the column arm,
// whose label and highlight are chosen by the same branch. Nothing else in the
// package exercises a column-oriented pointing pair.
func TestBuildPointingLineMoveWalksTheColumnOutsideTheBox(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(1, 4): {6},
		idxOf(6, 4): {6},
		idxOf(8, 4): {6},
	})
	positions := refs([2]int{3, 4}, [2]int{4, 4})

	assertMove(t, buildPointingLineMove(b, 4, 6, positions, 4, 3, false), &core.Move{
		Action:  constants.ActionEliminate,
		Digit:   6,
		Targets: positions,
		Eliminations: simpleCands(
			[3]int{1, 4, 6}, [3]int{6, 4, 6}, [3]int{8, 4, 6}),
		Explanation: "In box 5, 6 is confined to column 5: eliminate 6 from rest of column 5.",
		Highlights: core.Highlights{
			Primary:   positions,
			Secondary: ToCellRefs(ColIndices[4]),
		},
	})
}

// ============================================================================
// scanLineCandidates
// ============================================================================

// TestScanLineCandidatesWalksRowsAndColumns pins the index arithmetic of both
// arms. The board holds digit 6 on row 4 and on column 4, so an arm that
// computed the wrong cell index would collect the wrong line, or nothing.
func TestScanLineCandidatesWalksRowsAndColumns(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 1): {6},
		idxOf(4, 4): {6},
		idxOf(4, 7): {6},
		idxOf(1, 4): {6},
		idxOf(7, 4): {6},
	})

	if got, want := scanLineCandidates(b, 4, true, 6), refs([2]int{4, 1}, [2]int{4, 4}, [2]int{4, 7}); !reflect.DeepEqual(got, want) {
		t.Errorf("row scan = %+v, want %+v", got, want)
	}
	if got, want := scanLineCandidates(b, 4, false, 6), refs([2]int{1, 4}, [2]int{4, 4}, [2]int{7, 4}); !reflect.DeepEqual(got, want) {
		t.Errorf("column scan = %+v, want %+v", got, want)
	}
}

// ============================================================================
// sharedBoxAlongLine
// ============================================================================

// TestSharedBoxAlongLineReportsTheCommonBoxOrigin pins the box-origin
// arithmetic of both arms. Every case starts at coordinate 3, the first cell of
// the middle band, so an origin computed with the wrong divisor or the wrong
// multiplier lands somewhere other than 3. The rejected cases pin the zero
// return, which callers discard.
func TestSharedBoxAlongLineReportsTheCommonBoxOrigin(t *testing.T) {
	for _, tc := range []struct {
		name       string
		positions  []core.CellRef
		byRow      bool
		wantOrigin int
		wantOK     bool
	}{
		{"columns in one box", refs([2]int{0, 3}, [2]int{1, 4}, [2]int{2, 5}), true, 3, true},
		{"rows in one box", refs([2]int{3, 0}, [2]int{4, 1}, [2]int{5, 2}), false, 3, true},
		{"single position", refs([2]int{2, 5}), true, 3, true},
		{"columns spanning boxes", refs([2]int{0, 3}, [2]int{1, 6}), true, 0, false},
		{"rows spanning boxes", refs([2]int{3, 0}, [2]int{6, 1}), false, 0, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			origin, ok := sharedBoxAlongLine(tc.positions, tc.byRow)
			if origin != tc.wantOrigin || ok != tc.wantOK {
				t.Errorf("sharedBoxAlongLine = (%d, %t), want (%d, %t)",
					origin, ok, tc.wantOrigin, tc.wantOK)
			}
		})
	}
}

// ============================================================================
// collectBoxExcludingLine
// ============================================================================

// TestCollectBoxExcludingLineSkipsOnlyTheSourceLine pins both arms of the
// exclusion. Each fixture places candidates in all three rows and all three
// columns of box 4 so that a scan clipped to two of either is visible, and puts
// a candidate on the perpendicular index of the source line so that an arm
// excluding the wrong axis is visible too.
func TestCollectBoxExcludingLineSkipsOnlyTheSourceLine(t *testing.T) {
	t.Run("row source", func(t *testing.T) {
		b := simpleBoard(map[int][]int{
			idxOf(3, 3): {6},
			idxOf(3, 5): {6},
			idxOf(4, 4): {6},
			idxOf(5, 4): {6},
			idxOf(5, 5): {6},
		})
		got := collectBoxExcludingLine(b, 3, 3, 4, 6, true)
		want := simpleCands([3]int{3, 3, 6}, [3]int{3, 5, 6}, [3]int{5, 4, 6}, [3]int{5, 5, 6})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("row source = %+v, want %+v", got, want)
		}
	})

	t.Run("column source", func(t *testing.T) {
		b := simpleBoard(map[int][]int{
			idxOf(3, 3): {6},
			idxOf(3, 4): {6},
			idxOf(4, 4): {6},
			idxOf(4, 5): {6},
			idxOf(5, 3): {6},
		})
		got := collectBoxExcludingLine(b, 3, 3, 4, 6, false)
		want := simpleCands([3]int{3, 3, 6}, [3]int{4, 5, 6}, [3]int{5, 3, 6})
		if !reflect.DeepEqual(got, want) {
			t.Errorf("column source = %+v, want %+v", got, want)
		}
	})
}

// ============================================================================
// DetectBoxLineReduction
// ============================================================================

// boxLineRowBoard confines digit to the box-8 stretch of row 7 and leaves two
// victims elsewhere in box 8. Rows 6 and 8 each hold the digit only once, so no
// earlier line is confined.
func boxLineRowBoard(digit int) *testBoard {
	return simpleBoard(map[int][]int{
		idxOf(7, 6): {digit, 5},
		idxOf(7, 7): {digit, 5},
		idxOf(6, 8): {digit},
		idxOf(8, 6): {digit},
	})
}

// TestDetectBoxLineReductionReturnsCompleteRowMove pins the whole move for the
// row scan. The box is box 9, the last one, so its highlight index is the
// composition of both band terms and a mis-scaled term lands on a different box.
func TestDetectBoxLineReductionReturnsCompleteRowMove(t *testing.T) {
	positions := refs([2]int{7, 6}, [2]int{7, 7})

	assertMove(t, DetectBoxLineReduction(boxLineRowBoard(4)), &core.Move{
		Action:       constants.ActionEliminate,
		Digit:        4,
		Targets:      positions,
		Eliminations: simpleCands([3]int{6, 8, 4}, [3]int{8, 6, 4}),
		Explanation:  "In row 8, 4 is confined to one box: eliminate 4 from rest of box.",
		Highlights: core.Highlights{
			Primary:   positions,
			Secondary: ToCellRefs(BoxIndices[8]),
		},
	})
}

// TestDetectBoxLineReductionScansEveryDigit covers both ends of the digit
// range, which the row fixture above exercises only in the middle.
func TestDetectBoxLineReductionScansEveryDigit(t *testing.T) {
	for _, digit := range []int{1, constants.GridSize} {
		t.Run(fmt.Sprintf("digit %d", digit), func(t *testing.T) {
			move := DetectBoxLineReduction(boxLineRowBoard(digit))
			if move == nil {
				t.Fatalf("expected a box-line reduction on digit %d", digit)
			}
			if move.Digit != digit {
				t.Errorf("Digit = %d, want %d", move.Digit, digit)
			}
		})
	}
}

// TestDetectBoxLineReductionReturnsCompleteColumnMove forces the column scan to
// be the one that fires: every row carrying digit 4 spreads it across two
// boxes, so no row is confined, while column 7 keeps it inside box 9. Nothing
// else in the package exercises a column-oriented box-line reduction, whose
// label and box origin come from the opposite arm of every branch in the path.
func TestDetectBoxLineReductionReturnsCompleteColumnMove(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(6, 7): {4, 5},
		idxOf(7, 7): {4, 5},
		idxOf(8, 6): {4, 1},
		idxOf(8, 8): {4, 2},
		idxOf(6, 0): {4, 3},
		idxOf(8, 0): {4, 3},
	})
	positions := refs([2]int{6, 7}, [2]int{7, 7})

	assertMove(t, DetectBoxLineReduction(b), &core.Move{
		Action:       constants.ActionEliminate,
		Digit:        4,
		Targets:      positions,
		Eliminations: simpleCands([3]int{8, 6, 4}, [3]int{8, 8, 4}),
		Explanation:  "In column 8, 4 is confined to one box: eliminate 4 from rest of box.",
		Highlights: core.Highlights{
			Primary:   positions,
			Secondary: ToCellRefs(BoxIndices[8]),
		},
	})
}

// ============================================================================
// findBoxLineReductionInLine
// ============================================================================

// TestLineDigitBoxAdmitsOnlyTwoOrThreePositions pins the arity contract
// directly. A line can never actually hand this function four positions inside
// one box, since a box contributes only three cells to a line, so the upper
// bound is unreachable from the scan and observable only from here.
func TestLineDigitBoxAdmitsOnlyTwoOrThreePositions(t *testing.T) {
	for _, tc := range []struct {
		name       string
		positions  []core.CellRef
		byRow      bool
		wantOrigin int
		wantOK     bool
	}{
		{"one position", refs([2]int{7, 6}), true, 0, false},
		{"two positions", refs([2]int{7, 6}, [2]int{7, 7}), true, 6, true},
		{"three positions", refs([2]int{7, 6}, [2]int{7, 7}, [2]int{7, 8}), true, 6, true},
		{"four positions in one box", refs(
			[2]int{7, 6}, [2]int{7, 7}, [2]int{7, 8}, [2]int{6, 6}), true, 0, false},
		{"two positions spanning boxes", refs([2]int{7, 6}, [2]int{7, 1}), true, 0, false},
		{"two positions down a column", refs([2]int{6, 7}, [2]int{7, 7}), false, 6, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			origin, ok := lineDigitBox(tc.positions, tc.byRow)
			if origin != tc.wantOrigin || ok != tc.wantOK {
				t.Errorf("lineDigitBox = (%d, %t), want (%d, %t)",
					origin, ok, tc.wantOrigin, tc.wantOK)
			}
		})
	}
}

// TestFindBoxLineReductionInLineRequiresTwoOrThreePositions pins the arity
// contract from the line scan's own side. Digit 3 sits in a single cell of row
// 7, which is a hidden single rather than a reduction, so admitting it would
// produce an elimination move one digit too early.
func TestFindBoxLineReductionInLineRequiresTwoOrThreePositions(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(7, 6): {3},
		idxOf(7, 7): {4},
		idxOf(7, 8): {4},
		idxOf(6, 6): {3, 4},
		idxOf(8, 8): {3, 4},
	})

	move := findBoxLineReductionInLine(b, 7, true)
	if move == nil {
		t.Fatal("expected a box-line reduction on digit 4")
	}
	if move.Digit != 4 {
		t.Errorf("Digit = %d, want 4: a lone position is a hidden single, not a reduction", move.Digit)
	}
}

// TestFindBoxLineReductionInLineKeepsScanningAfterASpreadDigit covers the
// rejection path's control flow. Digit 3 occupies two boxes of row 7 and so is
// rejected, but the scan must go on to digit 4, which is confined to box 9.
func TestFindBoxLineReductionInLineKeepsScanningAfterASpreadDigit(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(7, 1): {3},
		idxOf(7, 4): {3},
		idxOf(7, 6): {4},
		idxOf(7, 7): {4},
		idxOf(8, 8): {4},
	})

	move := findBoxLineReductionInLine(b, 7, true)
	if move == nil {
		t.Fatal("expected the scan to continue past digit 3 and find digit 4")
	}
	if move.Digit != 4 {
		t.Errorf("Digit = %d, want 4", move.Digit)
	}
}
