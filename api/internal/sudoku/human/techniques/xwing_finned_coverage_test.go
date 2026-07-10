package techniques

import "testing"

// TestFinnedXWingColumnBasedEliminates covers the column-based branch of the
// Finned X-Wing detector (and the column arm of buildFinnedXWingMove). Digit 5
// forms a base column 0 with candidates in rows {0,4} and a fin column 1 with
// candidates in rows {0,1,4}, where the fin (row 1) shares box-row 0 with the
// base position at row 0. The candidate at (0,2) sees both the base corner and
// the fin, so it is eliminated.
func TestFinnedXWingColumnBasedEliminates(t *testing.T) {
	b := &testBoard{}
	// Only digit 5 is placed, so no earlier digit and no row-based pattern fires.
	for _, idx := range []int{
		idxOf(0, 0), idxOf(4, 0), // base column 0 -> rows {0,4}
		idxOf(0, 1), idxOf(1, 1), idxOf(4, 1), // fin column 1 -> rows {0,1,4}
		idxOf(0, 2), // elimination target: sees base corner (0,0) and fin box
	} {
		b.candidates[idx] = NewCandidates([]int{5})
	}

	move := DetectFinnedXWing(b)
	if move == nil {
		t.Fatal("expected column-based Finned X-Wing to fire")
	}
	if move.Digit != 5 {
		t.Errorf("expected eliminated digit 5, got %d", move.Digit)
	}
	var hit bool
	for _, e := range move.Eliminations {
		if e.Row == 0 && e.Col == 2 && e.Digit == 5 {
			hit = true
		}
	}
	if !hit {
		t.Errorf("expected 5 eliminated at R1C3, got %+v", move.Eliminations)
	}
}
