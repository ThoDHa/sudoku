package diagnosis

import (
	"reflect"
	"testing"

	"sudoku-api/internal/sudoku/human"
)

// The tests in this file characterize FindErrorByCandidateRefill and
// FindBlockingUserCell: they pin the exact return values for fixture boards.
// They were unified here from the HTTP transport (where the functions
// previously lived as package-private helpers) so the shared package proves
// behavior preservation for both transports.

func TestFindErrorByCandidateRefillReturnsNoErrorOnCleanBoard(t *testing.T) {
	board := make([]int, 81)
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := FindErrorByCandidateRefill(board, givens)

	if badCell != -1 || badDigit != 0 || zeroCell != -1 {
		t.Errorf("expected no error on empty board, got cell=%d digit=%d zero=%d", badCell, badDigit, zeroCell)
	}
}

func TestFindErrorByCandidateRefillLocatesUserEntryBlockingAllCandidates(t *testing.T) {
	// Build a board where cell 8 (row 0, col 8) has zero candidates:
	// row 0 holds digits 1-8 (user entries), and digit 9 sits in the same
	// column at cell 17, so every digit 1-9 blocks cell 8.
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d-1] = d
	}
	board[17] = 9
	givens := make([]int, 81) // all entries are user-entered, none are givens

	badCell, badDigit, zeroCell := FindErrorByCandidateRefill(board, givens)

	if zeroCell != 8 {
		t.Errorf("expected zero-candidate cell 8, got %d", zeroCell)
	}
	if badCell < 0 || badDigit < 1 || badDigit > 9 {
		t.Errorf("expected a blocking user cell + digit, got cell=%d digit=%d", badCell, badDigit)
	}
	// The reported blocker must be one of the user-entered cells in cell 8's peers.
	peerCells := map[int]bool{0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 17: true}
	if !peerCells[badCell] {
		t.Errorf("reported blocker cell %d is not a peer of cell 8", badCell)
	}
	if board[badCell] != badDigit {
		t.Errorf("reported digit %d does not match cell %d contents %d", badDigit, badCell, board[badCell])
	}
}

func TestFindErrorByCandidateRefillReturnsFirstBlockingUserEntry(t *testing.T) {
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := FindErrorByCandidateRefill(board, givens)
	if zeroCell != 0 {
		t.Errorf("expected zero-candidate cell 0, got %d", zeroCell)
	}
	if badCell != 1 {
		t.Errorf("expected blocker cell 1 (holds digit 1, first in scan), got %d", badCell)
	}
	if badDigit != 1 {
		t.Errorf("expected digit 1, got %d", badDigit)
	}
}

// TestFindErrorByCandidateRefillZeroCandidateCellAndNonZeroCoords pins the
// exact (badCell, badDigit, zeroCell) return. Cell 8 is the zero-candidate
// cell (non-zero row/col coordinates), and cell 1 is the first blocking user
// entry. This kills the arithmetic mutants on the idx/GridSize row/col
// computation and the branch/loop mutants on the candidate-non-empty continue.
func TestFindErrorByCandidateRefillZeroCandidateCellAndNonZeroCoords(t *testing.T) {
	board := make([]int, 81)
	for d := 1; d <= 7; d++ {
		board[d] = d
	}
	board[17] = 8
	board[26] = 9
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := FindErrorByCandidateRefill(board, givens)

	if zeroCell != 8 {
		t.Errorf("zeroCell: expected 8, got %d", zeroCell)
	}
	if badCell != 1 {
		t.Errorf("badCell: expected 1 (first row peer holding a user digit), got %d", badCell)
	}
	if badDigit != 1 {
		t.Errorf("badDigit: expected 1, got %d", badDigit)
	}
}

// TestFindErrorByCandidateRefillBlockerIsDigitNine pins the case where the
// only user-entered blocker holds digit 9 (digits 1-8 are givens). This kills
// the comparison mutant that narrows the digit loop to 1..8.
func TestFindErrorByCandidateRefillBlockerIsDigitNine(t *testing.T) {
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)
	for d := 1; d <= 8; d++ {
		givens[d] = d
	}

	badCell, badDigit, zeroCell := FindErrorByCandidateRefill(board, givens)

	if zeroCell != 0 {
		t.Errorf("zeroCell: expected 0, got %d", zeroCell)
	}
	if badCell != 9 {
		t.Errorf("badCell: expected 9 (only non-given blocker), got %d", badCell)
	}
	if badDigit != 9 {
		t.Errorf("badDigit: expected 9, got %d", badDigit)
	}
}

// TestFindErrorByCandidateRefillBlockerInBoxRegion pins the box-region scan:
// cell 0 has zero candidates, and digit 1's only blocker is cell 10 (row 1,
// col 1), which shares box 0 with cell 0 but sits in neither row 0 nor col 0.
// firstBlockingUserPeer scans row, then column, then box; only the box scan
// finds the blocker, exercising the box-region return.
func TestFindErrorByCandidateRefillBlockerInBoxRegion(t *testing.T) {
	board := make([]int, 81)
	for d := 2; d <= 9; d++ {
		board[d-1] = d // row peers of cell 0 (cells 1-8) hold digits 2-9
	}
	board[10] = 1 // box-only peer of cell 0 holds digit 1
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := FindErrorByCandidateRefill(board, givens)

	if zeroCell != 0 {
		t.Errorf("zeroCell: expected 0, got %d", zeroCell)
	}
	if badCell != 10 {
		t.Errorf("badCell: expected 10 (box-region blocker), got %d", badCell)
	}
	if badDigit != 1 {
		t.Errorf("badDigit: expected 1, got %d", badDigit)
	}
}

// --- peerCellIndices exact cell indices ---
//
// These three tests pin the exact cell indices returned by peerCellIndices for
// a mid-grid cell and the two grid corners. They kill all arithmetic/base
// mutants on row*GridSize, i*GridSize, box origin computation, and box cell
// computation. They moved here from the HTTP transport when peerCellIndices
// became a private helper of this package.

func TestPeerCellIndices_ExactIndices(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(4, 5)

	expectedRow := []int{36, 37, 38, 39, 40, 41, 42, 43, 44}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells: expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{5, 14, 23, 32, 41, 50, 59, 68, 77}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells: expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{30, 31, 32, 39, 40, 41, 48, 49, 50}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells: expected %v, got %v", expectedBox, boxCells)
	}
}

func TestPeerCellIndices_TopLeftCorner(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(0, 0)

	expectedRow := []int{0, 1, 2, 3, 4, 5, 6, 7, 8}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells (0,0): expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{0, 9, 18, 27, 36, 45, 54, 63, 72}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells (0,0): expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{0, 1, 2, 9, 10, 11, 18, 19, 20}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells (0,0): expected %v, got %v", expectedBox, boxCells)
	}
}

func TestPeerCellIndices_BottomRightCorner(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(8, 8)

	expectedRow := []int{72, 73, 74, 75, 76, 77, 78, 79, 80}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells (8,8): expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{8, 17, 26, 35, 44, 53, 62, 71, 80}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells (8,8): expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{60, 61, 62, 69, 70, 71, 78, 79, 80}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells (8,8): expected %v, got %v", expectedBox, boxCells)
	}
}

// --- firstUserBlocker stop-on-first-digit semantics ---
//
// These four tests pin firstUserBlocker's stop-on-first-digit rule, which is
// what makes FindBlockingUserCell's per-region scan deterministic. They cover
// the user-match case, the given-break case, the solver-placed case, and the
// no-match case.

func TestFirstUserBlocker_ReturnsUserCellHoldingDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 5
	cells[2] = 7
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 5
	original[2] = 7
	givens := make([]int, 81)

	idx, ok := firstUserBlocker([]int{0, 1, 2}, board, 5, original, givens)
	if !ok || idx != 1 {
		t.Errorf("digit 5 at user cell 1: expected (1,true), got (%d,%v)", idx, ok)
	}
}

func TestFirstUserBlocker_BreaksOnGivenCellHoldingDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	cells[1] = 5
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[0] = 5
	original[1] = 5
	givens := make([]int, 81)
	givens[0] = 5

	idx, ok := firstUserBlocker([]int{0, 1}, board, 5, original, givens)
	if ok || idx != -1 {
		t.Errorf("given cell 0 holds digit: expected (-1,false) break, got (%d,%v)", idx, ok)
	}
}

func TestFirstUserBlocker_FalseWhenSolverPlacedCellHoldsDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 4
	board := human.NewBoard(cells)
	original := make([]int, 81)
	givens := make([]int, 81)

	idx, ok := firstUserBlocker([]int{0}, board, 4, original, givens)
	if ok || idx != -1 {
		t.Errorf("solver-placed cell: expected (-1,false), got (%d,%v)", idx, ok)
	}
}

func TestFirstUserBlocker_FalseWhenNoCellHoldsDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 1
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[0] = 1
	givens := make([]int, 81)

	idx, ok := firstUserBlocker([]int{0, 1, 2}, board, 9, original, givens)
	if ok || idx != -1 {
		t.Errorf("no cell holds digit 9: expected (-1,false), got (%d,%v)", idx, ok)
	}
}

// --- FindBlockingUserCell characterization tests ---
//
// These tests pin FindBlockingUserCell's deterministic result on the
// prior-analysis fixtures. They prove both transports (WASM and HTTP), which
// now call this shared function, get the same lowest-index + stop-on-first-digit
// result. They moved here from the HTTP transport's pure_helpers_test.go and
// handlers_mutation_kill_test.go when the function was unified.

func TestFindBlockingUserCell_ReturnsCellZeroAsBlocker(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[0] = 5
	givens := make([]int, 81)

	idx, digit := FindBlockingUserCell(board, 4, original, givens)
	if idx != 0 {
		t.Errorf("expected blocker cell 0, got %d", idx)
	}
	if digit != 5 {
		t.Errorf("expected digit 5 held at cell 0, got %d", digit)
	}
}

func TestFindBlockingUserCell_ReturnsMostBlockingCellWithItsDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 3
	cells[27] = 8
	cells[36] = 9
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 3
	original[27] = 8
	original[36] = 9
	givens := make([]int, 81)

	idx, digit := FindBlockingUserCell(board, 0, original, givens)
	if idx != 1 {
		t.Errorf("expected blocker cell 1 (count 2, lowest max), got %d", idx)
	}
	if digit != 3 {
		t.Errorf("expected digit 3 held at cell 1, got %d", digit)
	}
}

func TestFindBlockingUserCell_ReturnsMinusOneWhenNoUserBlockers(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 3
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 3
	givens := make([]int, 81)
	givens[1] = 3

	idx, digit := FindBlockingUserCell(board, 0, original, givens)
	if idx != -1 || digit != 0 {
		t.Errorf("expected (-1,0) when no user blockers, got (%d,%d)", idx, digit)
	}
}

// TestFindBlockingUserCell_BlockerIsDigitNine pins a blocker whose digit is 9
// and which is the unique max, killing the digit-loop comparison mutant that
// would skip digit 9, and the len(userBlockers)==0 incrementer (a single
// blocker would make the mutant early-return).
func TestFindBlockingUserCell_BlockerIsDigitNine(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 9
	cells[9] = 9
	cells[3] = 5
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 9
	original[9] = 9
	original[3] = 5
	givens := make([]int, 81)

	idx, digit := FindBlockingUserCell(board, 0, original, givens)
	if idx != 1 {
		t.Errorf("expected blocker cell 1 (count 2), got %d", idx)
	}
	if digit != 9 {
		t.Errorf("expected digit 9, got %d", digit)
	}
}

// TestFindBlockingUserCell_SingleBlockerReturnsCellAndDigit pins the
// single-blocker case. cell 27 (col 0 only of cell 0's peers) holds the only
// blocking user entry, so userBlockers has length 1. The len==0 incrementer
// mutant (==1) would early-return (-1,0) for exactly one blocker.
func TestFindBlockingUserCell_SingleBlockerReturnsCellAndDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[27] = 6
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[27] = 6
	givens := make([]int, 81)

	idx, digit := FindBlockingUserCell(board, 0, original, givens)
	if idx != 27 {
		t.Errorf("expected single blocker cell 27, got %d", idx)
	}
	if digit != 6 {
		t.Errorf("expected digit 6, got %d", digit)
	}
}

// TestFindBlockingUserCell_DeterministicLowestIndexTieBreak pins the
// lowest-index tie-break rule. Cell 1 (count 2) and cell 2 (count 2) both
// block two digits of contradictionCell 0; cell 1 must win because the
// scan walks cell indices in order and uses a strict ">" comparison. The WASM
// copy previously used map iteration here and returned a non-deterministic
// winner; the unified deterministic form is the contracted behavior now.
func TestFindBlockingUserCell_DeterministicLowestIndexTieBreak(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 3
	cells[2] = 4
	cells[9] = 3
	cells[18] = 4
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 3
	original[2] = 4
	original[9] = 3
	original[18] = 4
	givens := make([]int, 81)

	idx, digit := FindBlockingUserCell(board, 0, original, givens)
	if idx != 1 {
		t.Errorf("expected lowest-index tied cell 1, got %d", idx)
	}
	if digit != 3 {
		t.Errorf("expected digit 3 held at cell 1, got %d", digit)
	}
}
