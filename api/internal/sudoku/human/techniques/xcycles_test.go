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

// TestBuildStrongLinksXCConfinesTheBoxScanToItsOwnThreeByThree pins all four
// bounds of the box window: a cell on the box's first row or first column
// belongs to it, and a cell one row or one column beyond its last does not.
func TestBuildStrongLinksXCConfinesTheBoxScanToItsOwnThreeByThree(t *testing.T) {
	b := &testBoard{}
	want := []strongLinkXC{{idxOf(0, 0), idxOf(1, 1), "box"}}

	// R1C1 sits on both the first row and the first column of box 1, so
	// excluding either edge would leave the box holding one cell and no link.
	if got := buildStrongLinksXC(b, 5, []int{idxOf(0, 0), idxOf(1, 1)}); !reflect.DeepEqual(got, want) {
		t.Errorf("links with both cells inside box 1 = %+v, want %+v", got, want)
	}

	// R4C3 lies one row below box 1. Admitting it would give the box three
	// cells, which is one too many for a strong link.
	if got := buildStrongLinksXC(b, 5, []int{idxOf(0, 0), idxOf(1, 1), idxOf(3, 2)}); !reflect.DeepEqual(got, want) {
		t.Errorf("links with a cell one row below box 1 = %+v, want %+v", got, want)
	}

	// R2C4 lies one column right of box 1, and shares row 2 with R2C2, so the
	// row link is expected and only the box link is at stake.
	wantWithRow := []strongLinkXC{
		{idxOf(1, 1), idxOf(1, 3), "row"},
		{idxOf(0, 0), idxOf(1, 1), "box"},
	}
	if got := buildStrongLinksXC(b, 5, []int{idxOf(0, 0), idxOf(1, 1), idxOf(1, 3)}); !reflect.DeepEqual(got, wantWithRow) {
		t.Errorf("links with a cell one column right of box 1 = %+v, want %+v", got, wantWithRow)
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

// TestHasStrongLinkXCRejectsHalfMatchingPairs pins both halves of both
// orientations of the lookup: matching one end of a link is not matching the
// link.
func TestHasStrongLinkXCRejectsHalfMatchingPairs(t *testing.T) {
	links := []strongLinkXC{{idxOf(0, 0), idxOf(0, 4), "row"}}

	if hasStrongLinkXC(links, idxOf(0, 1), idxOf(0, 4)) {
		t.Error("expected no link when only the far end matches as given")
	}
	if hasStrongLinkXC(links, idxOf(0, 4), idxOf(0, 1)) {
		t.Error("expected no link when only the far end matches reversed")
	}
	if hasStrongLinkXC(links, idxOf(0, 1), idxOf(0, 0)) {
		t.Error("expected no link when only the near end matches reversed")
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

// offsetCyclePath is a four-cell cycle placed away from the grid origin: R2C2,
// R2C6, R6C6, R6C2. Its second node has index 14, whose row quotient, column
// remainder and index are three different numbers, so the coordinate split of
// a move naming that node is observable.
func offsetCyclePath() []int {
	return []int{idxOf(1, 1), idxOf(1, 5), idxOf(5, 5), idxOf(5, 1)}
}

// TestAnalyzeCycleFixedAssignsAtAMeetingNodeAwayFromTheOrigin pins the
// coordinate arithmetic of the Type 1 move, which a cycle meeting at R1C1
// cannot: index 0 divides, remainders and multiplies to itself.
func TestAnalyzeCycleFixedAssignsAtAMeetingNodeAwayFromTheOrigin(t *testing.T) {
	b := &testBoard{}

	// Links out of each node: strong, strong, weak, weak. Node 0 is entered
	// weakly and left strongly, so the scan passes it and stops at node 1.
	got := analyzeCycleFixed(b, 5, offsetCyclePath(), []bool{true, true, false, false})

	assertMove(t, got, &core.Move{
		Action:      "assign",
		Digit:       5,
		Targets:     refs([2]int{1, 5}),
		Explanation: "X-Cycle Type 1: two strong links meet at R2C6, so it must be 5",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 1}, [2]int{1, 5}, [2]int{5, 5}, [2]int{5, 1}),
		},
	})
}

// TestAnalyzeCycleFixedEliminatesAtAMeetingNodeAwayFromTheOrigin is the Type 2
// mirror, and pins the same coordinate split across the elimination, the
// explanation and the secondary highlight.
func TestAnalyzeCycleFixedEliminatesAtAMeetingNodeAwayFromTheOrigin(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(1, 5)] = NewCandidates([]int{5, 7})

	got := analyzeCycleFixed(b, 5, offsetCyclePath(), []bool{false, false, true, true})

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 1, Col: 5, Digit: 5}},
		Explanation:  "X-Cycle Type 2: two weak links meet at R2C6, eliminating 5",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 1}, [2]int{1, 5}, [2]int{5, 5}, [2]int{5, 1}),
			Secondary: refs([2]int{1, 5}),
		},
	})
}

// TestAnalyzeCycleFixedHandsAnAlternatingCycleToTheNiceLoop pins both halves of
// each discontinuity test. Every node of an alternating cycle is entered and
// left by opposite link types, so neither reading applies and the analysis
// falls through; testing only the incoming or only the outgoing link would
// report a discontinuity at the first node the scan reached.
//
// R2C8 sees the near end of the R2C6-R6C6 weak link but not the far end, so it
// survives, which pins the far end as a distinct cell rather than a repeat of
// the near one.
func TestAnalyzeCycleFixedHandsAnAlternatingCycleToTheNiceLoop(t *testing.T) {
	b := &testBoard{}
	for _, cell := range offsetCyclePath() {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}
	b.candidates[idxOf(3, 5)] = NewCandidates([]int{5, 8})
	b.candidates[idxOf(1, 7)] = NewCandidates([]int{5, 8})

	got := analyzeCycleFixed(b, 5, offsetCyclePath(), []bool{true, false, true, false})

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 3, Col: 5, Digit: 5}},
		Explanation:  "X-Cycle Nice Loop: eliminate 5 from cells seeing both ends of weak links.",
		Highlights: core.Highlights{
			Primary: refs([2]int{1, 1}, [2]int{1, 5}, [2]int{5, 5}, [2]int{5, 1}),
		},
	})
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

// TestFindNiceLoopEliminationsFixedSkipsLoopCellsAndDeduplicates uses a loop
// whose four cells share a box, so each of them sees both ends of a weak link
// and would be eliminated from itself if the in-path skip were dropped. The one
// outside cell sees both ends of both weak links, so it is collected twice and
// only deduplication reduces it to a single elimination.
func TestFindNiceLoopEliminationsFixedSkipsLoopCellsAndDeduplicates(t *testing.T) {
	b := &testBoard{}
	path := []int{idxOf(0, 0), idxOf(0, 1), idxOf(1, 1), idxOf(1, 0)}
	for _, cell := range path {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}
	b.candidates[idxOf(2, 2)] = NewCandidates([]int{5, 8})

	got := findNiceLoopEliminationsFixed(b, 5, path, []bool{true, false, true, false})

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 2, Col: 2, Digit: 5}},
		Explanation:  "X-Cycle Nice Loop: eliminate 5 from cells seeing both ends of weak links.",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{1, 1}, [2]int{1, 0}),
		},
	})
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
