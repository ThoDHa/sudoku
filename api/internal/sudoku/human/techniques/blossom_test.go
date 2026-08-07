package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// alsOf builds an ALS value from its cells and the digits each cell holds,
// mirroring what FindAllALS produces. The helpers under test take ALS values as
// arguments, so most of this file can work from hand-built sets rather than from
// boards contrived to make FindAllALS emit the right ones.
func alsOf(cellDigits map[int][]int) ALS {
	als := ALS{ByDigit: map[int][]int{}}
	digitSeen := map[int]bool{}
	for _, cell := range sortedKeys(cellDigits) {
		als.Cells = append(als.Cells, cell)
		for _, d := range cellDigits[cell] {
			als.ByDigit[d] = append(als.ByDigit[d], cell)
			if !digitSeen[d] {
				digitSeen[d] = true
				als.Digits = append(als.Digits, d)
			}
		}
	}
	return als
}

func sortedKeys(m map[int][]int) []int {
	keys := make([]int, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := range keys {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return keys
}

// ============================================================================
// findPetalsForCandidate
// ============================================================================

// TestFindPetalsForCandidateAcceptsOnlyFullyLinkedSets pins every rejection the
// petal filter makes, and that a set surviving all of them is returned. The
// last rejection is the load-bearing one: if any cell of the petal holding the
// link digit does not see the stem, placing the stem digit does not clear that
// digit from the petal and the set never locks.
func TestFindPetalsForCandidateAcceptsOnlyFullyLinkedSets(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(0, 0)

	good := alsOf(map[int][]int{idxOf(0, 1): {1, 5}})
	// Holds the link digit only in a cell that does see the stem, so every
	// later check passes and the stem-membership rejection is the only one that
	// can turn it away.
	containsStem := alsOf(map[int][]int{stem: {5, 7}, idxOf(0, 2): {1, 5}})
	lacksDigit := alsOf(map[int][]int{idxOf(0, 3): {2, 5}})
	unseenLinkCell := alsOf(map[int][]int{idxOf(0, 4): {1, 5}, idxOf(8, 8): {1, 6}})

	got := findPetalsForCandidate(b, stem, 1, []ALS{containsStem, lacksDigit, unseenLinkCell, good})

	if !reflect.DeepEqual(got, []ALS{good}) {
		t.Errorf("petals = %+v, want only %+v", got, good)
	}
}

// TestFindPetalsForCandidateRejectsASetHoldingTheDigitNowhere covers the
// remaining rejection: a set whose digit list names the link digit but whose
// per-digit cell list for it is empty cannot connect to the stem at all.
func TestFindPetalsForCandidateRejectsASetHoldingTheDigitNowhere(t *testing.T) {
	b := &testBoard{}
	hollow := ALS{
		Cells:   []int{idxOf(0, 1)},
		Digits:  []int{1, 5},
		ByDigit: map[int][]int{5: {idxOf(0, 1)}},
	}

	if got := findPetalsForCandidate(b, idxOf(0, 0), 1, []ALS{hollow}); got != nil {
		t.Errorf("expected no petals when the link digit has no cells, got %+v", got)
	}
}

// ============================================================================
// findEliminationDigits
// ============================================================================

// TestFindEliminationDigitsIntersectsPetalsAndDropsStemDigits pins the digit
// arithmetic: a candidate for elimination must appear in every petal and in
// none of the stem's own candidates.
func TestFindEliminationDigitsIntersectsPetalsAndDropsStemDigits(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(0, 0)
	b.candidates[stem] = NewCandidates([]int{1, 2})

	// Each petal carries a digit the others do not, and both stem digits appear
	// in the intersection, so dropping either the intersection step or the
	// subtraction changes the answer.
	petal1 := alsOf(map[int][]int{idxOf(0, 1): {1, 2, 5, 7}})
	petal2 := alsOf(map[int][]int{idxOf(1, 0): {1, 2, 5, 8}})
	petal3 := alsOf(map[int][]int{idxOf(2, 0): {1, 2, 5, 9}})

	if got := findEliminationDigits(b, stem, []ALS{petal1, petal2}); !reflect.DeepEqual(got, []int{5}) {
		t.Errorf("two petals: digits = %v, want [5]", got)
	}
	if got := findEliminationDigits(b, stem, []ALS{petal1, petal2, petal3}); !reflect.DeepEqual(got, []int{5}) {
		t.Errorf("three petals: digits = %v, want [5]", got)
	}
	// Reversing the order changes which petal seeds the intersection without
	// changing the result, which is what pins the seed against the loop bound.
	if got := findEliminationDigits(b, stem, []ALS{petal2, petal1}); !reflect.DeepEqual(got, []int{5}) {
		t.Errorf("reversed petals: digits = %v, want [5]", got)
	}
	if got := findEliminationDigits(b, stem, nil); got != nil {
		t.Errorf("no petals: digits = %v, want nil", got)
	}
}

// ============================================================================
// findBlossomEliminations
// ============================================================================

// blossomPetals is the two-petal arrangement the elimination tests work from:
// petals at R2C3 {1,5} and R3C2 {2,5}, both seeing the stem at R2C2 and both
// holding digit 5. The stem sits away from the grid origin so the row and
// column it reports are distinguishable from the cell index itself.
func blossomPetals() []ALS {
	return []ALS{
		alsOf(map[int][]int{idxOf(1, 2): {1, 5}}),
		alsOf(map[int][]int{idxOf(2, 1): {2, 5}}),
	}
}

// blossomStem is the stem those petals link to.
const blossomStemRow, blossomStemCol = 1, 1

// TestFindBlossomEliminationsReturnsCompleteMove pins the whole move, which is
// where the stem's coordinates, the petal count and the eliminated digit all
// reach the explanation, and where the targets and both highlight sets are
// assembled.
func TestFindBlossomEliminationsReturnsCompleteMove(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(blossomStemRow, blossomStemCol)
	b.candidates[stem] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(2, 1)] = NewCandidates([]int{2, 5})
	// Sees both petal cells, so digit 5 leaves it.
	b.candidates[idxOf(2, 2)] = NewCandidates([]int{4, 5})

	assertMove(t, findBlossomEliminations(b, stem, blossomPetals(), 5, []int{1, 2}), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      refs([2]int{1, 1}, [2]int{1, 2}, [2]int{2, 1}),
		Eliminations: []core.Candidate{{Row: 2, Col: 2, Digit: 5}},
		Explanation:  "Death Blossom: stem R2C2 {1, 2} with 2 petals; eliminate 5",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 1}),
			Secondary: refs([2]int{1, 2}, [2]int{2, 1}),
		},
	})
}

// TestFindBlossomEliminationsSkipsWhenNothingSeesEveryPetal checks the
// elimination guard: a cell must see every cell holding the digit across all
// petals, so one that sees only one of them licenses nothing.
func TestFindBlossomEliminationsSkipsWhenNothingSeesEveryPetal(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(blossomStemRow, blossomStemCol)
	b.candidates[stem] = NewCandidates([]int{1, 2})
	// Sees R2C3 along row 1 but not R3C2.
	b.candidates[idxOf(1, 7)] = NewCandidates([]int{4, 5})

	if move := findBlossomEliminations(b, stem, blossomPetals(), 5, []int{1, 2}); move != nil {
		t.Errorf("expected nil when no cell sees every petal, got %+v", move)
	}
}

// TestFindBlossomEliminationsSkipsADigitNoPetalHolds checks the guard on the
// other side: a digit absent from every petal has no cells to see, so the
// pattern says nothing about it.
func TestFindBlossomEliminationsSkipsADigitNoPetalHolds(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(blossomStemRow, blossomStemCol)
	b.candidates[idxOf(2, 2)] = NewCandidates([]int{4, 9})

	if move := findBlossomEliminations(b, stem, blossomPetals(), 9, []int{1, 2}); move != nil {
		t.Errorf("expected nil for a digit no petal holds, got %+v", move)
	}
}

// ============================================================================
// Petal combination dispatch
// ============================================================================

// TestTryPetalCombinationsDispatchesOnStemSize pins which strategy each stem
// size reaches. A stem of two candidates has a two-petal strategy and one of
// three has a three-petal strategy; four has neither, and a stem that size is
// not a Death Blossom stem at all.
func TestTryPetalCombinationsDispatchesOnStemSize(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(0, 0)
	b.candidates[stem] = NewCandidates([]int{1, 2, 3, 4})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{2, 5})
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{3, 5})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{4, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{6, 5})

	byCandidate := map[int][]ALS{
		1: {alsOf(map[int][]int{idxOf(0, 1): {1, 5}})},
		2: {alsOf(map[int][]int{idxOf(1, 0): {2, 5}})},
		3: {alsOf(map[int][]int{idxOf(2, 0): {3, 5}})},
		4: {alsOf(map[int][]int{idxOf(0, 2): {4, 5}})},
	}

	if move := tryPetalCombinations(b, stem, []int{1, 2}, byCandidate); move == nil {
		t.Error("expected a move for a two-candidate stem")
	}
	if move := tryPetalCombinations(b, stem, []int{1, 2, 3}, byCandidate); move == nil {
		t.Error("expected a move for a three-candidate stem")
	}
	if move := tryPetalCombinations(b, stem, []int{1, 2, 3, 4}, byCandidate); move != nil {
		t.Errorf("expected nil for a four-candidate stem, got %+v", move)
	}
}

// TestTryTwoPetalsScansPastOverlappingAndBarrenPairings checks that the
// two-petal search rejects a pairing rather than abandoning the scan: the first
// petal for digit 1 shares a cell with the only petal for digit 2, and the
// second is the one that closes.
func TestTryTwoPetalsScansPastOverlappingAndBarrenPairings(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(0, 0)
	b.candidates[stem] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{2, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{4, 5})

	// The first petal offered for digit 2 shares its cell with the only petal
	// for digit 1, so the inner loop has to reject that pairing and go on to
	// the second rather than abandon the first petal altogether.
	byCandidate := map[int][]ALS{
		1: {alsOf(map[int][]int{idxOf(0, 1): {1, 5}})},
		2: {
			alsOf(map[int][]int{idxOf(0, 1): {2, 5}}),
			alsOf(map[int][]int{idxOf(1, 0): {2, 5}}),
		},
	}

	move := tryTwoPetals(b, stem, []int{1, 2}, byCandidate)
	if move == nil {
		t.Fatal("expected the second petal for digit 2 to close the pattern")
	}
	if !reflect.DeepEqual(move.Highlights.Secondary, refs([2]int{0, 1}, [2]int{1, 0})) {
		t.Errorf("Highlights.Secondary = %+v, want the non-overlapping petals", move.Highlights.Secondary)
	}
}

// TestTryThreePetalsRejectsAThirdPetalOverlappingEitherEarlierOne checks both
// halves of the three-petal overlap guard. The first candidate petal for digit
// 3 shares a cell with petal one and the second shares one with petal two, so
// only the third can complete the blossom.
func TestTryThreePetalsRejectsAThirdPetalOverlappingEitherEarlierOne(t *testing.T) {
	b := &testBoard{}
	stem := idxOf(0, 0)
	b.candidates[stem] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{2, 5})
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{3, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{4, 5})

	byCandidate := map[int][]ALS{
		1: {alsOf(map[int][]int{idxOf(0, 1): {1, 5}})},
		// The first petal offered for digit 2 shares a cell with the petal for
		// digit 1, so the second-petal loop must reject it and go on.
		2: {
			alsOf(map[int][]int{idxOf(0, 1): {2, 5}}),
			alsOf(map[int][]int{idxOf(1, 0): {2, 5}}),
		},
		3: {
			alsOf(map[int][]int{idxOf(0, 1): {3, 5}}),
			alsOf(map[int][]int{idxOf(1, 0): {3, 5}}),
			alsOf(map[int][]int{idxOf(2, 0): {3, 5}}),
		},
	}

	move := tryThreePetals(b, stem, []int{1, 2, 3}, byCandidate)
	if move == nil {
		t.Fatal("expected the third petal for digit 3 to close the pattern")
	}
	want := refs([2]int{0, 1}, [2]int{1, 0}, [2]int{2, 0})
	if !reflect.DeepEqual(move.Highlights.Secondary, want) {
		t.Errorf("Highlights.Secondary = %+v, want %+v", move.Highlights.Secondary, want)
	}
}

// ============================================================================
// DetectDeathBlossom
// ============================================================================

// TestDetectDeathBlossomNeedsTwoAlmostLockedSets checks the opening guard: a
// board offering a single almost locked set cannot supply a petal per stem
// candidate, whatever the stem looks like.
func TestDetectDeathBlossomNeedsTwoAlmostLockedSets(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})

	if move := DetectDeathBlossom(b); move != nil {
		t.Errorf("expected nil with fewer than two almost locked sets, got %+v", move)
	}
}

// TestDetectDeathBlossomSkipsAStemMissingAPetal checks the completeness rule:
// every stem candidate needs a petal of its own, because the argument rests on
// whichever candidate turns out true forcing its petal to lock.
func TestDetectDeathBlossomSkipsAStemMissingAPetal(t *testing.T) {
	b := &testBoard{}
	// Stem candidate 2 has no set to link to; digit 8 appears only here.
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 8})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{2, 5})
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{4, 5})

	if move := DetectDeathBlossom(b); move != nil {
		t.Errorf("expected nil when a stem candidate has no petal, got %+v", move)
	}
}

// TestDetectDeathBlossomReturnsCompleteTwoPetalMove drives the whole detector
// rather than its parts: the stem is found by the candidate-count scan, both
// petals by the almost-locked-set search, and the shared digit by the
// intersection. R3C3 sees both petal cells and holds 5, so 5 leaves it.
func TestDetectDeathBlossomReturnsCompleteTwoPetalMove(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 5})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{2, 5})
	// Four candidates, so it forms no almost locked set of its own.
	b.candidates[idxOf(2, 2)] = NewCandidates([]int{4, 5, 6, 7})

	assertMove(t, DetectDeathBlossom(b), &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}, [2]int{1, 0}),
		Eliminations: []core.Candidate{{Row: 2, Col: 2, Digit: 5}},
		Explanation:  "Death Blossom: stem R1C1 {1, 2} with 2 petals; eliminate 5",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}),
			Secondary: refs([2]int{0, 1}, [2]int{1, 0}),
		},
	})
}

// TestDetectDeathBlossomUsesAFourCellPetal pins the size the almost-locked-set
// search is asked for. The only set here carrying both the link digit 1 and the
// eliminated digit 5 is the four-cell one spanning R1C2 to R1C5: every smaller
// subset of those cells holds too many digits for its size to be an almost
// locked set at all. A search capped one size lower finds no petal for stem
// candidate 1 and returns nothing.
func TestDetectDeathBlossomUsesAFourCellPetal(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 3})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{3, 4})
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{4, 6})
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{6, 5})
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{2, 5})
	// Sees the petals' only cells holding 5, along column 4 and row 1.
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{5, 7})

	assertMove(t, DetectDeathBlossom(b), &core.Move{
		Action: "eliminate",
		Digit:  5,
		Targets: refs([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2},
			[2]int{0, 3}, [2]int{0, 4}, [2]int{1, 0}),
		Eliminations: []core.Candidate{{Row: 1, Col: 4, Digit: 5}},
		Explanation:  "Death Blossom: stem R1C1 {1, 2} with 2 petals; eliminate 5",
		Highlights: core.Highlights{
			Primary: refs([2]int{0, 0}),
			Secondary: refs([2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3},
				[2]int{0, 4}, [2]int{1, 0}),
		},
	})
}
