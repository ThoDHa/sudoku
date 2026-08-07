package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// aicNode builds a candidate node from a grid coordinate, so the hand-built
// chains and link tables below read as positions rather than as cell indices.
func aicNode(row, col, digit int) candidateNode {
	return candidateNode{cell: idxOf(row, col), digit: digit}
}

// TestContainsNodeMatchesOnBothCellAndDigit pins that a node matches only when
// cell and digit agree. The half-matches are the interesting cases: a shared
// cell with a different digit, and a shared digit in a different cell, are both
// misses.
func TestContainsNodeMatchesOnBothCellAndDigit(t *testing.T) {
	nodes := []candidateNode{{cell: 1, digit: 2}, {cell: 3, digit: 4}}

	cases := []struct {
		name   string
		target candidateNode
		want   bool
	}{
		{"first element", candidateNode{cell: 1, digit: 2}, true},
		{"later element", candidateNode{cell: 3, digit: 4}, true},
		{"same cell, other digit", candidateNode{cell: 1, digit: 4}, false},
		{"same digit, other cell", candidateNode{cell: 3, digit: 2}, false},
		{"neither", candidateNode{cell: 9, digit: 9}, false},
	}
	for _, c := range cases {
		if got := containsNode(nodes, c.target); got != c.want {
			t.Errorf("%s: containsNode(%+v) = %v, want %v", c.name, c.target, got, c.want)
		}
	}

	if containsNode(nil, candidateNode{cell: 1, digit: 2}) {
		t.Error("an empty node slice must contain nothing")
	}
}

// TestBuildStrongLinksPinsConjugatePairsAndBivalueCells asserts the complete
// strong-link table for a sparse board carrying one of every case the builder
// distinguishes:
//
//   - digit 5 in exactly two cells of row 0, and digits 1 and 9 likewise in
//     rows 2 and 1, so both ends of the digit range are exercised;
//   - digit 6 in two cells that share a row and a box, so the pair is
//     discovered twice and the duplicate guard has to reject the second;
//   - digit 7 in three cells of one row and box, which is not a conjugate pair;
//   - a bivalue cell, whose two candidates strongly link to each other;
//   - a filled cell that still carries two candidates, which the bivalue scan
//     must skip, and a three-candidate cell, which is not bivalue.
//
// The whole table is compared, so a missing link and a spurious one both fail.
func TestBuildStrongLinksPinsConjugatePairsAndBivalueCells(t *testing.T) {
	b := &testBoard{}
	set := func(row, col int, digits ...int) {
		b.candidates[idxOf(row, col)] = NewCandidates(digits)
	}
	set(0, 0, 5)
	set(0, 4, 5)
	set(1, 0, 9)
	set(1, 4, 9)
	set(2, 0, 1)
	set(2, 4, 1)
	set(3, 0, 6)
	set(3, 1, 6)
	set(6, 0, 7)
	set(6, 1, 7)
	set(6, 2, 7)
	set(8, 7, 5, 8, 9)
	set(8, 8, 1, 2)
	set(8, 0, 3, 4)
	b.cells[idxOf(8, 0)] = 9

	want := map[candidateNode][]candidateNode{
		aicNode(0, 0, 5): {aicNode(0, 4, 5)},
		aicNode(0, 4, 5): {aicNode(0, 0, 5)},
		aicNode(1, 0, 9): {aicNode(1, 4, 9)},
		aicNode(1, 4, 9): {aicNode(1, 0, 9)},
		aicNode(2, 0, 1): {aicNode(2, 4, 1)},
		aicNode(2, 4, 1): {aicNode(2, 0, 1)},
		aicNode(3, 0, 6): {aicNode(3, 1, 6)},
		aicNode(3, 1, 6): {aicNode(3, 0, 6)},
		aicNode(8, 8, 1): {aicNode(8, 8, 2)},
		aicNode(8, 8, 2): {aicNode(8, 8, 1)},
	}
	if got := buildStrongLinks(b); !reflect.DeepEqual(got, want) {
		t.Errorf("strong links = %v\nwant %v", got, want)
	}
}

// TestBuildWeakLinksPinsPeerAndInCellLinks asserts the complete weak-link table
// for a sparse board covering both weak-link kinds and every rejection:
//
//   - digit 1 sits in two row peers and in a third cell that sees neither, so
//     the peer test has something to reject;
//   - digit 9 sits in two row peers, exercising the top of the digit range;
//   - a three-candidate cell contributes all three of its in-cell pairs;
//   - a filled cell carrying two candidates contributes to neither scan.
func TestBuildWeakLinksPinsPeerAndInCellLinks(t *testing.T) {
	b := &testBoard{}
	set := func(row, col int, digits ...int) {
		b.candidates[idxOf(row, col)] = NewCandidates(digits)
	}
	set(0, 0, 1, 2)
	set(0, 1, 1)
	set(4, 4, 1)
	set(6, 6, 3, 4, 5)
	set(6, 7, 9)
	set(6, 8, 9)
	set(8, 0, 1, 2)
	b.cells[idxOf(8, 0)] = 9

	want := map[candidateNode][]candidateNode{
		aicNode(0, 0, 1): {aicNode(0, 1, 1), aicNode(0, 0, 2)},
		aicNode(0, 1, 1): {aicNode(0, 0, 1)},
		aicNode(0, 0, 2): {aicNode(0, 0, 1)},
		aicNode(6, 7, 9): {aicNode(6, 8, 9)},
		aicNode(6, 8, 9): {aicNode(6, 7, 9)},
		aicNode(6, 6, 3): {aicNode(6, 6, 4), aicNode(6, 6, 5)},
		aicNode(6, 6, 4): {aicNode(6, 6, 3), aicNode(6, 6, 5)},
		aicNode(6, 6, 5): {aicNode(6, 6, 3), aicNode(6, 6, 4)},
	}
	if got := buildWeakLinks(b); !reflect.DeepEqual(got, want) {
		t.Errorf("weak links = %v\nwant %v", got, want)
	}
}

// TestCheckChainConclusionAssignsOnDiscontinuousNiceLoop drives the Type 1
// discontinuous nice loop: a chain that returns to its own start candidate with
// both ends ON proves that candidate true, so it is assigned. The whole move is
// pinned, including the one-indexed coordinates in the explanation and the
// chain cells carried as highlights.
func TestCheckChainConclusionAssignsOnDiscontinuousNiceLoop(t *testing.T) {
	start := aicNode(2, 3, 7)
	chain := []candidateNode{start, aicNode(1, 3, 7), start}

	move := checkChainConclusion(&testBoard{}, chain, start, true, start, true)
	assertMove(t, move, &core.Move{
		Action:      "assign",
		Digit:       7,
		Targets:     refs([2]int{2, 3}),
		Explanation: "AIC: Chain proves r3c4 must be 7",
		Highlights: core.Highlights{
			Primary:   refs([2]int{2, 3}, [2]int{1, 3}, [2]int{2, 3}),
			Secondary: []core.CellRef{},
		},
	})
	if move.Technique != "aic" {
		t.Errorf("Technique = %q, want %q", move.Technique, "aic")
	}
}

// TestCheckChainConclusionEliminatesWhenBothEndsSeeEachOther drives the Type 2
// conclusion: the chain proves start ON implies end ON, but the two share a
// row, so they cannot both be ON and the start candidate is eliminated. The
// endpoints sit at distinct rows and columns, so the four coordinate
// expressions in the explanation are each pinned separately.
func TestCheckChainConclusionEliminatesWhenBothEndsSeeEachOther(t *testing.T) {
	start := aicNode(2, 3, 7)
	end := aicNode(2, 6, 7)
	chain := []candidateNode{start, aicNode(1, 3, 7), end}

	move := checkChainConclusion(&testBoard{}, chain, start, true, end, true)
	assertMove(t, move, &core.Move{
		Action:       "eliminate",
		Digit:        7,
		Targets:      refs([2]int{2, 3}, [2]int{1, 3}, [2]int{2, 6}),
		Eliminations: []core.Candidate{{Row: 2, Col: 3, Digit: 7}},
		Explanation: "AIC: Chain proves r3c4=7 leads to r3c7=7, " +
			"but they see each other - contradiction",
		Highlights: core.Highlights{
			Primary:   refs([2]int{2, 3}, [2]int{1, 3}, [2]int{2, 6}),
			Secondary: []core.CellRef{},
		},
	})
	if move.Technique != "aic" {
		t.Errorf("Technique = %q, want %q", move.Technique, "aic")
	}
}

// TestCheckChainConclusionRejectsChainsThatProveNothing walks every way a chain
// can fail to conclude. Each case satisfies all but one of the conditions the
// two conclusions require, so no single condition can be dropped without one of
// them starting to fire.
func TestCheckChainConclusionRejectsChainsThatProveNothing(t *testing.T) {
	origin := aicNode(2, 3, 7)
	peer := aicNode(2, 6, 7)
	stranger := aicNode(4, 4, 7)
	mid := aicNode(1, 3, 7)

	cases := []struct {
		name                       string
		start, end                 candidateNode
		startPolarity, endPolarity bool
	}{
		{"loop back to start but the end is OFF", origin, origin, true, false},
		{"loop back to start but the start is OFF", origin, origin, false, true},
		{"same cell, different digit", origin, aicNode(2, 3, 3), true, true},
		{"same digit but the endpoints do not see each other", origin, stranger, true, true},
		{"peers holding different digits", origin, aicNode(2, 6, 3), true, true},
		{"peers with the same digit but the end is OFF", origin, peer, true, false},
		{"peers with the same digit but the start is OFF", origin, peer, false, true},
	}
	for _, c := range cases {
		chain := []candidateNode{c.start, mid, c.end}
		move := checkChainConclusion(&testBoard{}, chain, c.start, c.startPolarity, c.end, c.endPolarity)
		if move != nil {
			t.Errorf("%s: expected no conclusion, got %+v", c.name, move)
		}
	}
}

// TestGetChainCellRefsMapsEveryChainCellToItsCoordinate pins the index-to-grid
// arithmetic. The cells chosen have distinct rows and columns, so swapping the
// row and column halves of the conversion changes the result.
func TestGetChainCellRefsMapsEveryChainCellToItsCoordinate(t *testing.T) {
	chain := []candidateNode{aicNode(0, 0, 1), aicNode(1, 3, 2), aicNode(8, 4, 3)}

	want := refs([2]int{0, 0}, [2]int{1, 3}, [2]int{8, 4})
	if got := getChainCellRefs(chain); !reflect.DeepEqual(got, want) {
		t.Errorf("chain cell refs = %+v, want %+v", got, want)
	}
	if got := getChainCellRefs(nil); len(got) != 0 {
		t.Errorf("an empty chain must yield no refs, got %+v", got)
	}
}

// TestBuildAICHighlightsMarksEveryChainCellPrimary pins that the chain cells
// land in Primary in chain order, and that Secondary is present but empty,
// since the move is serialized straight to the client.
func TestBuildAICHighlightsMarksEveryChainCellPrimary(t *testing.T) {
	chain := []candidateNode{aicNode(0, 0, 1), aicNode(1, 3, 2), aicNode(8, 4, 3)}

	got := buildAICHighlights(chain)
	want := refs([2]int{0, 0}, [2]int{1, 3}, [2]int{8, 4})
	if !reflect.DeepEqual(got.Primary, want) {
		t.Errorf("Primary = %+v, want %+v", got.Primary, want)
	}
	if got.Secondary == nil || len(got.Secondary) != 0 {
		t.Errorf("Secondary must be an empty non-nil slice, got %+v", got.Secondary)
	}
}

// TestBFSAICReturnsEliminationBehindADecoyBranch drives the search over
// hand-built link tables rather than over a board, so the traversal itself is
// pinned. The start node's first weak neighbor opens a branch that reaches a
// three-node chain proving nothing, so the search has to reject it and go on to
// the second branch. That second branch's strong links lead back to the start
// node first: revisiting it would close a loop and yield an assignment instead
// of an elimination, so the action alone pins the revisit check.
func TestBFSAICReturnsEliminationBehindADecoyBranch(t *testing.T) {
	start := aicNode(0, 0, 5)
	decoy := aicNode(4, 4, 8)
	decoyEnd := aicNode(4, 5, 8)
	mid := aicNode(1, 4, 5)
	end := aicNode(0, 3, 5)

	weak := map[candidateNode][]candidateNode{start: {decoy, mid}}
	strong := map[candidateNode][]candidateNode{
		decoy: {decoyEnd},
		mid:   {start, end},
	}

	move := bfsAIC(&testBoard{}, start, true, strong, weak)
	assertMove(t, move, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      refs([2]int{0, 0}, [2]int{1, 4}, [2]int{0, 3}),
		Eliminations: []core.Candidate{{Row: 0, Col: 0, Digit: 5}},
		Explanation: "AIC: Chain proves r1c1=5 leads to r1c4=5, " +
			"but they see each other - contradiction",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{1, 4}, [2]int{0, 3}),
			Secondary: []core.CellRef{},
		},
	})
}

// aicRun builds a run of nodes wired into alternating weak and strong link
// tables. The search starts ON and follows a weak link, then a strong one, and
// so on, so a node is ON exactly at even positions in the run. The first and
// last nodes share digit 5 and sit in row 0, and the interior nodes never carry
// digit 5, so the only conclusion the run admits is the one at its far end.
func aicRun(interior int) (nodes []candidateNode, strong, weak map[candidateNode][]candidateNode) {
	nodes = []candidateNode{aicNode(0, 0, 5)}
	for i := range interior {
		nodes = append(nodes, candidateNode{cell: 40 + i, digit: 1 + i%4})
	}
	nodes = append(nodes, aicNode(0, 8, 5))

	strong = map[candidateNode][]candidateNode{}
	weak = map[candidateNode][]candidateNode{}
	for i := 0; i+1 < len(nodes); i++ {
		if i%2 == 0 {
			weak[nodes[i]] = []candidateNode{nodes[i+1]}
		} else {
			strong[nodes[i]] = []candidateNode{nodes[i+1]}
		}
	}
	return nodes, strong, weak
}

// TestBFSAICConcludesAtTheLongestPermittedChain pins the chain-length bound
// from below. The conclusion here needs all eleven nodes of the chain, which is
// the longest the bound admits, so tightening the bound loses the move.
func TestBFSAICConcludesAtTheLongestPermittedChain(t *testing.T) {
	nodes, strong, weak := aicRun(9)

	move := bfsAIC(&testBoard{}, nodes[0], true, strong, weak)
	if move == nil {
		t.Fatal("expected an elimination from an eleven-node chain, got nil")
	}
	if move.Action != "eliminate" || move.Digit != 5 {
		t.Errorf("expected an elimination of digit 5, got action %q digit %d", move.Action, move.Digit)
	}
	if len(move.Targets) != len(nodes) {
		t.Errorf("expected all %d chain cells as targets, got %d", len(nodes), len(move.Targets))
	}
	want := core.Candidate{Row: 0, Col: 0, Digit: 5}
	if len(move.Eliminations) != 1 || move.Eliminations[0] != want {
		t.Errorf("expected the start candidate eliminated, got %+v", move.Eliminations)
	}
}

// TestBFSAICAbandonsChainsBeyondTheLengthBound pins the bound from above. This
// run's only conclusion sits two nodes past the longest admissible chain, so
// the search must give up rather than reach it.
func TestBFSAICAbandonsChainsBeyondTheLengthBound(t *testing.T) {
	nodes, strong, weak := aicRun(11)

	if move := bfsAIC(&testBoard{}, nodes[0], true, strong, weak); move != nil {
		t.Errorf("expected no move beyond the chain-length bound, got %+v", move)
	}
}

// TestDetectAICEliminatesThroughAConjugatePairBehindTwoDeadStarts drives the
// whole detector from a board. Digit 5 sits in three cells of box 1: R1C1 and
// R1C2 form a conjugate pair in row 1, and R2C3 sees both of them. Assuming
// R2C3 is 5 forces R1C1 off, which forces R1C2 on through the conjugate pair,
// and R1C2 also sees R2C3, so the assumption contradicts itself and 5 leaves
// R2C3.
//
// The scan reaches R1C1 and R1C2 first and must reject both, since neither
// starts a chain that concludes. A detector that gave up at its first miss, or
// fired on its first start candidate, would not find this.
func TestDetectAICEliminatesThroughAConjugatePairBehindTwoDeadStarts(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{5})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{5})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{5, 7})

	move := DetectAIC(b)
	assertMove(t, move, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      refs([2]int{1, 2}, [2]int{0, 0}, [2]int{0, 1}),
		Eliminations: []core.Candidate{{Row: 1, Col: 2, Digit: 5}},
		Explanation: "AIC: Chain proves r2c3=5 leads to r1c2=5, " +
			"but they see each other - contradiction",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 2}, [2]int{0, 0}, [2]int{0, 1}),
			Secondary: []core.CellRef{},
		},
	})
	if move.Technique != "aic" {
		t.Errorf("Technique = %q, want %q", move.Technique, "aic")
	}
}
