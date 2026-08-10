// Package diagnosis contains shared user-error detection logic used by both
// the HTTP API and the WASM client to pinpoint which user-entered cell is
// most likely wrong.
package diagnosis

import (
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

// noCell is the "no such cell" sentinel every scan in this package returns.
// It sits outside 0..TotalCells-1, so it can never be mistaken for a real cell
// index, and having exactly one spelling of it means the value is pinned by any
// test that reads a not-found result rather than being restated at each return.
const noCell = -1

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
// Returns: (badCell, badDigit, zeroCandidateCell) or (noCell, 0, noCell) if no error
// is found.
func FindErrorByCandidateRefill(originalUserBoard, givens []int) (badCell, badDigit, zeroCandidateCell int) {
	freshBoard := human.NewBoard(originalUserBoard)

	for idx := range constants.TotalCells {
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
		for d := range constants.GridSize {
			digit := d + 1
			if cellIdx, ok := firstBlockingUserPeer(originalUserBoard, givens, row, col, digit); ok {
				return cellIdx, digit, idx
			}
		}
	}

	return noCell, 0, noCell
}

// firstBlockingUserPeer scans the row, column, and box peers of (row, col), in
// that order, for the first user-entered cell (a non-given holding digit). It
// returns that cell's index and true, or noCell and false when no peer blocks
// digit. The scan order matches the original per-transport inline scans, so
// the first match is deterministic.
func firstBlockingUserPeer(originalUserBoard, givens []int, row, col, digit int) (int, bool) {
	// Row, then column, then box — peerCellIndices returns the peers in that
	// exact order, preserving the deterministic first-match scan.
	rowCells, colCells, boxCells := peerCellIndices(row, col)
	for _, unit := range [...][]int{rowCells, colCells, boxCells} {
		for _, cellIdx := range unit {
			if userHoldsDigit(originalUserBoard, givens, cellIdx, digit) {
				return cellIdx, true
			}
		}
	}
	return noCell, false
}

// userHoldsDigit reports whether cellIdx is a user-entered cell (not a given)
// whose value equals digit.
func userHoldsDigit(originalUserBoard, givens []int, cellIdx, digit int) bool {
	return originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0
}

// peerCellIndices returns the cell indices of the row, column, and 3x3 box
// peers of the cell at (row, col). Row peers come first (left to right), then
// column peers (top to bottom), then box peers in row-major order. The
// diagnosis helpers below scan peers in this exact order, so reordering the
// returned slices would change which cell is reported as the blocker.
func peerCellIndices(row, col int) (rowCells, colCells, boxCells []int) {
	rowCells = make([]int, constants.GridSize)
	colCells = make([]int, constants.GridSize)
	for i := range constants.GridSize {
		rowCells[i] = row*constants.GridSize + i
		colCells[i] = i*constants.GridSize + col
	}
	boxRow := (row / constants.BoxSize) * constants.BoxSize
	boxCol := (col / constants.BoxSize) * constants.BoxSize
	// Filled by index rather than by append so the allocation is load-bearing:
	// a capacity-only `make` is unobservable, and the row and column slices
	// above are built the same way.
	boxCells = make([]int, constants.GridSize)
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			boxCells[(r-boxRow)*constants.BoxSize+(c-boxCol)] = r*constants.GridSize + c
		}
	}
	return rowCells, colCells, boxCells
}

// firstUserBlocker scans cells in order for the first one holding digit. It
// returns that cell's index and true when the cell is a user entry (present in
// originalUserBoard) and not a given. It returns false on the first non-user
// match or when no cell holds digit: once a digit is found in a region, no
// other cell in that region is considered even if it is not a user entry. This
// stop-on-first-digit rule is what makes FindBlockingUserCell deterministic
// across the row/column/box regions.
func firstUserBlocker(cells []int, board *human.Board, digit int, originalUserBoard, givens []int) (int, bool) {
	for _, idx := range cells {
		if board.Cells[idx] != digit {
			continue
		}
		if originalUserBoard[idx] != 0 && givens[idx] == 0 {
			return idx, true
		}
		return noCell, false
	}
	return noCell, false
}

// FindBlockingUserCell analyzes a contradiction reported by the solver and
// identifies which user-entered cell is most likely causing it.
//
// For each digit 1-9 it asks what is blocking it from contradictionCell, in
// turn scanning the cell's row, column, and box via firstUserBlocker. Only
// user-entered cells (not givens, not solver placements) are considered, and
// each region contributes at most one blocker (the first cell holding the
// digit). The user cell blocking the most candidates is reported as most
// likely wrong; ties resolve to the lowest-index cell, so the result is
// deterministic.
//
// Returns: Cell index and blocking digit, or (noCell, 0) if no user error found.
func FindBlockingUserCell(board *human.Board, contradictionCell int, originalUserBoard, givens []int) (int, int) {
	row, col := contradictionCell/constants.GridSize, contradictionCell%constants.GridSize
	rowCells, colCells, boxCells := peerCellIndices(row, col)

	// Count how many times each user cell appears as a blocker; the cell
	// blocking the most candidates is most likely wrong. A cell reached by
	// several digits keeps the last one scanned, matching the original
	// per-transport behavior.
	cellCount := make(map[int]int)
	cellDigit := make(map[int]int)
	for d := range constants.GridSize {
		digit := d + 1
		for _, region := range [][]int{rowCells, colCells, boxCells} {
			if idx, ok := firstUserBlocker(region, board, digit, originalUserBoard, givens); ok {
				cellCount[idx]++
				cellDigit[idx] = digit
			}
		}
	}

	// Iterating in cell-index order with a strict ">" comparison makes ties
	// resolve to the lowest-index cell, keeping the result deterministic.
	maxCount := 0
	maxCell := noCell
	for idx := range constants.TotalCells {
		if cellCount[idx] > maxCount {
			maxCount = cellCount[idx]
			maxCell = idx
		}
	}

	if maxCell != noCell {
		return maxCell, cellDigit[maxCell]
	}
	return noCell, 0
}
