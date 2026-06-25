package techniques

import (
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// testBoard is a minimal BoardInterface implementation for exercising
// detectors within the techniques package (so coverage attributes here,
// not to the human package). It mirrors the semantics of human.Board.
type testBoard struct {
	cells      [constants.TotalCells]int
	candidates [constants.TotalCells]Candidates
}

func (b *testBoard) GetCell(idx int) int { return b.cells[idx] }
func (b *testBoard) GetCandidatesAt(idx int) Candidates {
	return b.candidates[idx]
}
func (b *testBoard) CellsWithDigitInUnit(unit Unit, digit int) []int {
	var out []int
	for _, idx := range unit.Cells {
		if b.candidates[idx].Has(digit) {
			out = append(out, idx)
		}
	}
	return out
}
func (b *testBoard) CloneBoard() BoardInterface {
	cp := *b
	return &cp
}
func (b *testBoard) SetCell(idx, digit int) {
	b.cells[idx] = digit
	b.candidates[idx] = 0
	for _, peer := range Peers[idx] {
		if b.candidates[peer].Has(digit) {
			b.candidates[peer] = b.candidates[peer].Clear(digit)
		}
	}
}
func (b *testBoard) RemoveCandidate(idx, digit int) bool {
	if b.candidates[idx].Has(digit) {
		b.candidates[idx] = b.candidates[idx].Clear(digit)
		return true
	}
	return false
}

// boardFromMap builds a board whose empty cells start with all candidates,
// then applies the per-cell candidate overrides in the map.
func boardFromMap(cells [constants.TotalCells]int, overrides map[int][]int) *testBoard {
	b := &testBoard{}
	b.cells = cells
	for i := 0; i < constants.TotalCells; i++ {
		b.candidates[i] = 0
		if cells[i] == 0 {
			for d := 1; d <= constants.GridSize; d++ {
				b.candidates[i] = b.candidates[i].Set(d)
			}
		}
	}
	for idx, cands := range overrides {
		b.candidates[idx] = 0
		for _, d := range cands {
			b.candidates[idx] = b.candidates[idx].Set(d)
		}
	}
	return b
}

// emptyCandidateBoard has no candidates anywhere: no technique should fire.
func emptyCandidateBoard() *testBoard { return &testBoard{} }

func idxOf(row, col int) int { return row*constants.GridSize + col }

// ============================================================================
// Candidates bitmask
// ============================================================================

func TestNewCandidatesFiltersOutOfRangeDigits(t *testing.T) {
	c := NewCandidates([]int{0, 1, 5, constants.GridSize, constants.GridSize + 1, -1})
	if !c.Has(1) || !c.Has(5) || !c.Has(constants.GridSize) {
		t.Errorf("expected digits 1,5,%d set, got %s", constants.GridSize, c)
	}
	if c.Has(0) || c.Has(constants.GridSize+1) {
		t.Error("out-of-range digits should be filtered out")
	}
}

func TestAllCandidatesSetsEveryDigit(t *testing.T) {
	c := AllCandidates()
	if c.Count() != constants.GridSize {
		t.Errorf("expected %d candidates, got %d", constants.GridSize, c.Count())
	}
	for d := 1; d <= constants.GridSize; d++ {
		if !c.Has(d) {
			t.Errorf("expected digit %d set in AllCandidates", d)
		}
	}
}

func TestCandidatesHasRejectsOutOfRange(t *testing.T) {
	c := AllCandidates()
	if c.Has(0) || c.Has(constants.GridSize+1) || c.Has(-3) {
		t.Error("Has must return false for out-of-range digits")
	}
}

func TestCandidatesSetAndClearAreIdempotentBoundaries(t *testing.T) {
	var c Candidates
	c = c.Set(1).Set(1)
	if c.Count() != 1 {
		t.Errorf("double-set should not duplicate, count=%d", c.Count())
	}
	c = c.Clear(1).Clear(1)
	if !c.IsEmpty() {
		t.Errorf("double-clear should leave empty, got %s", c)
	}
	if (AllCandidates().Set(100)) != AllCandidates() {
		t.Error("Set with out-of-range digit must be a no-op")
	}
}

func TestCandidatesOnlyReturnsSingleDigit(t *testing.T) {
	c := NewCandidates([]int{4})
	digit, ok := c.Only()
	if !ok || digit != 4 {
		t.Errorf("expected (4,true), got (%d,%v)", digit, ok)
	}

	multi := NewCandidates([]int{1, 2})
	if _, ok := multi.Only(); ok {
		t.Error("Only must be false when more than one candidate")
	}

	var empty Candidates
	if _, ok := empty.Only(); ok {
		t.Error("Only must be false for empty candidates")
	}
}

func TestCandidatesSetAlgebra(t *testing.T) {
	a := NewCandidates([]int{1, 2, 3})
	b := NewCandidates([]int{2, 3, 4})

	if !a.Intersect(b).Equals(NewCandidates([]int{2, 3})) {
		t.Errorf("intersect wrong: %s", a.Intersect(b))
	}
	if !a.Union(b).Equals(NewCandidates([]int{1, 2, 3, 4})) {
		t.Errorf("union wrong: %s", a.Union(b))
	}
	if !a.Subtract(b).Equals(NewCandidates([]int{1})) {
		t.Errorf("subtract wrong: %s", a.Subtract(b))
	}
	if a.Equals(b) {
		t.Error("different candidate sets must not be equal")
	}
}

func TestCandidatesToSliceAndString(t *testing.T) {
	c := NewCandidates([]int{3, 1, 2})
	if got := c.ToSlice(); len(got) != 3 || got[0] != 1 || got[2] != 3 {
		t.Errorf("ToSlice must be sorted ascending, got %v", got)
	}

	var empty Candidates
	if empty.String() != "{}" {
		t.Errorf("empty string must be {}, got %q", empty.String())
	}
	if c.String() != "{1,2,3}" {
		t.Errorf("string form wrong, got %q", c.String())
	}
	if !c.Equals(c) {
		t.Error("a set must equal itself")
	}
}

// ============================================================================
// Formatter
// ============================================================================

func TestFormatCellAndRefAreOneIndexed(t *testing.T) {
	if got := FormatCell(0); got != "R1C1" {
		t.Errorf("FormatCell(0) = %q, want R1C1", got)
	}
	if got := FormatRef(core.CellRef{Row: 2, Col: 3}); got != "R3C4" {
		t.Errorf("FormatRef = %q, want R3C4", got)
	}
}

func TestFormatCollectionsHandleEmpty(t *testing.T) {
	if got := FormatCells(nil); got != "" {
		t.Errorf("empty FormatCells = %q, want \"\"", got)
	}
	if got := FormatRefs(nil); got != "" {
		t.Errorf("empty FormatRefs = %q, want \"\"", got)
	}
	if got := FormatDigits(nil); got != "" {
		t.Errorf("empty FormatDigits = %q, want \"\"", got)
	}
}

func TestFormatCollectionsJoinValues(t *testing.T) {
	if got := FormatCells([]int{0, 9}); got != "R1C1, R2C1" {
		t.Errorf("FormatCells = %q", got)
	}
	if got := FormatRefs([]core.CellRef{{Row: 0, Col: 0}, {Row: 8, Col: 8}}); got != "R1C1, R9C9" {
		t.Errorf("FormatRefs = %q", got)
	}
	if got := FormatDigits([]int{1, 2, 3}); got != "1, 2, 3" {
		t.Errorf("FormatDigits = %q", got)
	}
}

func TestFormatDigitAndCompact(t *testing.T) {
	if FormatDigit(7) != "7" {
		t.Errorf("FormatDigit(7) wrong")
	}
	if got := FormatDigitsCompact([]int{1, 2, 9}); got != "129" {
		t.Errorf("FormatDigitsCompact = %q, want 129", got)
	}
}

// ============================================================================
// Grid helpers
// ============================================================================

func TestCoordinateHelpersRoundTrip(t *testing.T) {
	for _, idx := range []int{0, 1, 40, 80} {
		if back := IndexOf(RowOf(idx), ColOf(idx)); back != idx {
			t.Errorf("IndexOf(RowOf,ColOf) not identity for %d: got %d", idx, back)
		}
		if back := FromCellRef(ToCellRef(idx)); back != idx {
			t.Errorf("FromCellRef(ToCellRef) not identity for %d: got %d", idx, back)
		}
	}
	if BoxOf(0) != 0 || BoxOf(80) != 8 {
		t.Errorf("BoxOf corners wrong: %d, %d", BoxOf(0), BoxOf(80))
	}
}

func TestToCellRefsMapsAllIndices(t *testing.T) {
	refs := ToCellRefs([]int{0, 9, 80})
	if refs[0] != (core.CellRef{Row: 0, Col: 0}) || refs[1] != (core.CellRef{Row: 1, Col: 0}) {
		t.Errorf("ToCellRefs mapping wrong: %v", refs)
	}
}

func TestPeerChecks(t *testing.T) {
	if !AreRowPeers(0, 8) || AreRowPeers(0, 9) {
		t.Error("AreRowPeers wrong")
	}
	if !AreColPeers(0, 72) || AreColPeers(0, 1) {
		t.Error("AreColPeers wrong")
	}
	if !AreBoxPeers(0, 20) || AreBoxPeers(0, 21) {
		t.Error("AreBoxPeers wrong")
	}
	if ArePeers(0, 0) {
		t.Error("a cell must not be its own peer")
	}
	if !ArePeers(0, 8) || ArePeers(0, 40) {
		t.Error("ArePeers wrong")
	}
}

func TestUnitAccessors(t *testing.T) {
	if len(AllUnits()) != constants.GridSize*3 {
		t.Errorf("expected %d units, got %d", constants.GridSize*3, len(AllUnits()))
	}
	u := Unit{Type: UnitRow, Index: 0, Cells: RowIndices[0]}
	if got := u.GetCellRefs(); len(got) != constants.GridSize || got[0] != (core.CellRef{Row: 0, Col: 0}) {
		t.Errorf("GetCellRefs wrong: %v", got)
	}
	if UnitRow.String() != "row" || UnitCol.String() != "column" || UnitBox.String() != "box" {
		t.Error("UnitType.String wrong")
	}
	pos := core.CellRef{Row: 3, Col: 5}
	if UnitRow.LineIndexFromPos(pos) != 3 || UnitCol.LineIndexFromPos(pos) != 5 {
		t.Error("LineIndexFromPos wrong")
	}
	if UnitRow.BoxIndexFromPos(pos) != 1 || UnitCol.BoxIndexFromPos(pos) != 1 {
		t.Error("BoxIndexFromPos wrong")
	}
}

func TestSliceUtilities(t *testing.T) {
	if !ContainsInt([]int{1, 2, 3}, 2) || ContainsInt([]int{1, 2, 3}, 9) {
		t.Error("ContainsInt wrong")
	}
	got := IntersectInts([]int{1, 2, 3, 4}, []int{2, 4, 6})
	if len(got) != 2 || got[0] != 2 || got[1] != 4 {
		t.Errorf("IntersectInts wrong: %v", got)
	}
	if empty := IntersectInts([]int{1}, nil); len(empty) != 0 {
		t.Errorf("IntersectInts with empty should be empty, got %v", empty)
	}
}

func TestCombinations(t *testing.T) {
	if Combinations([]int{1, 2, 3}, 0) != nil {
		t.Error("k<=0 must return nil")
	}
	if Combinations([]int{1}, 5) != nil {
		t.Error("k>len must return nil")
	}
	got := Combinations([]int{1, 2, 3}, 2)
	if len(got) != 3 {
		t.Errorf("expected 3 pairs, got %d: %v", len(got), got)
	}
}

func TestEliminationHelpers(t *testing.T) {
	e := MakeElimination(0, 5)
	if e.Row != 0 || e.Col != 0 || e.Digit != 5 {
		t.Errorf("MakeElimination wrong: %+v", e)
	}

	dup := []core.Candidate{MakeElimination(0, 1), MakeElimination(0, 1), MakeElimination(1, 1)}
	deduped := DedupeEliminations(dup)
	if len(deduped) != 2 {
		t.Errorf("expected 2 after dedupe, got %d", len(deduped))
	}
	if len(DedupeEliminations(dup[:1])) != 1 {
		t.Error("single-element dedupe must pass through")
	}

	if !AllSeeAll([]int{0}, []int{1, 8}) {
		t.Error("cells in same row should all see each other")
	}
	if AllSeeAll([]int{0}, []int{40}) {
		t.Error("non-peers must not all see each other")
	}
	refs := CellRefsFromIndices(0, 9)
	if refs[0] != (core.CellRef{Row: 0, Col: 0}) || refs[1] != (core.CellRef{Row: 1, Col: 0}) {
		t.Errorf("CellRefsFromIndices wrong: %v", refs)
	}
}

func TestFindEliminationsSeeingRespectsExclude(t *testing.T) {
	// Sparse board: only cells 0,1,2 (row 0) and 9 (col 0) hold candidate 5;
	// every other cell has no candidates, so the elimination set is bounded.
	b := &testBoard{}
	for _, idx := range []int{0, 1, 2, 9} {
		b.candidates[idx] = b.candidates[idx].Set(5)
	}

	// Default exclude = mustSee cells themselves.
	elims := FindEliminationsSeeing(b, 5, nil, 0)
	if len(elims) != 3 {
		t.Errorf("expected 3 eliminations seeing cell 0, got %d: %v", len(elims), elims)
	}

	// Explicit exclude that suppresses cell 1.
	elims = FindEliminationsSeeing(b, 5, []int{1}, 0)
	foundCell1 := false
	for _, e := range elims {
		if e.Row == 0 && e.Col == 1 {
			foundCell1 = true
		}
	}
	if foundCell1 {
		t.Error("excluded cell 1 should not appear in eliminations")
	}
}

func TestFindAllALSAndShareCheck(t *testing.T) {
	// Sparse board: two bivalue cells in row 0 form a size-1 ALS each and a
	// 2-cell ALS together (cells {0,1}, candidates {1,2,3}).
	b := &testBoard{}
	b.candidates[0] = NewCandidates([]int{1, 2})
	b.candidates[1] = NewCandidates([]int{1, 3})

	als := FindAllALS(b, 4)
	if len(als) == 0 {
		t.Fatal("expected at least one ALS from bivalue cells")
	}
	// maxSize default path
	if def := FindAllALS(b, 0); len(def) != len(als) {
		t.Errorf("default maxSize should match explicit 4, got %d vs %d", len(def), len(als))
	}
	// ALSShareCells
	if !ALSShareCells(als[0], als[0]) {
		t.Error("an ALS must share cells with itself")
	}
	other := ALS{Cells: []int{80}, Digits: []int{9}}
	if ALSShareCells(als[0], other) {
		t.Error("disjoint ALS must not report shared cells")
	}
}

// ============================================================================
// Detector positive cases (clear, reliably-constructible techniques)
// ============================================================================

func TestDetectNakedSingleAssignsSoleCandidate(t *testing.T) {
	b := boardFromMap([constants.TotalCells]int{}, map[int][]int{
		0: {5},
		1: {1, 2, 3},
	})
	move := DetectNakedSingle(b)
	if move == nil {
		t.Fatal("expected a naked-single move")
	}
	if move.Action != "assign" || move.Digit != 5 {
		t.Errorf("expected assign 5, got %+v", move)
	}
	if len(move.Targets) != 1 || move.Targets[0] != (core.CellRef{Row: 0, Col: 0}) {
		t.Errorf("expected target R1C1, got %+v", move.Targets)
	}
}

func TestDetectNakedSingleAbsentWhenNoSoleCandidate(t *testing.T) {
	b := boardFromMap([constants.TotalCells]int{}, map[int][]int{
		0: {1, 2}, 1: {3, 4},
	})
	if move := DetectNakedSingle(b); move != nil {
		t.Errorf("expected nil, got %+v", move)
	}
}

func TestDetectHiddenSingleInRow(t *testing.T) {
	overrides := map[int][]int{}
	for c := 0; c < constants.GridSize; c++ {
		if c == 3 {
			overrides[idxOf(0, c)] = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
		} else {
			overrides[idxOf(0, c)] = []int{1, 2, 3, 4, 5, 6, 8, 9} // no 7
		}
	}
	b := boardFromMap([constants.TotalCells]int{}, overrides)
	move := DetectHiddenSingle(b)
	if move == nil {
		t.Fatal("expected a hidden-single move")
	}
	if move.Digit != 7 {
		t.Errorf("expected digit 7, got %d", move.Digit)
	}
	if len(move.Targets) != 1 || move.Targets[0] != (core.CellRef{Row: 0, Col: 3}) {
		t.Errorf("expected R1C4, got %+v", move.Targets)
	}
}

func TestDetectNakedPairEliminatesFromRowPeers(t *testing.T) {
	b := boardFromMap([constants.TotalCells]int{}, map[int][]int{
		idxOf(0, 0): {2, 5},
		idxOf(0, 1): {1, 2, 5},
		idxOf(0, 2): {2, 5},
		idxOf(0, 3): {1, 3, 5},
	})
	move := DetectNakedPair(b)
	if move == nil {
		t.Fatal("expected a naked-pair move")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected eliminate, got %q", move.Action)
	}
	if len(move.Eliminations) == 0 {
		t.Error("expected eliminations")
	}
}

func TestDetectNakedTripleEliminatesRemainingTripleDigits(t *testing.T) {
	// Three cells in row 0 holding only {1,2,3}; a fourth cell holds {1,2,3,4}
	// so digits 1,2,3 should be eliminated from it.
	b := boardFromMap([constants.TotalCells]int{}, map[int][]int{
		idxOf(0, 0): {1, 2, 3},
		idxOf(0, 1): {1, 2, 3},
		idxOf(0, 2): {1, 2, 3},
		idxOf(0, 3): {1, 2, 3, 4},
	})
	move := DetectNakedTriple(b)
	if move == nil {
		t.Fatal("expected a naked-triple move")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected eliminate, got %q", move.Action)
	}
	if len(move.Eliminations) == 0 {
		t.Error("expected eliminations")
	}
}

func TestDetectPointingPairEliminatesFromRowOutsideBox(t *testing.T) {
	b := boardFromMap([constants.TotalCells]int{}, map[int][]int{
		idxOf(0, 0): {1, 5},
		idxOf(0, 1): {2, 5},
		idxOf(0, 2): {3, 4},
		idxOf(1, 0): {1, 2},
		idxOf(1, 1): {3, 4},
		idxOf(1, 2): {6, 7},
		idxOf(2, 0): {8, 9},
		idxOf(2, 1): {1, 2},
		idxOf(2, 2): {3, 4},
		idxOf(0, 5): {5, 6}, // outside box, in row -> should be eliminated
	})
	move := DetectPointingPair(b)
	if move == nil {
		t.Fatal("expected a pointing-pair move")
	}
	if move.Digit != 5 {
		t.Errorf("expected digit 5, got %d", move.Digit)
	}
}

// ============================================================================
// Detector negative cases: no candidates anywhere => nothing fires, no panic.
// ============================================================================

func TestDetectorsReturnNilOnEmptyCandidateBoard(t *testing.T) {
	b := emptyCandidateBoard()

	detectors := []struct {
		name string
		fn   func(BoardInterface) *core.Move
	}{
		{"NakedSingle", DetectNakedSingle},
		{"HiddenSingle", DetectHiddenSingle},
		{"NakedPair", DetectNakedPair},
		{"HiddenPair", DetectHiddenPair},
		{"NakedTriple", DetectNakedTriple},
		{"HiddenTriple", DetectHiddenTriple},
		{"NakedQuad", DetectNakedQuad},
		{"HiddenQuad", DetectHiddenQuad},
		{"PointingPair", DetectPointingPair},
		{"BoxLineReduction", DetectBoxLineReduction},
		{"XWing", DetectXWing},
		{"XYWing", DetectXYWing},
		{"SimpleColoring", DetectSimpleColoring},
		{"Swordfish", DetectSwordfish},
		{"FinnedSwordfish", DetectFinnedSwordfish},
		{"FinnedXWing", DetectFinnedXWing},
		{"Skyscraper", DetectSkyscraper},
		{"XYZWing", DetectXYZWing},
		{"WXYZWing", DetectWXYZWing},
		{"ALSXZ", DetectALSXZ},
		{"ALSXYWing", DetectALSXYWing},
		{"ALSXYChain", DetectALSXYChain},
		{"GroupedXCycles", DetectGroupedXCycles},
		{"XChain", DetectXChain},
		{"XYChain", DetectXYChain},
		{"WWing", DetectWWing},
		{"EmptyRectangle", DetectEmptyRectangle},
		{"Jellyfish", DetectJellyfish},
		{"AIC", DetectAIC},
		{"Medusa3D", DetectMedusa3D},
		{"SueDeCoq", DetectSueDeCoq},
		{"DeathBlossom", DetectDeathBlossom},
		{"BUG", DetectBUG},
		{"DigitForcingChain", DetectDigitForcingChain},
		{"ForcingChain", DetectForcingChain},
		{"UniqueRectangle", DetectUniqueRectangle},
		{"UniqueRectangleType2", DetectUniqueRectangleType2},
		{"UniqueRectangleType3", DetectUniqueRectangleType3},
		{"UniqueRectangleType4", DetectUniqueRectangleType4},
	}

	for _, d := range detectors {
		move := d.fn(b)
		if move != nil {
			t.Errorf("%s: expected nil on empty-candidate board, got %+v", d.name, move)
		}
	}
}
