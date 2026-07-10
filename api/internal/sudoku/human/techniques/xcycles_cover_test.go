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
