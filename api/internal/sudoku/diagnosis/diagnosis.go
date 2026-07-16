// Package diagnosis contains shared user-error detection logic used by both
// the HTTP API and the WASM client to pinpoint which user-entered cell is
// most likely wrong.
package diagnosis

import (
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

// FindErrorByCandidateRefill uses the "clear and recalculate" strategy to
// find user errors: rebuild candidates from the current board, then for any
// cell that ends up with zero candidates, scan its peers for a user-entered
// cell blocking some digit. The first such blocker is returned.
//
// Scan order is digit-major (1..9), then peers in row, column, box order
// (left to right, top to bottom), so the first match is deterministic. This
// behavior is identical across the HTTP and WASM transports, which is why it
// is unified here.
//
// Returns: (badCell, badDigit, zeroCandidateCell) or (-1, 0, -1) if no error
// is found.
func FindErrorByCandidateRefill(originalUserBoard, givens []int) (badCell, badDigit, zeroCandidateCell int) {
	freshBoard := human.NewBoard(originalUserBoard)

	for idx := 0; idx < constants.TotalCells; idx++ {
		if originalUserBoard[idx] != 0 {
			continue
		}
		if !freshBoard.Candidates[idx].IsEmpty() {
			continue
		}

		// Cell has no candidates: scan its peers for the first user-entered
		// cell blocking some digit. Scan order is row, column, box (left to
		// right, top to bottom) with digit as the outer loop, so the first
		// match is deterministic.
		row, col := idx/constants.GridSize, idx%constants.GridSize
		for digit := 1; digit <= constants.GridSize; digit++ {
			if cellIdx, ok := firstBlockingUserPeer(originalUserBoard, givens, row, col, digit); ok {
				return cellIdx, digit, idx
			}
		}
	}

	return -1, 0, -1
}

// firstBlockingUserPeer scans the row, column, and box peers of (row, col), in
// that order, for the first user-entered cell (a non-given holding digit). It
// returns that cell's index and true, or -1 and false when no peer blocks
// digit. The scan order matches the original per-transport inline scans, so
// the first match is deterministic.
func firstBlockingUserPeer(originalUserBoard, givens []int, row, col, digit int) (int, bool) {
	// Row peers (left to right).
	for c := 0; c < constants.GridSize; c++ {
		cellIdx := row*constants.GridSize + c
		if userHoldsDigit(originalUserBoard, givens, cellIdx, digit) {
			return cellIdx, true
		}
	}
	// Column peers (top to bottom).
	for r := 0; r < constants.GridSize; r++ {
		cellIdx := r*constants.GridSize + col
		if userHoldsDigit(originalUserBoard, givens, cellIdx, digit) {
			return cellIdx, true
		}
	}
	// Box peers (row by row).
	boxRow := (row / constants.BoxSize) * constants.BoxSize
	boxCol := (col / constants.BoxSize) * constants.BoxSize
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			cellIdx := r*constants.GridSize + c
			if userHoldsDigit(originalUserBoard, givens, cellIdx, digit) {
				return cellIdx, true
			}
		}
	}
	return -1, false
}

// userHoldsDigit reports whether cellIdx is a user-entered cell (not a given)
// whose value equals digit.
func userHoldsDigit(originalUserBoard, givens []int, cellIdx, digit int) bool {
	return originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0
}
