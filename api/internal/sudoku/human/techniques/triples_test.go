package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// ============================================================================
// Naked subsets
// ============================================================================

// TestDetectNakedTripleReturnsCompleteRowMove pins the whole move for a naked
// triple in a row, including the unit label and number the explanation carries
// and the coordinates every elimination reports. The row also holds a
// single-candidate cell ahead of the triple: it is too narrow to be a subset
// member yet still loses the triple's digit, which separates the subset scan
// from the elimination scan.
func TestDetectNakedTripleReturnsCompleteRowMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 3})
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{1, 4, 5})
	b.candidates[idxOf(0, 6)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectNakedTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 1},
			{Row: 0, Col: 5, Digit: 1},
			{Row: 0, Col: 6, Digit: 3},
		},
		Explanation: "Naked Triple {1,2,3} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		},
	})
}

// TestDetectNakedTripleReturnsCompleteColumnMove pins the same move for a
// column. The three subset cells sit in different boxes so no box unit can
// claim the pattern first, which is what makes the column label observable.
func TestDetectNakedTripleReturnsCompleteColumnMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(6, 4)] = NewCandidates([]int{1, 3})
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{1, 7})
	b.candidates[idxOf(8, 4)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectNakedTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 4}, [2]int{3, 4}, [2]int{6, 4}),
		Eliminations: []core.Candidate{
			{Row: 4, Col: 4, Digit: 1},
			{Row: 8, Col: 4, Digit: 3},
		},
		Explanation: "Naked Triple {1,2,3} in column 5",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 4}, [2]int{3, 4}, [2]int{6, 4}),
		},
	})
}

// TestDetectNakedTripleReturnsCompleteBoxMove pins the box case, where the
// subset cells share neither a row nor a column. The combination scan has to
// step past several unions that are too wide before reaching the triple, so a
// detector that accepted the first combination outright would return a
// different move.
func TestDetectNakedTripleReturnsCompleteBoxMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(2, 2)] = NewCandidates([]int{1, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 7})
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{3, 9})

	assertMove(t, DetectNakedTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{1, 1}, [2]int{2, 2}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 2, Digit: 1},
			{Row: 2, Col: 0, Digit: 3},
		},
		Explanation: "Naked Triple {1,2,3} in box 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{1, 1}, [2]int{2, 2}),
		},
	})
}

// TestDetectNakedTripleNeedsThreeCandidateCells checks the lower bound on the
// cell pool: two cells cannot form a triple however their candidates line up.
func TestDetectNakedTripleNeedsThreeCandidateCells(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})

	if move := DetectNakedTriple(b); move != nil {
		t.Errorf("expected nil with only two candidate cells, got %+v", move)
	}
}

// TestDetectNakedTripleFiresOnExactlyThreeCandidateCells is the boundary
// partner of the test above: a pool of exactly three cells is enough, so the
// pool check must admit it rather than reject at equality.
func TestDetectNakedTripleFiresOnExactlyThreeCandidateCells(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 3})
	// Too wide to join the pool, and the only cell to eliminate from.
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1, 4, 5, 6})

	assertMove(t, DetectNakedTriple(b), &core.Move{
		Action:       "eliminate",
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		Eliminations: []core.Candidate{{Row: 0, Col: 4, Digit: 1}},
		Explanation:  "Naked Triple {1,2,3} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		},
	})
}

// TestDetectNakedTripleSkipsUnitWithNothingToEliminate checks the elimination
// guard: a closed triple whose unit holds nothing else is a fact about the
// board, not a move, so no empty move is returned.
func TestDetectNakedTripleSkipsUnitWithNothingToEliminate(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 3})
	// Shares the row but holds none of the triple's digits.
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{7, 8})

	if move := DetectNakedTriple(b); move != nil {
		t.Errorf("expected nil when the triple eliminates nothing, got %+v", move)
	}
}

// TestDetectNakedQuadReturnsCompleteRowMove pins the whole move for the
// four-cell subset, which reaches the shared subset search with a different
// size and technique name. Exactly one elimination results, which pins the
// elimination guard against a comparison that would demand more than one.
func TestDetectNakedQuadReturnsCompleteRowMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 4})
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{1, 7})

	assertMove(t, DetectNakedQuad(b), &core.Move{
		Action:       "eliminate",
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		Eliminations: []core.Candidate{{Row: 0, Col: 5, Digit: 1}},
		Explanation:  "Naked Quad {1,2,3,4} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		},
	})
}

// ============================================================================
// Hidden subsets
// ============================================================================

// TestDetectHiddenTripleReturnsCompleteRowMove pins the whole move for a hidden
// triple in a row. Digit 1 also appears exactly twice in the row, so it joins
// the digit pool and every combination containing it is tried and rejected
// before the real triple is reached.
func TestDetectHiddenTripleReturnsCompleteRowMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2, 3, 7})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{3, 4, 8})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 4, 9})
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(0, 6)] = NewCandidates([]int{1, 6})

	assertMove(t, DetectHiddenTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 7},
			{Row: 0, Col: 1, Digit: 8},
			{Row: 0, Col: 2, Digit: 9},
		},
		Explanation: "Hidden Triple {2,3,4} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		},
	})
}

// TestDetectHiddenTripleReturnsCompleteColumnMove pins the column case, with
// the three cells in different boxes so no box unit reaches the pattern first.
func TestDetectHiddenTripleReturnsCompleteColumnMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{2, 3, 7})
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{3, 4, 8})
	b.candidates[idxOf(6, 4)] = NewCandidates([]int{2, 4, 9})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(2, 4)] = NewCandidates([]int{1, 6})

	assertMove(t, DetectHiddenTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 4}, [2]int{3, 4}, [2]int{6, 4}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 4, Digit: 7},
			{Row: 3, Col: 4, Digit: 8},
			{Row: 6, Col: 4, Digit: 9},
		},
		Explanation: "Hidden Triple {2,3,4} in column 5",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 4}, [2]int{3, 4}, [2]int{6, 4}),
		},
	})
}

// TestDetectHiddenTripleReturnsCompleteBoxMove pins the box case, where the
// three cells share neither a row nor a column.
func TestDetectHiddenTripleReturnsCompleteBoxMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2, 3, 7})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4, 8})
	b.candidates[idxOf(2, 2)] = NewCandidates([]int{2, 4, 9})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{1, 6})

	assertMove(t, DetectHiddenTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{1, 1}, [2]int{2, 2}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 7},
			{Row: 1, Col: 1, Digit: 8},
			{Row: 2, Col: 2, Digit: 9},
		},
		Explanation: "Hidden Triple {2,3,4} in box 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{1, 1}, [2]int{2, 2}),
		},
	})
}

// TestDetectHiddenTripleFiresOnExactlyThreeSmallDigits is the boundary case for
// the digit pool: exactly three digits qualify, and the single elimination that
// results also pins the elimination guard against a comparison demanding more.
// The row also holds a digit with a single position sorting ahead of the
// triple's digits, which must remove only itself from the pool rather than end
// the scan before the triple is reached.
func TestDetectHiddenTripleFiresOnExactlyThreeSmallDigits(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 4, 9})
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1})

	assertMove(t, DetectHiddenTriple(b), &core.Move{
		Action:       "eliminate",
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		Eliminations: []core.Candidate{{Row: 0, Col: 2, Digit: 9}},
		Explanation:  "Hidden Triple {2,3,4} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		},
	})
}

// TestDetectHiddenTripleNeedsThreeSmallDigits checks the lower bound on the
// digit pool: two qualifying digits cannot close a triple.
func TestDetectHiddenTripleNeedsThreeSmallDigits(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})

	if move := DetectHiddenTriple(b); move != nil {
		t.Errorf("expected nil with only two qualifying digits, got %+v", move)
	}
}

// TestDetectHiddenTripleSkipsUnitWithNothingToEliminate checks the elimination
// guard on the hidden branch: three digits confined to three cells that hold
// nothing else is already resolved and yields no move.
func TestDetectHiddenTripleSkipsUnitWithNothingToEliminate(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 4})

	if move := DetectHiddenTriple(b); move != nil {
		t.Errorf("expected nil when the triple eliminates nothing, got %+v", move)
	}
}

// TestDetectHiddenQuadReturnsCompleteRowMove pins the four-digit case, which
// reaches the shared hidden-subset search with a different size and name.
func TestDetectHiddenQuadReturnsCompleteRowMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2, 3, 7})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{3, 4, 8})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{4, 5, 9})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{2, 5, 6})
	// Three decoy cells whose digits qualify for the pool but spread over three
	// positions each, so every combination containing them is tried and rejected
	// before the real quad is reached.
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{1, 7})
	b.candidates[idxOf(0, 6)] = NewCandidates([]int{1, 8})
	b.candidates[idxOf(0, 7)] = NewCandidates([]int{1, 7, 8})

	assertMove(t, DetectHiddenQuad(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 7},
			{Row: 0, Col: 1, Digit: 8},
			{Row: 0, Col: 2, Digit: 9},
			{Row: 0, Col: 3, Digit: 6},
		},
		Explanation: "Hidden Quad {2,3,4,5} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		},
	})
}

// TestDetectHiddenTripleIgnoresDigitFillingMoreCellsThanTheSubset checks the
// upper bound on the digit pool: a digit spread over four cells cannot be part
// of a triple, so it must not enter the pool and drag the combination scan into
// unions that can never close.
func TestDetectHiddenTripleIgnoresDigitFillingMoreCellsThanTheSubset(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2, 3, 7})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 3, 4, 8})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 2, 4, 9})
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{1, 5})

	assertMove(t, DetectHiddenTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 1},
			{Row: 0, Col: 0, Digit: 7},
			{Row: 0, Col: 1, Digit: 1},
			{Row: 0, Col: 1, Digit: 8},
			{Row: 0, Col: 2, Digit: 1},
			{Row: 0, Col: 2, Digit: 9},
		},
		Explanation: "Hidden Triple {2,3,4} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		},
	})
}

// ============================================================================
// Combination machinery
// ============================================================================

// TestCombinationsSizeKEnumeratesLexicographically pins the exact sequence the
// generator produces, which is what fixes which subset a detector reports when
// a unit admits more than one. The index-reset step after an increment is only
// observable across the whole sequence, not in any single combination.
func TestCombinationsSizeKEnumeratesLexicographically(t *testing.T) {
	var got [][]int
	combinationsSizeK([]int{10, 20, 30, 40, 50}, 3, func(combo []int) bool {
		got = append(got, append([]int(nil), combo...))
		return false
	})

	want := [][]int{
		{10, 20, 30}, {10, 20, 40}, {10, 20, 50},
		{10, 30, 40}, {10, 30, 50}, {10, 40, 50},
		{20, 30, 40}, {20, 30, 50}, {20, 40, 50},
		{30, 40, 50},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("combinationsSizeK = %v, want %v", got, want)
	}
}

// TestCombinationsSizeKStopsWhenCallbackReturnsTrue pins the early exit. Without
// it a detector would keep searching after finding its subset and report the
// last match instead of the first.
func TestCombinationsSizeKStopsWhenCallbackReturnsTrue(t *testing.T) {
	var seen [][]int
	combinationsSizeK([]int{1, 2, 3, 4}, 2, func(combo []int) bool {
		seen = append(seen, append([]int(nil), combo...))
		return len(seen) == 2
	})

	want := [][]int{{1, 2}, {1, 3}}
	if !reflect.DeepEqual(seen, want) {
		t.Errorf("combinations seen = %v, want %v", seen, want)
	}
}

// TestCombinationsSizeKYieldsTheEmptyCombinationForZero pins the k == 0
// boundary: zero is a legal size with exactly one combination, so the guard
// must reject only negative sizes.
func TestCombinationsSizeKYieldsTheEmptyCombinationForZero(t *testing.T) {
	calls := 0
	combinationsSizeK([]int{1, 2, 3}, 0, func(combo []int) bool {
		calls++
		if len(combo) != 0 {
			t.Errorf("combo = %v, want empty", combo)
		}
		return false
	})

	if calls != 1 {
		t.Errorf("callback called %d times, want 1", calls)
	}
}

// ============================================================================
// Formatting helpers
// ============================================================================

// TestFormatDigitsBracedSeparatesWithCommas pins the explanation's digit list,
// including that the separator is written between digits rather than before
// every one or none at all.
func TestFormatDigitsBracedSeparatesWithCommas(t *testing.T) {
	cases := []struct {
		digits []int
		want   string
	}{
		{nil, "{}"},
		{[]int{7}, "{7}"},
		{[]int{1, 2}, "{1,2}"},
		{[]int{3, 5, 9}, "{3,5,9}"},
	}
	for _, c := range cases {
		if got := formatDigitsBraced(c.digits); got != c.want {
			t.Errorf("formatDigitsBraced(%v) = %q, want %q", c.digits, got, c.want)
		}
	}
}

// TestIndicesToCellRefsSplitsRowMajorIndices pins the row/column arithmetic that
// turns a cell index into the coordinates a move reports.
func TestIndicesToCellRefsSplitsRowMajorIndices(t *testing.T) {
	got := indicesToCellRefs([]int{0, 8, 10, 80})

	want := []core.CellRef{{Row: 0, Col: 0}, {Row: 0, Col: 8}, {Row: 1, Col: 1}, {Row: 8, Col: 8}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("indicesToCellRefs = %+v, want %+v", got, want)
	}
}

// TestDetectNakedTripleStepsPastAWideCellBeforeTheSubset checks that a cell too
// wide to be a subset member only removes itself from the pool: the scan carries
// on to the cells behind it, and the wide cell is still eliminated from.
func TestDetectNakedTripleStepsPastAWideCellBeforeTheSubset(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 4, 5, 6})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 3})
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{3, 8})

	assertMove(t, DetectNakedTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 1},
			{Row: 0, Col: 5, Digit: 3},
		},
		Explanation: "Naked Triple {1,2,3} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3}),
		},
	})
}

// TestDetectNakedTripleAcceptsAMemberHoldingAllThreeDigits is the upper-bound
// boundary for the cell pool: a cell with exactly as many candidates as the
// subset has digits is a legal member, so the bound must exclude only cells
// wider than that.
func TestDetectNakedTripleAcceptsAMemberHoldingAllThreeDigits(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1, 7})

	assertMove(t, DetectNakedTriple(b), &core.Move{
		Action:       "eliminate",
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		Eliminations: []core.Candidate{{Row: 0, Col: 4, Digit: 1}},
		Explanation:  "Naked Triple {1,2,3} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		},
	})
}

// TestDetectHiddenTripleAcceptsADigitFillingAllThreeCells is the matching
// boundary for the digit pool: a digit occupying every cell of the subset is
// still a subset member, so the bound must exclude only digits spread wider.
// The row also carries a digit spread over four cells ahead of the triple,
// which must remove only itself from the pool rather than end the scan.
func TestDetectHiddenTripleAcceptsADigitFillingAllThreeCells(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2, 3, 7})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2, 4, 8})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 3, 4, 9})
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{1, 6})
	b.candidates[idxOf(0, 6)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(0, 7)] = NewCandidates([]int{1, 6})

	assertMove(t, DetectHiddenTriple(b), &core.Move{
		Action:  "eliminate",
		Targets: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 7},
			{Row: 0, Col: 1, Digit: 8},
			{Row: 0, Col: 2, Digit: 9},
		},
		Explanation: "Hidden Triple {2,3,4} in row 1",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}),
		},
	})
}
