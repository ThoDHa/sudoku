package techniques

import (
	"testing"

	"sudoku-api/internal/core"
)

// TestAnalyzeCycleFixedRejectsTooShortOrMismatchedCycle drives the guard clause
// at the top of analyzeCycleFixed: a cycle needs at least four nodes and the
// link-type slice length must equal the node count. Both violations return nil.
func TestAnalyzeCycleFixedRejectsTooShortOrMismatchedCycle(t *testing.T) {
	b := &testBoard{}
	b.candidates[0] = b.candidates[0].Set(5)
	b.candidates[1] = b.candidates[1].Set(5)
	b.candidates[2] = b.candidates[2].Set(5)

	// Fewer than four nodes: no cycle is possible.
	if move := analyzeCycleFixed(b, 5, []int{0, 1, 2}, []bool{true, false, true}); move != nil {
		t.Errorf("expected nil for a 3-node path, got %+v", move)
	}

	// Node count and link-type slice length disagree: malformed cycle.
	if move := analyzeCycleFixed(b, 5, []int{0, 1, 2, 3}, []bool{true, false, true}); move != nil {
		t.Errorf("expected nil when len(linkStrong) != len(path), got %+v", move)
	}
}

// TestFindNiceLoopEliminationsFixedEliminatesFromCellSeeingBothWeakEnds drives
// the nice-loop elimination path of findNiceLoopEliminationsFixed. A continuous
// alternating 4-cycle (strong, weak, strong, weak) has weak links whose two
// endpoints are peers; any external cell that sees BOTH endpoints of a weak
// link and holds the digit is eliminated.
func TestFindNiceLoopEliminationsFixedEliminatesFromCellSeeingBothWeakEnds(t *testing.T) {
	// Cycle cells for digit 5:
	//   R1C1 (0) -strong- R1C9 (8) -weak- R9C9 (80) -strong- R9C1 (72) -weak- back.
	// Weak link R1C9<->R9C9 lies in column 9; R5C9 (44) sees both ends via
	// column 9 and carries digit 5, so 5 is eliminated there.
	path := []int{idxOf(0, 0), idxOf(0, 8), idxOf(8, 8), idxOf(8, 0)}
	linkStrong := []bool{true, false, true, false}

	b := &testBoard{}
	for _, idx := range append(append([]int{}, path...), idxOf(4, 8)) {
		b.candidates[idx] = b.candidates[idx].Set(5)
	}

	move := findNiceLoopEliminationsFixed(b, 5, path, linkStrong)
	if move == nil {
		t.Fatal("expected a nice-loop elimination for a cell seeing both ends of a weak link")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if move.Digit != 5 {
		t.Errorf("expected digit 5, got %d", move.Digit)
	}
	want := core.Candidate{Row: 4, Col: 8, Digit: 5}
	found := false
	for _, e := range move.Eliminations {
		if e == want {
			found = true
		}
	}
	if !found {
		t.Errorf("expected elimination of 5 at R5C9, got %+v", move.Eliminations)
	}
}

// TestSearchCycleClosesOnStrongLinkAndAssigns drives the strong-link cycle
// closure inside searchCycle. A five-node path whose links alternate
// strong, weak, strong, weak and then closes back to the start with a strong
// link forms an odd cycle with two strong links meeting at the start node,
// which analyzeCycleFixed reports as a Type 1 assignment.
//
// The strong-link set is supplied directly (weak links are derived from real
// peer relationships) to exercise the DFS closure branch deterministically,
// following the existing pattern of driving analyzeCycleFixed with a
// hand-built cycle.
func TestSearchCycleClosesOnStrongLinkAndAssigns(t *testing.T) {
	// Cells for digit 5 (only these carry it, so no shorter sub-cycle can
	// produce an elimination and pre-empt the strong closure):
	//   c0=R1C1(0), c1=R2C1(9), c2=R2C9(17), c3=R8C9(71), c4=R8C1(63).
	c0, c1, c2, c3, c4 := idxOf(0, 0), idxOf(1, 0), idxOf(1, 8), idxOf(7, 8), idxOf(7, 0)
	cells := []int{c0, c1, c2, c3, c4}

	b := &testBoard{}
	for _, idx := range cells {
		b.candidates[idx] = b.candidates[idx].Set(5)
	}

	// Strong links form the odd cycle c0-c1, c2-c3, c4-c0; the weak links
	// c1-c2 (row 2) and c3-c4 (row 8) come from real peer relationships.
	strongLinks := []strongLinkXC{
		{cell1: c0, cell2: c1, unit: "col"},
		{cell1: c2, cell2: c3, unit: "col"},
		{cell1: c4, cell2: c0, unit: "col"},
	}

	move := searchCycle(b, 5, cells, strongLinks, c0, true)
	if move == nil {
		t.Fatal("expected a Type 1 assignment from a strong-link-closing odd cycle")
	}
	if move.Action != "assign" {
		t.Errorf("expected action 'assign', got %q", move.Action)
	}
	if move.Digit != 5 {
		t.Errorf("expected digit 5, got %d", move.Digit)
	}
	if len(move.Targets) != 1 || move.Targets[0] != (core.CellRef{Row: 0, Col: 0}) {
		t.Errorf("expected assignment at R1C1 (the start node), got %+v", move.Targets)
	}
}

// TestSearchCycleClosesAFourNodeLoopAndEliminates drives the shortest cycle the
// search accepts. R3C5 is reached first and carries no strong link onwards, so
// the scan has to abandon it and take the other branch before the loop closes;
// it is then the cell the closed loop eliminates from.
func TestSearchCycleClosesAFourNodeLoopAndEliminates(t *testing.T) {
	c0, c1, c2, c3 := idxOf(0, 0), idxOf(0, 4), idxOf(4, 4), idxOf(4, 0)
	cells := []int{c0, c1, c2, c3, idxOf(2, 4)}

	b := &testBoard{}
	for _, cell := range cells {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}

	strongLinks := []strongLinkXC{
		{cell1: c0, cell2: c1, unit: "row"},
		{cell1: c2, cell2: c3, unit: "row"},
	}

	assertMove(t, searchCycle(b, 5, cells, strongLinks, c0, true), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 2, Col: 4, Digit: 5}},
		Explanation:  "X-Cycle Nice Loop: eliminate 5 from cells seeing both ends of weak links.",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 4}, [2]int{4, 0}),
		},
	})
}

// TestSearchCycleRefusesAStrongClosureWhereTheAlternationDemandsWeak pins the
// need-strong half of the strong closure guard. A strong link back to the start
// does exist here, but the alternation calls for a weak one at that point, and
// taking the strong one would report two strong links meeting at a start node
// that no cycle brings them together at.
func TestSearchCycleRefusesAStrongClosureWhereTheAlternationDemandsWeak(t *testing.T) {
	c0, c1, c2, c3 := idxOf(0, 0), idxOf(0, 4), idxOf(4, 4), idxOf(4, 0)
	cells := []int{c0, c1, c2, c3}

	b := &testBoard{}
	for _, cell := range cells {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}

	strongLinks := []strongLinkXC{
		{cell1: c0, cell2: c1, unit: "row"},
		{cell1: c2, cell2: c3, unit: "row"},
		{cell1: c3, cell2: c0, unit: "col"},
	}

	if move := searchCycle(b, 5, cells, strongLinks, c0, true); move != nil {
		t.Errorf("expected nil when the closing link has to be weak, got %+v", move)
	}
}

// TestSearchCycleRefusesAWeakClosureWhereTheAlternationDemandsStrong is the
// mirror: the path returns to a cell it can see but holds no strong link to,
// while the alternation calls for a strong one. R1C3 sees both ends of a weak
// link either wrong closure would produce, so a closure taken here yields a
// move instead of nothing.
func TestSearchCycleRefusesAWeakClosureWhereTheAlternationDemandsStrong(t *testing.T) {
	c0, c1, c2, c3 := idxOf(0, 0), idxOf(0, 4), idxOf(4, 4), idxOf(4, 0)
	cells := []int{c0, c1, c2, c3}

	b := &testBoard{}
	for _, cell := range cells {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{5, 8})

	strongLinks := []strongLinkXC{{cell1: c1, cell2: c2, unit: "col"}}

	if move := searchCycle(b, 5, cells, strongLinks, c0, false); move != nil {
		t.Errorf("expected nil when the closing link has to be strong, got %+v", move)
	}
}

// TestSearchCycleRefusesToRevisitACellAlreadyOnThePath pins the in-path check.
// Two cells joined by both a strong and a weak link can be walked back and
// forth into a four-node loop, and R1C3 sees both of them, so such a loop
// reports an elimination that no real cycle supports.
func TestSearchCycleRefusesToRevisitACellAlreadyOnThePath(t *testing.T) {
	c0, c1 := idxOf(0, 0), idxOf(0, 4)
	cells := []int{c0, c1}

	b := &testBoard{}
	b.candidates[c0] = NewCandidates([]int{5, 9})
	b.candidates[c1] = NewCandidates([]int{5, 9})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{5, 8})

	strongLinks := []strongLinkXC{{cell1: c0, cell2: c1, unit: "row"}}

	if move := searchCycle(b, 5, cells, strongLinks, c0, true); move != nil {
		t.Errorf("expected nil when the only continuation revisits the path, got %+v", move)
	}
}

// TestSearchCycleRefusesToStepWhereTheRequiredLinkIsMissing pins the extension
// guard. R1C5 and R5C6 share no unit, so the weak step between them does not
// exist; bridging it anyway closes a loop through R5C1 back to the start and
// eliminates from R3C1.
func TestSearchCycleRefusesToStepWhereTheRequiredLinkIsMissing(t *testing.T) {
	c0, c1, c2, c3 := idxOf(0, 0), idxOf(0, 4), idxOf(4, 5), idxOf(4, 0)
	cells := []int{c0, c1, c2, c3}

	b := &testBoard{}
	for _, cell := range cells {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{5, 8})

	strongLinks := []strongLinkXC{
		{cell1: c0, cell2: c1, unit: "row"},
		{cell1: c2, cell2: c3, unit: "row"},
	}

	if move := searchCycle(b, 5, cells, strongLinks, c0, true); move != nil {
		t.Errorf("expected nil when no link of the required type exists, got %+v", move)
	}
}

// TestSearchCycleClosesATenNodeLoop pins the upper end of the path-length
// bound. The ten cells sit two to a row and two to a column with no two of them
// sharing a box by accident, so they see each other along the loop and nowhere
// else: the walk around it is forced at every step and no shorter loop exists.
// A bound one node tighter discards the closing state and finds nothing.
func TestSearchCycleClosesATenNodeLoop(t *testing.T) {
	cells := []int{
		idxOf(0, 3), idxOf(0, 0),
		idxOf(3, 0), idxOf(3, 1),
		idxOf(6, 1), idxOf(6, 6),
		idxOf(1, 6), idxOf(1, 7),
		idxOf(4, 7), idxOf(4, 3),
	}
	strongLinks := []strongLinkXC{
		{cell1: cells[0], cell2: cells[1], unit: "row"},
		{cell1: cells[2], cell2: cells[3], unit: "row"},
		{cell1: cells[4], cell2: cells[5], unit: "row"},
		{cell1: cells[6], cell2: cells[7], unit: "row"},
		{cell1: cells[8], cell2: cells[9], unit: "row"},
	}

	b := &testBoard{}
	for _, cell := range cells {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}
	// Column 1 carries both ends of the loop's first weak link.
	b.candidates[idxOf(6, 0)] = NewCandidates([]int{5, 8})

	assertMove(t, searchCycle(b, 5, cells, strongLinks, cells[0], true), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 6, Col: 0, Digit: 5}},
		Explanation:  "X-Cycle Nice Loop: eliminate 5 from cells seeing both ends of weak links.",
		Highlights: core.Highlights{
			Primary: refs(
				[2]int{0, 3}, [2]int{0, 0}, [2]int{3, 0}, [2]int{3, 1}, [2]int{6, 1},
				[2]int{6, 6}, [2]int{1, 6}, [2]int{1, 7}, [2]int{4, 7}, [2]int{4, 3},
			),
		},
	})
}

// TestSearchCycleAbandonsALoopLongerThanTenNodes pins the other end of the
// bound. These eleven cells see each other in five disjoint pairs and nowhere
// else, and the six strong links join those pairs into a single eleven-node
// loop, so the only walk available runs the whole loop and the only closure
// available is at its eleventh node. The search declines to look that far.
//
// The strong links bridge cells that share no unit, which is what keeps the
// loop odd; the search consults the table rather than the grid for them, so
// they carry no unit name.
func TestSearchCycleAbandonsALoopLongerThanTenNodes(t *testing.T) {
	start := idxOf(6, 1)
	cells := []int{
		start,
		idxOf(0, 0), idxOf(1, 0), // seen along column 1
		idxOf(3, 4), idxOf(4, 4), // seen along column 5
		idxOf(2, 5), idxOf(2, 7), // seen along row 3
		idxOf(5, 2), idxOf(5, 6), // seen along row 6
		idxOf(7, 3), idxOf(7, 8), // seen along row 8
	}
	strongLinks := []strongLinkXC{
		{cell1: cells[0], cell2: cells[1]},
		{cell1: cells[2], cell2: cells[3]},
		{cell1: cells[4], cell2: cells[5]},
		{cell1: cells[6], cell2: cells[7]},
		{cell1: cells[8], cell2: cells[9]},
		{cell1: cells[10], cell2: cells[0]},
	}

	b := &testBoard{}
	for _, cell := range cells {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}

	if move := searchCycle(b, 5, cells, strongLinks, start, true); move != nil {
		t.Errorf("expected nil for a loop of eleven nodes, got %+v", move)
	}
}

// TestSearchCycleKeepsSearchingAfterAbandoningAnOverlongPath pins that the
// path-length bound drops one path rather than ending the search. R1C7 leads
// into box 9, where the walk runs eleven nodes deep and closes nowhere; the
// four-node loop through R2C2 and R5C2 is only reached once that branch is
// exhausted.
func TestSearchCycleKeepsSearchingAfterAbandoningAnOverlongPath(t *testing.T) {
	start := idxOf(0, 0)
	loop := []int{idxOf(1, 1), idxOf(4, 1), idxOf(4, 0)}
	overlong := []int{
		idxOf(0, 6),
		idxOf(6, 6), idxOf(6, 7), idxOf(6, 8),
		idxOf(7, 6), idxOf(7, 7), idxOf(7, 8),
		idxOf(8, 6), idxOf(8, 7), idxOf(8, 8),
	}
	cells := append(append([]int{start}, loop...), overlong...)

	strongLinks := []strongLinkXC{
		{cell1: start, cell2: loop[0], unit: "box"},
		{cell1: loop[1], cell2: loop[2], unit: "row"},
		{cell1: start, cell2: overlong[0], unit: "row"},
		{cell1: overlong[1], cell2: overlong[2], unit: "row"},
		{cell1: overlong[3], cell2: overlong[4], unit: "box"},
		{cell1: overlong[5], cell2: overlong[6], unit: "row"},
		{cell1: overlong[7], cell2: overlong[8], unit: "row"},
	}

	b := &testBoard{}
	for _, cell := range cells {
		b.candidates[cell] = NewCandidates([]int{5, 9})
	}
	// Sees both ends of the loop's weak link along column 2.
	b.candidates[idxOf(7, 1)] = NewCandidates([]int{5, 8})

	assertMove(t, searchCycle(b, 5, cells, strongLinks, start, true), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Eliminations: []core.Candidate{{Row: 7, Col: 1, Digit: 5}},
		Explanation:  "X-Cycle Nice Loop: eliminate 5 from cells seeing both ends of weak links.",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{1, 1}, [2]int{4, 1}, [2]int{4, 0}),
		},
	})
}

// TestDetectGroupedXCyclesReportsTheLowestDigitHoldingACycle drives the whole
// detector from a board, so the digit scan, the link table and the search all
// take part. Only digit 1 has candidates, so a scan starting one digit higher
// finds nothing. The column strong link out of R1C1 and the box strong link
// into R3C5 both lead to dead ends the search has to step over first.
func TestDetectGroupedXCyclesReportsTheLowestDigitHoldingACycle(t *testing.T) {
	b := &testBoard{}
	for _, cell := range []int{idxOf(0, 0), idxOf(0, 4), idxOf(2, 4), idxOf(4, 0), idxOf(4, 4)} {
		b.candidates[cell] = NewCandidates([]int{1})
	}

	assertMove(t, DetectGroupedXCycles(b), &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Eliminations: []core.Candidate{{Row: 2, Col: 4, Digit: 1}},
		Explanation:  "X-Cycle Nice Loop: eliminate 1 from cells seeing both ends of weak links.",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{4, 4}, [2]int{4, 0}),
		},
	})
}
