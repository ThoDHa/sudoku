package http

import (
	"regexp"
	"testing"
)

var hexPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func TestHashSeedIsDeterministicAndVariesByInput(t *testing.T) {
	first := hashSeed("practice-seed-123")
	sameAgain := hashSeed("practice-seed-123")
	other := hashSeed("practice-seed-999")

	if first != sameAgain {
		t.Errorf("hashSeed must be deterministic: got %d then %d", first, sameAgain)
	}
	if first == other {
		t.Errorf("hashSeed should differ for different seeds, both gave %d", first)
	}
}

func TestHashSolutionProducesDeterministicSha256Hex(t *testing.T) {
	emptyBoard := make([]int, 81)
	mixedBoard := make([]int, 81)
	mixedBoard[0] = 5
	mixedBoard[40] = 9

	emptyHash := hashSolution(emptyBoard)

	if !hexPattern.MatchString(emptyHash) {
		t.Errorf("expected 64-char hex sha256, got %q", emptyHash)
	}
	if hashSolution(emptyBoard) != emptyHash {
		t.Error("hashSolution must be deterministic for the same board")
	}
	if hashSolution(mixedBoard) == emptyHash {
		t.Error("hashSolution should differ when board contents change")
	}
}

func TestFindErrorByCandidateRefillReturnsNoErrorOnCleanBoard(t *testing.T) {
	board := make([]int, 81)
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := findErrorByCandidateRefill(board, givens)

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

	badCell, badDigit, zeroCell := findErrorByCandidateRefill(board, givens)

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
