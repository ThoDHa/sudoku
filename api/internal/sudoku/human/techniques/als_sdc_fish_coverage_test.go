package techniques

import (
	"strings"
	"testing"

	"sudoku-api/pkg/constants"
)

// ============================================================================
// Swordfish: row-oriented (byRow=true) firing path
// ============================================================================

// TestDetectSwordfishFiresOnRowBasedPattern drives the row branch of Swordfish
// detection. Digit 5 lives in three rows (0,1,2), each with exactly two
// positions, and those positions project onto exactly three columns (3,4,5).
// A stray 5 at R5C4 (outside the three source rows) is eliminable. This
// exercises detectSwordfishInRows returning a move, plus the byRow branches of
// swordfishTargets and swordfishExplanation, which the column-based curated
// fixtures never reach.
func TestDetectSwordfishFiresOnRowBasedPattern(t *testing.T) {
	b := &testBoard{}
	// Row swordfish for digit 5: rows 0,1,2 x columns 3,4,5.
	for _, idx := range []int{
		idxOf(0, 3), idxOf(0, 4), // row 0: cols 3,4
		idxOf(1, 4), idxOf(1, 5), // row 1: cols 4,5
		idxOf(2, 3), idxOf(2, 5), // row 2: cols 3,5
		idxOf(4, 3), // elimination target: extra 5 in column 3, row 4
	} {
		b.candidates[idx] = b.candidates[idx].Set(5)
	}

	move := DetectSwordfish(b)
	if move == nil {
		t.Fatal("expected row-based Swordfish to fire on rows 0,1,2 / cols 3,4,5")
	}
	if move.Action != "eliminate" || move.Digit != 5 {
		t.Fatalf("expected eliminate of digit 5, got action=%q digit=%d", move.Action, move.Digit)
	}
	var hit bool
	for _, e := range move.Eliminations {
		if e.Row == 4 && e.Col == 3 && e.Digit == 5 {
			hit = true
		}
	}
	if !hit {
		t.Errorf("expected elimination of 5 at R5C4, got %+v", move.Eliminations)
	}
	// The byRow explanation names rows before columns (source lines emerge in
	// non-deterministic map order, so assert the format, not the ordering).
	if want := "Swordfish: 5 in rows "; !strings.HasPrefix(move.Explanation, want) {
		t.Errorf("expected row-oriented explanation prefix %q, got %q", want, move.Explanation)
	}
}

// ============================================================================
// Finned Swordfish: fin-visibility guard (seesAllFins / collectFinnedSwordfishElims)
// ============================================================================

// TestSeesAllFinsRejectsNonPeer covers the negative branch of seesAllFins: a
// candidate cell that is not a peer of a fin cell must not see all fins.
func TestSeesAllFinsRejectsNonPeer(t *testing.T) {
	// Fin at R4C1 (finnedLine=3, finPerp=0). R5C1 shares column 0 -> peer.
	if !seesAllFins(3, []int{0}, idxOf(4, 0), true) {
		t.Error("R5C1 shares column 0 with fin R4C1 and must see it")
	}
	// R5C7 shares no row/col/box with fin R4C1 -> not a peer.
	if seesAllFins(3, []int{0}, idxOf(4, 6), true) {
		t.Error("R5C7 is not a peer of fin R4C1 and must not see all fins")
	}
}

// TestCollectFinnedSwordfishElimsExcludesCellsNotSeeingFin covers the
// fin-visibility guard inside collectFinnedSwordfishElims: within the fin's
// parallel box, a candidate that sees the fin is eliminated while one that does
// not is skipped. Fin sits at R4C1 (finPerps={0}); target columns {0,6} both
// carry digit 7 at R5. R5C1 shares column 0 with the fin (kept); R5C7 shares
// nothing with the fin (skipped via the seesAllFins guard).
func TestCollectFinnedSwordfishElimsExcludesCellsNotSeeingFin(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(4, 0)] = b.candidates[idxOf(4, 0)].Set(7) // R5C1: sees fin
	b.candidates[idxOf(4, 6)] = b.candidates[idxOf(4, 6)].Set(7) // R5C7: does not see fin

	finned := finnedLineInfo{line: 3}
	base1 := finnedLineInfo{line: 0}
	base2 := finnedLineInfo{line: 1}
	elims := collectFinnedSwordfishElims(b, 7, finned, base1, base2, []int{0, 6}, []int{0}, true)

	if len(elims) != 1 {
		t.Fatalf("expected exactly one elimination (the fin-seeing cell), got %+v", elims)
	}
	if elims[0].Row != 4 || elims[0].Col != 0 || elims[0].Digit != 7 {
		t.Errorf("expected elimination at R5C1 digit 7, got %+v", elims[0])
	}
}

// ============================================================================
// BUG: non-BUG+1 shapes return nil
// ============================================================================

// filledExcept builds a board where every cell is a given (digit 1) except the
// listed empty cells, which receive the supplied candidate overrides. This
// isolates a single "extra" cell for BUG detection without every other empty
// cell polluting the extra-cell count.
func filledExcept(overrides map[int][]int) *testBoard {
	var cells [constants.TotalCells]int
	for i := range cells {
		cells[i] = 1
	}
	for idx := range overrides {
		cells[idx] = 0
	}
	return boardFromMap(cells, overrides)
}

// TestDetectBUGNilWhenLoneExtraCellHasFourCandidates covers the guard that a
// BUG+1 requires the single non-bivalue cell to hold exactly three candidates.
// Here the lone extra cell has four, so detection returns nil.
func TestDetectBUGNilWhenLoneExtraCellHasFourCandidates(t *testing.T) {
	b := filledExcept(map[int][]int{idxOf(4, 4): {1, 2, 3, 4}})
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: lone extra cell has 4 candidates, not a BUG+1, got %+v", move)
	}
}

// TestDetectBUGNilWhenNoDigitAppearsThrice covers the fall-through return: the
// lone extra cell is a valid BUG+1 shape (three candidates) but none of its
// digits appears three times in its row, column, or box, so no BUG digit exists
// and detection returns nil.
func TestDetectBUGNilWhenNoDigitAppearsThrice(t *testing.T) {
	b := filledExcept(map[int][]int{idxOf(4, 4): {1, 2, 3}})
	if move := DetectBUG(b); move != nil {
		t.Errorf("expected nil: no candidate of the extra cell appears three times, got %+v", move)
	}
}

// ============================================================================
// ALS: restricted-common absence guard
// ============================================================================

// TestIsRestrictedCommonFalseWhenDigitAbsent covers the guard in
// isRestrictedCommon: a digit present in neither ALS cannot be a restricted
// common, so the function returns false.
func TestIsRestrictedCommonFalseWhenDigitAbsent(t *testing.T) {
	a := ALS{Cells: []int{0}, Digits: []int{1, 2}, ByDigit: map[int][]int{1: {0}, 2: {0}}}
	other := ALS{Cells: []int{1}, Digits: []int{3, 4}, ByDigit: map[int][]int{3: {1}, 4: {1}}}
	if isRestrictedCommon(a, other, 5) {
		t.Error("digit 5 is absent from both ALS and cannot be a restricted common")
	}
}

// ============================================================================
// Death Blossom: helper guards + three-petal firing path
// ============================================================================

// TestFindEliminationDigitsNilOnNoPetals covers the empty-petals guard.
func TestFindEliminationDigitsNilOnNoPetals(t *testing.T) {
	b := &testBoard{}
	if got := findEliminationDigits(b, idxOf(0, 0), nil); got != nil {
		t.Errorf("expected nil elimination digits for empty petal list, got %v", got)
	}
}

// TestFindBlossomEliminationsNilWhenDigitAbsentFromPetals covers the guard that
// returns nil when the elimination digit appears in none of the petals (no
// z-cells to see), so no cell can be eliminated.
func TestFindBlossomEliminationsNilWhenDigitAbsentFromPetals(t *testing.T) {
	b := &testBoard{}
	petal := ALS{Cells: []int{idxOf(0, 1)}, Digits: []int{1, 5}, ByDigit: map[int][]int{1: {idxOf(0, 1)}, 5: {idxOf(0, 1)}}}
	// z=9 is not present in the petal, so ByDigit[9] is empty.
	if move := findBlossomEliminations(b, idxOf(0, 0), []ALS{petal}, 9, []int{1, 2}); move != nil {
		t.Errorf("expected nil: digit 9 is absent from the petals, got %+v", move)
	}
}

// TestTryPetalCombinationsNilForUnsupportedStemSize covers the dispatch default:
// a stem candidate count other than 2 or 3 has no petal-combination strategy and
// returns nil.
func TestTryPetalCombinationsNilForUnsupportedStemSize(t *testing.T) {
	b := &testBoard{}
	if move := tryPetalCombinations(b, idxOf(0, 0), []int{1}, map[int][]ALS{}); move != nil {
		t.Errorf("expected nil for single-candidate stem (no 1-petal strategy), got %+v", move)
	}
}

// TestDetectDeathBlossomFiresWithThreeCandidateStem drives the three-petal
// branch of Death Blossom. Stem R1C1 {1,2,3}; each stem candidate links to a
// bivalue petal sharing digit 5: R1C2 {1,5}, R1C3 {2,5}, R2C1 {3,5}, each seeing
// the stem. Digit 5 appears in all three petals but not the stem, and R3C3
// (which shares box 0 with all three petal cells) carries 5, so 5 is eliminated
// there. This exercises tryThreePetals returning a move.
func TestDetectDeathBlossomFiresWithThreeCandidateStem(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2, 3})    // stem
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 5})       // petal for candidate 1
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 5})       // petal for candidate 2
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{3, 5})       // petal for candidate 3
	b.candidates[idxOf(2, 2)] = NewCandidates([]int{4, 5, 6, 7}) // elimination target (4 cands: forms no ALS)

	move := DetectDeathBlossom(b)
	if move == nil {
		t.Fatal("expected Death Blossom to fire on a three-candidate stem with three petals")
	}
	if move.Action != "eliminate" || move.Digit != 5 {
		t.Fatalf("expected eliminate of digit 5, got action=%q digit=%d", move.Action, move.Digit)
	}
	var hit bool
	for _, e := range move.Eliminations {
		if e.Row == 2 && e.Col == 2 && e.Digit == 5 {
			hit = true
		}
	}
	if !hit {
		t.Errorf("expected elimination of 5 at R3C3, got %+v", move.Eliminations)
	}
}

// ============================================================================
// Sue de Coq: row-oriented firing path + no-elimination guard
// ============================================================================

// TestDetectSueDeCoqFiresOnRowIntersection drives the row branch of Sue de Coq.
// Box 0 / row 0 intersection cells R1C1 {1,2} and R1C2 {3,4} span four
// candidates. The box ALS R2C1 {1,2} covers {1,2}; the row ALS R1C5 {3,4} covers
// {3,4}; together they cover the intersection with no overlap. R3C1 {1,7} loses
// 1 (box elimination) and R1C6 {3,8} loses 3 (row/line elimination). This
// exercises detectSueDeCoqIntersection returning a move on a row and the
// isRow=true branch of sdcLineEliminations, which the column-based curated
// fixture never reaches.
func TestDetectSueDeCoqFiresOnRowIntersection(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2}) // intersection
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{3, 4}) // intersection
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{1, 2}) // box ALS
	b.candidates[idxOf(2, 0)] = NewCandidates([]int{1, 7}) // box elimination target
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{3, 4}) // row (line) ALS
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{3, 8}) // row elimination target

	move := DetectSueDeCoq(b)
	if move == nil {
		t.Fatal("expected Sue de Coq to fire on the box 0 / row 0 intersection")
	}
	var rowElim bool
	for _, e := range move.Eliminations {
		if e.Row == 0 && e.Col == 5 && e.Digit == 3 {
			rowElim = true
		}
	}
	if !rowElim {
		t.Errorf("expected row-line elimination of 3 at R1C6, got %+v", move.Eliminations)
	}
}

// TestDetectSueDeCoqNilWhenPairHasNoEliminations covers the guard where a valid
// Sue de Coq pair (box ALS + line ALS exactly covering the intersection with no
// overlap) yields zero eliminations because no other cell in the box or line
// carries the covered digits. Detection returns nil.
func TestDetectSueDeCoqNilWhenPairHasNoEliminations(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2}) // intersection
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{3, 4}) // intersection
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{1, 2}) // box ALS (no other box cell carries 1/2)
	b.candidates[idxOf(0, 4)] = NewCandidates([]int{3, 4}) // line ALS (no other line cell carries 3/4)

	if move := DetectSueDeCoq(b); move != nil {
		t.Errorf("expected nil: the valid Sue de Coq pair eliminates nothing, got %+v", move)
	}
}
