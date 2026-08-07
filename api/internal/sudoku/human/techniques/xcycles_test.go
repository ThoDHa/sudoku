package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// ============================================================================
// Link tables
// ============================================================================

// TestBuildStrongLinksXCTakesEveryUnitHoldingExactlyTwo pins the link scan: a
// row, column or box in which the digit has exactly two places gives a strong
// link, and one with any other count gives none. A cell pair can produce more
// than one link when it shares more than one unit, which is why the units are
// reported in row, column, box order rather than deduplicated.
func TestBuildStrongLinksXCTakesEveryUnitHoldingExactlyTwo(t *testing.T) {
	b := &testBoard{}
	cells := []int{
		idxOf(0, 0), idxOf(0, 4), // row 0: exactly two
		idxOf(4, 0),                           // column 0 now holds two with R1C1
		idxOf(8, 1), idxOf(8, 2), idxOf(8, 5), // row 8: three, so no link
	}

	got := buildStrongLinksXC(b, 5, cells)

	want := []strongLinkXC{
		{idxOf(0, 0), idxOf(0, 4), "row"},
		{idxOf(0, 0), idxOf(4, 0), "col"},
		{idxOf(8, 1), idxOf(8, 2), "box"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("strong links = %+v, want %+v", got, want)
	}
}

// TestHasStrongLinkXCMatchesEitherDirection pins the lookup: a link is a pair
// without an order, so it must be found however its ends are given.
func TestHasStrongLinkXCMatchesEitherDirection(t *testing.T) {
	links := []strongLinkXC{{idxOf(0, 0), idxOf(0, 4), "row"}}

	if !hasStrongLinkXC(links, idxOf(0, 0), idxOf(0, 4)) {
		t.Error("expected the link to be found as given")
	}
	if !hasStrongLinkXC(links, idxOf(0, 4), idxOf(0, 0)) {
		t.Error("expected the link to be found reversed")
	}
	if hasStrongLinkXC(links, idxOf(0, 0), idxOf(0, 5)) {
		t.Error("expected no link to an unrelated cell")
	}
	if hasStrongLinkXC(nil, idxOf(0, 0), idxOf(0, 4)) {
		t.Error("expected no link in an empty table")
	}
}

// TestHasWeakLinkXCRequiresTwoDistinctPeers pins the weak-link test, including
// that a cell is not weakly linked to itself even though it trivially shares
// every unit with itself.
func TestHasWeakLinkXCRequiresTwoDistinctPeers(t *testing.T) {
	if !hasWeakLinkXC(idxOf(0, 0), idxOf(0, 4)) {
		t.Error("expected two cells in one row to be weakly linked")
	}
	if hasWeakLinkXC(idxOf(0, 0), idxOf(0, 0)) {
		t.Error("expected a cell not to be weakly linked to itself")
	}
	if hasWeakLinkXC(idxOf(0, 0), idxOf(4, 5)) {
		t.Error("expected two cells sharing no unit not to be weakly linked")
	}
}

// ============================================================================
// Cycle analysis
// ============================================================================

// xcyclePath is a four-cell cycle: R1C1, R1C5, R5C5, R5C1, each consecutive
// pair sharing a row or a column.
func xcyclePath() []int {
	return []int{idxOf(0, 0), idxOf(0, 4), idxOf(4, 4), idxOf(4, 0)}
}

// TestAnalyzeCycleFixedAssignsWhereTwoStrongLinksMeet pins the first
// discontinuity: a cell entered and left by strong links must hold the digit,
// so the move is an assignment rather than an elimination, and it names the
// cell it applies to.
func TestAnalyzeCycleFixedAssignsWhereTwoStrongLinksMeet(t *testing.T) {
	b := &testBoard{}
	// Links out of each node: strong, weak, strong, strong. Node 3 is entered
	// by a strong link and left by one, and node 0 is entered by node 3's strong
	// link and left by a strong link too, so node 0 is reached first.
	got := analyzeCycleFixed(b, 5, xcyclePath(), []bool{true, false, true, true})

	assertMove(t, got, &core.Move{
		Action:      "assign",
		Digit:       5,
		Targets:     refs([2]int{0, 0}),
		Explanation: "X-Cycle Type 1: two strong links meet at R1C1, so it must be 5",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 4}, [2]int{4, 0}),
		},
	})
}

// TestAnalyzeCycleFixedEliminatesWhereTwoWeakLinksMeet pins the second
// discontinuity, which is the mirror of the first: a cell entered and left by
// weak links cannot hold the digit.
func TestAnalyzeCycleFixedEliminatesWhereTwoWeakLinksMeet(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{5, 7})

	got := analyzeCycleFixed(b, 5, xcyclePath(), []bool{false, false, true, false})

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 0, Col: 0, Digit: 5}},
		Explanation:  "X-Cycle Type 2: two weak links meet at R1C1, eliminating 5",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 4}, [2]int{4, 0}),
			Secondary: refs([2]int{0, 0}),
		},
	})
}

// TestAnalyzeCycleFixedIgnoresAWeakMeetingWithoutTheDigit checks the guard on
// that elimination: there is nothing to remove from a cell that does not hold
// the digit, so the scan carries on rather than returning an empty move.
func TestAnalyzeCycleFixedIgnoresAWeakMeetingWithoutTheDigit(t *testing.T) {
	b := &testBoard{}

	if move := analyzeCycleFixed(b, 5, xcyclePath(), []bool{false, false, true, false}); move != nil {
		t.Errorf("expected nil when the meeting cell does not hold the digit, got %+v", move)
	}
}

// TestAnalyzeCycleFixedRejectsMalformedCycles pins both structural
// preconditions: a cycle shorter than four nodes is not a cycle, and a link
// sequence of the wrong length cannot describe the path it accompanies.
func TestAnalyzeCycleFixedRejectsMalformedCycles(t *testing.T) {
	b := &testBoard{}
	short := []int{idxOf(0, 0), idxOf(0, 4), idxOf(4, 4)}

	if move := analyzeCycleFixed(b, 5, short, []bool{true, true, true}); move != nil {
		t.Errorf("expected nil for a three-node cycle, got %+v", move)
	}
	if move := analyzeCycleFixed(b, 5, xcyclePath(), []bool{true, true, true}); move != nil {
		t.Errorf("expected nil when the link sequence is shorter than the path, got %+v", move)
	}
	if move := analyzeCycleFixed(b, 5, xcyclePath(), []bool{true, true, true, true, true}); move != nil {
		t.Errorf("expected nil when the link sequence is longer than the path, got %+v", move)
	}
}

// ============================================================================
// Nice loops
// ============================================================================

// TestFindNiceLoopEliminationsFixedTakesCellsSeeingBothEndsOfAWeakLink pins the
// continuous case, where no node is a discontinuity and the eliminations come
// from outside the loop: a cell seeing both ends of any weak link cannot hold
// the digit. Cells on the loop are skipped even though each sees its own
// neighbors.
func TestFindNiceLoopEliminationsFixedTakesCellsSeeingBothEndsOfAWeakLink(t *testing.T) {
	b := &testBoard{}
	path := xcyclePath()
	for _, cell := range path {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}
	// Sees both ends of the loop's second weak link, R5C1 and R1C1, along
	// column 0.
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{5, 8})
	// Sees only one end.
	b.candidates[idxOf(7, 7)] = NewCandidates([]int{5, 8})

	got := findNiceLoopEliminationsFixed(b, 5, path, []bool{true, false, true, false})

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 2, Col: 0, Digit: 5}},
		Explanation:  "X-Cycle Nice Loop: eliminate 5 from cells seeing both ends of weak links.",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 4}, [2]int{4, 0}),
		},
	})
}

// TestFindNiceLoopEliminationsFixedReturnsNilWithoutWeakLinks checks the other
// end: a loop of strong links alone offers no weak link to eliminate across, so
// the analysis yields nothing.
func TestFindNiceLoopEliminationsFixedReturnsNilWithoutWeakLinks(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{5, 8})

	if move := findNiceLoopEliminationsFixed(b, 5, xcyclePath(), []bool{true, true, true, true}); move != nil {
		t.Errorf("expected nil when the loop holds no weak link, got %+v", move)
	}
}

// ============================================================================
// Path formatting
// ============================================================================

// TestPathToCellRefsSimpleKeepsPathOrder pins the coordinate split and the
// order the highlights report the loop in.
func TestPathToCellRefsSimpleKeepsPathOrder(t *testing.T) {
	got := pathToCellRefsSimple([]int{idxOf(0, 0), idxOf(1, 3), idxOf(8, 8)})

	want := refs([2]int{0, 0}, [2]int{1, 3}, [2]int{8, 8})
	if !reflect.DeepEqual(got, want) {
		t.Errorf("refs = %+v, want %+v", got, want)
	}
}
