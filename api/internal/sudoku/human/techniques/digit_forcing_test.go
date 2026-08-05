package techniques

import (
	"maps"
	"slices"
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// digitForcingOpenBoard is an all-empty board on which every cell still holds
// every candidate, so a helper under test sees no incidental exclusions.
func digitForcingOpenBoard() *testBoard {
	var cells [constants.TotalCells]int
	return boardFromMap(cells, nil)
}

// digitForcingResultWith builds a result carrying the given placements and
// eliminations, so the convergence helpers can be driven without propagating.
func digitForcingResultWith(placements map[int]int, eliminations map[int][]int) *digitForcingResult {
	r := newDigitForcingResult()
	for idx, digit := range placements {
		r.addPlacement(idx, digit)
	}
	for idx, digits := range eliminations {
		for _, digit := range digits {
			r.addElimination(idx, digit)
		}
	}
	return r
}

// digitForcingElimKeys returns the cell indices a result recorded eliminations
// for, in ascending order.
func digitForcingElimKeys(r *digitForcingResult) []int {
	return slices.Sorted(maps.Keys(r.eliminations))
}

// ============================================================================
// DetectDigitForcingChain: whole-Move output
// ============================================================================

// TestDetectDigitForcingChainAssignMoveIsFullyPinned pins the complete Move the
// common-placement path emits. Impossible puzzle 0 gives digit 1 two homes in
// row 2 (R2C4 and R2C6), and both branches force R1C5=2. Explanation wording,
// the one-based coordinate arithmetic, the target cell and both highlight
// groups are all user-visible output, so the whole struct is pinned rather
// than the action alone.
func TestDetectDigitForcingChainAssignMoveIsFullyPinned(t *testing.T) {
	b := givensBoard(t, 0, "impossible")

	assertMove(t, DetectDigitForcingChain(b), &core.Move{
		Action:  "assign",
		Digit:   2,
		Targets: refs([2]int{0, 4}),
		Explanation: "Digit Forcing Chain: 1 in row 2 can only go in 2 positions; " +
			"trying each leads to R1C5=2",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 4}),
			Secondary: refs([2]int{1, 3}, [2]int{1, 5}),
		},
	})
}

// TestDetectDigitForcingChainEliminationMoveIsFullyPinned pins the complete
// Move the common-elimination path emits. Impossible puzzle 69 gives digit 1
// three homes in row 1 (R1C1, R1C7, R1C8), and all three branches eliminate 5
// from R1C5. The three starting positions become both Targets and the secondary
// highlights, so a coordinate slip in either shows up here.
func TestDetectDigitForcingChainEliminationMoveIsFullyPinned(t *testing.T) {
	b := givensBoard(t, 69, "impossible")

	assertMove(t, DetectDigitForcingChain(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      refs([2]int{0, 0}, [2]int{0, 6}, [2]int{0, 7}),
		Eliminations: []core.Candidate{{Row: 0, Col: 4, Digit: 5}},
		Explanation: "Digit Forcing Chain: 1 in row 1 can only go in 3 positions; " +
			"trying each eliminates 5 from R1C5",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 4}),
			Secondary: refs([2]int{0, 0}, [2]int{0, 6}, [2]int{0, 7}),
		},
	})
}

// TestDetectDigitForcingChainScansEveryDigitIncludingNine pins that the digit
// sweep reaches digit 9. Every cell is a given except R1C1, R1C2 and R2C1,
// which hold 9 alone, so the only chain on the board is digit 9's two homes in
// row 1 eliminating 9 from R2C1. A sweep that stops short of 9 finds nothing.
func TestDetectDigitForcingChainScansEveryDigitIncludingNine(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {constants.GridSize},
		idxOf(0, 1): {constants.GridSize},
		idxOf(1, 0): {constants.GridSize},
	})

	move := DetectDigitForcingChain(b)
	if move == nil {
		t.Fatal("expected a digit 9 forcing chain, got nil")
	}
	if move.Digit != constants.GridSize {
		t.Errorf("Digit = %d, want %d", move.Digit, constants.GridSize)
	}
}

// ============================================================================
// tryDigitForcingChain: position-count bounds
// ============================================================================

// TestTryDigitForcingChainAcceptsOnlyTwoOrThreePositions pins both bounds of
// the branch-count guard. Each position list below reaches a convergent
// conclusion once propagated, so acceptance is decided by the count alone: one
// home is a hidden single rather than a chain, and four homes are refused as
// too wide even though they happen to converge here.
func TestTryDigitForcingChainAcceptsOnlyTwoOrThreePositions(t *testing.T) {
	two := givensBoard(t, 0, "impossible")
	many := givensBoard(t, 69, "impossible")

	tests := []struct {
		name      string
		board     *testBoard
		positions []int
		wantMove  bool
	}{
		{"one position is a hidden single, not a chain", many, []int{idxOf(0, 0)}, false},
		{"two positions", two, []int{idxOf(1, 3), idxOf(1, 5)}, true},
		{"three positions", many, []int{idxOf(0, 0), idxOf(0, 6), idxOf(0, 7)}, true},
		{"four positions are too wide", many, []int{idxOf(0, 0), idxOf(2, 0), idxOf(6, 0), idxOf(7, 0)}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			move := tryDigitForcingChain(tt.board, 1, tt.positions, "row", 0)
			if got := move != nil; got != tt.wantMove {
				t.Fatalf("move present = %v, want %v (move %+v)", got, tt.wantMove, move)
			}
		})
	}
}

// ============================================================================
// Propagation
// ============================================================================

// TestPropagateFromPlacementStopsAtTheStepLimit pins the propagation budget.
// Every cell is a given except eleven that each hold a single candidate, so the
// assumed placement is followed by a cascade of naked singles, one per step.
// Ten steps is exactly enough to reach the last of them, and the eleventh cell
// is the one a shorter budget would leave unplaced.
func TestPropagateFromPlacementStopsAtTheStepLimit(t *testing.T) {
	overrides := make(map[int][]int, maxDigitForcingPropagation+1)
	for col := range constants.GridSize {
		overrides[idxOf(0, col)] = []int{col + 1}
	}
	overrides[idxOf(1, 0)] = []int{4}
	overrides[idxOf(1, 1)] = []int{5}
	b := filledExcept(overrides)

	result := propagateFromPlacement(b, idxOf(0, 0), 1)

	if got, want := len(result.placements), maxDigitForcingPropagation+1; got != want {
		t.Fatalf("placements = %d, want %d (%v)", got, want, result.placements)
	}
	if got := result.placements[idxOf(1, 1)]; got != 5 {
		t.Errorf("last cascade cell R2C2 = %d, want 5", got)
	}
}

// TestPropagateOneForcingStepPlacesHiddenSingleWhenNoNakedSingleExists pins the
// hidden-single fallback. No cell on this board has a lone candidate, so the
// naked-single scan finds nothing; row 1 is the only home for digit 3, which
// the step must place on the simulation board and record in the result.
func TestPropagateOneForcingStepPlacesHiddenSingleWhenNoNakedSingleExists(t *testing.T) {
	b := filledExcept(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {1, 2},
		idxOf(0, 2): {2, 3},
	})
	simBoard := b.CloneBoard()
	result := newDigitForcingResult()

	if !propagateOneForcingStep(b, simBoard, result) {
		t.Fatal("expected the hidden single in row 1 to be placed")
	}
	if got := simBoard.GetCell(idxOf(0, 2)); got != 3 {
		t.Errorf("simBoard R1C3 = %d, want 3", got)
	}
	if got := result.placements[idxOf(0, 2)]; got != 3 {
		t.Errorf("recorded placement at R1C3 = %d, want 3", got)
	}
}

// ============================================================================
// findNakedSingleForcing
// ============================================================================

// TestFindNakedSingleForcingSkipsFilledCells pins that the scan only considers
// empty cells. R1C1 is filled yet still carries a lone candidate, which a scan
// that trusted the candidate set alone would report as a naked single.
func TestFindNakedSingleForcingSkipsFilledCells(t *testing.T) {
	b := &testBoard{}
	b.cells[idxOf(0, 0)] = 5
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{3})
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{7})

	idx, digit, ok := findNakedSingleForcing(b)
	if !ok || idx != idxOf(4, 4) || digit != 7 {
		t.Fatalf("got (%d, %d, %v), want (%d, 7, true)", idx, digit, ok, idxOf(4, 4))
	}
}

// TestFindNakedSingleForcingReportsNotFoundWithZeroValues pins the sentinel a
// caller sees when no cell qualifies, since the index and digit are only
// meaningful when the third result is true.
func TestFindNakedSingleForcingReportsNotFoundWithZeroValues(t *testing.T) {
	idx, digit, ok := findNakedSingleForcing(emptyCandidateBoard())
	if ok || idx != 0 || digit != 0 {
		t.Fatalf("got (%d, %d, %v), want (0, 0, false)", idx, digit, ok)
	}
}

// ============================================================================
// findHiddenSingleForcing
// ============================================================================

// TestFindHiddenSingleForcingFindsTheLoneEmptyHomeAndSkipsFilledCells drives
// the whole scan in one board. Row 1 holds a filled R1C1 that still carries
// candidate 7, and an empty R1C2 whose 7 is the digit's only live home; the
// remaining row-1 cells share candidates 1 and 2 so no other digit has a lone
// home. The expected answer is therefore R1C2 with digit 7: reached only by
// skipping the filled cell, honoring the candidate set, and requiring exactly
// one home.
func TestFindHiddenSingleForcingFindsTheLoneEmptyHomeAndSkipsFilledCells(t *testing.T) {
	overrides := map[int][]int{
		idxOf(0, 0): {7},
		idxOf(0, 1): {7},
	}
	for col := 2; col < constants.GridSize; col++ {
		overrides[idxOf(0, col)] = []int{1, 2}
	}
	b := filledExcept(overrides)
	b.cells[idxOf(0, 0)] = 5 // filled, yet its candidate 7 survives

	idx, digit, ok := findHiddenSingleForcing(b, RowIndices)
	if !ok || idx != idxOf(0, 1) || digit != 7 {
		t.Fatalf("got (%d, %d, %v), want (%d, 7, true)", idx, digit, ok, idxOf(0, 1))
	}
}

// TestFindHiddenSingleForcingRejectsUnitsWithoutExactlyOneHome pins the
// exactly-one requirement in both directions: digit 7 has two homes in row 1
// and digit 8 has none anywhere, so the scan reports the not-found sentinel.
func TestFindHiddenSingleForcingRejectsUnitsWithoutExactlyOneHome(t *testing.T) {
	overrides := map[int][]int{
		idxOf(0, 0): {7, 9},
		idxOf(0, 1): {7, 9},
	}
	for col := 2; col < constants.GridSize; col++ {
		overrides[idxOf(0, col)] = []int{1, 2}
	}
	b := filledExcept(overrides)

	idx, digit, ok := findHiddenSingleForcing(b, RowIndices)
	if ok || idx != 0 || digit != 0 {
		t.Fatalf("got (%d, %d, %v), want (0, 0, false)", idx, digit, ok)
	}
}

// ============================================================================
// Peer elimination recording
// ============================================================================

// TestRecordPeerEliminationsForcingCoversRowColumnAndBox pins the exact peer
// set a placement eliminates from. R5C6 is chosen because its row, column and
// box indices are all distinct and non-zero, so a wrong unit or a miscomputed
// box index cannot coincide with the right answer.
func TestRecordPeerEliminationsForcingCoversRowColumnAndBox(t *testing.T) {
	b := digitForcingOpenBoard()
	result := newDigitForcingResult()

	recordPeerEliminationsForcing(b, result, idxOf(4, 5), 7)

	// Row 5, column 6 and box 5 (rows 4-6, columns 4-6), minus R5C6 itself.
	want := []int{5, 14, 23, 30, 31, 32, 36, 37, 38, 39, 40, 42, 43, 44, 48, 49, 50, 59, 68, 77}
	if got := digitForcingElimKeys(result); !slices.Equal(got, want) {
		t.Fatalf("eliminated cells = %v, want %v", got, want)
	}
	for _, idx := range want {
		if !result.eliminations[idx][7] {
			t.Errorf("cell %d: expected digit 7 eliminated", idx)
		}
	}
}

// TestEliminateIfHasCandidateSkipsOnlySourceCellAndScansTheWholeUnit pins that
// the source cell is passed over rather than terminating the scan: R5C5 sits in
// the middle of row 5, so a scan that stopped there would silently lose the
// four cells after it.
func TestEliminateIfHasCandidateSkipsOnlySourceCellAndScansTheWholeUnit(t *testing.T) {
	b := digitForcingOpenBoard()
	result := newDigitForcingResult()

	eliminateIfHasCandidate(b, result, RowIndices[4], idxOf(4, 4), 7)

	want := []int{36, 37, 38, 39, 41, 42, 43, 44}
	if got := digitForcingElimKeys(result); !slices.Equal(got, want) {
		t.Fatalf("eliminated cells = %v, want %v", got, want)
	}
}

// ============================================================================
// findCommonPlacement
// ============================================================================

// TestFindCommonPlacementScansSortedKeysAndSkipsIneligibleCells drives every
// rejection the placement scan makes, ordered so each rejected cell sorts ahead
// of the one that should win. R1C2 is a starting position, R1C6 is already
// filled on the board, and the branches disagree at R3C3; only R7C7 survives,
// and reaching it requires continuing past all three rather than stopping.
func TestFindCommonPlacementScansSortedKeysAndSkipsIneligibleCells(t *testing.T) {
	b := emptyCandidateBoard()
	b.cells[idxOf(0, 5)] = 9

	positions := []int{idxOf(0, 1), idxOf(0, 2)}
	base := digitForcingResultWith(map[int]int{
		idxOf(0, 1): 2, idxOf(0, 5): 3, idxOf(2, 2): 6, idxOf(6, 6): 7,
	}, nil)
	other := digitForcingResultWith(map[int]int{
		idxOf(0, 1): 2, idxOf(0, 5): 3, idxOf(2, 2): 8, idxOf(6, 6): 7,
	}, nil)

	got := findCommonPlacement(b, 1, positions, []*digitForcingResult{base, other}, "column", 4)

	assertMove(t, got, &core.Move{
		Action:  "assign",
		Digit:   7,
		Targets: refs([2]int{6, 6}),
		Explanation: "Digit Forcing Chain: 1 in column 5 can only go in 2 positions; " +
			"trying each leads to R7C7=7",
		Highlights: core.Highlights{
			Primary:   refs([2]int{6, 6}),
			Secondary: refs([2]int{0, 1}, [2]int{0, 2}),
		},
	})
}

// ============================================================================
// findCommonElimination
// ============================================================================

// TestFindCommonEliminationSkipsStartPositions pins that an elimination landing
// on one of the branch's own starting cells is passed over. R1C2 sorts first
// and is a starting position, so the move must come from R4C4 instead.
func TestFindCommonEliminationSkipsStartPositions(t *testing.T) {
	b := digitForcingOpenBoard()
	positions := []int{idxOf(0, 1), idxOf(0, 2)}
	elims := map[int][]int{idxOf(0, 1): {4}, idxOf(3, 3): {6}}
	results := []*digitForcingResult{
		digitForcingResultWith(nil, elims),
		digitForcingResultWith(nil, elims),
	}

	got := findCommonElimination(b, 1, positions, results, "row", 0)
	if got == nil {
		t.Fatal("expected the elimination at R4C4, got nil")
	}
	if want := []core.Candidate{{Row: 3, Col: 3, Digit: 6}}; !slices.Equal(got.Eliminations, want) {
		t.Fatalf("Eliminations = %+v, want %+v", got.Eliminations, want)
	}
}

// TestFindCommonEliminationSkipsCandidatesTheBoardNoLongerHolds pins that a
// recorded elimination whose digit is already gone from the board is passed
// over rather than ending the scan of that cell. R4C4 records both 2 and 6, but
// only 6 is still a live candidate there.
func TestFindCommonEliminationSkipsCandidatesTheBoardNoLongerHolds(t *testing.T) {
	var cells [constants.TotalCells]int
	b := boardFromMap(cells, map[int][]int{idxOf(3, 3): {6, 9}})
	elims := map[int][]int{idxOf(3, 3): {2, 6}}
	results := []*digitForcingResult{
		digitForcingResultWith(nil, elims),
		digitForcingResultWith(nil, elims),
	}

	got := findCommonElimination(b, 1, []int{idxOf(0, 1), idxOf(0, 2)}, results, "row", 0)
	if got == nil {
		t.Fatal("expected the elimination of 6 at R4C4, got nil")
	}
	if want := []core.Candidate{{Row: 3, Col: 3, Digit: 6}}; !slices.Equal(got.Eliminations, want) {
		t.Fatalf("Eliminations = %+v, want %+v", got.Eliminations, want)
	}
}

// TestFindCommonEliminationSkipsEliminationsMissingFromABranch pins that an
// elimination only one branch reached is passed over while the scan of that
// same cell continues: digit 2 is eliminated in the base branch alone, digit 6
// in both.
func TestFindCommonEliminationSkipsEliminationsMissingFromABranch(t *testing.T) {
	b := digitForcingOpenBoard()
	results := []*digitForcingResult{
		digitForcingResultWith(nil, map[int][]int{idxOf(3, 3): {2, 6}}),
		digitForcingResultWith(nil, map[int][]int{idxOf(3, 3): {6}}),
	}

	got := findCommonElimination(b, 1, []int{idxOf(0, 1), idxOf(0, 2)}, results, "row", 0)
	if got == nil {
		t.Fatal("expected the elimination of 6 at R4C4, got nil")
	}
	if want := []core.Candidate{{Row: 3, Col: 3, Digit: 6}}; !slices.Equal(got.Eliminations, want) {
		t.Fatalf("Eliminations = %+v, want %+v", got.Eliminations, want)
	}
}

// TestFindCommonEliminationUsesTheFirstResultAsTheBase pins which branch
// supplies the candidate eliminations. The second branch also eliminates 4 from
// R3C3, which sorts ahead of R4C4, so a scan seeded from the wrong branch would
// report that cell instead.
func TestFindCommonEliminationUsesTheFirstResultAsTheBase(t *testing.T) {
	b := digitForcingOpenBoard()
	results := []*digitForcingResult{
		digitForcingResultWith(nil, map[int][]int{idxOf(3, 3): {6}}),
		digitForcingResultWith(nil, map[int][]int{idxOf(2, 2): {4}, idxOf(3, 3): {6}}),
	}

	got := findCommonElimination(b, 1, []int{idxOf(0, 1), idxOf(0, 2)}, results, "row", 0)
	if got == nil {
		t.Fatal("expected the elimination of 6 at R4C4, got nil")
	}
	if want := []core.Candidate{{Row: 3, Col: 3, Digit: 6}}; !slices.Equal(got.Eliminations, want) {
		t.Fatalf("Eliminations = %+v, want %+v", got.Eliminations, want)
	}
}

// ============================================================================
// Cross-branch predicates
// ============================================================================

// TestPlacementInAllResultsChecksEveryBranchAfterTheBase pins the scan range.
// The base branch is excluded by design (its placement is what the caller is
// asking about), while every later branch must agree.
func TestPlacementInAllResultsChecksEveryBranchAfterTheBase(t *testing.T) {
	idx := idxOf(1, 1)
	tests := []struct {
		name    string
		results []*digitForcingResult
		want    bool
	}{
		{
			name: "base branch is not consulted",
			results: []*digitForcingResult{
				digitForcingResultWith(map[int]int{idx: 9}, nil),
				digitForcingResultWith(map[int]int{idx: 5}, nil),
			},
			want: true,
		},
		{
			name: "a later branch that disagrees rejects",
			results: []*digitForcingResult{
				digitForcingResultWith(map[int]int{idx: 5}, nil),
				digitForcingResultWith(map[int]int{idx: 9}, nil),
			},
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := placementInAllResults(idx, 5, tt.results); got != tt.want {
				t.Fatalf("placementInAllResults = %v, want %v", got, tt.want)
			}
		})
	}
}

// TestEliminationInAllResultsChecksEveryBranchAfterTheBase pins the same scan
// range for eliminations: the base branch is skipped, and a later branch that
// neither eliminates the digit nor places over it rejects the conclusion.
func TestEliminationInAllResultsChecksEveryBranchAfterTheBase(t *testing.T) {
	idx := idxOf(1, 1)
	tests := []struct {
		name    string
		results []*digitForcingResult
		want    bool
	}{
		{
			name: "base branch is not consulted",
			results: []*digitForcingResult{
				newDigitForcingResult(),
				digitForcingResultWith(nil, map[int][]int{idx: {5}}),
			},
			want: true,
		},
		{
			name: "a later branch that keeps the digit rejects",
			results: []*digitForcingResult{
				digitForcingResultWith(nil, map[int][]int{idx: {5}}),
				newDigitForcingResult(),
			},
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := eliminationInAllResults(idx, 5, tt.results); got != tt.want {
				t.Fatalf("eliminationInAllResults = %v, want %v", got, tt.want)
			}
		})
	}
}

// TestResultEliminatesCountsDirectEliminationsAndPlacementSubstitution pins
// both routes by which a branch rules a digit out of a cell, and both cases
// where it does not: no information at all, and the digit itself being placed
// there.
func TestResultEliminatesCountsDirectEliminationsAndPlacementSubstitution(t *testing.T) {
	idx := idxOf(1, 1)
	tests := []struct {
		name   string
		result *digitForcingResult
		want   bool
	}{
		{"recorded directly", digitForcingResultWith(nil, map[int][]int{idx: {5}}), true},
		{"another digit placed there", digitForcingResultWith(map[int]int{idx: 3}, nil), true},
		{"digit one placed there", digitForcingResultWith(map[int]int{idx: 1}, nil), true},
		{"the digit itself placed there", digitForcingResultWith(map[int]int{idx: 5}, nil), false},
		{"branch says nothing about the cell", newDigitForcingResult(), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resultEliminates(tt.result, idx, 5); got != tt.want {
				t.Fatalf("resultEliminates = %v, want %v", got, tt.want)
			}
		})
	}
}

// TestIsStartPositionMatchesAnyPositionNotOnlyTheFirst pins that the whole
// position list is searched: the match below is the second entry, and a
// non-member sitting between two members must still report false.
func TestIsStartPositionMatchesAnyPositionNotOnlyTheFirst(t *testing.T) {
	positions := []int{3, 5, 7}
	if !isStartPosition(5, positions) {
		t.Error("expected 5 to be recognized as a start position")
	}
	if !isStartPosition(7, positions) {
		t.Error("expected 7 to be recognized as a start position")
	}
	if isStartPosition(4, positions) {
		t.Error("expected 4 not to be a start position")
	}
}

// TestTargetsFromPositionsConvertsEveryPositionToRowColumn pins the coordinate
// split for the whole slice, using positions whose row and column differ so a
// swapped or scaled conversion cannot land on the right answer by accident.
func TestTargetsFromPositionsConvertsEveryPositionToRowColumn(t *testing.T) {
	got := targetsFromPositions([]int{idxOf(0, 0), idxOf(2, 5), idxOf(8, 1)})
	want := refs([2]int{0, 0}, [2]int{2, 5}, [2]int{8, 1})
	if !slices.Equal(got, want) {
		t.Fatalf("targets = %+v, want %+v", got, want)
	}
}
