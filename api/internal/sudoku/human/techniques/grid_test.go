package techniques

import (
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// TestGetCellRefsConvertsEveryCellIndex pins the index-to-coordinate conversion
// across the whole slice. The existing accessor test checks only the first ref
// of a row unit, where row 0 and column 0 both convert to zero, so any arithmetic
// error and any early exit from the conversion loop stays invisible there.
func TestGetCellRefsConvertsEveryCellIndex(t *testing.T) {
	u := Unit{Type: UnitRow, Index: 0, Cells: []int{0, 10, 80}}
	want := []core.CellRef{{Row: 0, Col: 0}, {Row: 1, Col: 1}, {Row: 8, Col: 8}}

	got := u.GetCellRefs()
	if len(got) != len(want) {
		t.Fatalf("expected %d refs, got %d: %v", len(want), len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("ref %d: got %+v, want %+v", i, got[i], want[i])
		}
	}
}

// TestBoxIndexFromPosUsesTheAxisMatchingTheUnitType pins that a row unit reads
// the column and a column unit reads the row. The existing test uses R4C6, whose
// row and column land in the same box segment, so it passes even when both
// branches read the same axis.
func TestBoxIndexFromPosUsesTheAxisMatchingTheUnitType(t *testing.T) {
	pos := core.CellRef{Row: 0, Col: 6}
	if got := UnitRow.BoxIndexFromPos(pos); got != 2 {
		t.Errorf("a row unit must segment by column: got %d, want 2", got)
	}
	if got := UnitCol.BoxIndexFromPos(pos); got != 0 {
		t.Errorf("a column unit must segment by row: got %d, want 0", got)
	}
}

// TestArePeersRejectsACellAsItsOwnPeer pins the self-peer exclusion. The peer
// tables are built skipping the cell itself, and FindEliminationsSeeing relies on
// that: a cell named in mustSee can never see itself, so it drops out of the
// elimination sweep without needing to be excluded explicitly.
func TestArePeersRejectsACellAsItsOwnPeer(t *testing.T) {
	for _, idx := range []int{0, 40, constants.TotalCells - 1} {
		if ArePeers(idx, idx) {
			t.Errorf("cell %d must not be its own peer", idx)
		}
	}
}

// TestPeerTablesArePopulated pins that the per-cell peer tables are actually
// built. Nothing else asserts their contents: the Are*Peers helpers compute
// coordinates directly rather than reading these slices.
func TestPeerTablesArePopulated(t *testing.T) {
	cases := []struct {
		name  string
		table [constants.TotalCells][]int
		peer  int
	}{
		{"row", RowPeers, idxOf(0, 8)},
		{"column", ColPeers, idxOf(8, 0)},
		{"box", BoxPeers, idxOf(2, 2)},
	}
	for _, tc := range cases {
		got := tc.table[idxOf(0, 0)]
		if len(got) != constants.GridSize-1 {
			t.Errorf("%s peers of R1C1: expected %d entries, got %d", tc.name, constants.GridSize-1, len(got))
			continue
		}
		var found, hasSelf bool
		for _, idx := range got {
			if idx == tc.peer {
				found = true
			}
			if idx == idxOf(0, 0) {
				hasSelf = true
			}
		}
		if !found {
			t.Errorf("%s peers of R1C1 must include cell %d, got %v", tc.name, tc.peer, got)
		}
		if hasSelf {
			t.Errorf("%s peers of R1C1 must not include the cell itself, got %v", tc.name, got)
		}
	}
}

// TestDedupeEliminationsPreservesNil pins that a nil input comes back nil rather
// than as an allocated empty slice, which is what the length fast path
// guarantees for callers that distinguish the two.
func TestDedupeEliminationsPreservesNil(t *testing.T) {
	if got := DedupeEliminations(nil); got != nil {
		t.Errorf("nil input must come back nil, got %v", got)
	}
}

// TestDedupeEliminationsCollapsesAnExactPair pins deduplication at exactly two
// elements, the smallest input where a duplicate can exist. The existing test
// covers three elements and one element, so a fast path that skips work at two
// passes it.
func TestDedupeEliminationsCollapsesAnExactPair(t *testing.T) {
	pair := []core.Candidate{MakeElimination(0, 1), MakeElimination(0, 1)}
	if got := DedupeEliminations(pair); len(got) != 1 {
		t.Errorf("two identical eliminations must collapse to one, got %d: %v", len(got), got)
	}
}

// alsBoard builds a board carrying three Almost Locked Sets of known sizes, all
// within their own units so they cannot interfere:
//
//   - row 1 (R1C1..R1C4): four cells over five candidates, a size-4 ALS
//   - row 1 (R1C1..R1C5): five cells over six candidates, a size-5 ALS
//   - row 2 (R2C1..R2C2): two cells over three candidates, a size-2 ALS whose
//     first cell holds a single candidate
func alsBoard() *testBoard {
	b := &testBoard{}
	for idx, digits := range map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {2, 3},
		idxOf(0, 2): {3, 4},
		idxOf(0, 3): {4, 5},
		idxOf(0, 4): {5, 6},
		idxOf(1, 0): {7},
		idxOf(1, 1): {8, 9},
	} {
		b.candidates[idx] = NewCandidates(digits)
	}
	return b
}

func alsSizes(all []ALS) map[int]int {
	sizes := make(map[int]int)
	for _, a := range all {
		sizes[len(a.Cells)]++
	}
	return sizes
}

// TestFindAllALSDefaultsToSizeFour pins both ends of the default size limit: an
// ALS of four cells must be found, and one of five cells must not.
func TestFindAllALSDefaultsToSizeFour(t *testing.T) {
	sizes := alsSizes(FindAllALS(alsBoard(), 0))
	if sizes[4] == 0 {
		t.Errorf("the default limit must reach size 4, got sizes %v", sizes)
	}
	if sizes[5] != 0 {
		t.Errorf("the default limit must stop at size 4, got %d of size 5", sizes[5])
	}
}

// TestFindAllALSHonoursAnExplicitSizeLimit pins that a caller-supplied positive
// limit is used as given rather than being replaced by the default.
func TestFindAllALSHonoursAnExplicitSizeLimit(t *testing.T) {
	for _, a := range FindAllALS(alsBoard(), 1) {
		if len(a.Cells) > 1 {
			t.Errorf("a limit of 1 must not return an ALS of %d cells: %v", len(a.Cells), a.Cells)
		}
	}
}

// TestFindAllALSIncludesSingleCandidateCells pins that a cell holding exactly one
// candidate still counts as unsolved. Excluding it would silently drop every ALS
// that such a cell participates in.
func TestFindAllALSIncludesSingleCandidateCells(t *testing.T) {
	want := []int{idxOf(1, 0), idxOf(1, 1)}
	for _, a := range FindAllALS(alsBoard(), 0) {
		if len(a.Cells) == len(want) && a.Cells[0] == want[0] && a.Cells[1] == want[1] {
			return
		}
	}
	t.Errorf("expected an ALS over the single-candidate cell R2C1 and R2C2")
}

// TestFindEliminationsSeeingSkipsTheCellsItMustSee pins that a cell named in
// mustSee is never returned as its own elimination, and that this holds for every
// named cell rather than only the first.
func TestFindEliminationsSeeingSkipsTheCellsItMustSee(t *testing.T) {
	b := &testBoard{}
	for _, idx := range []int{idxOf(0, 0), idxOf(0, 1), idxOf(0, 2)} {
		b.candidates[idx] = NewCandidates([]int{5})
	}

	got := FindEliminationsSeeing(b, 5, nil, idxOf(0, 0), idxOf(0, 1))
	if len(got) != 1 {
		t.Fatalf("expected exactly one elimination, got %d: %v", len(got), got)
	}
	if got[0].Row != 0 || got[0].Col != 2 || got[0].Digit != 5 {
		t.Errorf("expected R1C3 digit 5, got %+v", got[0])
	}
}
