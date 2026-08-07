package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// alsWingBoard is the smallest board on which both ALS chain detectors fire:
// three single-cell almost locked sets at R1C1 {1,2}, R2C1 {1,3} and R1C5
// {2,3}, pairwise disjoint, with 1 restricted between the first two and 2
// between the first and third. R2C5 sees both of the sets carrying 3 and holds
// 3 itself, so 3 leaves it.
func alsWingBoard() *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{1, 3})
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{2, 3})
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 7})
	return b
}

// ============================================================================
// Whole moves
// ============================================================================

// TestDetectALSXYWingReturnsCompleteMove pins the whole move, which is where
// the three sets' coordinates and both restricted commons reach the
// explanation. The existing coverage asserts the digit and one elimination and
// leaves every one of those numbers unchecked.
func TestDetectALSXYWingReturnsCompleteMove(t *testing.T) {
	assertMove(t, DetectALSXYWing(alsWingBoard()), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Targets:      refs([2]int{0, 0}, [2]int{0, 4}, [2]int{1, 0}),
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 3}},
		Explanation:  "ALS-XY-Wing: A=R1C1, B=R1C5, C=R2C1; RC(A-B)=2, RC(A-C)=1; eliminate 3",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}, [2]int{0, 4}, [2]int{1, 0}),
		},
	})
}

// TestDetectALSXYChainReturnsCompleteMove pins the chain detector's whole move
// on the same board, including the restricted-common list its explanation
// prints in chain order.
func TestDetectALSXYChainReturnsCompleteMove(t *testing.T) {
	assertMove(t, DetectALSXYChain(alsWingBoard()), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Targets:      refs([2]int{0, 4}, [2]int{0, 0}, [2]int{1, 0}),
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 3}},
		Explanation:  "ALS-XY-Chain: 3 ALS linked by RCs [2 1]; eliminate 3",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 4}, [2]int{0, 0}, [2]int{1, 0}),
		},
	})
}

// ============================================================================
// Restricted commons
// ============================================================================

// TestIsRestrictedCommonRequiresEveryCellPairToSee pins the restricted-common
// test, which is what licenses the whole family of ALS techniques: a digit is
// restricted between two sets only when every cell holding it in one sees every
// cell holding it in the other, so the digit cannot be true in both at once.
func TestIsRestrictedCommonRequiresEveryCellPairToSee(t *testing.T) {
	// Both sets hold 1 in row 0, so every pair sees.
	seeing := alsOf(map[int][]int{idxOf(0, 0): {1, 2}})
	seen := alsOf(map[int][]int{idxOf(0, 1): {1, 3}})
	// Holds 1 in two cells, one of which is out of sight of row 0 column 0.
	partlyUnseen := alsOf(map[int][]int{idxOf(0, 1): {1, 3}, idxOf(8, 8): {1, 4}})
	absent := alsOf(map[int][]int{idxOf(0, 2): {5, 6}})

	if !isRestrictedCommon(seeing, seen, 1) {
		t.Error("expected 1 restricted between two sets whose cells all see each other")
	}
	if isRestrictedCommon(seeing, partlyUnseen, 1) {
		t.Error("expected 1 not restricted when one holding cell is out of sight")
	}
	if isRestrictedCommon(seeing, absent, 1) {
		t.Error("expected 1 not restricted when the second set does not hold it")
	}
	if isRestrictedCommon(absent, seeing, 1) {
		t.Error("expected 1 not restricted when the first set does not hold it")
	}
}

// TestFindRestrictedCommonsReturnsOnlyTheSeeingDigits pins the scan over shared
// digits: a digit both sets hold is reported only when it is restricted, and
// the result keeps the ascending order the intersection produces.
func TestFindRestrictedCommonsReturnsOnlyTheSeeingDigits(t *testing.T) {
	// Shares 1, 2 and 9 with the second set. 1 and 2 are held in row 0 by both,
	// so both are restricted; 9 is held far away in the second set.
	first := alsOf(map[int][]int{idxOf(0, 0): {1, 2, 9}})
	second := alsOf(map[int][]int{idxOf(0, 1): {1, 2}, idxOf(8, 8): {9, 4}})

	if got := findRestrictedCommons(first, second); !reflect.DeepEqual(got, []int{1, 2}) {
		t.Errorf("restricted commons = %v, want [1 2]", got)
	}
	if got := findRestrictedCommons(first, alsOf(map[int][]int{idxOf(8, 8): {5, 6}})); got != nil {
		t.Errorf("expected no restricted commons between disjoint digit sets, got %v", got)
	}
}

// ============================================================================
// Triple disjointness
// ============================================================================

// TestAlsTripleDisjointRejectsEveryOverlappingPair pins all three pairwise
// checks. Each case shares cells in exactly one pair, so a check dropped from
// the conjunction shows up as one case answering wrongly.
func TestAlsTripleDisjointRejectsEveryOverlappingPair(t *testing.T) {
	a := alsOf(map[int][]int{idxOf(0, 0): {1, 2}})
	bb := alsOf(map[int][]int{idxOf(1, 0): {1, 3}})
	c := alsOf(map[int][]int{idxOf(0, 4): {2, 3}})

	if !alsTripleDisjoint(a, bb, c) {
		t.Error("expected three pairwise disjoint sets to pass")
	}
	if alsTripleDisjoint(a, a, c) {
		t.Error("expected a triple sharing cells between the first two to fail")
	}
	if alsTripleDisjoint(a, bb, a) {
		t.Error("expected a triple sharing cells between the first and third to fail")
	}
	if alsTripleDisjoint(a, bb, bb) {
		t.Error("expected a triple sharing cells between the second and third to fail")
	}
}

// ============================================================================
// Elimination and target assembly
// ============================================================================

// TestFindZEliminationsRequiresSightOfBothEndsAndSkipsTheChain pins the
// elimination scan: a cell must see every cell holding the digit at both ends of
// the chain, and cells belonging to the chain itself are excluded even though
// they satisfy that condition trivially.
func TestFindZEliminationsRequiresSightOfBothEndsAndSkipsTheChain(t *testing.T) {
	b := &testBoard{}
	first := []int{idxOf(1, 0)}
	last := []int{idxOf(0, 4)}
	b.candidates[first[0]] = NewCandidates([]int{1, 3})
	b.candidates[last[0]] = NewCandidates([]int{2, 3})
	// Sees both ends: row 1 reaches R2C1, column 4 reaches R1C5.
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{3, 7})
	// Sees only the first end.
	b.candidates[idxOf(1, 7)] = NewCandidates([]int{3, 8})
	// Sees only the last end.
	b.candidates[idxOf(7, 4)] = NewCandidates([]int{3, 9})

	got := findZEliminations(b, 3, first, last, first, last)

	want := []core.Candidate{{Row: 1, Col: 4, Digit: 3}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("eliminations = %+v, want %+v", got, want)
	}
}

// TestBuildTargetsConcatenatesGroupsInOrder pins the target assembly, which
// decides the order the move reports its cells in.
func TestBuildTargetsConcatenatesGroupsInOrder(t *testing.T) {
	got := buildTargets([]int{idxOf(0, 4)}, []int{idxOf(0, 0), idxOf(1, 0)}, nil)

	want := refs([2]int{0, 4}, [2]int{0, 0}, [2]int{1, 0})
	if !reflect.DeepEqual(got, want) {
		t.Errorf("targets = %+v, want %+v", got, want)
	}
}

// wingRestrictedZSets is the triple the two cases below share. B and C both
// hold 4 in cells that see each other, so 4 is restricted between them and
// cannot be the eliminated digit, and both hold 6 out of full sight, so 6 can.
// R3C4 sees both cells holding 4, so a scan that admits 4 reports it.
func wingRestrictedZSets() (*testBoard, ALS, ALS, ALS) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 4): {4, 5},
		idxOf(1, 4): {5, 6},
		idxOf(0, 5): {4, 6},
		idxOf(5, 5): {6, 7},
		idxOf(2, 3): {4, 9},
		idxOf(1, 5): {6, 8},
	})
	return b,
		alsOf(map[int][]int{idxOf(0, 0): {1, 2}}),
		alsOf(map[int][]int{idxOf(0, 4): {4, 5}, idxOf(1, 4): {5, 6}}),
		alsOf(map[int][]int{idxOf(0, 5): {4, 6}, idxOf(5, 5): {6, 7}})
}

// TestAlsXYWingMoveReturnsTheCompleteMoveForTheDigitItReaches pins the move the
// wing assembles from a triple, and with it the rule that a digit restricted
// between B and C collapses the pattern. Digit 4 is restricted and has an
// elimination of its own waiting, so admitting it reports the wrong digit and
// stopping the scan on it reports nothing.
func TestAlsXYWingMoveReturnsTheCompleteMoveForTheDigitItReaches(t *testing.T) {
	b, alsA, alsB, alsC := wingRestrictedZSets()

	cells := refs([2]int{0, 0}, [2]int{0, 4}, [2]int{1, 4}, [2]int{0, 5}, [2]int{5, 5})
	assertMove(t, alsXYWingMove(b, alsA, alsB, alsC, 1, 2), &core.Move{
		Action:       "eliminate",
		Digit:        6,
		Targets:      cells,
		Eliminations: []core.Candidate{{Row: 1, Col: 5, Digit: 6}},
		Explanation:  "ALS-XY-Wing: A=R1C1, B=R1C5, R2C5, C=R1C6, R6C6; RC(A-B)=1, RC(A-C)=2; eliminate 6",
		Highlights:   core.Highlights{Primary: cells},
	})
}

// TestAlsXYWingMoveIgnoresADigitASetAdvertisesButHoldsNowhere pins the guard
// against a set whose digit list and cell map disagree. FindAllALS never builds
// one, so the guard is defensive; dropping it leaves the elimination scan with
// one end only, which reports a digit the other end cannot carry.
func TestAlsXYWingMoveIgnoresADigitASetAdvertisesButHoldsNowhere(t *testing.T) {
	for _, tc := range []struct {
		name       string
		advertised string
	}{
		{"B advertises it", "B"},
		{"C advertises it", "C"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, alsA, alsB, alsC := wingRestrictedZSets()
			if tc.advertised == "B" {
				alsB = ALS{
					Cells:   []int{idxOf(0, 4), idxOf(1, 4)},
					Digits:  []int{4, 5, 6},
					ByDigit: map[int][]int{5: {idxOf(0, 4), idxOf(1, 4)}, 6: {idxOf(1, 4)}},
				}
			} else {
				alsC = ALS{
					Cells:   []int{idxOf(0, 5), idxOf(5, 5)},
					Digits:  []int{4, 6, 7},
					ByDigit: map[int][]int{6: {idxOf(0, 5), idxOf(5, 5)}, 7: {idxOf(5, 5)}},
				}
			}

			move := alsXYWingMove(b, alsA, alsB, alsC, 1, 2)
			if move == nil {
				t.Fatal("expected the wing to step over 4 and eliminate 6, got no move")
			}
			if move.Digit != 6 {
				t.Errorf("Digit = %d, want 6", move.Digit)
			}
		})
	}
}

// wingLinkDigitZSets is the triple for the link-digit cases. B and C hold 3 out
// of each other's sight, so 3 clears the restricted-common test and only the
// link-digit rule can reject it, and R6C5 sees both cells holding it.
func wingLinkDigitZSets() (*testBoard, ALS, ALS, ALS) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 4): {3, 5},
		idxOf(1, 4): {5, 6},
		idxOf(0, 5): {6, 7},
		idxOf(5, 5): {3, 6},
		idxOf(5, 4): {3, 9},
		idxOf(1, 5): {6, 8},
	})
	return b,
		alsOf(map[int][]int{idxOf(0, 0): {1, 2}}),
		alsOf(map[int][]int{idxOf(0, 4): {3, 5}, idxOf(1, 4): {5, 6}}),
		alsOf(map[int][]int{idxOf(0, 5): {6, 7}, idxOf(5, 5): {3, 6}})
}

// TestAlsXYWingMoveSkipsADigitEqualToEitherLinkDigit pins both halves of the
// rule that the eliminated digit is neither of the triple's two link digits.
// Each half is checked by naming 3 as that half's link digit and requiring the
// wing to step over 3 and reach 6.
func TestAlsXYWingMoveSkipsADigitEqualToEitherLinkDigit(t *testing.T) {
	for _, tc := range []struct {
		name string
		x, y int
	}{
		{"equal to the A-B link digit", 3, 2},
		{"equal to the A-C link digit", 1, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, alsA, alsB, alsC := wingLinkDigitZSets()
			move := alsXYWingMove(b, alsA, alsB, alsC, tc.x, tc.y)
			if move == nil {
				t.Fatal("expected the wing to step over 3 and eliminate 6, got no move")
			}
			if move.Digit != 6 {
				t.Errorf("Digit = %d, want 6", move.Digit)
			}
		})
	}
}

// TestAlsXYWingMoveRejectsATripleWhoseLinkDigitsCoincide pins that the two
// links must be different digits. A triple joined to both partners on the same
// digit is not a wing, and this one would otherwise eliminate 3 from R6C5.
func TestAlsXYWingMoveRejectsATripleWhoseLinkDigitsCoincide(t *testing.T) {
	b, alsA, alsB, alsC := wingLinkDigitZSets()

	if move := alsXYWingMove(b, alsA, alsB, alsC, 1, 1); move != nil {
		t.Fatalf("expected no move when both link digits are 1, got %+v", move)
	}
}

// TestAlsXYWingMoveSkipsADigitYieldingNoElimination pins that a digit clearing
// every structural rule still produces nothing when no cell outside the triple
// sees both of its ends, and that the scan carries on to the next digit rather
// than reporting an empty elimination set. This is the link-digit board with
// the cell that sees both 3s taken away.
func TestAlsXYWingMoveSkipsADigitYieldingNoElimination(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 4): {3, 5},
		idxOf(1, 4): {5, 6},
		idxOf(0, 5): {6, 7},
		idxOf(5, 5): {3, 6},
		idxOf(1, 5): {6, 8},
	})
	alsA := alsOf(map[int][]int{idxOf(0, 0): {1, 2}})
	alsB := alsOf(map[int][]int{idxOf(0, 4): {3, 5}, idxOf(1, 4): {5, 6}})
	alsC := alsOf(map[int][]int{idxOf(0, 5): {6, 7}, idxOf(5, 5): {3, 6}})

	move := alsXYWingMove(b, alsA, alsB, alsC, 1, 2)
	if move == nil {
		t.Fatal("expected the wing to pass over 3 and eliminate 6, got no move")
	}
	if move.Digit != 6 {
		t.Errorf("Digit = %d, want 6", move.Digit)
	}
	if len(move.Eliminations) == 0 {
		t.Error("expected a non-empty elimination set")
	}
}

// TestDetectALSXYWingRejectsATripleWhoseSetsOverlap pins the triple's
// disjointness. The disjoint triple R4C9 / R4C6 / R5C9 eliminates 6 from R4C8;
// a search admitting overlapping triples reaches the pair R4C8+R4C9 first,
// which shares a cell with R4C9, and reports 5 at R5C9 instead.
func TestDetectALSXYWingRejectsATripleWhoseSetsOverlap(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(3, 5): {1, 6},
		idxOf(3, 7): {1, 6},
		idxOf(3, 8): {1, 5},
		idxOf(4, 8): {5, 6},
	})

	cells := refs([2]int{3, 8}, [2]int{3, 5}, [2]int{4, 8})
	assertMove(t, DetectALSXYWing(b), &core.Move{
		Action:       "eliminate",
		Digit:        6,
		Targets:      cells,
		Eliminations: []core.Candidate{{Row: 3, Col: 7, Digit: 6}},
		Explanation:  "ALS-XY-Wing: A=R4C9, B=R4C6, C=R5C9; RC(A-B)=1, RC(A-C)=5; eliminate 6",
		Highlights:   core.Highlights{Primary: cells},
	})
}

// TestDetectALSXYWingPairsAPivotWithEveryLaterSet pins that the pair loop
// covers the whole index range rather than stopping partway. FindAllALS emits
// each set once per unit containing it, rows then columns then boxes, so a
// single-cell pivot is normally reachable from a later index too and a
// truncated pair loop still finds it. Here the pivot R2C4 is a single cell
// inside box 2 and both other sets span two cells apiece, R1C4+R2C5 in box 2
// and R1C7+R2C8 in box 3, so each is emitted once and only after the pivot. A
// pair loop that stops at the pivot's own index never reaches either of them
// and settles on a different triple.
func TestDetectALSXYWingPairsAPivotWithEveryLaterSet(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 3): {4, 8},
		idxOf(0, 6): {7, 9},
		idxOf(1, 3): {5, 8},
		idxOf(1, 4): {4, 9},
		idxOf(1, 6): {1, 9},
		idxOf(1, 7): {5, 9},
		idxOf(2, 5): {4, 8},
		idxOf(2, 8): {7, 9},
	})

	cells := refs([2]int{1, 3}, [2]int{0, 3}, [2]int{1, 4}, [2]int{0, 6}, [2]int{1, 7})
	assertMove(t, DetectALSXYWing(b), &core.Move{
		Action:       "eliminate",
		Digit:        9,
		Targets:      cells,
		Eliminations: []core.Candidate{{Row: 1, Col: 6, Digit: 9}},
		Explanation:  "ALS-XY-Wing: A=R2C4, B=R1C4, R2C5, C=R1C7, R2C8; RC(A-B)=8, RC(A-C)=5; eliminate 9",
		Highlights:   core.Highlights{Primary: cells},
	})
}

// TestDetectALSXYChainExcludesOverlappingSetsFromTheAdjacency pins that two
// sets sharing a cell are never linked. The three-set chain here eliminates 3
// from R7C2; an adjacency that also links overlapping sets offers a fourth link
// the search takes first, reporting the same elimination through a four-set
// chain and a different link-digit list.
func TestDetectALSXYChainExcludesOverlappingSetsFromTheAdjacency(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(6, 1): {2, 3},
		idxOf(6, 3): {3, 4},
		idxOf(6, 5): {4, 6},
		idxOf(7, 4): {3, 4},
		idxOf(8, 3): {6, 8},
		idxOf(8, 5): {4, 8},
	})

	cells := refs([2]int{6, 3}, [2]int{7, 4}, [2]int{8, 3}, [2]int{8, 5}, [2]int{6, 3}, [2]int{6, 5})
	assertMove(t, DetectALSXYChain(b), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Targets:      cells,
		Eliminations: []core.Candidate{{Row: 6, Col: 1, Digit: 3}},
		Explanation:  "ALS-XY-Chain: 3 ALS linked by RCs [4 6]; eliminate 3",
		Highlights:   core.Highlights{Primary: cells},
	})
}

// TestDetectALSXYChainBoundsSetsAtFourCells pins the set-size bound the public
// entry point applies. Within four cells the chain runs through four sets and
// eliminates 8 from R5C3 and R8C1. Allowing five-cell sets puts R8C1 itself
// inside a five-cell set spanning row 8, which shortens the chain to three sets
// and costs that second elimination.
func TestDetectALSXYChainBoundsSetsAtFourCells(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(4, 2): {5, 8},
		idxOf(6, 2): {1, 8},
		idxOf(7, 0): {1, 8},
		idxOf(7, 2): {1, 6},
		idxOf(7, 3): {4, 6},
		idxOf(7, 4): {4, 5},
		idxOf(7, 6): {2, 5},
		idxOf(7, 8): {2, 5},
	})

	cells := refs([2]int{6, 2}, [2]int{7, 2}, [2]int{7, 4}, [2]int{7, 6},
		[2]int{7, 8}, [2]int{7, 3}, [2]int{6, 2}, [2]int{7, 2})
	assertMove(t, DetectALSXYChain(b), &core.Move{
		Action:  "eliminate",
		Digit:   8,
		Targets: cells,
		Eliminations: []core.Candidate{
			{Row: 4, Col: 2, Digit: 8},
			{Row: 7, Col: 0, Digit: 8},
		},
		Explanation: "ALS-XY-Chain: 4 ALS linked by RCs [1 4 6]; eliminate 8",
		Highlights:  core.Highlights{Primary: cells},
	})
}

// TestDetectALSXYChainBoundsChainsAtSixSets pins the chain-length bound the
// public entry point applies. Six sets reach the elimination of 6 from R5C2
// through link digits 4, 7, 3, 5 and 1. Allowing a seventh set lets the search
// reach the same elimination first through a longer route that inserts a link
// on 2, which reports a different chain for the same result.
func TestDetectALSXYChainBoundsChainsAtSixSets(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {3, 4},
		idxOf(0, 5): {4, 5},
		idxOf(1, 2): {2, 3},
		idxOf(4, 1): {1, 6},
		idxOf(4, 7): {4, 6},
		idxOf(5, 5): {1, 5},
		idxOf(5, 8): {1, 4},
		idxOf(6, 2): {2, 7},
		idxOf(6, 7): {4, 7},
	})

	cells := refs([2]int{4, 7}, [2]int{6, 7}, [2]int{1, 2}, [2]int{6, 2}, [2]int{0, 0},
		[2]int{0, 5}, [2]int{5, 5}, [2]int{4, 7}, [2]int{5, 8})
	assertMove(t, DetectALSXYChain(b), &core.Move{
		Action:       "eliminate",
		Digit:        6,
		Targets:      cells,
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 6}},
		Explanation:  "ALS-XY-Chain: 6 ALS linked by RCs [4 7 3 5 1]; eliminate 6",
		Highlights:   core.Highlights{Primary: cells},
	})
}

// alsAdjacency builds the restricted-common adjacency searchALSChain consumes,
// the way detectALSXYChain does. The search fixtures below hand-build their set
// list and derive the adjacency from it, so every graph searched is one the
// adjacency build could have produced, without needing a board contrived to
// make FindAllALS emit those sets.
func alsAdjacency(all []ALS) map[int]map[int][]int {
	adj := make(map[int]map[int][]int, len(all))
	for i := range all {
		adj[i] = make(map[int][]int)
		for j := range all {
			if i == j || ALSShareCells(all[i], all[j]) {
				continue
			}
			if rcs := findRestrictedCommons(all[i], all[j]); len(rcs) > 0 {
				adj[i][j] = rcs
			}
		}
	}
	return adj
}

// TestSearchALSChainTriesAFurtherLinkDigitAfterRejectingTheRepeatedOne pins
// that rejecting a link digit rejects only that digit, not the neighbor
// offering it. R1C1 links to R1C2 on 2, and the only route onward is the pair
// R5C2+R6C2, which links on both 2 and 3; 2 repeats the previous link, so the
// chain must go on to try 3. The chain's ends share 1, and R6C1 sees both cells
// holding it.
func TestSearchALSChainTriesAFurtherLinkDigitAfterRejectingTheRepeatedOne(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {2, 3},
		idxOf(4, 1): {2, 3},
		idxOf(5, 1): {3, 1},
		idxOf(5, 0): {1, 9},
	})
	all := []ALS{
		alsOf(map[int][]int{idxOf(0, 0): {1, 2}}),
		alsOf(map[int][]int{idxOf(0, 1): {2, 3}}),
		alsOf(map[int][]int{idxOf(4, 1): {2, 3}, idxOf(5, 1): {3, 1}}),
	}

	cells := refs([2]int{0, 0}, [2]int{0, 1}, [2]int{4, 1}, [2]int{5, 1})
	assertMove(t, searchALSChain(b, all, alsAdjacency(all), 0, 6), &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Targets:      cells,
		Eliminations: []core.Candidate{{Row: 5, Col: 0, Digit: 1}},
		Explanation:  "ALS-XY-Chain: 3 ALS linked by RCs [2 3]; eliminate 1",
		Highlights:   core.Highlights{Primary: cells},
	})
}

// TestSearchALSChainRejectsALinkRepeatingAnEarlierLinkDigit pins the
// alternation rule against a repeat that is not the immediately previous link.
// The three-set chain eliminates nothing, and its only extension links on 2,
// used two links back, so a search admitting it reports a chain the alternation
// rule forbids.
func TestSearchALSChainRejectsALinkRepeatingAnEarlierLinkDigit(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {2, 3},
		idxOf(4, 1): {3, 2},
		idxOf(4, 2): {2, 1},
		idxOf(4, 0): {1, 9},
	})
	all := []ALS{
		alsOf(map[int][]int{idxOf(0, 0): {1, 2}}),
		alsOf(map[int][]int{idxOf(0, 1): {2, 3}}),
		alsOf(map[int][]int{idxOf(4, 1): {3, 2}}),
		alsOf(map[int][]int{idxOf(4, 2): {2, 1}}),
	}

	if move := searchALSChain(b, all, alsAdjacency(all), 0, 6); move != nil {
		t.Fatalf("expected no chain: the only extension reuses link digit 2, got %+v", move)
	}
}

// TestSearchALSChainKeepsTryingLinkDigitsPastARejectedOne pins that a rejected
// link digit costs only itself. The four-set chain eliminating 1 from R5C1 is
// reached through a neighbor offering 2 and 4, where 2 repeats a link used two
// steps back and 4 is the productive one; abandoning the neighbor at 2 finds
// nothing.
func TestSearchALSChainKeepsTryingLinkDigitsPastARejectedOne(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {2, 3},
		idxOf(4, 1): {3, 2},
		idxOf(4, 2): {2, 4},
		idxOf(4, 5): {2, 1},
		idxOf(4, 6): {1, 4},
		idxOf(4, 0): {1, 9},
	})
	all := []ALS{
		alsOf(map[int][]int{idxOf(0, 0): {1, 2}}),
		alsOf(map[int][]int{idxOf(0, 1): {2, 3}}),
		alsOf(map[int][]int{idxOf(4, 1): {3, 2}, idxOf(4, 2): {2, 4}}),
		alsOf(map[int][]int{idxOf(4, 5): {2, 1}, idxOf(4, 6): {1, 4}}),
	}

	move := searchALSChain(b, all, alsAdjacency(all), 0, 6)
	if move == nil {
		t.Fatal("expected the four-set chain to fire on the second link digit offered")
	}
	if move.Digit != 1 {
		t.Errorf("Digit = %d, want 1", move.Digit)
	}
	if !hasElimination(move.Eliminations, 4, 0, 1) {
		t.Errorf("expected elimination of 1 at r5c1, got %v", move.Eliminations)
	}
}

// TestSearchALSChainStopsExtendingAtTheLengthBound pins the bound. The only
// firing chain here is four sets long, so a search bounded at three reports
// nothing while the same search bounded at four reports the move.
func TestSearchALSChainStopsExtendingAtTheLengthBound(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(0, 1): {2, 3},
		idxOf(4, 1): {3, 4},
		idxOf(4, 2): {4, 1},
		idxOf(4, 0): {1, 9},
	})
	all := []ALS{
		alsOf(map[int][]int{idxOf(0, 0): {1, 2}}),
		alsOf(map[int][]int{idxOf(0, 1): {2, 3}}),
		alsOf(map[int][]int{idxOf(4, 1): {3, 4}}),
		alsOf(map[int][]int{idxOf(4, 2): {4, 1}}),
	}
	adj := alsAdjacency(all)

	if move := searchALSChain(b, all, adj, 0, 3); move != nil {
		t.Errorf("expected no chain within three sets, got %+v", move)
	}
	move := searchALSChain(b, all, adj, 0, 4)
	if move == nil {
		t.Fatal("expected the four-set chain to fire when four sets are allowed")
	}
	if move.Digit != 1 {
		t.Errorf("Digit = %d, want 1", move.Digit)
	}
}

// TestSearchALSChainWillNotRevisitASetAlreadyInTheChain pins the visited set.
// The middle set links to the last on both 3 and 4, so a chain allowed to step
// back into a set it already holds reaches four sets and eliminates 1 from
// R1C7. No chain visiting each set once eliminates anything here.
func TestSearchALSChainWillNotRevisitASetAlreadyInTheChain(t *testing.T) {
	b := simpleBoard(map[int][]int{
		idxOf(0, 0): {1, 2},
		idxOf(1, 0): {2, 5},
		idxOf(2, 0): {2, 3},
		idxOf(2, 1): {3, 4},
		idxOf(2, 6): {4, 1},
		idxOf(2, 3): {3, 4},
		idxOf(0, 6): {1, 9},
	})
	all := []ALS{
		alsOf(map[int][]int{idxOf(0, 0): {1, 2}, idxOf(1, 0): {2, 5}}),
		alsOf(map[int][]int{idxOf(2, 0): {2, 3}, idxOf(2, 1): {3, 4}, idxOf(2, 6): {4, 1}}),
		alsOf(map[int][]int{idxOf(2, 3): {3, 4}}),
	}

	if move := searchALSChain(b, all, alsAdjacency(all), 0, 6); move != nil {
		t.Fatalf("expected no chain: every route repeats a set already in the chain, got %+v", move)
	}
}

// TestCheckChainEliminationIgnoresADigitAnEndAdvertisesButHoldsNowhere pins the
// guard against a chain end whose digit list and cell map disagree. FindAllALS
// never builds such a set, so the guard is defensive; dropping it leaves the
// scan with the opposite end alone and reports a digit this end cannot carry.
func TestCheckChainEliminationIgnoresADigitAnEndAdvertisesButHoldsNowhere(t *testing.T) {
	middle := alsOf(map[int][]int{idxOf(0, 4): {5, 6}})
	for _, tc := range []struct {
		name        string
		first, last ALS
	}{
		{
			name: "the first set advertises it",
			first: ALS{
				Cells:   []int{idxOf(0, 0), idxOf(1, 0)},
				Digits:  []int{4, 1, 5},
				ByDigit: map[int][]int{1: {idxOf(0, 0), idxOf(1, 0)}, 5: {idxOf(1, 0)}},
			},
			last: alsOf(map[int][]int{idxOf(4, 2): {4, 1}, idxOf(4, 3): {1, 6}}),
		},
		{
			name:  "the last set advertises it",
			first: alsOf(map[int][]int{idxOf(0, 0): {4, 1}, idxOf(1, 0): {1, 5}}),
			last: ALS{
				Cells:   []int{idxOf(4, 2), idxOf(4, 3)},
				Digits:  []int{4, 1, 6},
				ByDigit: map[int][]int{1: {idxOf(4, 2), idxOf(4, 3)}, 6: {idxOf(4, 3)}},
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := simpleBoard(map[int][]int{
				idxOf(0, 0): {4, 1},
				idxOf(1, 0): {1, 5},
				idxOf(0, 4): {5, 6},
				idxOf(4, 2): {4, 1},
				idxOf(4, 3): {1, 6},
				// Sees both ends, so it takes whichever digit the chain reaches.
				idxOf(4, 0): {1, 4},
			})
			move := checkChainElimination(b, []ALS{tc.first, middle, tc.last}, []int{0, 1, 2}, []int{5, 6})
			if move == nil {
				t.Fatal("expected the chain to step over 4 and eliminate 1, got no move")
			}
			if move.Digit != 1 {
				t.Errorf("Digit = %d, want 1", move.Digit)
			}
		})
	}
}
