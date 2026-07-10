package techniques

import (
	"testing"

	"sudoku-api/internal/core"
)

// This file houses behavior-asserting tests that pin down mutation-testing
// escapees in als_chains.go, chains.go, sdc.go, and xwing_finned.go. Each test
// asserts the exact value/elimination/target that a surviving mutant would
// change, so applying the mutation flips the assertion.

// ============================================================================
// chains.go: findChainEndpointElimination path-membership guard
// ============================================================================

// TestFindChainEndpointEliminationSkipsPathCells pins the pathSet membership
// guard. With endpoints in column 0 (idx 0 and idx 72), every other column-0
// cell sees both ends. The intermediate path cell idx 9 (R2C1... actually R2C1
// is idx 10; idx 9 is R2C1? no) also sees both ends and holds the digit, but it
// is part of the chain and must be skipped. The correct elimination is the
// external cell idx 18 (R3C1... R3C1 is idx 19; idx 18 is R3C1? uses R3C1).
// Clearing pathSet (statement/remove) or dropping the continue (branch/if)
// makes the mutant return the lower-indexed path cell idx 9 instead.
func TestFindChainEndpointEliminationSkipsPathCells(t *testing.T) {
	b := &testBoard{}
	// Endpoints and intermediate share column 0; the external target does too.
	for _, idx := range []int{0, 9, 18, 72} {
		b.candidates[idx] = NewCandidates([]int{5})
	}
	// path endpoints: idx 0 (R1C1) and idx 72 (R9C1); intermediate idx 9 (R2C1).
	move := findChainEndpointElimination(b, 5, []int{0, 9, 72}, "X: eliminate %d from R%dC%d.")
	if move == nil {
		t.Fatal("expected an elimination via a column-0 cell seeing both endpoints")
	}
	if len(move.Eliminations) != 1 {
		t.Fatalf("expected exactly one elimination, got %+v", move.Eliminations)
	}
	e := move.Eliminations[0]
	// idx 18 = R3C1 (row 2, col 0 in 0-index). The path cell idx 9 = R2C1
	// (row 1, col 0) must NOT be chosen.
	if e.Row != 2 || e.Col != 0 || e.Digit != 5 {
		t.Errorf("expected elimination at the external cell (row 2, col 0), got %+v", e)
	}
}

// ============================================================================
// chains.go: buildERMove column (byRow=false) explanation branch
// ============================================================================

// TestBuildERMoveColumnBranchExplanation pins the else branch of buildERMove
// (byRow=false). The branch/else and statement/remove mutants blank the
// explanation; the numbers/incrementer mutant shifts targetCol+1 to +2. The
// exact string catches all three.
func TestBuildERMoveColumnBranchExplanation(t *testing.T) {
	b := &testBoard{}
	// target cell (row 2, col 3) must carry the digit for a move to build.
	b.candidates[idxOf(2, 3)] = NewCandidates([]int{5})

	move := buildERMove(b, 5, 0, []int{0, 1}, 2, 3, 4, false)
	if move == nil {
		t.Fatal("expected a column-conjugate Empty Rectangle move")
	}
	want := "Empty Rectangle: 5 in box 1 with conjugate pair in C5: eliminate from R3C4."
	if move.Explanation != want {
		t.Errorf("explanation mismatch:\n got %q\nwant %q", move.Explanation, want)
	}
}

// ============================================================================
// chains.go: W-Wing (first strong-link branch)
// ============================================================================

// wWingBoardFirstBranch builds a W-Wing on candidate pair {1,2}. bv1=R1C1,
// bv2=R4C4; the strong link on digit 1 lives in column 1 (rows 0 and 3), whose
// low-row cell R1C2 sees bv1 and high-row cell R4C2 sees bv2 (first branch).
// Digit 2 is eliminated at R4C1, which sees both bivalue cells.
func wWingBoardFirstBranch() *testBoard {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2}) // bv1
	b.candidates[idxOf(3, 3)] = NewCandidates([]int{1, 2}) // bv2
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 7}) // link cell near bv1 (secondary=0)
	b.candidates[idxOf(3, 1)] = NewCandidates([]int{1, 7}) // link cell near bv2
	b.candidates[idxOf(3, 0)] = NewCandidates([]int{2})    // elimination target (R4C1)
	return b
}

// TestWWingFirstBranchEliminatesCorrectDigitAndTargets pins several W-Wing
// mutants at once via the first strong-link branch:
//   - branch/if elimDigit: the eliminated digit must be 2 (the non-link digit).
//   - numbers/incrementer secondary:=1: the link cell at secondary 0 (R1C2)
//     must be collected, or the strong link (and the whole W-Wing) vanishes.
//   - arithmetic/base and numbers/incrementer on link1: the link1 target must
//     be R1C2 (row 0, col 1); mutants relocate it.
func TestWWingFirstBranchEliminatesCorrectDigitAndTargets(t *testing.T) {
	b := wWingBoardFirstBranch()
	move := DetectWWing(b)
	if move == nil {
		t.Fatal("expected a W-Wing to fire on the first strong-link branch")
	}
	if move.Digit != 2 {
		t.Fatalf("expected eliminated digit 2 (link is on digit 1), got %d", move.Digit)
	}
	if !hasElimination(move.Eliminations, 3, 0, 2) {
		t.Errorf("expected 2 eliminated at R4C1 (row 3, col 0), got %+v", move.Eliminations)
	}
	// link1 = R1C2 (row 0, col 1). Mutants set its column wrong or overwrite
	// link1 with the other link cell, removing this target.
	if !hasTarget(move.Targets, 0, 1) {
		t.Errorf("expected the link1 target at (row 0, col 1), got %+v", move.Targets)
	}
}

// TestWWingSecondBranchEliminatesAtCellZero pins the second strong-link branch.
// bv1=R4C1, bv2=R1C4; the column-1 link's low-row cell sees bv2 and high-row
// cell sees bv1, selecting the else-if branch. Digit 2 is eliminated at R1C1
// (idx 0). Kills the numbers/incrementer link2 overwrite (link2 target must be
// R1C2) and the elim-loop idx:=1 start (which would skip idx 0).
func TestWWingSecondBranchEliminatesAtCellZero(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(3, 0)] = NewCandidates([]int{1, 2}) // bv1
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 2}) // bv2
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 7}) // link cell sees bv2 (row 0)
	b.candidates[idxOf(3, 1)] = NewCandidates([]int{1, 7}) // link cell sees bv1 (row 3)
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{2})    // elimination target at idx 0

	move := DetectWWing(b)
	if move == nil {
		t.Fatal("expected a W-Wing to fire on the second strong-link branch")
	}
	if move.Digit != 2 {
		t.Fatalf("expected eliminated digit 2, got %d", move.Digit)
	}
	if !hasElimination(move.Eliminations, 0, 0, 2) {
		t.Errorf("expected 2 eliminated at R1C1 (idx 0), got %+v", move.Eliminations)
	}
	// link2 = R1C2 (row 0, col 1). The link2 overwrite mutant removes it.
	if !hasTarget(move.Targets, 0, 1) {
		t.Errorf("expected the link2 target at (row 0, col 1), got %+v", move.Targets)
	}
}

// TestWWingSecondBranchLink2Target pins the numbers/incrementer mutant that
// rewrites the else-if link assignment `link1, link2 = cells[1], cells[0]` to
// `cells[1], cells[1]`. The strong link on digit 1 is row 4 at columns {1,5};
// its low-column cell R5C2 sees bv2 (R8C2, col 2... actually col 1) and its
// high-column cell R5C6 sees bv1 (R1C6, col 5), selecting the else-if branch so
// that link2 must be R5C2 (row 4, col 1). The mutant overwrites link2 with the
// other link cell, removing that target.
func TestWWingSecondBranchLink2Target(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 5)] = NewCandidates([]int{1, 2}) // bv1 (lower index)
	b.candidates[idxOf(7, 1)] = NewCandidates([]int{1, 2}) // bv2 (higher index)
	b.candidates[idxOf(4, 1)] = NewCandidates([]int{1, 7}) // link cell: sees bv2 via col 1
	b.candidates[idxOf(4, 5)] = NewCandidates([]int{1, 7}) // link cell: sees bv1 via col 5
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{2})    // elimination target

	move := DetectWWing(b)
	if move == nil {
		t.Fatal("expected a W-Wing via the else-if strong-link branch")
	}
	if move.Digit != 2 || !hasElimination(move.Eliminations, 0, 1, 2) {
		t.Errorf("expected 2 eliminated at R1C2 (row 0, col 1), got digit=%d %+v", move.Digit, move.Eliminations)
	}
	// link2 = R5C2 (row 4, col 1). The link2 overwrite mutant removes it.
	if !hasTarget(move.Targets, 4, 1) {
		t.Errorf("expected the link2 target at (row 4, col 1), got %+v", move.Targets)
	}
}

// TestWWingContinuesPastPeerPair pins the loop/break mutant on the peer-pair
// guard. bv1=R1C1 has a same-digit peer decoy at R1C4 (earlier in scan order),
// then a genuine non-peer partner at R5C5. The guard must `continue` past the
// decoy so the partner is still examined; a `break` abandons the whole inner
// loop and the W-Wing never fires. The strong link (row 1, digits at C1 and C5)
// connects bv1 and the partner but not the decoy.
func TestWWingContinuesPastPeerPair(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2}) // bv1
	b.candidates[idxOf(0, 3)] = NewCandidates([]int{1, 2}) // decoy: peer of bv1 (row 0)
	b.candidates[idxOf(4, 4)] = NewCandidates([]int{1, 2}) // partner: non-peer
	b.candidates[idxOf(1, 0)] = NewCandidates([]int{1, 7}) // link cell sees bv1 (col 0)
	b.candidates[idxOf(1, 4)] = NewCandidates([]int{1, 7}) // link cell sees partner (col 4)
	b.candidates[idxOf(4, 0)] = NewCandidates([]int{2})    // elimination target

	move := DetectWWing(b)
	if move == nil {
		t.Fatal("expected a W-Wing: the peer decoy must be skipped, not break the loop")
	}
	if move.Digit != 2 || !hasElimination(move.Eliminations, 4, 0, 2) {
		t.Errorf("expected 2 eliminated at R5C1 (row 4, col 0), got digit=%d %+v", move.Digit, move.Eliminations)
	}
}

// TestWWingExcludesLink2FromEliminations pins the expression/remove mutant that
// drops `idx == link2` from the elimination exclusion. Here link2 (R2C3) sees
// both bivalue cells and carries the elimination digit 2, so without the
// exclusion the mutant wrongly eliminates 2 at link2. The legitimate
// elimination is at R1C3 only.
func TestWWingExcludesLink2FromEliminations(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2}) // bv1
	b.candidates[idxOf(5, 2)] = NewCandidates([]int{1, 2}) // bv2
	b.candidates[idxOf(1, 1)] = NewCandidates([]int{1, 7}) // link1: sees bv1 via box 0
	b.candidates[idxOf(1, 2)] = NewCandidates([]int{1, 2}) // link2: sees bv1 (box 0) & bv2 (col 2), holds 2
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{2, 8}) // legit elimination target

	move := DetectWWing(b)
	if move == nil {
		t.Fatal("expected a W-Wing to fire")
	}
	if !hasElimination(move.Eliminations, 0, 2, 2) {
		t.Errorf("expected 2 eliminated at R1C3 (row 0, col 2), got %+v", move.Eliminations)
	}
	// link2 = R2C3 (row 1, col 2) must be excluded from eliminations.
	if hasElimination(move.Eliminations, 1, 2, 2) {
		t.Errorf("link2 (row 1, col 2) must not be eliminated, got %+v", move.Eliminations)
	}
}

// ============================================================================
// chains.go: Empty Rectangle column-conjugate strategy (strategy 1)
// ============================================================================

// TestEmptyRectangleFiresViaRowConjugateLeftOfBox pins the expression/remove
// mutant on the in-box column guard of strategy 2 (the row-conjugate strategy,
// where the eliminating column is checked against the box). The Empty Rectangle
// sits in box 1 (columns 3-5), with a row-5 conjugate on digit 5 whose far end
// is at column 0, to the LEFT of the box. The elimination lands at R1C1
// (erRow 0 x linkCol 0). Rewriting `linkCol >= boxColStart` to `true` skips
// every column below the box's right edge (including column 0), so the
// elimination is discarded. A third 5 in column 0 (row 7) breaks the column-0
// conjugate so strategy 1 cannot mask the mutation.
func TestEmptyRectangleFiresViaRowConjugateLeftOfBox(t *testing.T) {
	b := &testBoard{}
	for _, idx := range []int{
		idxOf(0, 3), idxOf(0, 4), idxOf(1, 3), // box-1 ER (pivot R1C4)
		idxOf(5, 0), idxOf(5, 3), // row-5 conjugate (one end at ER col 3)
		idxOf(0, 0), // elimination target (erRow 0 x linkCol 0)
		idxOf(7, 0), // breaks the column-0 conjugate so strategy 1 cannot mask
	} {
		b.candidates[idx] = b.candidates[idx].Set(5)
	}

	move := DetectEmptyRectangle(b)
	if move == nil {
		t.Fatal("expected an Empty Rectangle via a row conjugate reaching left of the box")
	}
	if move.Digit != 5 || !hasElimination(move.Eliminations, 0, 0, 5) {
		t.Errorf("expected 5 eliminated at R1C1 (row 0, col 0), got digit=%d %+v", move.Digit, move.Eliminations)
	}
}

// ============================================================================
// chains.go: X-Chain requires a box-only conjugate edge
// ============================================================================

// TestXChainRequiresBoxConjugateEdge pins the numbers/incrementer mutant that
// starts the box loop of buildConjugateGraph at box 1, skipping box 0. The
// digit-5 chain runs A(R1C1)-B(R3C3)-C(R3C8)-D(R1C8); the A-B link is a box-0
// diagonal conjugate that is not also a row/column conjugate. Endpoints A and D
// share row 0, so the stray 5 at R1C5 (which forms no conjugate of its own) is
// eliminated. Dropping box 0 severs A-B, isolating A, and no even-length chain
// remains, so the elimination disappears entirely.
func TestXChainRequiresBoxConjugateEdge(t *testing.T) {
	b := &testBoard{}
	for _, idx := range []int{
		idxOf(0, 0), idxOf(2, 2), // A-B: box-0 diagonal conjugate
		idxOf(2, 7), // C (row-2 conjugate with B)
		idxOf(0, 7), // D (col-7 conjugate with C; shares row 0 with A)
		idxOf(0, 4), // elimination cell (row 0 sees both endpoints, forms no conjugate)
	} {
		b.candidates[idx] = NewCandidates([]int{5})
	}

	move := DetectXChain(b)
	if move == nil {
		t.Fatal("expected an X-Chain that routes through the box-0 conjugate")
	}
	if move.Digit != 5 {
		t.Errorf("expected digit 5, got %d", move.Digit)
	}
	if !hasElimination(move.Eliminations, 0, 4, 5) {
		t.Errorf("expected 5 eliminated at R1C5 (row 0, col 4), got %+v", move.Eliminations)
	}
}

// ============================================================================
// chains.go: XY-Chain must not add a redundant restricted link (naked pair)
// ============================================================================

// TestXYChainDoesNotUseRedundantNakedPairLink pins the loop/break mutant in the
// adjacency builder. B(R1C2) and C(R1C3) are an identical {1,2} naked pair; the
// break keeps only their first shared-digit edge. Switching to continue adds a
// second edge on digit 2, which fabricates the chain A-B-C-D and a spurious
// elimination of 3 at R4C1. On the original there is no valid XY-chain at all,
// so a nil result is required.
func TestXYChainDoesNotUseRedundantNakedPairLink(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 3}) // A
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2}) // B (naked pair with C)
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 2}) // C (naked pair with B)
	b.candidates[idxOf(3, 2)] = NewCandidates([]int{1, 3}) // D
	b.candidates[idxOf(3, 0)] = NewCandidates([]int{3, 8}) // would-be elimination cell

	if move := DetectXYChain(b); move != nil {
		t.Fatalf("expected no XY-chain (the digit-2 naked-pair link is redundant), got %+v", move)
	}
}

// ============================================================================
// chains.go: Jellyfish line-size ceiling and elimination row scan
// ============================================================================

// TestJellyfishRequiresFourPositionBaseLine pins the expression/comparison
// mutant `len(secondaries) <= 4` -> `< 4`. Row 0 holds digit 7 in exactly four
// columns; excluding four-position lines drops row 0 and leaves only three base
// rows, so the row-oriented Jellyfish cannot form.
func TestJellyfishRequiresFourPositionBaseLine(t *testing.T) {
	b := &testBoard{}
	set := func(r, c int) { b.candidates[idxOf(r, c)] = NewCandidates([]int{7}) }
	set(0, 0)
	set(0, 1)
	set(0, 2)
	set(0, 3) // row 0: four positions {0,1,2,3}
	set(1, 0)
	set(1, 1) // row 1: {0,1}
	set(2, 2)
	set(2, 3) // row 2: {2,3}
	set(3, 1)
	set(3, 2) // row 3: {1,2}
	set(4, 0) // elimination: stray 7 in a covered column, non-base row
	move := detectJellyfishInDirection(b, 7, UnitRow)
	if move == nil {
		t.Fatal("expected a row Jellyfish using the four-position row 0")
	}
	if !hasElimination(move.Eliminations, 4, 0, 7) {
		t.Errorf("expected 7 eliminated at R5C1 (row 4, col 0), got %+v", move.Eliminations)
	}
}

// TestJellyfishScansEliminationRowZero pins the numbers/incrementer mutant that
// starts the elimination row scan at pri=1. The base rows are {1,2,3,4} and the
// sole elimination sits in row 0, so skipping pri=0 erases the only
// elimination and the Jellyfish returns nil.
func TestJellyfishScansEliminationRowZero(t *testing.T) {
	b := &testBoard{}
	set := func(r, c int) { b.candidates[idxOf(r, c)] = NewCandidates([]int{7}) }
	set(1, 0)
	set(1, 1) // row 1: {0,1}
	set(2, 2)
	set(2, 3) // row 2: {2,3}
	set(3, 1)
	set(3, 2) // row 3: {1,2}
	set(4, 0)
	set(4, 3) // row 4: {0,3}
	set(0, 0) // elimination: stray 7 in row 0 (non-base)
	move := detectJellyfishInDirection(b, 7, UnitRow)
	if move == nil {
		t.Fatal("expected a row Jellyfish eliminating in row 0")
	}
	if !hasElimination(move.Eliminations, 0, 0, 7) {
		t.Errorf("expected 7 eliminated at R1C1 (row 0, col 0), got %+v", move.Eliminations)
	}
}

// ============================================================================
// sdc.go: intersection/line-remainder index arithmetic and box guard
// ============================================================================

// TestSDCIntersectionCellsRowIndexing pins the arithmetic/base mutant
// `lineIdx*GridSize` -> `lineIdx/GridSize` in the row branch. Using a non-zero
// row (row 3) makes the multiplication essential; the division collapses every
// index onto row 0.
func TestSDCIntersectionCellsRowIndexing(t *testing.T) {
	b := &testBoard{}
	for _, idx := range []int{idxOf(3, 0), idxOf(3, 1), idxOf(3, 2)} {
		b.candidates[idx] = NewCandidates([]int{5})
	}
	got := sdcIntersectionCells(b, 0, 0, 3, true)
	want := []int{idxOf(3, 0), idxOf(3, 1), idxOf(3, 2)}
	if !equalInts(got, want) {
		t.Errorf("expected row-3 intersection cells %v, got %v", want, got)
	}
}

// TestSDCLineRemainderRowIndexingAndBoxGuard pins two mutants in the row branch
// of sdcLineRemainder: the arithmetic/base index mutant (non-zero row 3) and
// the expression/comparison box-skip mutant (`k >= boxStart` -> `k > boxStart`,
// which would wrongly include the in-box cell at col 0).
func TestSDCLineRemainderRowIndexingAndBoxGuard(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(3, 0)] = NewCandidates([]int{5}) // in-box (col 0) — must be excluded
	b.candidates[idxOf(3, 4)] = NewCandidates([]int{5}) // outside box (col 4)
	got := sdcLineRemainder(b, 0, 0, 3, true)
	want := []int{idxOf(3, 4)}
	if !equalInts(got, want) {
		t.Errorf("expected only the outside-box row-3 cell %v, got %v", want, got)
	}
}

// TestSDCLineRemainderColumnIndexing pins the arithmetic/base mutant
// `k*GridSize` -> `k/GridSize` in the column branch of sdcLineRemainder.
func TestSDCLineRemainderColumnIndexing(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(4, 3)] = NewCandidates([]int{5})
	b.candidates[idxOf(5, 3)] = NewCandidates([]int{5})
	got := sdcLineRemainder(b, 0, 0, 3, false)
	want := []int{idxOf(4, 3), idxOf(5, 3)}
	if !equalInts(got, want) {
		t.Errorf("expected column-3 remainder cells %v, got %v", want, got)
	}
}

// TestFindALSInCellsSizeThreeConsecutive pins the numbers/incrementer mutant
// `j := i + 1` -> `j := i + 2` in the size-3 ALS loop. The three cells form a
// valid 3-cell ALS ({1,2,3},{1,2,4},{1,2,3,4} -> 4 candidates) with no smaller
// ALS subset, so only the i=0,j=1,k=2 enumeration finds it.
func TestFindALSInCellsSizeThreeConsecutive(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2, 3})
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{1, 2, 4})
	b.candidates[idxOf(0, 2)] = NewCandidates([]int{1, 2, 3, 4})
	result := findALSInCells(b, []int{idxOf(0, 0), idxOf(0, 1), idxOf(0, 2)}, []int{1})
	var found bool
	for _, als := range result {
		if len(als.Cells) == 3 {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a 3-cell ALS from the consecutive triple, got %+v", result)
	}
}

// TestAlsFromCellsRejectsZeroOverlap pins the numbers/incrementer mutant
// `Intersect(...) == 0` -> `== 1`. A single {1,2} cell forms a valid ALS shape
// but shares no digit with the {5} intersection set, so it must be rejected.
// The empty-intersection bitmask is 0, never 1, so the mutant stops rejecting.
func TestAlsFromCellsRejectsZeroOverlap(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})
	if als := alsFromCells(b, []int{idxOf(0, 0)}, NewCandidates([]int{5})); als != nil {
		t.Errorf("expected nil: the ALS shares no digit with the intersection, got %+v", als)
	}
}

// ============================================================================
// xwing_finned.go: buildFinnedXWingMove column targets and row explanation
// ============================================================================

// TestBuildFinnedXWingMoveColumnTargetsUseBothPerps pins the numbers/decrementer
// mutant `base.perps[1]` -> `base.perps[0]` in the column (byRow=false) branch.
// Both perpendicular rows must appear as target rows; the mutant collapses r2
// onto r1.
func TestBuildFinnedXWingMoveColumnTargetsUseBothPerps(t *testing.T) {
	base := finnedLineInfo{line: 0, perps: []int{4, 8}}
	fin := finnedLineInfo{line: 1}
	elims := []core.Candidate{{Row: 0, Col: 0, Digit: 5}}
	move := buildFinnedXWingMove(5, base, fin, 2, 3, elims, false)
	if move == nil {
		t.Fatal("expected a finned X-Wing move")
	}
	if !hasTargetRow(move.Targets, 8) {
		t.Errorf("expected a target on the second perp row (8), got %+v", move.Targets)
	}
}

// TestBuildFinnedXWingMoveRowExplanation pins the numbers/decrementer mutant
// `finRowIdx+1` -> `finRowIdx+0` in the row (byRow=true) explanation.
func TestBuildFinnedXWingMoveRowExplanation(t *testing.T) {
	base := finnedLineInfo{line: 0, perps: []int{3, 6}}
	fin := finnedLineInfo{line: 1}
	elims := []core.Candidate{{Row: 0, Col: 0, Digit: 5}}
	move := buildFinnedXWingMove(5, base, fin, 2, 4, elims, true)
	if move == nil {
		t.Fatal("expected a finned X-Wing move")
	}
	want := "Finned X-Wing: 5 in rows 1,2 with fin at R2C3"
	if move.Explanation != want {
		t.Errorf("explanation mismatch:\n got %q\nwant %q", move.Explanation, want)
	}
}

// ============================================================================
// helpers
// ============================================================================

func hasElimination(elims []core.Candidate, row, col, digit int) bool {
	for _, e := range elims {
		if e.Row == row && e.Col == col && e.Digit == digit {
			return true
		}
	}
	return false
}

func hasTarget(targets []core.CellRef, row, col int) bool {
	for _, t := range targets {
		if t.Row == row && t.Col == col {
			return true
		}
	}
	return false
}

func hasTargetRow(targets []core.CellRef, row int) bool {
	for _, t := range targets {
		if t.Row == row {
			return true
		}
	}
	return false
}

func equalInts(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
