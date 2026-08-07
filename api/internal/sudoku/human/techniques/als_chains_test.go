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
