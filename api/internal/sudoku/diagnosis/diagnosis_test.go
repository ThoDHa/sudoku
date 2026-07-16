package diagnosis

import "testing"

// The tests in this file characterize FindErrorByCandidateRefill: they pin
// the exact (badCell, badDigit, zeroCandidateCell) return for fixture boards.
// They were unified here from the HTTP transport (where the function
// previously lived as a package-private helper) so the shared package proves
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
