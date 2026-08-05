package techniques

// Behavior tests for chains.go. The detectors in this file return a whole
// core.Move, and the fields that carry coordinates (Explanation, Targets,
// Eliminations, Highlights) are asserted in full rather than by spot-checking a
// digit or a single elimination. Coordinate-bearing fixtures are placed away
// from row 0 and column 0, because at the origin cell/9 and cell%9 both
// evaluate to 0 and a mutant that swaps them produces identical output.
//
// assertMove lives in ur_test.go in this package and is called directly.

import (
	"fmt"
	"maps"
	"reflect"
	"slices"
	"testing"

	"sudoku-api/internal/core"
)

// ============================================================================
// Jellyfish
// ============================================================================

// chainsJellyfishRowBoard builds a row-oriented Jellyfish on digit 7. The four
// base rows are 1, 2, 3 and 5, and their digit-7 positions cover exactly the
// four columns 2, 3, 4 and 6:
//
//	row 1: cols 2,3   row 2: cols 3,4   row 3: cols 4,6   row 5: cols 2,6
//
// Row 7 holds a single stray 7 in column 3, which is the elimination. One
// position is too few to make row 7 a base row, so the cover set stays at four.
// No base line sits at index 0, so every index appearing in the explanation is
// distinguishable from its off-by-one neighbors.
func chainsJellyfishRowBoard() *testBoard {
	b := &testBoard{}
	for _, rc := range [][2]int{
		{1, 2}, {1, 3},
		{2, 3}, {2, 4},
		{3, 4}, {3, 6},
		{5, 2}, {5, 6},
		{7, 3}, // stray 7 outside the base rows: the elimination
	} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{7})
	}
	return b
}

// TestDetectJellyfishReportsEveryBaseLineInTheExplanation pins the complete
// Jellyfish move. The explanation names all four base rows in 1-based form, so
// each of the four index expressions is asserted independently: a mutant that
// perturbs any one of them by -2, -1 or +1 renames exactly one row and the
// string no longer matches. Targets and Highlights.Primary pin the full
// enumeration of the sixteen base positions, so truncating either collection
// loop is caught as well.
func TestDetectJellyfishReportsEveryBaseLineInTheExplanation(t *testing.T) {
	targets := refs(
		[2]int{1, 2}, [2]int{1, 3},
		[2]int{2, 3}, [2]int{2, 4},
		[2]int{3, 4}, [2]int{3, 6},
		[2]int{5, 2}, [2]int{5, 6},
	)
	assertMove(t, DetectJellyfish(chainsJellyfishRowBoard()), &core.Move{
		Action:       "eliminate",
		Digit:        7,
		Targets:      targets,
		Eliminations: []core.Candidate{{Row: 7, Col: 3, Digit: 7}},
		Explanation:  "Jellyfish: 7 in rows 2,3,4,6",
		Highlights:   core.Highlights{Primary: targets},
	})
}

// ============================================================================
// findChainEndpointElimination and pathCellRefs
// ============================================================================

// TestFindChainEndpointEliminationFormatsCoordinatesAndPath pins the whole move
// the shared chain-endpoint helper returns. The eliminated cell is R3C5, whose
// row and column are both non-zero and unequal, so the 1-based row and column
// in the explanation are each distinguishable from every off-by-one variant and
// from each other.
//
// Targets come from pathCellRefs, and the three path cells decode to three
// distinct (row, col) pairs with no zero component. That pins pathCellRefs'
// index arithmetic: swapping its division for multiplication, or its remainder
// for multiplication, moves every ref, and truncating its loop leaves the tail
// refs zero-valued.
func TestFindChainEndpointEliminationFormatsCoordinatesAndPath(t *testing.T) {
	b := &testBoard{}
	path := []int{idxOf(2, 1), idxOf(3, 3), idxOf(2, 7)}
	for _, idx := range path {
		b.candidates[idx] = NewCandidates([]int{6})
	}
	// The only non-path candidate. It shares row 2 with both endpoints.
	b.candidates[idxOf(2, 4)] = NewCandidates([]int{6})

	got := findChainEndpointElimination(b, 6, path, "TEST: eliminate %d from R%dC%d.")
	targets := refs([2]int{2, 1}, [2]int{3, 3}, [2]int{2, 7})
	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        6,
		Targets:      targets,
		Eliminations: []core.Candidate{{Row: 2, Col: 4, Digit: 6}},
		Explanation:  "TEST: eliminate 6 from R3C5.",
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: refs([2]int{2, 4}),
		},
	})
}

// ============================================================================
// buildERMove
// ============================================================================

// TestBuildERMoveRowBranchFormatsEveryCoordinate pins the byRow branch of
// buildERMove, which the existing column-branch test does not reach. Every
// integer the explanation carries is given a distinct value (box 4, link row 3,
// target R8C3), so each of the four 1-based conversions is pinned separately:
// no two of them print the same number, and no off-by-one variant of one
// collides with the correct value of another.
//
// The two ER positions decode to (4,4) and (5,3), which pins the target
// conversion loop the same way pathCellRefs is pinned above.
func TestBuildERMoveRowBranchFormatsEveryCoordinate(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(7, 2)] = NewCandidates([]int{6}) // the eliminated cell

	got := buildERMove(b, 6, 4, []int{idxOf(4, 4), idxOf(5, 3)}, 7, 2, 3, true)
	targets := refs([2]int{4, 4}, [2]int{5, 3})
	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        6,
		Targets:      targets,
		Eliminations: []core.Candidate{{Row: 7, Col: 2, Digit: 6}},
		Explanation:  "Empty Rectangle: 6 in box 5 with conjugate pair in R4: eliminate from R8C3.",
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: refs([2]int{7, 2}),
		},
	})
}

// ============================================================================
// W-Wing
// ============================================================================

// chainsWWingBoard builds a W-Wing on the candidate pair {3,4}. The two bivalue
// cells are R2C2 and R5C6, which do not see each other. Column 2 holds digit 3
// in exactly two cells, R2C3 and R5C3; R2C3 sees the first bivalue cell and
// R5C3 sees the second, so they form the strong-link bridge. Digit 4 is
// therefore eliminated at R5C2, which sees both bivalue cells.
//
// Every cell involved has a non-zero row and a non-zero column, and no cell's
// row equals its column, so each index-to-coordinate conversion in the move is
// pinned independently.
func chainsWWingBoard() *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4}) // bivalue 1
	b.candidates[idxOf(4, 5)] = NewCandidates([]int{3, 4}) // bivalue 2
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{3, 8}) // link end seeing bivalue 1
	b.candidates[idxOf(4, 2)] = NewCandidates([]int{3, 8}) // link end seeing bivalue 2
	b.candidates[idxOf(4, 1)] = NewCandidates([]int{4, 9}) // the elimination
	return b
}

// TestDetectWWingReportsBothBivalueCellsAndBothLinkEnds pins the complete
// W-Wing move. Targets carry the two bivalue cells followed by the two link
// ends, and Highlights splits them: the bivalue pair is primary and the link
// ends are secondary. Each of those six coordinate pairs is derived by dividing
// and taking the remainder of a cell index, and every one decodes to a distinct
// non-zero (row, col), so a mutant that multiplies instead of dividing, or
// multiplies instead of taking the remainder, relocates a cell far outside the
// grid and fails the comparison.
func TestDetectWWingReportsBothBivalueCellsAndBothLinkEnds(t *testing.T) {
	assertMove(t, DetectWWing(chainsWWingBoard()), &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      refs([2]int{1, 1}, [2]int{4, 5}, [2]int{1, 2}, [2]int{4, 2}),
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 4}},
		Explanation:  "W-Wing: {3,4} cells connected by strong link on 3",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 1}, [2]int{4, 5}),
			Secondary: refs([2]int{1, 2}, [2]int{4, 2}),
		},
	})
}

// ============================================================================
// findChainEndpointElimination path-length guard
// ============================================================================

// TestFindChainEndpointEliminationRejectsEmptyPath pins the guard's
// panic-protection role. The helper indexes path[0] immediately after the
// guard, so dropping the early return turns an empty path into an
// out-of-range panic rather than a nil result.
func TestFindChainEndpointEliminationRejectsEmptyPath(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(3, 3)] = NewCandidates([]int{4})
	if move := findChainEndpointElimination(b, 4, nil, "x %d %d %d"); move != nil {
		t.Errorf("expected nil for an empty path, got %+v", move)
	}
}

// TestFindChainEndpointEliminationRejectsSingleCellPath pins the lower bound at
// two. A one-cell path has coincident endpoints, so any peer holding the digit
// would see "both" of them; the board deliberately supplies such a peer. The
// helper must still decline, because a chain needs two distinct ends.
func TestFindChainEndpointEliminationRejectsSingleCellPath(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(3, 3)] = NewCandidates([]int{4})
	b.candidates[idxOf(3, 5)] = NewCandidates([]int{4}) // a peer of the lone path cell
	if move := findChainEndpointElimination(b, 4, []int{idxOf(3, 3)}, "x %d %d %d"); move != nil {
		t.Errorf("expected nil for a single-cell path, got %+v", move)
	}
}

// TestFindChainEndpointEliminationAcceptsTwoCellPath pins the upper side of the
// same bound: a two-cell path is the shortest the helper accepts, so raising
// the minimum to three suppresses a legitimate elimination.
func TestFindChainEndpointEliminationAcceptsTwoCellPath(t *testing.T) {
	b := &testBoard{}
	path := []int{idxOf(3, 3), idxOf(3, 7)}
	for _, idx := range path {
		b.candidates[idx] = NewCandidates([]int{4})
	}
	b.candidates[idxOf(3, 5)] = NewCandidates([]int{4}) // sees both ends via row 3

	got := findChainEndpointElimination(b, 4, path, "TEST: eliminate %d from R%dC%d.")
	targets := refs([2]int{3, 3}, [2]int{3, 7})
	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      targets,
		Eliminations: []core.Candidate{{Row: 3, Col: 5, Digit: 4}},
		Explanation:  "TEST: eliminate 4 from R4C6.",
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: refs([2]int{3, 5}),
		},
	})
}

// ============================================================================
// findConjugateLink
// ============================================================================

// TestFindConjugateLinkReturnsZeroWhenNotAConjugatePair pins both the ok flag
// and the integer returned alongside it. The caller compares the returned line
// index against box bounds before using it, so a non-zero sentinel would be a
// live coordinate rather than an inert one.
func TestFindConjugateLinkReturnsZeroWhenNotAConjugatePair(t *testing.T) {
	for _, positions := range [][]int{nil, {4}, {4, 5, 6}} {
		got, ok := findConjugateLink(positions, 4)
		if ok {
			t.Errorf("positions %v is not a conjugate pair, want ok=false", positions)
		}
		if got != 0 {
			t.Errorf("positions %v: got %d, want 0", positions, got)
		}
	}
}

// TestFindConjugateLinkReturnsZeroWhenAnchorAbsent pins the same contract for a
// well-formed pair that simply does not contain the anchor.
func TestFindConjugateLinkReturnsZeroWhenAnchorAbsent(t *testing.T) {
	got, ok := findConjugateLink([]int{4, 5}, 7)
	if ok {
		t.Error("anchor 7 is absent from {4,5}, want ok=false")
	}
	if got != 0 {
		t.Errorf("got %d, want 0", got)
	}
}

// TestFindConjugateLinkReturnsTheOtherEnd pins both orderings of a genuine
// conjugate pair.
func TestFindConjugateLinkReturnsTheOtherEnd(t *testing.T) {
	if got, ok := findConjugateLink([]int{4, 6}, 4); !ok || got != 6 {
		t.Errorf("anchor at index 0: got (%d, %v), want (6, true)", got, ok)
	}
	if got, ok := findConjugateLink([]int{4, 6}, 6); !ok || got != 4 {
		t.Errorf("anchor at index 1: got (%d, %v), want (4, true)", got, ok)
	}
}

// ============================================================================
// Jellyfish structural guards
// ============================================================================

// TestDetectJellyfishSkipsCombinationsCoveringMoreThanFourLines pins the
// `continue` that rejects an over-wide cover set. Five rows qualify as base
// lines here, and the first combination the search reaches (rows 1,2,3,4)
// covers five columns and must be rejected. The Jellyfish that does exist uses
// rows 1,2,3,5. Turning the rejection into a loop exit abandons the search at
// the first failure and finds nothing.
func TestDetectJellyfishSkipsCombinationsCoveringMoreThanFourLines(t *testing.T) {
	b := &testBoard{}
	for _, rc := range [][2]int{
		{1, 2}, {1, 3},
		{2, 3}, {2, 4},
		{3, 4}, {3, 6},
		{4, 6}, {4, 8}, // the extra base row that widens the first combination
		{5, 2}, {5, 6},
		{7, 3},
	} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{7})
	}
	targets := refs(
		[2]int{1, 2}, [2]int{1, 3},
		[2]int{2, 3}, [2]int{2, 4},
		[2]int{3, 4}, [2]int{3, 6},
		[2]int{5, 2}, [2]int{5, 6},
	)
	assertMove(t, DetectJellyfish(b), &core.Move{
		Action:  "eliminate",
		Digit:   7,
		Targets: targets,
		Eliminations: []core.Candidate{
			{Row: 7, Col: 3, Digit: 7},
			{Row: 4, Col: 6, Digit: 7},
		},
		Explanation: "Jellyfish: 7 in rows 2,3,4,6",
		Highlights:  core.Highlights{Primary: targets},
	})
}

// TestDetectJellyfishExhaustsAllCombinationsWithoutOverrunning pins the upper
// bounds of the combination loops. Six rows qualify as base lines and no
// four of them cover exactly four columns, so the search runs to exhaustion and
// returns nil. Relaxing either inner bound to include len(units) indexes one
// past the end of the slice, which panics instead of returning.
func TestDetectJellyfishExhaustsAllCombinationsWithoutOverrunning(t *testing.T) {
	b := &testBoard{}
	// Six rows, each holding the digit in two columns, arranged as three
	// disjoint column pairs so no four rows ever share exactly four columns.
	for _, rc := range [][2]int{
		{1, 0}, {1, 1},
		{2, 2}, {2, 3},
		{3, 4}, {3, 5},
		{4, 6}, {4, 7},
		{5, 0}, {5, 2},
		{6, 4}, {6, 6},
	} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{7})
	}
	if move := DetectJellyfish(b); move != nil {
		t.Fatalf("expected no Jellyfish on a board with no four-column cover, got %+v", move)
	}
}

// ============================================================================
// buildConjugateGraph
// ============================================================================

// chainsConjugateEdges renders a conjugate graph as a sorted, printable form so
// a whole-graph comparison reports a readable difference.
func chainsConjugateEdges(g map[int][]int) []string {
	out := make([]string, 0, len(g))
	for _, k := range slices.Sorted(maps.Keys(g)) {
		out = append(out, fmt.Sprintf("%d->%v", k, g[k]))
	}
	return out
}

// TestBuildConjugateGraphRecordsBothDirectionsOfALineEdge pins the whole graph
// for a single row conjugate. Both directions are asserted, so dropping either
// append leaves a one-sided edge, and pointing either append back at its own
// endpoint leaves a self-loop; all four are visible in the full comparison.
func TestBuildConjugateGraphRecordsBothDirectionsOfALineEdge(t *testing.T) {
	b := &testBoard{}
	a, c := idxOf(1, 1), idxOf(1, 4)
	b.candidates[a] = NewCandidates([]int{5})
	b.candidates[c] = NewCandidates([]int{5})

	got := chainsConjugateEdges(buildConjugateGraph(b, 5))
	want := []string{
		fmt.Sprintf("%d->[%d]", a, c),
		fmt.Sprintf("%d->[%d]", c, a),
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("conjugate graph = %v, want %v", got, want)
	}
}

// TestBuildConjugateGraphFindsBoxOnlyEdgeOutsideTheFirstBox pins the box-origin
// arithmetic. The two cells sit on the diagonal of box 4, so they share neither
// a row nor a column and the edge can only come from the box scan. Box 4's
// origin is row 3, column 3; computing either coordinate by dividing instead of
// multiplying collapses it to 0, which scans a different nine cells and finds
// no pair at all.
func TestBuildConjugateGraphFindsBoxOnlyEdgeOutsideTheFirstBox(t *testing.T) {
	b := &testBoard{}
	a, c := idxOf(3, 3), idxOf(5, 5)
	b.candidates[a] = NewCandidates([]int{5})
	b.candidates[c] = NewCandidates([]int{5})

	got := chainsConjugateEdges(buildConjugateGraph(b, 5))
	want := []string{
		fmt.Sprintf("%d->[%d]", a, c),
		fmt.Sprintf("%d->[%d]", c, a),
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("conjugate graph = %v, want %v", got, want)
	}
}

// ============================================================================
// W-Wing exclusion of the link cells
// ============================================================================

// chainsWWingLinkHoldsElimDigitBoard builds a W-Wing whose first link end also
// carries the eliminated digit and sees both bivalue cells, which is what makes
// the link exclusion observable. bv1 = R2C2 and bv2 = R3C6 hold {3,4} and do
// not see each other. Digit 3 forms a conjugate pair in column 5 at R2C5 and
// R3C5: R2C5 sees bv1 along row 1 and R3C5 sees bv2 along row 2. R2C5 also sees
// bv2 through box 1 and carries digit 4, so without the link exclusion it would
// be eliminated alongside the genuine target at R3C2.
func chainsWWingLinkHoldsElimDigitBoard() *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4}) // bv1
	b.candidates[idxOf(2, 5)] = NewCandidates([]int{3, 4}) // bv2
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 4}) // link end 1, carries the elim digit
	b.candidates[idxOf(2, 4)] = NewCandidates([]int{3})    // link end 2
	b.candidates[idxOf(2, 1)] = NewCandidates([]int{4, 9}) // the genuine elimination
	return b
}

// TestDetectWWingExcludesTheLinkCellsFromEliminations pins that the two link
// ends are never themselves eliminated. The first link end qualifies on every
// other count, so dropping it from the exclusion list adds a second
// elimination and the move no longer matches.
func TestDetectWWingExcludesTheLinkCellsFromEliminations(t *testing.T) {
	assertMove(t, DetectWWing(chainsWWingLinkHoldsElimDigitBoard()), &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      refs([2]int{1, 1}, [2]int{2, 5}, [2]int{1, 4}, [2]int{2, 4}),
		Eliminations: []core.Candidate{{Row: 2, Col: 1, Digit: 4}},
		Explanation:  "W-Wing: {3,4} cells connected by strong link on 3",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 1}, [2]int{2, 5}),
			Secondary: refs([2]int{1, 4}, [2]int{2, 4}),
		},
	})
}

// ============================================================================
// findXYChainFrom guards
// ============================================================================

// chainsXYAdjacency is the adjacency map shape findXYChainFrom consumes.
type chainsXYAdjacency map[int][]struct {
	cell       int
	sharedCand int
}

// chainsXYLink builds one adjacency entry.
func chainsXYLink(cell, sharedCand int) struct {
	cell       int
	sharedCand int
} {
	return struct {
		cell       int
		sharedCand int
	}{cell, sharedCand}
}

// TestFindXYChainFromRejectsStartWithThreeCandidates pins the bivalue
// requirement on the starting cell. The adjacency and the board are arranged so
// that a chain does exist from this cell and would produce an elimination if
// the search were allowed to begin: R2C2 - R2C5 - R5C5 ends on the same digit 1
// the start offers, and R5C2 sees both ends. The bivalue guard must reject it
// anyway, because an XY-Chain's dangling-candidate bookkeeping is only sound
// for two-candidate cells.
func TestFindXYChainFromRejectsStartWithThreeCandidates(t *testing.T) {
	b := &testBoard{}
	start, mid, end := idxOf(1, 1), idxOf(1, 4), idxOf(4, 4)
	b.candidates[start] = NewCandidates([]int{1, 2, 3})
	b.candidates[mid] = NewCandidates([]int{2, 4})
	b.candidates[end] = NewCandidates([]int{4, 1})
	b.candidates[idxOf(4, 1)] = NewCandidates([]int{1, 7}) // sees both ends

	adj := chainsXYAdjacency{
		start: {chainsXYLink(mid, 2)},
		mid:   {chainsXYLink(start, 2), chainsXYLink(end, 4)},
		end:   {chainsXYLink(mid, 4)},
	}
	if move := findXYChainFrom(b, start, adj); move != nil {
		t.Errorf("expected nil for a three-candidate start, got %+v", move)
	}
}

// TestFindXYChainFromSkipsNonBivalueNeighbor pins the guard that protects the
// two-candidate indexing of a neighbor cell. The neighbor here holds a single
// candidate which is also the shared one, so the "other candidate" lookup would
// read the second element of a one-element slice. The guard must skip the
// neighbor rather than let that read happen.
func TestFindXYChainFromSkipsNonBivalueNeighbor(t *testing.T) {
	b := &testBoard{}
	start, neighbor := idxOf(1, 1), idxOf(1, 4)
	b.candidates[start] = NewCandidates([]int{1, 2})
	b.candidates[neighbor] = NewCandidates([]int{2}) // single candidate, equal to the shared one

	adj := chainsXYAdjacency{start: {chainsXYLink(neighbor, 2)}}
	if move := findXYChainFrom(b, start, adj); move != nil {
		t.Errorf("expected nil, got %+v", move)
	}
}

// ============================================================================
// Empty Rectangle
// ============================================================================

// chainsERBoard builds an Empty Rectangle in box 4 with the given extra digit-5
// positions inside the box, plus a column-1 conjugate pair whose far end is at
// row 7 and an elimination target at R8C5. The ER pivot is R5C5 (row 4,
// column 4). Box 4 spans rows 3-5 and columns 3-5, so neither box origin is
// zero and the box-origin arithmetic is observable.
func chainsERBoard(inBox ...[2]int) *testBoard {
	b := &testBoard{}
	cells := [][2]int{
		{4, 1}, {7, 1}, // column-1 conjugate pair on digit 5, one end in the ER row
		{7, 4}, // the elimination: link row 7 crossed with ER column 4
	}
	cells = append(cells, inBox...)
	for _, rc := range cells {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{5})
	}
	return b
}

// TestDetectEmptyRectangleLocatesTheBoxAwayFromTheGridOrigin pins the complete
// Empty Rectangle move for a box whose origin is neither row 0 nor column 0.
// Box 4 starts at row 3 and column 3; deriving either origin by dividing
// instead of multiplying collapses it to 0, so the position scan reads a
// different nine cells, finds nothing in box 4, and the move disappears.
func TestDetectEmptyRectangleLocatesTheBoxAwayFromTheGridOrigin(t *testing.T) {
	b := chainsERBoard([2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4})
	targets := refs([2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4})
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      targets,
		Eliminations: []core.Candidate{{Row: 7, Col: 4, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in C2: eliminate from R8C5.",
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: refs([2]int{7, 4}),
		},
	})
}

// TestDetectEmptyRectangleAcceptsFourPositionsInTheBox pins the upper bound of
// the position count at four inclusive. The box holds four digit-5 cells that
// still form a proper L around the pivot, so tightening the ceiling to three
// discards a legitimate Empty Rectangle.
func TestDetectEmptyRectangleAcceptsFourPositionsInTheBox(t *testing.T) {
	b := chainsERBoard([2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4})
	targets := refs([2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4})
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      targets,
		Eliminations: []core.Candidate{{Row: 7, Col: 4, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in C2: eliminate from R8C5.",
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: refs([2]int{7, 4}),
		},
	})
}

// TestDetectEmptyRectangleRejectsFivePositionsInTheBox pins the same ceiling
// from above. Five digit-5 cells fill the pivot's whole row and column inside
// the box, which still satisfies the L-shape and arm checks, so only the
// position ceiling rejects it. Relaxing or removing that ceiling turns this
// board into a spurious elimination.
func TestDetectEmptyRectangleRejectsFivePositionsInTheBox(t *testing.T) {
	b := chainsERBoard([2]int{3, 4}, [2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4})
	if move := DetectEmptyRectangle(b); move != nil {
		t.Fatalf("expected no Empty Rectangle from a five-position box, got %+v", move)
	}
}

// TestDetectEmptyRectangleRequiresBothArms pins the two arm checks. The box
// holds the pivot and two further cells in the pivot's row, so the L has a row
// arm but no column arm and must be rejected. Weakening either arm condition to
// an unconditional true, or dropping the rejection, accepts this flat line as
// an Empty Rectangle.
func TestDetectEmptyRectangleRequiresBothArms(t *testing.T) {
	b := chainsERBoard([2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5})
	if move := DetectEmptyRectangle(b); move != nil {
		t.Fatalf("expected no Empty Rectangle without a column arm, got %+v", move)
	}
}

// TestDetectEmptyRectangleRequiresARowArm is the mirror case: three cells in
// the pivot's column give a column arm and no row arm.
func TestDetectEmptyRectangleRequiresARowArm(t *testing.T) {
	b := chainsERBoard([2]int{3, 4}, [2]int{4, 4}, [2]int{5, 4})
	if move := DetectEmptyRectangle(b); move != nil {
		t.Fatalf("expected no Empty Rectangle without a row arm, got %+v", move)
	}
}

// chainsERCells builds a board holding digit 5 at exactly the given cells. Every
// Empty Rectangle fixture below places its rectangle in box 4 (rows 3-5,
// columns 3-5) with the pivot at R5C5, so the box origin, the ER row and the ER
// column are all non-zero.
func chainsERCells(cells ...[2]int) *testBoard {
	b := &testBoard{}
	for _, rc := range cells {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{5})
	}
	return b
}

// chainsERPivotTargets is the target list every box-4 rectangle below produces.
var chainsERPivotTargets = refs([2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4})

// TestDetectEmptyRectangleUsesAConjugateColumnAtTheBoxEdge pins the exclusive
// upper bound on the box's own column range. The conjugate pair lives in
// column 6, the first column to the right of box 4, which the search must
// consider. Making the bound inclusive, or skipping every column at or past the
// box start, discards that column and the detector falls through to the row
// strategy, producing a different move.
func TestDetectEmptyRectangleUsesAConjugateColumnAtTheBoxEdge(t *testing.T) {
	b := chainsERCells(
		[2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4}, // the rectangle
		[2]int{4, 6}, [2]int{7, 6}, // column-6 conjugate, one end in the ER row
		[2]int{7, 4}, // the elimination
	)
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      chainsERPivotTargets,
		Eliminations: []core.Candidate{{Row: 7, Col: 4, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in C7: eliminate from R8C5.",
		Highlights: core.Highlights{
			Primary:   chainsERPivotTargets,
			Secondary: refs([2]int{7, 4}),
		},
	})
}

// TestDetectEmptyRectangleUsesAConjugateColumnAboveTheBox pins that the link
// row may sit above the box, not only below it. The conjugate pair in column 1
// has its far end at row 1, so a guard that rejects every row below the box
// bottom rather than only the rows inside the box discards it.
func TestDetectEmptyRectangleUsesAConjugateColumnAboveTheBox(t *testing.T) {
	b := chainsERCells(
		[2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4}, // the rectangle
		[2]int{1, 1}, [2]int{4, 1}, // column-1 conjugate, far end above the box
		[2]int{1, 4}, // the elimination
	)
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      chainsERPivotTargets,
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in C2: eliminate from R2C5.",
		Highlights: core.Highlights{
			Primary:   chainsERPivotTargets,
			Secondary: refs([2]int{1, 4}),
		},
	})
}

// TestDetectEmptyRectangleKeepsScanningColumnsPastAnInBoxLink pins the
// `continue` that rejects a conjugate whose far end lands inside the box.
// Column 1's conjugate ends at row 5, inside box 4, and must be skipped;
// column 6's ends at row 7 and is the one that works. Turning the rejection
// into a loop exit abandons the column scan at column 1 and never reaches it.
func TestDetectEmptyRectangleKeepsScanningColumnsPastAnInBoxLink(t *testing.T) {
	b := chainsERCells(
		[2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4}, // the rectangle
		[2]int{4, 1}, [2]int{5, 1}, // column-1 conjugate ending inside the box
		[2]int{4, 6}, [2]int{7, 6}, // column-6 conjugate ending below it
		[2]int{7, 4}, // the elimination
	)
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      chainsERPivotTargets,
		Eliminations: []core.Candidate{{Row: 7, Col: 4, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in C7: eliminate from R8C5.",
		Highlights: core.Highlights{
			Primary:   chainsERPivotTargets,
			Secondary: refs([2]int{7, 4}),
		},
	})
}

// TestDetectEmptyRectangleFallsBackToARowConjugateAboveTheBox pins the row
// strategy reached only when no column conjugate qualifies. Column 1 holds
// three candidates so it is not a conjugate pair, leaving row 1's pair as the
// only link. Its row is above the box, so a guard rejecting every row below the
// box bottom discards it and no move survives.
func TestDetectEmptyRectangleFallsBackToARowConjugateAboveTheBox(t *testing.T) {
	b := chainsERCells(
		[2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4}, // the rectangle
		[2]int{1, 1}, [2]int{1, 4}, // row-1 conjugate, one end in the ER column
		[2]int{4, 1}, [2]int{7, 1}, // third and fourth column-1 cells break that pair
	)
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      chainsERPivotTargets,
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in R2: eliminate from R5C2.",
		Highlights: core.Highlights{
			Primary:   chainsERPivotTargets,
			Secondary: refs([2]int{4, 1}),
		},
	})
}

// TestDetectEmptyRectangleUsesARowConjugateAtTheBoxEdge pins the exclusive
// upper bound on the box's row range in the row strategy. The link row is 6,
// the first row below box 4, so making that bound inclusive discards it.
func TestDetectEmptyRectangleUsesARowConjugateAtTheBoxEdge(t *testing.T) {
	b := chainsERCells(
		[2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4}, // the rectangle
		[2]int{6, 1}, [2]int{6, 4}, // row-6 conjugate, one end in the ER column
		[2]int{4, 1}, [2]int{8, 1}, // extra column-1 cells break the column pair
	)
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      chainsERPivotTargets,
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in R7: eliminate from R5C2.",
		Highlights: core.Highlights{
			Primary:   chainsERPivotTargets,
			Secondary: refs([2]int{4, 1}),
		},
	})
}

// TestDetectEmptyRectangleRowStrategyUsesAColumnAtTheBoxEdge pins the row
// strategy's own check on the eliminating column. That column is 6, immediately
// right of the box, so an inclusive bound rejects it and no move survives.
func TestDetectEmptyRectangleRowStrategyUsesAColumnAtTheBoxEdge(t *testing.T) {
	b := chainsERCells(
		[2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4}, // the rectangle
		[2]int{7, 4}, [2]int{7, 6}, // row-7 conjugate, one end in the ER column
		[2]int{2, 6}, // third column-6 cell breaks the column pair
		[2]int{4, 6}, // the elimination
	)
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      chainsERPivotTargets,
		Eliminations: []core.Candidate{{Row: 4, Col: 6, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in R8: eliminate from R5C7.",
		Highlights: core.Highlights{
			Primary:   chainsERPivotTargets,
			Secondary: refs([2]int{4, 6}),
		},
	})
}

// TestDetectEmptyRectangleKeepsScanningRowsPastAnInBoxLink pins the row
// strategy's rejection of a conjugate whose far end lands inside the box.
// Row 2's pair points at column 5, inside box 4, and must be skipped; row 7's
// points at column 1 and is the one that works.
func TestDetectEmptyRectangleKeepsScanningRowsPastAnInBoxLink(t *testing.T) {
	b := chainsERCells(
		[2]int{4, 4}, [2]int{4, 5}, [2]int{5, 4}, // the rectangle
		[2]int{2, 4}, [2]int{2, 5}, // row-2 conjugate pointing inside the box
		[2]int{7, 1}, [2]int{7, 4}, // row-7 conjugate pointing left of it
		[2]int{0, 1}, [2]int{4, 1}, // column-1 cells: break the pair, supply the target
	)
	assertMove(t, DetectEmptyRectangle(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      chainsERPivotTargets,
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 5}},
		Explanation:  "Empty Rectangle: 5 in box 5 with conjugate pair in R8: eliminate from R5C2.",
		Highlights: core.Highlights{
			Primary:   chainsERPivotTargets,
			Secondary: refs([2]int{4, 1}),
		},
	})
}

// ============================================================================
// Chain-length floors
// ============================================================================

// TestDetectXChainRequiresMoreThanASingleConjugatePair pins the X-Chain length
// floor. Digit 5 forms one conjugate pair in row 1 (R2C2 and R2C3), and R1C1
// sees both of its ends through box 0 while lying outside row 1, so it does not
// disturb the pair. That makes a two-cell path look eliminable, and it is
// exactly what the length floor must refuse: an X-Chain needs both ends to
// carry opposite colors, which a single link cannot supply.
func TestDetectXChainRequiresMoreThanASingleConjugatePair(t *testing.T) {
	b := &testBoard{}
	for _, rc := range [][2]int{{1, 1}, {1, 2}, {0, 0}} {
		b.candidates[idxOf(rc[0], rc[1])] = NewCandidates([]int{5})
	}
	if move := DetectXChain(b); move != nil {
		t.Fatalf("expected no X-Chain from a single conjugate pair, got %+v", move)
	}
}

// TestDetectXYChainRequiresThreeCellsInTheChain pins the XY-Chain length floor.
// R2C2 and R2C5 form a {1,2} naked pair whose link on digit 1 leaves digit 2
// dangling at both ends, and R2C8 holds digit 2 and sees both. A two-cell chain
// therefore looks eliminable, but an XY-Chain needs at least three cells: the
// two-cell case is a naked pair, which is a different technique and is not this
// detector's to report.
func TestDetectXYChainRequiresThreeCellsInTheChain(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 7)] = NewCandidates([]int{2, 8})
	if move := DetectXYChain(b); move != nil {
		t.Fatalf("expected no XY-Chain from a two-cell naked pair, got %+v", move)
	}
}

// TestDetectWWingReportsLinkEndsInTheCrossedOrientation pins the second
// strong-link branch, where the lower-indexed end of the pair sees the
// second bivalue cell and the higher-indexed end sees the first. The link ends
// are therefore reported in the reverse of their scan order, and a mutant that
// assigns the same end to both targets collapses them onto one cell.
//
// bv1 = R2C5 and bv2 = R5C2 hold {3,4} and do not see each other. Row 7 holds
// digit 3 at R8C2 and R8C5: R8C2 sees bv2 down column 1 and R8C5 sees bv1 down
// column 4, which is the crossed orientation. Digit 4 is eliminated at R5C5,
// the only cell besides R2C2 seeing both bivalue cells.
func TestDetectWWingReportsLinkEndsInTheCrossedOrientation(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 4}) // bv1
	b.candidates[idxOf(4, 1)] = NewCandidates([]int{3, 4}) // bv2
	b.candidates[idxOf(7, 1)] = NewCandidates([]int{3, 7}) // link end seeing bv2
	b.candidates[idxOf(7, 4)] = NewCandidates([]int{3, 7}) // link end seeing bv1
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{4, 9}) // the elimination

	assertMove(t, DetectWWing(b), &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      refs([2]int{1, 4}, [2]int{4, 1}, [2]int{7, 4}, [2]int{7, 1}),
		Eliminations: []core.Candidate{{Row: 4, Col: 4, Digit: 4}},
		Explanation:  "W-Wing: {3,4} cells connected by strong link on 3",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 4}, [2]int{4, 1}),
			Secondary: refs([2]int{7, 4}, [2]int{7, 1}),
		},
	})
}

// ============================================================================
// chainsScanDigits
// ============================================================================

// TestChainsScanDigitsEmitsEveryDigitInOrder pins the shared digit range the
// three detectors in chains.go iterate. The whole sequence is asserted rather
// than its length or its endpoints, so shifting the start value, tightening the
// bound, or emptying the loop all fail here. Before this range was extracted it
// was written out three times, and each copy carried its own unkillable
// start-value mutant: scanning from 0 is invisible through a detector, because
// Candidates.Has rejects every digit below 1 and the extra pass finds nothing.
// Asserting the sequence directly makes that mutant observable.
func TestChainsScanDigitsEmitsEveryDigitInOrder(t *testing.T) {
	var got []int
	for digit := range chainsScanDigits {
		got = append(got, digit)
	}
	want := []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("chainsScanDigits emitted %v, want %v", got, want)
	}
}

// TestChainsScanDigitsStopsWhenTheConsumerBreaks pins the early-exit path. Each
// detector returns from inside this loop as soon as it finds a move, so the
// iterator must honor a consumer that stops short instead of running the range
// to completion.
func TestChainsScanDigitsStopsWhenTheConsumerBreaks(t *testing.T) {
	var got []int
	for digit := range chainsScanDigits {
		got = append(got, digit)
		if digit == 3 {
			break
		}
	}
	want := []int{1, 2, 3}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("chainsScanDigits emitted %v after an early break, want %v", got, want)
	}
}

// TestDetectWWingExcludesTheSecondLinkEndFromEliminations is the mirror of the
// test above, for the other end of the strong link. Reaching it needs the
// crossed branch: bv1 = R1C1 and bv2 = R2C5 do not see each other, and column 1
// holds digit 3 at R2C2 and R3C2. R3C2 sees bv1 through box 0 while R2C2 sees
// bv2 along row 1, so the link ends are assigned in reverse and R2C2 becomes
// the second end.
//
// R2C2 is one of the few cells seeing both bivalue cells, and it carries the
// eliminated digit, so dropping it from the exclusion list adds a second
// elimination. The genuine elimination is at R1C5.
func TestDetectWWingExcludesTheSecondLinkEndFromEliminations(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{3, 4}) // bv1
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 4}) // bv2
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{3, 4}) // link end 2, sees both bivalue cells
	b.candidates[idxOf(2, 1)] = NewCandidates([]int{3, 7}) // link end 1
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{4, 9}) // the genuine elimination

	assertMove(t, DetectWWing(b), &core.Move{
		Action:       "eliminate",
		Digit:        4,
		Targets:      refs([2]int{0, 0}, [2]int{1, 4}, [2]int{2, 1}, [2]int{1, 1}),
		Eliminations: []core.Candidate{{Row: 0, Col: 4, Digit: 4}},
		Explanation:  "W-Wing: {3,4} cells connected by strong link on 3",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{1, 4}),
			Secondary: refs([2]int{2, 1}, [2]int{1, 1}),
		},
	})
}
