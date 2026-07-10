package techniques

import (
	"strconv"
	"strings"
	"testing"

	"sudoku-api/internal/sudoku/human/techniquetest"
	"sudoku-api/pkg/constants"
)

// boardFromCandidateState rebuilds an exact mid-solve testBoard from a captured
// snapshot: an 81-char cells string (0 for empty) and a comma-separated list of
// 81 raw candidate bitmasks (Candidates is a uint16). This lets a curated
// candidate state (one reduced by prior technique application) drive a detector
// directly, which is required for forcing-chain branches that only fire once
// candidates have been pruned below the raw givens state.
func boardFromCandidateState(cells, cand string) *testBoard {
	b := &testBoard{}
	for i := 0; i < constants.TotalCells && i < len(cells); i++ {
		b.cells[i] = int(cells[i] - '0')
	}
	parts := strings.Split(cand, ",")
	for i := 0; i < constants.TotalCells && i < len(parts); i++ {
		v, err := strconv.ParseUint(strings.TrimSpace(parts[i]), 10, 16)
		if err != nil {
			panic("bad candidate mask: " + parts[i])
		}
		b.candidates[i] = Candidates(uint16(v))
	}
	return b
}

func givensBoard(t *testing.T, idx int, difficulty string) *testBoard {
	t.Helper()
	givens := loadPuzzleIndex(t, techniquetest.PuzzleData{PuzzleIndex: idx, Difficulty: difficulty})
	return boardFromGivens(givens)
}

// TestDetectCellForcingChainCommonPlacement drives the common-placement
// convergence branch of detectCellForcingChain: on impossible puzzle 6, every
// candidate of R5C8 propagates to force R1C2=7, so the detector returns an
// assign move rather than a contradiction.
func TestDetectCellForcingChainCommonPlacement(t *testing.T) {
	b := givensBoard(t, 6, "impossible")
	move := detectCellForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil cell forcing chain move")
	}
	if move.Action != "assign" {
		t.Fatalf("expected assign, got %q", move.Action)
	}
	if !strings.Contains(move.Explanation, "All candidates in") {
		t.Fatalf("expected common-placement explanation, got %q", move.Explanation)
	}
	if move.Digit < 1 || move.Digit > 9 {
		t.Fatalf("expected digit 1-9, got %d", move.Digit)
	}
	if len(move.Targets) != 1 {
		t.Fatalf("expected one target, got %d", len(move.Targets))
	}
}

// cellElimCells / cellElimCand are a captured mid-solve state of impossible
// puzzle 6 (after 10 non-forcing technique steps) in which every candidate of
// R1C3 propagates to eliminate 2 from R4C3, exercising the common-elimination
// branch of detectCellForcingChain.
const cellElimCells = "370010046080006050560004100000090060007060004000400300000030427753249681000001000"
const cellElimCand = "0,0,516,800,0,292,772,0,0,18,0,18,648,132,0,644,0,524,0,0,516,904,388,0,0,648,780,278,30,310,426,0,428,420,0,292,774,526,0,298,0,300,804,514,0,838,518,870,0,420,420,0,642,804,834,514,834,352,0,288,0,0,0,0,0,0,0,0,0,0,0,0,852,532,852,480,416,0,544,520,552"

func TestDetectCellForcingChainCommonElimination(t *testing.T) {
	b := boardFromCandidateState(cellElimCells, cellElimCand)
	move := detectCellForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil cell forcing chain move")
	}
	if move.Action != "eliminate" {
		t.Fatalf("expected eliminate, got %q", move.Action)
	}
	if !strings.Contains(move.Explanation, "lead to eliminating") {
		t.Fatalf("expected common-elimination explanation, got %q", move.Explanation)
	}
	if len(move.Eliminations) != 1 {
		t.Fatalf("expected one elimination, got %d", len(move.Eliminations))
	}
	e := move.Eliminations[0]
	if e.Digit != move.Digit {
		t.Fatalf("elimination digit %d != move digit %d", e.Digit, move.Digit)
	}
	// R4C3 => row index 3, col index 2.
	if e.Row != 3 || e.Col != 2 || e.Digit != 2 {
		t.Fatalf("expected eliminate 2 from R4C3, got eliminate %d from R%dC%d", e.Digit, e.Row+1, e.Col+1)
	}
}

// TestDetectUnitForcingChainCommonPlacement drives the common-placement branch
// of tryUnitForcingChain via detectUnitForcingChain: on impossible puzzle 0,
// wherever 1 goes among its positions in row 2, R1C5=2 follows in all branches.
func TestDetectUnitForcingChainCommonPlacement(t *testing.T) {
	b := givensBoard(t, 0, "impossible")
	move := detectUnitForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil unit forcing chain move")
	}
	if move.Action != "assign" {
		t.Fatalf("expected assign, got %q", move.Action)
	}
	if !strings.Contains(move.Explanation, "Wherever") {
		t.Fatalf("expected common-placement explanation, got %q", move.Explanation)
	}
	if len(move.Highlights.Secondary) < 2 {
		t.Fatalf("expected multiple forcing-position highlights, got %d", len(move.Highlights.Secondary))
	}
}

// unitElimCells / unitElimCand are a captured mid-solve state of impossible
// puzzle 0 (after 19 non-forcing steps) in which, wherever 1 goes in row 2, 5
// is eliminated from R5C6 in all branches, exercising the common-elimination
// branch of tryUnitForcingChain.
const unitElimCells = "150024608062000004008036012031279400920400100004610200200060840010847020005392761"
const unitElimCand = "0,0,648,640,0,0,0,648,0,136,0,0,674,288,290,552,680,0,144,656,0,672,0,0,544,0,0,352,0,0,0,0,0,0,288,96,0,0,192,0,288,296,0,424,232,416,384,0,0,0,296,0,936,680,0,640,648,34,0,34,0,0,552,72,0,584,0,0,0,552,0,552,272,272,0,0,0,0,0,0,0"

func TestDetectUnitForcingChainCommonElimination(t *testing.T) {
	b := boardFromCandidateState(unitElimCells, unitElimCand)
	move := detectUnitForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil unit forcing chain move")
	}
	if move.Action != "eliminate" {
		t.Fatalf("expected eliminate, got %q", move.Action)
	}
	if !strings.Contains(move.Explanation, "eliminate") {
		t.Fatalf("expected common-elimination explanation, got %q", move.Explanation)
	}
	if len(move.Eliminations) != 1 {
		t.Fatalf("expected one elimination, got %d", len(move.Eliminations))
	}
	e := move.Eliminations[0]
	// R5C6 => row index 4, col index 5.
	if e.Row != 4 || e.Col != 5 || e.Digit != 5 {
		t.Fatalf("expected eliminate 5 from R5C6, got eliminate %d from R%dC%d", e.Digit, e.Row+1, e.Col+1)
	}
}

// TestTryUnitForcingChainAllValidNoConclusion covers the final return nil of
// tryUnitForcingChain: on the same captured state, digit 3 at its two column
// positions (R5C6, R6C6) propagates validly in both branches but the branches
// share no common placement or elimination, so the helper returns nil.
func TestTryUnitForcingChainAllValidNoConclusion(t *testing.T) {
	b := boardFromCandidateState(unitElimCells, unitElimCand)
	// Cells 41 (R5C6) and 50 (R6C6) are the two positions for digit 3 in column 6.
	if move := tryUnitForcingChain(b, 3, []int{41, 50}, "column 6"); move != nil {
		t.Fatalf("expected nil (all branches valid, no common conclusion), got %+v", move)
	}
}

// cellSubCells / cellSubCand are a captured mid-solve state of impossible puzzle
// 0 in which detectCellForcingChain returns a common elimination whose decision
// relies on the placement-substitution branch: in one branch R5C6 is eliminated
// of 5 not by a recorded peer elimination but because a different digit is
// placed there, which still counts as eliminating 5.
const cellSubCells = "070010204100524730020080516750002040203040005600850072812405007000071020937268451"
const cellSubCand = "40,0,800,584,0,584,0,768,0,0,832,832,0,0,0,0,0,768,24,0,528,648,0,648,0,0,0,0,0,770,586,520,0,842,0,776,0,768,0,706,0,704,834,832,0,0,528,530,0,0,520,522,0,0,0,0,0,0,520,0,584,576,0,48,80,112,520,0,0,840,0,776,0,0,0,0,0,0,0,0,0"

func TestDetectCellForcingChainEliminationViaPlacementSubstitution(t *testing.T) {
	b := boardFromCandidateState(cellSubCells, cellSubCand)
	move := detectCellForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil cell forcing chain move")
	}
	if move.Action != "eliminate" {
		t.Fatalf("expected eliminate, got %q", move.Action)
	}
	if len(move.Eliminations) != 1 {
		t.Fatalf("expected one elimination, got %d", len(move.Eliminations))
	}
}

// TestDetectDigitForcingChainCommonPlacement drives findCommonPlacement's
// firing path: on impossible puzzle 0, digit 1 in row 2 forces R9C6=2 across
// all its candidate positions.
func TestDetectDigitForcingChainCommonPlacement(t *testing.T) {
	b := givensBoard(t, 0, "impossible")
	move := DetectDigitForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil digit forcing chain move")
	}
	if move.Action != "assign" {
		t.Fatalf("expected assign, got %q", move.Action)
	}
	if !strings.Contains(move.Explanation, "Digit Forcing Chain") {
		t.Fatalf("expected digit forcing explanation, got %q", move.Explanation)
	}
}

// TestDetectDigitForcingChainCommonElimination drives findCommonElimination's
// firing path: on impossible puzzle 69, a digit forcing chain eliminates a
// candidate common to all branches.
func TestDetectDigitForcingChainCommonElimination(t *testing.T) {
	b := givensBoard(t, 69, "impossible")
	move := DetectDigitForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil digit forcing chain move")
	}
	// puzzle 69 yields an elimination at step 0.
	if move.Action != "eliminate" {
		t.Fatalf("expected eliminate, got %q", move.Action)
	}
	if len(move.Eliminations) != 1 {
		t.Fatalf("expected one elimination, got %d", len(move.Eliminations))
	}
}
