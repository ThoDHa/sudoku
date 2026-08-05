package techniques

import (
	"fmt"
	"reflect"
	"slices"
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Whole-Move pinning for the six forcing-chain return sites
//
// Every forcing-chain move carries coordinates twice: once as structured
// CellRef data (Targets, Eliminations, Highlights) and once as one-based text
// inside Explanation. Both are produced by their own arithmetic, so each return
// site is pinned as a complete core.Move rather than by spot-checking an action
// string or a digit.
// ============================================================================

// forcingBivalueContradictionBoard builds the smallest board that drives the
// bivalue-contradiction return of detectCellForcingChain. R5C5 is the only cell
// in row 5 that can hold 9, and the rest of row 5 holds {2..8}, so assuming
// R5C5=1 leaves 9 homeless in the row and the branch contradicts. The bivalue
// cell sits away from the origin so that row and column are distinct non-zero
// values and the coordinate arithmetic in the move is observable.
func forcingBivalueContradictionBoard() *testBoard {
	var cells [constants.TotalCells]int
	overrides := map[int][]int{idxOf(4, 4): {1, 9}}
	for c := range constants.GridSize {
		if c != 4 {
			overrides[idxOf(4, c)] = []int{2, 3, 4, 5, 6, 7, 8}
		}
	}
	return boardFromMap(cells, overrides)
}

func TestDetectCellForcingChainContradictionMoveIsFullyPinned(t *testing.T) {
	got := detectCellForcingChain(forcingBivalueContradictionBoard())
	assertMove(t, got, &core.Move{
		Action:      "assign",
		Digit:       9,
		Targets:     refs([2]int{4, 4}),
		Explanation: "Cell Forcing Chain: If R5C5=1, contradiction follows. Therefore R5C5=9",
		Highlights:  core.Highlights{Primary: refs([2]int{4, 4})},
	})
}

func TestDetectCellForcingChainCommonPlacementMoveIsFullyPinned(t *testing.T) {
	got := detectCellForcingChain(givensBoard(t, 6, "impossible"))
	assertMove(t, got, &core.Move{
		Action:      "assign",
		Digit:       7,
		Targets:     refs([2]int{0, 1}),
		Explanation: "Cell Forcing Chain: All candidates in R5C8 lead to R1C2=7",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 1}),
			Secondary: refs([2]int{4, 7}),
		},
	})
}

func TestDetectCellForcingChainCommonEliminationMoveIsFullyPinned(t *testing.T) {
	got := detectCellForcingChain(boardFromCandidateState(cellElimCells, cellElimCand))
	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        2,
		Targets:      refs([2]int{0, 2}),
		Eliminations: []core.Candidate{{Row: 3, Col: 2, Digit: 2}},
		Explanation:  "Cell Forcing Chain: All candidates in R1C3 lead to eliminating 2 from R4C3",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 2}),
			Secondary: refs([2]int{3, 2}),
		},
	})
}

func TestDetectUnitForcingChainContradictionMoveIsFullyPinned(t *testing.T) {
	got := detectUnitForcingChain(boardFromPuzzleString(forcingChainContradictionBoard))
	assertMove(t, got, &core.Move{
		Action:      "assign",
		Digit:       1,
		Targets:     refs([2]int{8, 1}),
		Explanation: "Unit Forcing Chain: In column 2, 1 at other positions leads to contradiction. R9C2=1",
		Highlights:  core.Highlights{Primary: refs([2]int{8, 1})},
	})
}

func TestDetectUnitForcingChainCommonPlacementMoveIsFullyPinned(t *testing.T) {
	got := detectUnitForcingChain(givensBoard(t, 0, "impossible"))
	assertMove(t, got, &core.Move{
		Action:      "assign",
		Digit:       2,
		Targets:     refs([2]int{0, 4}),
		Explanation: "Unit Forcing Chain: Wherever 1 goes in row 2, R1C5=2",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 4}),
			Secondary: refs([2]int{1, 3}, [2]int{1, 5}),
		},
	})
}

func TestDetectUnitForcingChainCommonEliminationMoveIsFullyPinned(t *testing.T) {
	got := detectUnitForcingChain(boardFromCandidateState(unitElimCells, unitElimCand))
	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      refs([2]int{1, 3}, [2]int{1, 5}),
		Eliminations: []core.Candidate{{Row: 4, Col: 5, Digit: 5}},
		Explanation:  "Unit Forcing Chain: Wherever 1 goes in row 2: eliminate 5 from R5C6.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{1, 3}, [2]int{1, 5}),
			Secondary: refs([2]int{4, 5}),
		},
	})
}

// TestDetectForcingChainPrefersCellChainOverUnitChain pins the dispatch order of
// the public entry point: when a cell forcing chain is available it is returned
// verbatim, without falling through to the unit scan.
func TestDetectForcingChainPrefersCellChainOverUnitChain(t *testing.T) {
	b := forcingBivalueContradictionBoard()
	cell := detectCellForcingChain(b)
	if cell == nil {
		t.Fatal("fixture no longer yields a cell forcing chain")
	}
	assertMove(t, DetectForcingChain(b), cell)
}

// ============================================================================
// forcingCommonPlacement
// ============================================================================

// forcingResultWith builds a propagation result carrying the given placements.
func forcingResultWith(placements map[int]int) *propagationResult {
	r := newPropagationResult()
	for cell, digit := range placements {
		r.placements[cell] = digit
	}
	return r
}

func TestForcingCommonPlacementAgreesOnlyWhenEveryBranchPlacesTheSameDigit(t *testing.T) {
	tests := []struct {
		name       string
		branches   []map[int]int
		wantDigit  int
		wantCommon bool
	}{
		{
			name:       "every branch places the same digit",
			branches:   []map[int]int{{40: 7, 3: 1}, {40: 7}, {40: 7, 9: 2}},
			wantDigit:  7,
			wantCommon: true,
		},
		{
			name:       "single branch is enough to agree",
			branches:   []map[int]int{{40: 4}},
			wantDigit:  4,
			wantCommon: true,
		},
		{
			name:       "last branch disagrees",
			branches:   []map[int]int{{40: 7}, {40: 7}, {40: 3}},
			wantCommon: false,
		},
		{
			name:       "second branch disagrees, so later agreement cannot rescue it",
			branches:   []map[int]int{{40: 7}, {40: 3}, {40: 7}},
			wantCommon: false,
		},
		{
			name:       "first branch leaves the cell unplaced",
			branches:   []map[int]int{{3: 9}, {40: 7}},
			wantCommon: false,
		},
		{
			name:       "last branch leaves the cell unplaced",
			branches:   []map[int]int{{40: 7}, {40: 7}, {3: 9}},
			wantCommon: false,
		},
		{
			name:       "no branches at all",
			branches:   nil,
			wantCommon: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			results := make([]*propagationResult, len(tc.branches))
			for i, p := range tc.branches {
				results[i] = forcingResultWith(p)
			}
			gotDigit, gotCommon := forcingCommonPlacement(results, 40)
			if gotCommon != tc.wantCommon {
				t.Fatalf("common = %v, want %v", gotCommon, tc.wantCommon)
			}
			if tc.wantCommon && gotDigit != tc.wantDigit {
				t.Errorf("digit = %d, want %d", gotDigit, tc.wantDigit)
			}
		})
	}
}

// ============================================================================
// forcingAllBranchesEliminate
// ============================================================================

// forcingElimResult builds a propagation result carrying one recorded
// elimination and one placement, either of which may be omitted with a zero
// cell/digit pair.
func forcingElimResult(elimCell, elimDigit, placeCell, placeDigit int) *propagationResult {
	r := newPropagationResult()
	if elimDigit != 0 {
		r.eliminations[elimCell] = map[int]bool{elimDigit: true}
	}
	if placeDigit != 0 {
		r.placements[placeCell] = placeDigit
	}
	return r
}

func TestForcingAllBranchesEliminateRequiresEveryBranchToRemoveTheDigit(t *testing.T) {
	const target, digit = 40, 5

	recorded := forcingElimResult(target, digit, 0, 0)
	substituted := forcingElimResult(0, 0, target, 8)   // places 8 in the cell
	sameDigit := forcingElimResult(0, 0, target, digit) // places 5, so 5 survives
	untouched := forcingElimResult(3, digit, 7, 8)      // touches other cells only

	tests := []struct {
		name     string
		branches []*propagationResult
		want     bool
	}{
		{"every branch records the elimination", []*propagationResult{recorded, recorded}, true},
		{"a branch placing a different digit counts as eliminating", []*propagationResult{recorded, substituted}, true},
		{"substitution alone is enough for every branch", []*propagationResult{substituted, substituted}, true},
		{"a branch placing the digit itself does not eliminate it", []*propagationResult{recorded, sameDigit}, false},
		{"a branch that neither records nor substitutes fails", []*propagationResult{recorded, untouched}, false},
		{"the first branch failing is enough", []*propagationResult{untouched, recorded}, false},
		{"no branches vacuously eliminate", nil, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := forcingAllBranchesEliminate(tc.branches, target, digit); got != tc.want {
				t.Errorf("forcingAllBranchesEliminate = %v, want %v", got, tc.want)
			}
		})
	}
}

// ============================================================================
// propagateSingles
// ============================================================================

// forcingSolution is a solved grid. Blanking a handful of its cells gives
// propagation fixtures whose placement and elimination sets are small enough to
// pin exactly.
const forcingSolution = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"

// forcingSolvedExcept blanks the listed cells of forcingSolution and gives each
// the supplied candidates, leaving every other cell a given.
func forcingSolvedExcept(blanks map[int][]int) *testBoard {
	var cells [constants.TotalCells]int
	for i, c := range forcingSolution {
		cells[i] = int(c - '0')
	}
	for idx := range blanks {
		cells[idx] = 0
	}
	return boardFromMap(cells, blanks)
}

// forcingPlacements flattens a propagation result's placements for comparison.
func forcingPlacements(r *propagationResult) map[int]int { return r.placements }

// forcingEliminations flattens a propagation result's eliminations into sorted
// digit slices so the whole set can be compared in one assertion.
func forcingEliminations(r *propagationResult) map[int][]int {
	out := make(map[int][]int, len(r.eliminations))
	for cell, digits := range r.eliminations {
		var ds []int
		for d := range digits {
			ds = append(ds, d)
		}
		slices.Sort(ds)
		out[cell] = ds
	}
	return out
}

// TestPropagateSinglesRecordsExactlyTheImpliedPlacementsAndEliminations pins the
// complete propagation result rather than a single flag. R1C1 and R1C2 hold
// {3,5} and R2C1 and R2C2 hold {6,7} on an otherwise solved grid, so assuming
// R1C1=5 cascades through one naked single and two hidden singles. Both maps are
// asserted whole: the eliminations set is what the common-elimination detector
// consumes, and recording an elimination for a cell that never held the digit is
// as wrong as missing one.
func TestPropagateSinglesRecordsExactlyTheImpliedPlacementsAndEliminations(t *testing.T) {
	b := forcingSolvedExcept(map[int][]int{
		idxOf(0, 0): {3, 5}, idxOf(0, 1): {3, 5},
		idxOf(1, 0): {6, 7}, idxOf(1, 1): {6, 7},
	})

	res := propagateSingles(b, idxOf(0, 0), 5, maxPropagationDepth)

	if !res.valid {
		t.Fatal("expected a valid propagation from R1C1=5")
	}
	wantPlacements := map[int]int{idxOf(0, 0): 5, idxOf(0, 1): 3, idxOf(1, 0): 6, idxOf(1, 1): 7}
	if got := forcingPlacements(res); !reflect.DeepEqual(got, wantPlacements) {
		t.Errorf("placements = %v, want %v", got, wantPlacements)
	}
	wantEliminations := map[int][]int{idxOf(0, 1): {5}, idxOf(1, 1): {6}}
	if got := forcingEliminations(res); !reflect.DeepEqual(got, wantEliminations) {
		t.Errorf("eliminations = %v, want %v", got, wantEliminations)
	}
}

// TestPropagateSinglesNakedContradictionStopsImmediately covers the empty-
// candidate contradiction. R5C6 holds only 1, so assuming R5C5=1 strips its last
// candidate. Digit 1 still has homes elsewhere in every unit R5C6 belongs to, so
// the hidden-single scan would not notice: the naked-empty check is the only
// thing that reports the contradiction, and propagation must stop there rather
// than carry on with a cell that can hold nothing.
func TestPropagateSinglesNakedContradictionStopsImmediately(t *testing.T) {
	var cells [constants.TotalCells]int
	b := boardFromMap(cells, map[int][]int{idxOf(4, 4): {1, 2}, idxOf(4, 5): {1}})

	res := propagateSingles(b, idxOf(4, 4), 1, maxPropagationDepth)

	if res.valid {
		t.Fatal("expected a contradiction once R5C6 loses its last candidate")
	}
	wantPlacements := map[int]int{idxOf(4, 4): 1}
	if got := forcingPlacements(res); !reflect.DeepEqual(got, wantPlacements) {
		t.Errorf("placements = %v, want %v (propagation continued past the contradiction)", got, wantPlacements)
	}
}

// TestPropagateSinglesCarriesNakedSinglesIntoLaterRounds pins that a naked
// single counts as progress. Assuming R5C5=1 makes R5C6 a naked 3, and only once
// R5C6 is placed does R1C6 become a naked 4. R1C6 sits at a lower index than
// R5C6, so it is reached only on the following round, which happens only if the
// naked-single pass reports progress.
func TestPropagateSinglesCarriesNakedSinglesIntoLaterRounds(t *testing.T) {
	var cells [constants.TotalCells]int
	b := boardFromMap(cells, map[int][]int{
		idxOf(4, 4): {1, 2}, idxOf(4, 5): {1, 3}, idxOf(0, 5): {3, 4},
	})

	res := propagateSingles(b, idxOf(4, 4), 1, maxPropagationDepth)

	if !res.valid {
		t.Fatal("expected a valid propagation")
	}
	wantPlacements := map[int]int{idxOf(4, 4): 1, idxOf(4, 5): 3, idxOf(0, 5): 4}
	if got := forcingPlacements(res); !reflect.DeepEqual(got, wantPlacements) {
		t.Errorf("placements = %v, want %v", got, wantPlacements)
	}
}

// TestPropagateSinglesPlacesHiddenSingleForDigitOne pins that the hidden-single
// scan starts at digit 1. R5C5 is the only cell in row 5 that can hold 1, so an
// unrelated assumption elsewhere must still leave 1 placed there.
func TestPropagateSinglesPlacesHiddenSingleForDigitOne(t *testing.T) {
	var cells [constants.TotalCells]int
	b := boardFromMap(cells, map[int][]int{idxOf(4, 4): {1, 2}})
	for c := range constants.GridSize {
		if c != 4 {
			b.candidates[idxOf(4, c)] = NewCandidates([]int{2, 3, 4, 5, 6, 7, 8, 9})
		}
	}

	res := propagateSingles(b, idxOf(0, 0), 5, maxPropagationDepth)

	if !res.valid {
		t.Fatal("expected a valid propagation")
	}
	wantPlacements := map[int]int{idxOf(0, 0): 5, idxOf(4, 4): 1}
	if got := forcingPlacements(res); !reflect.DeepEqual(got, wantPlacements) {
		t.Errorf("placements = %v, want %v", got, wantPlacements)
	}
}

// ============================================================================
// Scan bounds: which cells, units and digits each detector considers
// ============================================================================

// forcingNakedSingleCell is a lone-candidate cell every propagation places, so
// any set of branches shares it as a common placement. It anchors the fixtures
// below, which vary only in what the detector is allowed to scan.
var forcingNakedSingleCell = map[int][]int{idxOf(4, 4): {8}}

// forcingCellsWith merges the naked-single anchor with the supplied overrides.
func forcingCellsWith(overrides map[int][]int) *testBoard {
	var cells [constants.TotalCells]int
	merged := make(map[int][]int, len(overrides)+len(forcingNakedSingleCell))
	for k, v := range forcingNakedSingleCell {
		merged[k] = v
	}
	for k, v := range overrides {
		merged[k] = v
	}
	return boardFromMap(cells, merged)
}

// TestDetectCellForcingChainScansTrivalueCells pins the upper end of the
// candidate-count sweep. The only cell worth trying holds three candidates, all
// of which force R5C5=8, so a detector limited to bivalue cells finds nothing.
func TestDetectCellForcingChainScansTrivalueCells(t *testing.T) {
	b := forcingCellsWith(map[int][]int{idxOf(0, 0): {1, 2, 3}})
	assertMove(t, detectCellForcingChain(b), &core.Move{
		Action:      "assign",
		Digit:       8,
		Targets:     refs([2]int{4, 4}),
		Explanation: "Cell Forcing Chain: All candidates in R1C1 lead to R5C5=8",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 4}),
			Secondary: refs([2]int{0, 0}),
		},
	})
}

// TestDetectCellForcingChainIgnoresCellsWithMoreThanThreeCandidates pins the
// other end of the same sweep. R1C1 holds four candidates that would all force
// R5C5=8, and no cell holds two or three, so the detector must decline.
func TestDetectCellForcingChainIgnoresCellsWithMoreThanThreeCandidates(t *testing.T) {
	b := forcingCellsWith(map[int][]int{idxOf(0, 0): {1, 2, 3, 4}})
	if move := detectCellForcingChain(b); move != nil {
		t.Fatalf("expected nil for a four-candidate cell, got %+v", move)
	}
}

// TestDetectCellForcingChainIgnoresSingleCandidateCells pins the lower end.
// R5C5 holds one candidate; treating it as a forcing hypothesis would make its
// own single branch trivially unanimous and yield a move about a cell that is
// already determined. The move must instead come from the trivalue cell.
func TestDetectCellForcingChainIgnoresSingleCandidateCells(t *testing.T) {
	b := forcingCellsWith(map[int][]int{idxOf(0, 0): {1, 2, 3}})
	move := detectCellForcingChain(b)
	if move == nil {
		t.Fatal("expected a move from the trivalue cell")
	}
	if move.Explanation != "Cell Forcing Chain: All candidates in R1C1 lead to R5C5=8" {
		t.Errorf("move came from the wrong cell: %q", move.Explanation)
	}
}

// TestDetectCellForcingChainIgnoresFilledCellsCarryingCandidates pins that the
// sweep is gated on the cell being empty, not merely on its candidate count.
// R1C1 already holds 5 while stale candidate data still lists {1,2} for it;
// propagating from a cell that is already decided would invent a conclusion.
func TestDetectCellForcingChainIgnoresFilledCellsCarryingCandidates(t *testing.T) {
	var cells [constants.TotalCells]int
	cells[idxOf(0, 0)] = 5
	b := boardFromMap(cells, forcingNakedSingleCell)
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{1, 2})

	if move := detectCellForcingChain(b); move != nil {
		t.Fatalf("expected nil for a filled cell with stale candidates, got %+v", move)
	}
}

// forcingPartiallyInvalidTrivalueBoard gives R1C1 three candidates of which
// exactly one (2) contradicts, because R9C1 can only hold 2. R1C5 is a second
// trivalue cell whose three branches are all valid. Both cells force R5C5=8, so
// the two are distinguishable only by which cell the move names.
func forcingPartiallyInvalidTrivalueBoard() *testBoard {
	return forcingCellsWith(map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(0, 4): {4, 5, 6},
		idxOf(8, 0): {2},
	})
}

// TestDetectCellForcingChainSkipsPartiallyContradictedCellAndKeepsScanning pins
// two things at once: a cell whose branches do not all survive is passed over
// rather than used, and passing it over does not abandon the rest of the sweep.
// The move must therefore name R1C5, the later fully valid cell.
func TestDetectCellForcingChainSkipsPartiallyContradictedCellAndKeepsScanning(t *testing.T) {
	assertMove(t, detectCellForcingChain(forcingPartiallyInvalidTrivalueBoard()), &core.Move{
		Action:      "assign",
		Digit:       8,
		Targets:     refs([2]int{4, 4}),
		Explanation: "Cell Forcing Chain: All candidates in R1C5 lead to R5C5=8",
		Highlights: core.Highlights{
			Primary:   refs([2]int{4, 4}),
			Secondary: refs([2]int{0, 4}),
		},
	})
}

// forcingUnitPositionsBoard puts digit 9 in exactly n cells of row 1 and gives
// the rest of that row {1..8}. Every other cell keeps all nine candidates, so
// row 1 and digit 9 are the only unit/digit pair with a small position count.
func forcingUnitPositionsBoard(n int, extra map[int][]int) *testBoard {
	var cells [constants.TotalCells]int
	overrides := make(map[int][]int, constants.GridSize+len(extra))
	for c := range constants.GridSize {
		if c < n {
			overrides[idxOf(0, c)] = []int{7, 8, 9}
		} else {
			overrides[idxOf(0, c)] = []int{1, 2, 3, 4, 5, 6, 7, 8}
		}
	}
	for k, v := range extra {
		overrides[k] = v
	}
	return boardFromMap(cells, overrides)
}

// forcingUnitEliminationMove is what forcingUnitPositionsBoard yields for n
// positions: whichever of them takes the 9, R2C1 loses its own 9.
func forcingUnitEliminationMove(n int) *core.Move {
	positions := make([][2]int, n)
	for i := range n {
		positions[i] = [2]int{0, i}
	}
	return &core.Move{
		Action:       "eliminate",
		Digit:        9,
		Targets:      refs(positions...),
		Eliminations: []core.Candidate{{Row: 1, Col: 0, Digit: 9}},
		Explanation:  "Unit Forcing Chain: Wherever 9 goes in row 1: eliminate 9 from R2C1.",
		Highlights: core.Highlights{
			Primary:   refs(positions...),
			Secondary: refs([2]int{1, 0}),
		},
	}
}

// TestDetectUnitForcingChainAcceptsTwoAndThreePositionUnits pins the accepted
// width of a unit forcing chain. Both ends of the 2..3 range must fire.
func TestDetectUnitForcingChainAcceptsTwoAndThreePositionUnits(t *testing.T) {
	for _, n := range []int{2, 3} {
		t.Run(fmt.Sprintf("%d positions", n), func(t *testing.T) {
			b := forcingUnitPositionsBoard(n, nil)
			assertMove(t, detectUnitForcingChain(b), forcingUnitEliminationMove(n))
		})
	}
}

// TestDetectUnitForcingChainRejectsSinglePositionUnits pins the lower bound. A
// digit with one home in a unit is a hidden single, not a forcing chain, and
// must not be reported as one here.
func TestDetectUnitForcingChainRejectsSinglePositionUnits(t *testing.T) {
	b := forcingUnitPositionsBoard(1, nil)
	if move := detectUnitForcingChain(b); move != nil {
		t.Fatalf("expected nil for a single-position unit, got %+v", move)
	}
}

// TestDetectUnitForcingChainRejectsFourPositionUnits pins the upper bound. Row 1
// has four homes for 9 and every branch forces R9C9=5, so relaxing the bound
// would produce a move; the detector must decline instead.
func TestDetectUnitForcingChainRejectsFourPositionUnits(t *testing.T) {
	b := forcingUnitPositionsBoard(4, map[int][]int{idxOf(8, 8): {5}})
	if move := detectUnitForcingChain(b); move != nil {
		t.Fatalf("expected nil for a four-position unit, got %+v", move)
	}
}

// TestTryUnitForcingChainSinglePositionReportsTheForcedPlacement pins the
// degenerate direct call. With one position there is nothing to contradict, so
// the surviving-position shortcut must not fire and the move must come from the
// common-placement path, which words its explanation differently.
func TestTryUnitForcingChainSinglePositionReportsTheForcedPlacement(t *testing.T) {
	b := forcingUnitPositionsBoard(1, nil)
	assertMove(t, tryUnitForcingChain(b, 9, []int{idxOf(0, 0)}, "row 1"), &core.Move{
		Action:      "assign",
		Digit:       9,
		Targets:     refs([2]int{0, 0}),
		Explanation: "Unit Forcing Chain: Wherever 9 goes in row 1, R1C1=9",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}),
			Secondary: refs([2]int{0, 0}),
		},
	})
}

// TestTryUnitForcingChainEliminatesTheLowestDigit pins that the elimination
// sweep starts at digit 1. Row 1 has two homes for 1 and both strip 1 from
// R2C1, so a sweep starting at 2 would miss the only conclusion available.
func TestTryUnitForcingChainEliminatesTheLowestDigit(t *testing.T) {
	var cells [constants.TotalCells]int
	overrides := map[int][]int{}
	for c := range constants.GridSize {
		if c < 2 {
			overrides[idxOf(0, c)] = []int{1, 2, 3}
		} else {
			overrides[idxOf(0, c)] = []int{2, 3, 4, 5, 6, 7, 8, 9}
		}
	}
	b := boardFromMap(cells, overrides)

	assertMove(t, detectUnitForcingChain(b), &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}),
		Eliminations: []core.Candidate{{Row: 1, Col: 0, Digit: 1}},
		Explanation:  "Unit Forcing Chain: Wherever 1 goes in row 1: eliminate 1 from R2C1.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 1}),
			Secondary: refs([2]int{1, 0}),
		},
	})
}

// TestMaxPropagationDepthIsTwelve pins the propagation budget. The constant is a
// deliberate cost ceiling rather than a derived value, and changing it silently
// changes how deep every forcing hypothesis is allowed to reach.
func TestMaxPropagationDepthIsTwelve(t *testing.T) {
	const wantDepth = 12
	if maxPropagationDepth != wantDepth {
		t.Errorf("maxPropagationDepth = %d, want %d", maxPropagationDepth, wantDepth)
	}
}

// TestTryUnitForcingChainAbandonsPartiallyContradictedPositionSets pins that a
// position set in which some but not all branches survive yields nothing. Row 1
// has three homes for 9; the first contradicts because R9C1 can only hold 9,
// while all three branches agree on R5C5=8. That agreement must not be reported,
// because it rests on a branch already known to be impossible.
func TestTryUnitForcingChainAbandonsPartiallyContradictedPositionSets(t *testing.T) {
	b := forcingUnitPositionsBoard(3, map[int][]int{idxOf(4, 4): {8}, idxOf(8, 0): {9}})
	if move := tryUnitForcingChain(b, 9, []int{idxOf(0, 0), idxOf(0, 1), idxOf(0, 2)}, "row 1"); move != nil {
		t.Fatalf("expected nil when only two of three positions survive, got %+v", move)
	}
}

// TestTryUnitForcingChainSkipsFilledEliminationTargets pins that the elimination
// sweep only considers empty cells. R2C1 is already solved as 4 while stale
// candidate data still lists 9 for it, so the elimination must move on to R2C2
// rather than propose stripping a candidate from a decided cell.
func TestTryUnitForcingChainSkipsFilledEliminationTargets(t *testing.T) {
	b := forcingUnitPositionsBoard(2, nil)
	b.cells[idxOf(1, 0)] = 4

	assertMove(t, detectUnitForcingChain(b), &core.Move{
		Action:       "eliminate",
		Digit:        9,
		Targets:      refs([2]int{0, 0}, [2]int{0, 1}),
		Eliminations: []core.Candidate{{Row: 1, Col: 1, Digit: 9}},
		Explanation:  "Unit Forcing Chain: Wherever 9 goes in row 1: eliminate 9 from R2C2.",
		Highlights: core.Highlights{
			Primary:   refs([2]int{0, 0}, [2]int{0, 1}),
			Secondary: refs([2]int{1, 1}),
		},
	})
}

// TestPropagateSinglesLeavesAlreadyPlacedDigitsAlone pins the hidden-single
// guard against a digit that a unit already holds. R1C9 is solved as 5 while
// R1C1 still lists 5 as a stale candidate, making R1C1 the single remaining
// "position" for 5 in row 1. Row 1 already has its 5, so nothing may be placed
// at R1C1 on that basis.
func TestPropagateSinglesLeavesAlreadyPlacedDigitsAlone(t *testing.T) {
	var cells [constants.TotalCells]int
	cells[idxOf(0, 8)] = 5
	overrides := map[int][]int{idxOf(0, 0): {3, 5}, idxOf(4, 4): {1, 2}}
	for c := 1; c <= 7; c++ {
		overrides[idxOf(0, c)] = []int{1, 2, 3, 4, 6, 7, 8, 9}
	}
	b := boardFromMap(cells, overrides)

	res := propagateSingles(b, idxOf(4, 4), 1, maxPropagationDepth)

	if !res.valid {
		t.Fatal("expected a valid propagation")
	}
	wantPlacements := map[int]int{idxOf(4, 4): 1}
	if got := forcingPlacements(res); !reflect.DeepEqual(got, wantPlacements) {
		t.Errorf("placements = %v, want %v", got, wantPlacements)
	}
}
