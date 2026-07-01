package http

import (
	"reflect"
	"regexp"
	"testing"

	"sudoku-api/internal/core"
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

// --- peerCellIndices exact cell indices ---
// TestMutation_PeerCellIndices_ExactIndices pins the exact cell indices returned
// by peerCellIndices for a mid-grid cell. This kills all arithmetic/base mutants
// on row*GridSize, i*GridSize, box origin computation, and box cell computation.
func TestMutation_PeerCellIndices_ExactIndices(t *testing.T) {
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

// TestMutation_PeerCellIndices_TopLeftCorner pins indices for cell (0,0) to
// kill mutants on box origin at the grid boundary (0/BoxSize*BoxSize = 0).
func TestMutation_PeerCellIndices_TopLeftCorner(t *testing.T) {
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

// TestMutation_PeerCellIndices_BottomRightCorner pins indices for cell (8,8)
// to kill mutants on box boundary computation at the grid edge.
func TestMutation_PeerCellIndices_BottomRightCorner(t *testing.T) {
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

// TestMutation_ValidateDifficulty tests all valid difficulty levels plus an
// invalid one, killing branch/case mutants in the validation function.
func TestMutation_ValidateDifficulty(t *testing.T) {
	for _, d := range []string{"easy", "medium", "hard", "extreme", "impossible"} {
		if !validateDifficulty(core.Difficulty(d)) {
			t.Errorf("validateDifficulty(%q) = false, want true", d)
		}
	}
	if validateDifficulty(core.Difficulty("bogus")) {
		t.Error(`validateDifficulty("bogus") = true, want false`)
	}
}
