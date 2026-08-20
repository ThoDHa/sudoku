package techniques

import (
	"reflect"
	"testing"

	"sudoku-api/internal/core"
)

// swordfishBoard builds a board carrying digit at each listed (row, col).
func swordfishBoard(digit int, cells ...[2]int) *testBoard {
	b := &testBoard{}
	for _, c := range cells {
		idx := idxOf(c[0], c[1])
		b.candidates[idx] = b.candidates[idx].Set(digit)
	}
	return b
}

// ============================================================================
// Explanation formatting
// ============================================================================

// TestSwordfishExplanationFormatsBothAxes pins every coordinate the Swordfish
// explanation prints. The line and perpendicular indices are pairwise distinct
// and none is 0, so a wrong index, a wrong offset or a swapped axis all produce
// a different string.
func TestSwordfishExplanationFormatsBothAxes(t *testing.T) {
	lines := []int{1, 4, 6}
	perps := []int{2, 5, 7}

	if got, want := swordfishExplanation(3, lines, perps, true),
		"Swordfish: 3 in rows 2,5,7 columns 3,6,8"; got != want {
		t.Errorf("byRow explanation = %q, want %q", got, want)
	}

	if got, want := swordfishExplanation(3, lines, perps, false),
		"Swordfish: 3 in columns 2,5,7 rows 3,6,8"; got != want {
		t.Errorf("byCol explanation = %q, want %q", got, want)
	}
}

// TestFinnedSwordfishExplanationFormatsBothAxes pins every coordinate the
// Finned Swordfish explanation prints, including the fin cell reference whose
// row and column swap between the two axes.
func TestFinnedSwordfishExplanationFormatsBothAxes(t *testing.T) {
	lineIndices := []int{1, 4, 6}
	const finnedLine, firstFinPerp = 6, 2

	if got, want := finnedSwordfishExplanation(3, lineIndices, finnedLine, firstFinPerp, true),
		"Finned Swordfish: 3 in rows 2,5,7 with fin at R7C3"; got != want {
		t.Errorf("byRow explanation = %q, want %q", got, want)
	}
	if got, want := finnedSwordfishExplanation(3, lineIndices, finnedLine, firstFinPerp, false),
		"Finned Swordfish: 3 in columns 2,5,7 with fin at R3C7"; got != want {
		t.Errorf("byCol explanation = %q, want %q", got, want)
	}
}

// ============================================================================
// Line collection windows
// ============================================================================

// TestSwordfishLinePositionsAdmitsTwoAndThreeCandidateLines pins the exact map
// swordfishLinePositions returns for a board holding lines with 0, 1, 2, 3 and
// 4 candidate positions. Only the 2- and 3-position lines belong in the result,
// and the same board read along the other axis pins the transposed indexing.
func TestSwordfishLinePositionsAdmitsTwoAndThreeCandidateLines(t *testing.T) {
	b := swordfishBoard(5,
		[2]int{2, 4},               // row 2: one position
		[2]int{3, 2}, [2]int{3, 6}, // row 3: two positions
		[2]int{4, 1}, [2]int{4, 3}, [2]int{4, 8}, // row 4: three positions
		[2]int{5, 0}, [2]int{5, 2}, [2]int{5, 4}, [2]int{5, 6}, // row 5: four positions
	)

	wantRows := map[int][]int{3: {2, 6}, 4: {1, 3, 8}}
	if got := swordfishLinePositions(b, 5, true); !reflect.DeepEqual(got, wantRows) {
		t.Errorf("byRow positions = %v, want %v", got, wantRows)
	}

	wantCols := map[int][]int{2: {3, 5}, 4: {2, 5}, 6: {3, 5}}
	if got := swordfishLinePositions(b, 5, false); !reflect.DeepEqual(got, wantCols) {
		t.Errorf("byCol positions = %v, want %v", got, wantCols)
	}
}

// TestCollectFinnedLinesAdmitsTwoToFourCandidateLines pins the exact slice
// collectFinnedLines returns for a board holding lines with 1, 2, 3, 4 and 5
// candidate positions. The finned search widens the window to four, so the
// 4-position line belongs in the result while the 5-position one does not.
func TestCollectFinnedLinesAdmitsTwoToFourCandidateLines(t *testing.T) {
	b := swordfishBoard(5,
		[2]int{1, 4},               // row 1: one position
		[2]int{2, 1}, [2]int{2, 5}, // row 2: two positions
		[2]int{3, 0}, [2]int{3, 2}, [2]int{3, 7}, // row 3: three positions
		[2]int{4, 1}, [2]int{4, 3}, [2]int{4, 5}, [2]int{4, 8}, // row 4: four positions
		[2]int{5, 0}, [2]int{5, 2}, [2]int{5, 4}, [2]int{5, 6}, [2]int{5, 8}, // row 5: five
	)

	wantRows := []finnedLineInfo{
		{line: 2, perps: []int{1, 5}},
		{line: 3, perps: []int{0, 2, 7}},
		{line: 4, perps: []int{1, 3, 5, 8}},
	}
	if got := collectFinnedLines(b, 5, true); !reflect.DeepEqual(got, wantRows) {
		t.Errorf("byRow lines = %+v, want %+v", got, wantRows)
	}

	wantCols := []finnedLineInfo{
		{line: 0, perps: []int{3, 5}},
		{line: 1, perps: []int{2, 4}},
		{line: 2, perps: []int{3, 5}},
		{line: 4, perps: []int{1, 5}},
		{line: 5, perps: []int{2, 4}},
		{line: 8, perps: []int{4, 5}},
	}
	if got := collectFinnedLines(b, 5, false); !reflect.DeepEqual(got, wantCols) {
		t.Errorf("byCol lines = %+v, want %+v", got, wantCols)
	}
}

// ============================================================================
// Fin geometry helpers
// ============================================================================

// TestFinsInSameBoxAxis pins finsInSameBoxAxis across the whole input range.
// The empty and single-fin cases matter as much as the multi-fin ones: they are
// what makes the indexing inside the function observable, since any mutant that
// shifts finPerps[0] or the slice bound panics on them rather than returning a
// wrong answer.
func TestFinsInSameBoxAxis(t *testing.T) {
	cases := []struct {
		name     string
		finPerps []int
		want     bool
	}{
		{"no fins", nil, true},
		{"single fin", []int{5}, true},
		{"two fins in the same box", []int{3, 4}, true},
		{"three fins in the last box", []int{6, 7, 8}, true},
		{"two fins in adjacent boxes", []int{2, 3}, false},
		{"two fins in distant boxes", []int{0, 4}, false},
		{"third fin leaves the box", []int{0, 1, 4}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := finsInSameBoxAxis(tc.finPerps); got != tc.want {
				t.Errorf("finsInSameBoxAxis(%v) = %v, want %v", tc.finPerps, got, tc.want)
			}
		})
	}
}

// TestSeesAllFinsIndexesBothAxes pins the fin cell index seesAllFins computes.
// The fin lands on (row 4, col 3) under byRow and on (row 3, col 4) under byCol,
// both away from row 0 and column 0, so dropping, negating or dividing either
// term selects a different cell. The probe at (row 4, col 4) is a peer of both
// true fin cells and of none of the cells the mutated arithmetic would pick.
func TestSeesAllFinsIndexesBothAxes(t *testing.T) {
	const finnedLine, finPerp = 4, 3
	probe := idxOf(4, 4)

	if !seesAllFins(finnedLine, []int{finPerp}, probe, true) {
		t.Error("R5C5 shares row 5 with the byRow fin at R5C4 and must see it")
	}
	if seesAllFins(finnedLine, []int{finPerp}, idxOf(0, 8), true) {
		t.Error("R1C9 shares no unit with the byRow fin at R5C4 and must not see it")
	}

	if !seesAllFins(finnedLine, []int{finPerp}, probe, false) {
		t.Error("R5C5 shares column 5 with the byCol fin at R4C5 and must see it")
	}
	if seesAllFins(finnedLine, []int{finPerp}, idxOf(8, 0), false) {
		t.Error("R9C1 shares no unit with the byCol fin at R4C5 and must not see it")
	}

	// Every fin must be seen, not just the first. R6C5 sees the fin at R5C4
	// through box 5 but shares nothing with a second fin at R5C9.
	if seesAllFins(finnedLine, []int{finPerp, 8}, idxOf(5, 4), true) {
		t.Error("R6C5 does not see the second fin at R5C9 and must fail the check")
	}
	if !seesAllFins(finnedLine, []int{finPerp}, idxOf(5, 4), true) {
		t.Error("R6C5 does see the lone fin at R5C4")
	}
}

// ============================================================================
// Swordfish: whole-move contract
// ============================================================================

// swordfishRowPatternBoard builds a row Swordfish on rows 1,2,6 x columns
// 1,3,5, plus a decoy row 4 whose two positions (columns 0 and 7) make every
// triple containing it project onto five columns rather than three. The decoy
// sorts between the second and third source rows, so the scan must keep
// examining triples after a mismatch instead of abandoning the row.
// Eliminations sit at R9C4 and R6C6.
func swordfishRowPatternBoard(digit int) *testBoard {
	return swordfishBoard(digit,
		[2]int{1, 1}, [2]int{1, 3},
		[2]int{2, 3}, [2]int{2, 5},
		[2]int{4, 0}, [2]int{4, 7}, // decoy line
		[2]int{6, 1}, [2]int{6, 5},
		[2]int{8, 3}, [2]int{5, 5}, // elimination targets
	)
}

// TestDetectSwordfishRowPatternWholeMove pins the complete Move a row Swordfish
// produces: the elimination list and its order, the highlighted source cells in
// the order swordfishTargets emits them, and the explanation. The decoy row also
// makes this the kill for a scan that stops at the first triple whose columns do
// not line up.
func TestDetectSwordfishRowPatternWholeMove(t *testing.T) {
	got := DetectSwordfish(swordfishRowPatternBoard(4))
	targets := refs([2]int{1, 1}, [2]int{1, 3}, [2]int{2, 3}, [2]int{2, 5}, [2]int{6, 1}, [2]int{6, 5})
	assertMove(t, got, &core.Move{
		Action:      "eliminate",
		Digit:       4,
		Targets:     targets,
		Explanation: "Swordfish: 4 in rows 2,3,7 columns 2,4,6",
		Eliminations: []core.Candidate{
			{Row: 8, Col: 3, Digit: 4},
			{Row: 5, Col: 5, Digit: 4},
		},
		Highlights: core.Highlights{Primary: targets},
	})
}

// TestDetectSwordfishScansEveryDigit covers both ends of the digit loop. The
// same row pattern is built for digit 1 and digit 9, so a scan that starts one
// digit late or stops one digit early finds nothing.
func TestDetectSwordfishScansEveryDigit(t *testing.T) {
	for _, digit := range []int{1, 9} {
		if move := DetectSwordfish(swordfishRowPatternBoard(digit)); move == nil {
			t.Errorf("expected a Swordfish on digit %d", digit)
		} else if move.Digit != digit {
			t.Errorf("expected digit %d, got %d", digit, move.Digit)
		}
	}
}

// TestDetectSwordfishColumnPatternWholeMove pins the complete Move a column
// Swordfish produces. The board is the row pattern transposed, and no row
// projects onto three columns, so the column scan is the one that fires and the
// byCol branches of swordfishTargets and collectSwordfishElims are the ones
// under test.
func TestDetectSwordfishColumnPatternWholeMove(t *testing.T) {
	b := swordfishBoard(4,
		[2]int{1, 2}, [2]int{3, 2},
		[2]int{3, 4}, [2]int{5, 4},
		[2]int{1, 6}, [2]int{5, 6},
		[2]int{3, 7}, [2]int{5, 8}, // elimination targets
	)
	targets := refs([2]int{1, 2}, [2]int{3, 2}, [2]int{3, 4}, [2]int{5, 4}, [2]int{1, 6}, [2]int{5, 6})
	assertMove(t, DetectSwordfish(b), &core.Move{
		Action:      "eliminate",
		Digit:       4,
		Targets:     targets,
		Explanation: "Swordfish: 4 in columns 3,5,7 rows 2,4,6",
		Eliminations: []core.Candidate{
			{Row: 3, Col: 7, Digit: 4},
			{Row: 5, Col: 8, Digit: 4},
		},
		Highlights: core.Highlights{Primary: targets},
	})
}

// TestSwordfishAxisScanNeedsThreeQualifyingLines pins the behavior that used to
// sit behind an explicit `len(lines) < 3` guard. The innermost loop bound
// `k := j + 1; k < len(lines)` yields no iteration below three lines, so the
// scan returns nil on its own; these cases hold that contract in place.
func TestSwordfishAxisScanNeedsThreeQualifyingLines(t *testing.T) {
	if move := detectSwordfishInAxis(&testBoard{}, 4, true); move != nil {
		t.Errorf("expected nil on an empty board, got %+v", move)
	}
	// Two qualifying rows projecting onto exactly two columns: a valid X-Wing,
	// never a Swordfish.
	two := swordfishBoard(4,
		[2]int{1, 1}, [2]int{1, 3},
		[2]int{2, 1}, [2]int{2, 3},
		[2]int{5, 1},
	)
	if move := detectSwordfishInAxis(two, 4, true); move != nil {
		t.Errorf("expected nil with only two qualifying rows, got %+v", move)
	}
	if move := detectSwordfishInAxis(swordfishRowPatternBoard(4), 4, true); move == nil {
		t.Error("expected a move once three rows project onto three columns")
	}
}

// ============================================================================
// Finned Swordfish: whole-move contract
// ============================================================================

// finnedSwordfishRowPatternBoard builds a finned row Swordfish. Rows 1 and 2 are
// the base lines over columns 3,4,7; row 4 carries base columns 3 and 4 plus a
// fin at column 5, which shares a box column with both of them. Base row 1 holds
// three positions, the widest a base line may be. Eliminations sit at R4C4 and
// R6C5, both inside the fin's band of rows and both seeing the fin.
// All indices here are zero-based; the explanation prints them one-based.
func finnedSwordfishRowPatternBoard(digit int) *testBoard {
	return swordfishBoard(digit,
		[2]int{1, 3}, [2]int{1, 4}, [2]int{1, 7},
		[2]int{2, 3}, [2]int{2, 7},
		[2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5}, // fin at column 5
		[2]int{3, 3}, [2]int{5, 4}, // elimination targets
	)
}

// TestDetectFinnedSwordfishRowPatternWholeMove pins the complete Move a finned
// row Swordfish produces, including the secondary highlight that marks the fin
// cell and the target ordering, which appends the finned line's main positions
// after both base lines. Only three lines qualify on this board, so it is also
// the kill for a combination scan that skips adjacent line pairs.
func TestDetectFinnedSwordfishRowPatternWholeMove(t *testing.T) {
	targets := refs(
		[2]int{1, 3}, [2]int{1, 4}, [2]int{1, 7},
		[2]int{2, 3}, [2]int{2, 7},
		[2]int{4, 3}, [2]int{4, 4},
	)
	assertMove(t, DetectFinnedSwordfish(finnedSwordfishRowPatternBoard(6)), &core.Move{
		Action:      "eliminate",
		Digit:       6,
		Targets:     targets,
		Explanation: "Finned Swordfish: 6 in rows 2,3,5 with fin at R5C6",
		Eliminations: []core.Candidate{
			{Row: 3, Col: 3, Digit: 6},
			{Row: 5, Col: 4, Digit: 6},
		},
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: refs([2]int{4, 5}),
		},
	})
}

// TestDetectFinnedSwordfishScansEveryDigit covers both ends of the finned digit
// loop, as TestDetectSwordfishScansEveryDigit does for the plain one.
func TestDetectFinnedSwordfishScansEveryDigit(t *testing.T) {
	for _, digit := range []int{1, 9} {
		if move := DetectFinnedSwordfish(finnedSwordfishRowPatternBoard(digit)); move == nil {
			t.Errorf("expected a Finned Swordfish on digit %d", digit)
		} else if move.Digit != digit {
			t.Errorf("expected digit %d, got %d", digit, move.Digit)
		}
	}
}

// TestTryFinnedSwordfishConfigNeedsTwoMainPositions covers the guard that the
// finned line must keep at least two positions inside the base coordinate set.
// Here it keeps only column 3, so no fish remains once the fin is set aside,
// even though every other condition holds and an elimination is available.
func TestTryFinnedSwordfishConfigNeedsTwoMainPositions(t *testing.T) {
	b := swordfishBoard(6, [2]int{3, 3})
	finned := finnedLineInfo{line: 4, perps: []int{3, 5}}
	base1 := finnedLineInfo{line: 1, perps: []int{3, 4}}
	base2 := finnedLineInfo{line: 2, perps: []int{4, 7}}

	if move := tryFinnedSwordfishConfig(b, 6, finned, base1, base2, true); move != nil {
		t.Errorf("expected nil: the finned line keeps only one base position, got %+v", move)
	}
}

// TestDetectFinnedSwordfishNeedsThreeDistinctLines covers the combination scan's
// requirement that the three lines be distinct. Only two lines qualify here, and
// they would form a valid-looking fish if either were reused as both base lines:
// row 2 holds exactly three positions and row 1 holds two of them plus a fin at
// column 5, with R1C4 eliminable. A scan whose innermost index can revisit an
// outer one reports that two-line fish, which is not a Finned Swordfish.
func TestDetectFinnedSwordfishNeedsThreeDistinctLines(t *testing.T) {
	b := swordfishBoard(6,
		[2]int{1, 3}, [2]int{1, 4}, [2]int{1, 5},
		[2]int{2, 3}, [2]int{2, 4}, [2]int{2, 7},
		[2]int{0, 3},
	)
	if move := DetectFinnedSwordfish(b); move != nil {
		t.Errorf("expected nil: only two lines qualify, got %+v", move)
	}
}

// TestDetectFinnedSwordfishNeedsThreeBaseCoordinates covers the requirement that
// the two base lines project onto exactly three perpendicular coordinates. Here
// they project onto four (columns 3,4,7,8), and the finned row would otherwise
// pass every remaining check and eliminate R4C4.
func TestDetectFinnedSwordfishNeedsThreeBaseCoordinates(t *testing.T) {
	b := swordfishBoard(6,
		[2]int{1, 3}, [2]int{1, 4},
		[2]int{2, 7}, [2]int{2, 8},
		[2]int{4, 3}, [2]int{4, 4}, [2]int{4, 5},
		[2]int{3, 3},
	)
	if move := DetectFinnedSwordfish(b); move != nil {
		t.Errorf("expected nil: the base lines span four coordinates, got %+v", move)
	}
}

// TestTryFinnedSwordfishConfigNeedsAtLeastOneElimination covers the boundary at
// the end of the build: a configuration that is structurally a finned swordfish
// but eliminates nothing yields no move, while one that eliminates a single
// candidate does.
func TestTryFinnedSwordfishConfigNeedsAtLeastOneElimination(t *testing.T) {
	finned := finnedLineInfo{line: 4, perps: []int{3, 4, 5}}
	base1 := finnedLineInfo{line: 1, perps: []int{3, 4, 7}}
	base2 := finnedLineInfo{line: 2, perps: []int{3, 7}}

	if move := tryFinnedSwordfishConfig(&testBoard{}, 6, finned, base1, base2, true); move != nil {
		t.Errorf("expected nil when the configuration eliminates nothing, got %+v", move)
	}

	move := tryFinnedSwordfishConfig(swordfishBoard(6, [2]int{3, 3}), 6, finned, base1, base2, true)
	if move == nil {
		t.Fatal("expected a move when the configuration eliminates one candidate")
	}
	want := []core.Candidate{{Row: 3, Col: 3, Digit: 6}}
	if !reflect.DeepEqual(move.Eliminations, want) {
		t.Errorf("eliminations = %+v, want %+v", move.Eliminations, want)
	}
}

// TestFinnedElimCellIndexesBothAxes pins the cell index and Candidate the
// elimination walk builds from its two loop coordinates. The walk coordinate and
// the perpendicular coordinate differ and neither is 0, so swapping them,
// negating one or dividing instead of multiplying all select a different cell.
func TestFinnedElimCellIndexesBothAxes(t *testing.T) {
	idx, cand := finnedElimCell(4, 3, 6, true)
	if idx != idxOf(4, 3) {
		t.Errorf("byRow index = %d, want %d", idx, idxOf(4, 3))
	}
	if want := (core.Candidate{Row: 4, Col: 3, Digit: 6}); cand != want {
		t.Errorf("byRow candidate = %+v, want %+v", cand, want)
	}

	idx, cand = finnedElimCell(4, 3, 6, false)
	if idx != idxOf(3, 4) {
		t.Errorf("byCol index = %d, want %d", idx, idxOf(3, 4))
	}
	if want := (core.Candidate{Row: 3, Col: 4, Digit: 6}); cand != want {
		t.Errorf("byCol candidate = %+v, want %+v", cand, want)
	}
}

// TestCollectFinnedSwordfishElimsWalksPastSourceLines covers the skip of source
// lines inside the fin's band of rows. Rows 3 and 4 are both source lines, so the
// only eliminable row in the band is row 5; a walk that abandons the band at the
// first source line collects nothing.
func TestCollectFinnedSwordfishElimsWalksPastSourceLines(t *testing.T) {
	b := swordfishBoard(7, [2]int{5, 1})
	finned := finnedLineInfo{line: 4}
	base1 := finnedLineInfo{line: 3}
	base2 := finnedLineInfo{line: 0}

	got := collectFinnedSwordfishElims(b, 7, finned, base1, base2, []int{1}, []int{1}, true)
	want := []core.Candidate{{Row: 5, Col: 1, Digit: 7}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("eliminations = %+v, want %+v", got, want)
	}
}
