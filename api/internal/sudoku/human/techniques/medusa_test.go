package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// medusaBoard builds a board carrying exactly the listed cell/candidate sets and
// nothing else, so a 3D Medusa helper sees only the candidates the test placed.
func medusaBoard(cells map[int][]int) *testBoard {
	b := &testBoard{}
	for idx, digits := range cells {
		b.candidates[idx] = NewCandidates(digits)
	}
	return b
}

// ============================================================================
// Candidate pair key packing
// ============================================================================

func TestMedusaCandidatePairKeyPacksCellAndDigitIntoOneInteger(t *testing.T) {
	cases := []struct {
		pair candidatePair
		want int
	}{
		{candidatePair{cell: 0, digit: 1}, 1},
		{candidatePair{cell: 0, digit: 9}, 9},
		{candidatePair{cell: 23, digit: 4}, 2304},
		{candidatePair{cell: 80, digit: 1}, 8001},
		{candidatePair{cell: 80, digit: 9}, 8009},
	}
	for _, tc := range cases {
		if got := tc.pair.key(); got != tc.want {
			t.Errorf("candidatePair%+v.key() = %d, want %d", tc.pair, got, tc.want)
		}
	}
}

func TestMedusaPairFromKeyReversesKeyForEveryCellAndDigit(t *testing.T) {
	for cell := range constants.TotalCells {
		for digit := 1; digit <= constants.GridSize; digit++ {
			want := candidatePair{cell: cell, digit: digit}
			if got := medusaPairFromKey(want.key()); got != want {
				t.Fatalf("medusaPairFromKey(%d) = %+v, want %+v", want.key(), got, want)
			}
		}
	}
}

// ============================================================================
// Peer scanning
// ============================================================================

func TestMedusaSeesAnyDetectsAPeerPastTheFirstCandidate(t *testing.T) {
	// R5C4 shares nothing with R1C1 but shares column 4 with R1C4, so the scan
	// must look past the first entry.
	if !medusaSeesAny(idxOf(4, 3), []int{idxOf(0, 0), idxOf(0, 3)}) {
		t.Error("expected R5C4 to see R1C4 through column 4")
	}
}

func TestMedusaSeesAnyReturnsFalseWhenNoCandidateIsAPeer(t *testing.T) {
	if medusaSeesAny(idxOf(4, 3), []int{idxOf(0, 0), idxOf(8, 8)}) {
		t.Error("expected R5C4 to see neither R1C1 nor R9C9")
	}
}

func TestMedusaSeesAnyDoesNotTreatACellAsItsOwnPeer(t *testing.T) {
	if medusaSeesAny(idxOf(4, 3), []int{idxOf(4, 3)}) {
		t.Error("expected a cell not to see itself")
	}
}

func TestMedusaSeesAnyReturnsFalseForAnEmptyCandidateList(t *testing.T) {
	if medusaSeesAny(idxOf(4, 3), nil) {
		t.Error("expected no peer to be found in an empty list")
	}
}

// ============================================================================
// Target and highlight construction
// ============================================================================

func TestMedusaPairsToTargetsDeduplicatesCellsAndKeepsFirstSeenOrder(t *testing.T) {
	got := pairsToTargets([]candidatePair{
		{cell: idxOf(2, 5), digit: 4},
		{cell: idxOf(2, 5), digit: 7},
		{cell: idxOf(5, 2), digit: 1},
	})
	want := []core.CellRef{{Row: 2, Col: 5}, {Row: 5, Col: 2}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("pairsToTargets = %+v, want %+v", got, want)
	}
}

func TestMedusaPairsToTargetsReturnsNilWithoutPairs(t *testing.T) {
	if got := pairsToTargets(nil); got != nil {
		t.Errorf("pairsToTargets(nil) = %+v, want nil", got)
	}
}

func TestMedusaPairsToTargetsMultiMergesGroupsAndDeduplicatesAcrossThem(t *testing.T) {
	got := pairsToTargetsMulti(
		[]candidatePair{{cell: idxOf(5, 2), digit: 1}, {cell: idxOf(5, 2), digit: 5}},
		[]candidatePair{{cell: idxOf(2, 5), digit: 2}, {cell: idxOf(5, 2), digit: 9}},
	)
	want := []core.CellRef{{Row: 5, Col: 2}, {Row: 2, Col: 5}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("pairsToTargetsMulti = %+v, want %+v", got, want)
	}
}

func TestMedusaPairsToTargetsMultiReturnsNilWhenEveryGroupIsEmpty(t *testing.T) {
	if got := pairsToTargetsMulti(nil, nil); got != nil {
		t.Errorf("pairsToTargetsMulti = %+v, want nil", got)
	}
}

// ============================================================================
// findConjugatePairs
// ============================================================================

func TestMedusaFindConjugatePairsDeduplicatesAPairSharedByTwoUnits(t *testing.T) {
	// R1C1 and R1C2 are the only 5s in both row 1 and box 1, so the pair is
	// offered twice and must be recorded once.
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {5},
		idxOf(0, 1): {5},
	})

	got := findConjugatePairs(b, 5)
	want := [][2]int{{idxOf(0, 0), idxOf(0, 1)}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("findConjugatePairs = %+v, want %+v", got, want)
	}
}

func TestMedusaFindConjugatePairsIgnoresUnitsWithoutExactlyTwoCells(t *testing.T) {
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {5},
		idxOf(0, 1): {5},
		idxOf(0, 2): {5},
	})

	if got := findConjugatePairs(b, 5); got != nil {
		t.Errorf("findConjugatePairs = %+v, want nil for a unit holding three candidates", got)
	}
}

func TestMedusaFindConjugatePairsNormalisesEachPairToAscendingCells(t *testing.T) {
	// R1C4 and R4C4 are the only 4s in column 4; box 1 holds only R1C4.
	b := medusaBoard(map[int][]int{
		idxOf(0, 3): {4},
		idxOf(3, 3): {4},
	})

	got := findConjugatePairs(b, 4)
	want := [][2]int{{idxOf(0, 3), idxOf(3, 3)}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("findConjugatePairs = %+v, want %+v", got, want)
	}
}

// ============================================================================
// Rule 1: two same-colored candidates in one cell
// ============================================================================

func TestCheckSameCellContradictionBuildsTheCompleteEliminationMove(t *testing.T) {
	// Color 1 holds one candidate in R3C6 and two in R5C2. R3C6 sorts first
	// and must be passed over, because only R5C2 carries the contradiction.
	b := medusaBoard(map[int][]int{
		idxOf(2, 5): {3, 9},
		idxOf(4, 1): {4, 8},
		idxOf(6, 8): {5},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(2, 5), digit: 3},
		{cell: idxOf(4, 1), digit: 4},
		{cell: idxOf(4, 1), digit: 8},
	}
	otherColor := []candidatePair{
		{cell: idxOf(2, 5), digit: 9},
		{cell: idxOf(6, 8), digit: 5},
	}

	got := checkSameCellContradiction(b, colorToCheck, otherColor, 1)

	assertMove(t, got, &core.Move{
		Action: "eliminate",
		Digit:  0,
		Targets: []core.CellRef{
			{Row: 2, Col: 5}, {Row: 4, Col: 1}, {Row: 6, Col: 8},
		},
		Eliminations: []core.Candidate{
			{Row: 2, Col: 5, Digit: 3},
			{Row: 4, Col: 1, Digit: 4},
			{Row: 4, Col: 1, Digit: 8},
		},
		Explanation: "3D Medusa: Color 1 has two candidates in R5C2: eliminate all color 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 5}, {Row: 4, Col: 1}},
			Secondary: []core.CellRef{{Row: 2, Col: 5}, {Row: 6, Col: 8}},
		},
	})
}

func TestCheckSameCellContradictionReportsColorTwoInItsExplanation(t *testing.T) {
	// Exactly one of the two contradicting candidates survives on the board, so
	// a single elimination is enough to report the move.
	b := medusaBoard(map[int][]int{
		idxOf(4, 1): {4},
		idxOf(6, 8): {5},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(4, 1), digit: 4},
		{cell: idxOf(4, 1), digit: 8},
	}
	otherColor := []candidatePair{{cell: idxOf(6, 8), digit: 5}}

	got := checkSameCellContradiction(b, colorToCheck, otherColor, 2)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      []core.CellRef{{Row: 4, Col: 1}, {Row: 6, Col: 8}},
		Eliminations: []core.Candidate{{Row: 4, Col: 1, Digit: 4}},
		Explanation:  "3D Medusa: Color 2 has two candidates in R5C2: eliminate all color 2.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 4, Col: 1}},
			Secondary: []core.CellRef{{Row: 6, Col: 8}},
		},
	})
}

func TestCheckSameCellContradictionReturnsNilWhenNothingIsLeftToEliminate(t *testing.T) {
	// The coloring still contradicts itself, but both candidates have already
	// been removed from the board, so there is no move to report.
	b := medusaBoard(map[int][]int{idxOf(4, 1): {1}})
	colorToCheck := []candidatePair{
		{cell: idxOf(4, 1), digit: 4},
		{cell: idxOf(4, 1), digit: 8},
	}

	if got := checkSameCellContradiction(b, colorToCheck, nil, 1); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestCheckSameCellContradictionIgnoresACellHoldingOneColoredCandidate(t *testing.T) {
	b := medusaBoard(map[int][]int{
		idxOf(2, 5): {3},
		idxOf(4, 1): {4},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(2, 5), digit: 3},
		{cell: idxOf(4, 1), digit: 4},
	}

	if got := checkSameCellContradiction(b, colorToCheck, nil, 1); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

// ============================================================================
// Rule 2: two same-colored candidates of one digit in one unit
// ============================================================================

func TestCheckSameUnitContradictionBuildsTheCompleteEliminationMove(t *testing.T) {
	// Color 1 carries digit 4 once and digit 7 twice. Digit 4 sorts first and
	// must be passed over; the two 7s share row 3 and are the contradiction.
	b := medusaBoard(map[int][]int{
		idxOf(2, 5): {7},
		idxOf(2, 7): {7},
		idxOf(4, 1): {4},
		idxOf(6, 8): {5},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(2, 5), digit: 7},
		{cell: idxOf(2, 7), digit: 7},
		{cell: idxOf(4, 1), digit: 4},
	}
	otherColor := []candidatePair{{cell: idxOf(6, 8), digit: 5}}

	got := checkSameUnitContradiction(b, colorToCheck, otherColor, 1)

	assertMove(t, got, &core.Move{
		Action: "eliminate",
		Digit:  0,
		Targets: []core.CellRef{
			{Row: 2, Col: 5}, {Row: 2, Col: 7}, {Row: 4, Col: 1}, {Row: 6, Col: 8},
		},
		Eliminations: []core.Candidate{
			{Row: 2, Col: 5, Digit: 7},
			{Row: 2, Col: 7, Digit: 7},
			{Row: 4, Col: 1, Digit: 4},
		},
		Explanation: "3D Medusa: Color 1 has 7 twice in same unit (R3C6, R3C8): eliminate all color 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 5}, {Row: 2, Col: 7}, {Row: 4, Col: 1}},
			Secondary: []core.CellRef{{Row: 6, Col: 8}},
		},
	})
}

func TestCheckSameUnitContradictionReportsColorTwoInItsExplanation(t *testing.T) {
	b := medusaBoard(map[int][]int{
		idxOf(2, 5): {7},
		idxOf(2, 7): {1},
		idxOf(6, 8): {5},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(2, 5), digit: 7},
		{cell: idxOf(2, 7), digit: 7},
	}
	otherColor := []candidatePair{{cell: idxOf(6, 8), digit: 5}}

	got := checkSameUnitContradiction(b, colorToCheck, otherColor, 2)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      []core.CellRef{{Row: 2, Col: 5}, {Row: 2, Col: 7}, {Row: 6, Col: 8}},
		Eliminations: []core.Candidate{{Row: 2, Col: 5, Digit: 7}},
		Explanation:  "3D Medusa: Color 2 has 7 twice in same unit (R3C6, R3C8): eliminate all color 2.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 5}, {Row: 2, Col: 7}},
			Secondary: []core.CellRef{{Row: 6, Col: 8}},
		},
	})
}

func TestCheckSameUnitContradictionReturnsNilWhenNothingIsLeftToEliminate(t *testing.T) {
	b := medusaBoard(map[int][]int{
		idxOf(2, 5): {1},
		idxOf(2, 7): {1},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(2, 5), digit: 7},
		{cell: idxOf(2, 7), digit: 7},
	}

	if got := checkSameUnitContradiction(b, colorToCheck, nil, 1); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestCheckSameUnitContradictionIgnoresSameDigitCandidatesThatAreNotPeers(t *testing.T) {
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {7},
		idxOf(4, 4): {7},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(0, 0), digit: 7},
		{cell: idxOf(4, 4), digit: 7},
	}

	if got := checkSameUnitContradiction(b, colorToCheck, nil, 1); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

// ============================================================================
// Rule 3: uncolored candidate in a cell holding both colors
// ============================================================================

func TestCheckUncoloredInBicoloredCellEliminatesTheUncoloredCandidate(t *testing.T) {
	// R2C3 carries color 1 only and must be skipped. R5C8 carries color 1
	// (digit 2) and color 2 (digit 6), so its uncolored 9 falls.
	b := medusaBoard(map[int][]int{
		idxOf(1, 2): {2},
		idxOf(4, 7): {2, 6, 9},
		idxOf(6, 3): {1},
	})
	color1 := []candidatePair{
		{cell: idxOf(1, 2), digit: 2},
		{cell: idxOf(4, 7), digit: 2},
	}
	color2 := []candidatePair{
		{cell: idxOf(6, 3), digit: 1},
		{cell: idxOf(4, 7), digit: 6},
	}

	got := checkUncoloredInBicoloredCell(b, color1, color2, nil)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        9,
		Targets:      []core.CellRef{{Row: 4, Col: 7}},
		Eliminations: []core.Candidate{{Row: 4, Col: 7, Digit: 9}},
		Explanation:  "3D Medusa: R5C8 has candidates in both colors: eliminate uncolored 9.",
		Highlights: core.Highlights{
			Primary: []core.CellRef{{Row: 4, Col: 7}},
			Secondary: []core.CellRef{
				{Row: 1, Col: 2}, {Row: 4, Col: 7}, {Row: 6, Col: 3},
			},
		},
	})
}

func TestCheckUncoloredInBicoloredCellReturnsNilWhenEveryCandidateIsColored(t *testing.T) {
	b := medusaBoard(map[int][]int{idxOf(4, 7): {2, 6}})
	color1 := []candidatePair{{cell: idxOf(4, 7), digit: 2}}
	color2 := []candidatePair{{cell: idxOf(4, 7), digit: 6}}

	if got := checkUncoloredInBicoloredCell(b, color1, color2, nil); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestCheckUncoloredInBicoloredCellReturnsNilWhenNoCellHoldsBothColors(t *testing.T) {
	b := medusaBoard(map[int][]int{
		idxOf(1, 2): {2, 9},
		idxOf(6, 3): {1, 9},
	})
	color1 := []candidatePair{{cell: idxOf(1, 2), digit: 2}}
	color2 := []candidatePair{{cell: idxOf(6, 3), digit: 1}}

	if got := checkUncoloredInBicoloredCell(b, color1, color2, nil); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

// ============================================================================
// Rule 4: uncolored candidate seeing its digit in both colors
// ============================================================================

// medusaSeesBothColorsFixture lays out a digit so that both colors carry two
// cells each and the eliminated cell sees only the second entry of each color
// list, which forces the whole list to be scanned.
func medusaSeesBothColorsFixture(digit int) (*testBoard, []candidatePair, []candidatePair) {
	target := idxOf(4, 3)
	color1 := []candidatePair{
		{cell: idxOf(0, 0), digit: digit},
		{cell: idxOf(0, 3), digit: digit},
	}
	color2 := []candidatePair{
		{cell: idxOf(3, 0), digit: digit},
		{cell: idxOf(3, 3), digit: digit},
	}
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {digit},
		idxOf(0, 3): {digit},
		idxOf(3, 0): {digit},
		idxOf(3, 3): {digit},
		target:      {digit},
	})
	return b, color1, color2
}

func TestCheckUncoloredSeesBothColorsEliminatesTheCandidateItSees(t *testing.T) {
	b, color1, color2 := medusaSeesBothColorsFixture(5)

	got := checkUncoloredSeesBothColors(b, color1, color2, nil)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        5,
		Targets:      []core.CellRef{{Row: 4, Col: 3}},
		Eliminations: []core.Candidate{{Row: 4, Col: 3, Digit: 5}},
		Explanation:  "3D Medusa: R5C4 sees 5 in both colors: eliminate 5.",
		Highlights: core.Highlights{
			Primary: []core.CellRef{{Row: 4, Col: 3}},
			Secondary: []core.CellRef{
				{Row: 0, Col: 0}, {Row: 0, Col: 3}, {Row: 3, Col: 0}, {Row: 3, Col: 3},
			},
		},
	})
}

func TestCheckUncoloredSeesBothColorsScansTheLowestDigit(t *testing.T) {
	b, color1, color2 := medusaSeesBothColorsFixture(1)

	got := checkUncoloredSeesBothColors(b, color1, color2, nil)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Targets:      []core.CellRef{{Row: 4, Col: 3}},
		Eliminations: []core.Candidate{{Row: 4, Col: 3, Digit: 1}},
		Explanation:  "3D Medusa: R5C4 sees 1 in both colors: eliminate 1.",
		Highlights: core.Highlights{
			Primary: []core.CellRef{{Row: 4, Col: 3}},
			Secondary: []core.CellRef{
				{Row: 0, Col: 0}, {Row: 0, Col: 3}, {Row: 3, Col: 0}, {Row: 3, Col: 3},
			},
		},
	})
}

func TestCheckUncoloredSeesBothColorsScansTheHighestDigit(t *testing.T) {
	b, color1, color2 := medusaSeesBothColorsFixture(constants.GridSize)

	got := checkUncoloredSeesBothColors(b, color1, color2, nil)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        9,
		Targets:      []core.CellRef{{Row: 4, Col: 3}},
		Eliminations: []core.Candidate{{Row: 4, Col: 3, Digit: 9}},
		Explanation:  "3D Medusa: R5C4 sees 9 in both colors: eliminate 9.",
		Highlights: core.Highlights{
			Primary: []core.CellRef{{Row: 4, Col: 3}},
			Secondary: []core.CellRef{
				{Row: 0, Col: 0}, {Row: 0, Col: 3}, {Row: 3, Col: 0}, {Row: 3, Col: 3},
			},
		},
	})
}

func TestCheckUncoloredSeesBothColorsReturnsNilWhenOnlyOneColorIsSeen(t *testing.T) {
	// The candidate sees color 1 through column 4 but shares no unit with
	// either color 2 cell.
	b := medusaBoard(map[int][]int{
		idxOf(0, 3): {5},
		idxOf(8, 8): {5},
		idxOf(4, 3): {5},
	})
	color1 := []candidatePair{{cell: idxOf(0, 3), digit: 5}}
	color2 := []candidatePair{{cell: idxOf(8, 8), digit: 5}}

	if got := checkUncoloredSeesBothColors(b, color1, color2, nil); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestCheckUncoloredSeesBothColorsReturnsNilWhenADigitIsMissingFromAColor(t *testing.T) {
	b := medusaBoard(map[int][]int{
		idxOf(0, 3): {5},
		idxOf(3, 3): {6},
		idxOf(4, 3): {5, 6},
	})
	color1 := []candidatePair{{cell: idxOf(0, 3), digit: 5}}
	color2 := []candidatePair{{cell: idxOf(3, 3), digit: 6}}

	if got := checkUncoloredSeesBothColors(b, color1, color2, nil); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

// ============================================================================
// Rule 5: uncolored candidate seeing one color with the other in its cell
// ============================================================================

func TestCheckUncoloredSeesColorAndOppositeInCellEliminatesOnColorTwoInCell(t *testing.T) {
	// R3C6 holds color 2 (digit 4) and an uncolored 8 that sees the color 1
	// eight in R3C2 along row 3.
	b := medusaBoard(map[int][]int{
		idxOf(2, 1): {8},
		idxOf(2, 5): {4, 8},
	})
	color1 := []candidatePair{{cell: idxOf(2, 1), digit: 8}}
	color2 := []candidatePair{{cell: idxOf(2, 5), digit: 4}}

	got := checkUncoloredSeesColorAndOppositeInCell(b, color1, color2, nil)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        8,
		Targets:      []core.CellRef{{Row: 2, Col: 5}},
		Eliminations: []core.Candidate{{Row: 2, Col: 5, Digit: 8}},
		Explanation:  "3D Medusa: R3C6 has color 2 and sees 8 in color 1: eliminate 8.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 5}},
			Secondary: []core.CellRef{{Row: 2, Col: 1}, {Row: 2, Col: 5}},
		},
	})
}

func TestCheckUncoloredSeesColorAndOppositeInCellEliminatesOnColorOneInCell(t *testing.T) {
	// R7C3 holds color 1 (digit 3) and an uncolored 7 that sees the color 2
	// seven in R7C9 along row 7.
	b := medusaBoard(map[int][]int{
		idxOf(6, 2): {3, 7},
		idxOf(6, 8): {7},
	})
	color1 := []candidatePair{{cell: idxOf(6, 2), digit: 3}}
	color2 := []candidatePair{{cell: idxOf(6, 8), digit: 7}}

	got := checkUncoloredSeesColorAndOppositeInCell(b, color1, color2, nil)

	assertMove(t, got, &core.Move{
		Action:       "eliminate",
		Digit:        7,
		Targets:      []core.CellRef{{Row: 6, Col: 2}},
		Eliminations: []core.Candidate{{Row: 6, Col: 2, Digit: 7}},
		Explanation:  "3D Medusa: R7C3 has color 1 and sees 7 in color 2: eliminate 7.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 6, Col: 2}},
			Secondary: []core.CellRef{{Row: 6, Col: 2}, {Row: 6, Col: 8}},
		},
	})
}

func TestCheckUncoloredSeesColorAndOppositeInCellReturnsNilWithoutAColorInTheCell(t *testing.T) {
	// R3C6 sees the color 1 eight but carries no color of its own.
	b := medusaBoard(map[int][]int{
		idxOf(2, 1): {8},
		idxOf(2, 5): {8},
	})
	color1 := []candidatePair{{cell: idxOf(2, 1), digit: 8}}

	if got := checkUncoloredSeesColorAndOppositeInCell(b, color1, nil, nil); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestCheckUncoloredSeesColorAndOppositeInCellReturnsNilWhenNoOppositeIsSeen(t *testing.T) {
	// R3C6 holds color 2, but its uncolored 8 shares no unit with the color 1
	// eight in R9C9.
	b := medusaBoard(map[int][]int{
		idxOf(8, 8): {8},
		idxOf(2, 5): {4, 8},
	})
	color1 := []candidatePair{{cell: idxOf(8, 8), digit: 8}}
	color2 := []candidatePair{{cell: idxOf(2, 5), digit: 4}}

	if got := checkUncoloredSeesColorAndOppositeInCell(b, color1, color2, nil); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

// ============================================================================
// Rule 6: a cell whose every candidate carries one color
// ============================================================================

func TestCheckAllCandidatesSameColorBuildsTheCompleteEliminationMove(t *testing.T) {
	// R3C1 carries a single color-1 candidate and must be skipped, because a
	// one-candidate cell cannot have "all" its candidates colored in the sense
	// the rule needs. R3C7 has both its candidates in color 1.
	b := medusaBoard(map[int][]int{
		idxOf(2, 0): {3},
		idxOf(2, 6): {6, 9},
		idxOf(7, 7): {2},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(2, 6), digit: 6},
		{cell: idxOf(2, 6), digit: 9},
		{cell: idxOf(2, 0), digit: 3},
	}
	otherColor := []candidatePair{{cell: idxOf(7, 7), digit: 2}}

	got := checkAllCandidatesSameColor(b, colorToCheck, otherColor, nil, 1)

	assertMove(t, got, &core.Move{
		Action: "eliminate",
		Digit:  0,
		Targets: []core.CellRef{
			{Row: 2, Col: 6}, {Row: 2, Col: 0}, {Row: 7, Col: 7},
		},
		Eliminations: []core.Candidate{
			{Row: 2, Col: 6, Digit: 6},
			{Row: 2, Col: 6, Digit: 9},
			{Row: 2, Col: 0, Digit: 3},
		},
		Explanation: "3D Medusa: R3C7 has all candidates in color 1: eliminate all color 1.",
		Highlights: core.Highlights{
			Primary: []core.CellRef{{Row: 2, Col: 6}},
			Secondary: []core.CellRef{
				{Row: 2, Col: 6}, {Row: 2, Col: 0}, {Row: 7, Col: 7},
			},
		},
	})
}

func TestCheckAllCandidatesSameColorReportsTheSmallestPossibleEliminationSet(t *testing.T) {
	// A two-candidate cell fully inside the color is the minimum that can fire,
	// and it always yields both of that cell's candidates.
	b := medusaBoard(map[int][]int{
		idxOf(2, 6): {6, 9},
		idxOf(7, 7): {2},
	})
	colorToCheck := []candidatePair{
		{cell: idxOf(2, 6), digit: 6},
		{cell: idxOf(2, 6), digit: 9},
	}
	otherColor := []candidatePair{{cell: idxOf(7, 7), digit: 2}}

	got := checkAllCandidatesSameColor(b, colorToCheck, otherColor, nil, 2)

	assertMove(t, got, &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: []core.CellRef{{Row: 2, Col: 6}, {Row: 7, Col: 7}},
		Eliminations: []core.Candidate{
			{Row: 2, Col: 6, Digit: 6},
			{Row: 2, Col: 6, Digit: 9},
		},
		Explanation: "3D Medusa: R3C7 has all candidates in color 2: eliminate all color 2.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 6}},
			Secondary: []core.CellRef{{Row: 2, Col: 6}, {Row: 7, Col: 7}},
		},
	})
}

func TestCheckAllCandidatesSameColorReturnsNilWhenOneCandidateIsUncolored(t *testing.T) {
	b := medusaBoard(map[int][]int{idxOf(2, 6): {6, 9}})
	colorToCheck := []candidatePair{{cell: idxOf(2, 6), digit: 6}}

	if got := checkAllCandidatesSameColor(b, colorToCheck, nil, nil, 1); got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

// ============================================================================
// DetectMedusa3D: rule dispatch order and graph construction
//
// Each board below is built so exactly one rule invocation can produce a move,
// which pins both the color number that invocation passes and the fact that it
// returns immediately rather than falling through to a later rule.
// ============================================================================

// medusaFiveCycleCells is an odd cycle of conjugate links for a single digit:
// R1C1-R1C5 (row 1), R1C5-R4C5 (column 5), R4C5-R4C2 (row 4), R4C2-R2C2
// (column 2), R2C2-R1C1 (box 1). Coloring it puts R4C5 and R4C2 in the same
// color, and they share row 4.
var medusaFiveCycleCells = []int{idxOf(0, 0), idxOf(0, 4), idxOf(3, 4), idxOf(3, 1), idxOf(1, 1)}

func TestDetectMedusa3DReportsASameCellContradictionInColorOne(t *testing.T) {
	// R1C1 keeps three candidates so it is not bivalue. Digit 1 links R1C1-R1C2
	// (row 1) and R1C2-R2C2 (column 2), digit 2 links R1C1-R2C2 (box 1), and
	// R2C2 is bivalue. Both of R1C1's colored candidates land in color 1.
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(0, 1): {1},
		idxOf(1, 1): {1, 2},
	})

	assertMove(t, DetectMedusa3D(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: []core.CellRef{{Row: 0, Col: 0}, {Row: 1, Col: 1}, {Row: 0, Col: 1}},
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 1},
			{Row: 1, Col: 1, Digit: 1},
			{Row: 0, Col: 0, Digit: 2},
		},
		Explanation: "3D Medusa: Color 1 has two candidates in R1C1: eliminate all color 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 0, Col: 0}, {Row: 1, Col: 1}},
			Secondary: []core.CellRef{{Row: 0, Col: 1}, {Row: 1, Col: 1}},
		},
	})
}

func TestDetectMedusa3DReportsASameCellContradictionInColorTwo(t *testing.T) {
	// The same shape with the three-candidate cell moved one step along the
	// chain, so the doubled color is the second one rather than the first.
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {1},
		idxOf(0, 1): {1, 2, 3},
		idxOf(1, 0): {1, 2},
	})

	assertMove(t, DetectMedusa3D(b), &core.Move{
		Action:  "eliminate",
		Digit:   0,
		Targets: []core.CellRef{{Row: 0, Col: 1}, {Row: 1, Col: 0}, {Row: 0, Col: 0}},
		Eliminations: []core.Candidate{
			{Row: 0, Col: 1, Digit: 1},
			{Row: 1, Col: 0, Digit: 1},
			{Row: 0, Col: 1, Digit: 2},
		},
		Explanation: "3D Medusa: Color 2 has two candidates in R1C2: eliminate all color 2.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 0, Col: 1}, {Row: 1, Col: 0}},
			Secondary: []core.CellRef{{Row: 0, Col: 0}, {Row: 1, Col: 0}},
		},
	})
}

func TestDetectMedusa3DReportsASameUnitContradictionInColorOne(t *testing.T) {
	assertMove(t, DetectMedusa3D(medusaDigitOnlyBoard(5, medusaFiveCycleCells)), &core.Move{
		Action: "eliminate",
		Digit:  0,
		Targets: []core.CellRef{
			{Row: 0, Col: 0}, {Row: 3, Col: 4}, {Row: 3, Col: 1},
			{Row: 0, Col: 4}, {Row: 1, Col: 1},
		},
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 5},
			{Row: 3, Col: 4, Digit: 5},
			{Row: 3, Col: 1, Digit: 5},
		},
		Explanation: "3D Medusa: Color 1 has 5 twice in same unit (R4C5, R4C2): eliminate all color 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 0, Col: 0}, {Row: 3, Col: 4}, {Row: 3, Col: 1}},
			Secondary: []core.CellRef{{Row: 0, Col: 4}, {Row: 1, Col: 1}},
		},
	})
}

func TestDetectMedusa3DReportsASameUnitContradictionInColorTwo(t *testing.T) {
	// A five-cycle always places its conflicting edge in the seed's color, so
	// this board hangs a sixth cell off the cycle at a lower index. That cell
	// becomes the seed and shifts every cycle node by one color.
	cells := []int{idxOf(0, 4), idxOf(1, 1), idxOf(1, 5), idxOf(2, 2), idxOf(4, 2), idxOf(4, 5)}

	assertMove(t, DetectMedusa3D(medusaDigitOnlyBoard(5, cells)), &core.Move{
		Action: "eliminate",
		Digit:  0,
		Targets: []core.CellRef{
			{Row: 1, Col: 5}, {Row: 2, Col: 2}, {Row: 4, Col: 2},
			{Row: 0, Col: 4}, {Row: 1, Col: 1}, {Row: 4, Col: 5},
		},
		Eliminations: []core.Candidate{
			{Row: 1, Col: 5, Digit: 5},
			{Row: 2, Col: 2, Digit: 5},
			{Row: 4, Col: 2, Digit: 5},
		},
		Explanation: "3D Medusa: Color 2 has 5 twice in same unit (R3C3, R5C3): eliminate all color 2.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 1, Col: 5}, {Row: 2, Col: 2}, {Row: 4, Col: 2}},
			Secondary: []core.CellRef{{Row: 0, Col: 4}, {Row: 1, Col: 1}, {Row: 4, Col: 5}},
		},
	})
}

func TestDetectMedusa3DEliminatesAnUncoloredCandidateFromABicoloredCell(t *testing.T) {
	// R3C5 and R3C6 share conjugate links on digits 1 and 2, and R3C6 is
	// bivalue, so R3C5 ends up holding both colors. Its third candidate is
	// uncolored and falls.
	b := medusaBoard(map[int][]int{
		idxOf(2, 4): {1, 2, 3},
		idxOf(2, 5): {1, 2},
	})

	assertMove(t, DetectMedusa3D(b), &core.Move{
		Action:       "eliminate",
		Digit:        3,
		Targets:      []core.CellRef{{Row: 2, Col: 4}},
		Eliminations: []core.Candidate{{Row: 2, Col: 4, Digit: 3}},
		Explanation:  "3D Medusa: R3C5 has candidates in both colors: eliminate uncolored 3.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 4}},
			Secondary: []core.CellRef{{Row: 2, Col: 4}, {Row: 2, Col: 5}},
		},
	})
}

func TestDetectMedusa3DEliminatesACandidateSeeingItsDigitInBothColors(t *testing.T) {
	// Both linked cells are bivalue, so neither carries an uncolored candidate
	// and Rule 3 cannot fire. R3C9 holds an uncolored 1 that sees the 1 of each
	// color along row 3.
	b := medusaBoard(map[int][]int{
		idxOf(2, 4): {1, 2},
		idxOf(2, 5): {1, 2},
		idxOf(2, 8): {1, 4, 7},
	})

	assertMove(t, DetectMedusa3D(b), &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Targets:      []core.CellRef{{Row: 2, Col: 8}},
		Eliminations: []core.Candidate{{Row: 2, Col: 8, Digit: 1}},
		Explanation:  "3D Medusa: R3C9 sees 1 in both colors: eliminate 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 8}},
			Secondary: []core.CellRef{{Row: 2, Col: 4}, {Row: 2, Col: 5}},
		},
	})
}

func TestDetectMedusa3DEliminatesACandidateSeeingTheColorOppositeItsOwnCell(t *testing.T) {
	// A four-link chain: digit 1 joins R1C1-R5C1, R5C1 is bivalue on 1 and 3,
	// digit 3 joins R5C1-R5C9, R5C9 is bivalue on 3 and 8, and digit 8 joins
	// R5C9-R1C9. R1C1 therefore carries color 1 on digit 1 while its uncolored
	// 8 sees the color 2 eight in R1C9 along row 1. The two spare 8s keep row 1
	// from forming its own conjugate pair on that digit.
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {1, 8, 9},
		idxOf(0, 4): {8},
		idxOf(0, 8): {8},
		idxOf(4, 0): {1, 3},
		idxOf(4, 8): {3, 8},
	})

	assertMove(t, DetectMedusa3D(b), &core.Move{
		Action:       "eliminate",
		Digit:        8,
		Targets:      []core.CellRef{{Row: 0, Col: 0}},
		Eliminations: []core.Candidate{{Row: 0, Col: 0, Digit: 8}},
		Explanation:  "3D Medusa: R1C1 has color 1 and sees 8 in color 2: eliminate 8.",
		Highlights: core.Highlights{
			Primary: []core.CellRef{{Row: 0, Col: 0}},
			Secondary: []core.CellRef{
				{Row: 0, Col: 0}, {Row: 4, Col: 0}, {Row: 4, Col: 8}, {Row: 0, Col: 8},
			},
		},
	})
}

func TestDetectMedusa3DKeepsScanningAfterAComponentYieldsNothing(t *testing.T) {
	// R1C1 is an isolated bivalue cell whose component carries the lowest keys
	// and produces no move. The eliminating component sits behind it.
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {4, 6},
		idxOf(2, 4): {1, 2},
		idxOf(2, 5): {1, 2},
		idxOf(2, 8): {1, 4, 7},
	})

	assertMove(t, DetectMedusa3D(b), &core.Move{
		Action:       "eliminate",
		Digit:        1,
		Targets:      []core.CellRef{{Row: 2, Col: 8}},
		Eliminations: []core.Candidate{{Row: 2, Col: 8, Digit: 1}},
		Explanation:  "3D Medusa: R3C9 sees 1 in both colors: eliminate 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 2, Col: 8}},
			Secondary: []core.CellRef{{Row: 2, Col: 4}, {Row: 2, Col: 5}},
		},
	})
}

func TestDetectMedusa3DBuildsTheGraphForTheLowestDigit(t *testing.T) {
	assertMove(t, DetectMedusa3D(medusaDigitOnlyBoard(1, medusaFiveCycleCells)), &core.Move{
		Action: "eliminate",
		Digit:  0,
		Targets: []core.CellRef{
			{Row: 0, Col: 0}, {Row: 3, Col: 4}, {Row: 3, Col: 1},
			{Row: 0, Col: 4}, {Row: 1, Col: 1},
		},
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 1},
			{Row: 3, Col: 4, Digit: 1},
			{Row: 3, Col: 1, Digit: 1},
		},
		Explanation: "3D Medusa: Color 1 has 1 twice in same unit (R4C5, R4C2): eliminate all color 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 0, Col: 0}, {Row: 3, Col: 4}, {Row: 3, Col: 1}},
			Secondary: []core.CellRef{{Row: 0, Col: 4}, {Row: 1, Col: 1}},
		},
	})
}

func TestDetectMedusa3DBuildsTheGraphForTheHighestDigit(t *testing.T) {
	assertMove(t, DetectMedusa3D(medusaDigitOnlyBoard(constants.GridSize, medusaFiveCycleCells)), &core.Move{
		Action: "eliminate",
		Digit:  0,
		Targets: []core.CellRef{
			{Row: 0, Col: 0}, {Row: 3, Col: 4}, {Row: 3, Col: 1},
			{Row: 0, Col: 4}, {Row: 1, Col: 1},
		},
		Eliminations: []core.Candidate{
			{Row: 0, Col: 0, Digit: 9},
			{Row: 3, Col: 4, Digit: 9},
			{Row: 3, Col: 1, Digit: 9},
		},
		Explanation: "3D Medusa: Color 1 has 9 twice in same unit (R4C5, R4C2): eliminate all color 1.",
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: 0, Col: 0}, {Row: 3, Col: 4}, {Row: 3, Col: 1}},
			Secondary: []core.CellRef{{Row: 0, Col: 4}, {Row: 1, Col: 1}},
		},
	})
}

func TestDetectMedusa3DReturnsNilWhenTheGraphIsEmpty(t *testing.T) {
	// No cell is bivalue and no digit appears exactly twice in any unit, so no
	// adjacency is built at all.
	b := medusaBoard(map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(4, 4): {4, 5, 6},
	})

	if got := DetectMedusa3D(b); got != nil {
		t.Errorf("expected nil for a board with no medusa graph, got %+v", got)
	}
}
