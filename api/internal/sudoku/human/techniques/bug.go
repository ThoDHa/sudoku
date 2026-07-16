package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// DetectBUG finds a BUG+1 (Bivalue Universal Grave + 1): a board one tri-value
// cell away from a deadly pattern. Because a valid puzzle has a unique solution,
// the one candidate of that cell which appears three times in its row, column,
// and box must be the solution.
//
//nolint:gocyclo // BUG+1 detection combines the structural gate, the 27-unit invariant scan, and the restore-digit search in a single sequential pass
func DetectBUG(b BoardInterface) *core.Move {
	var extraCells []int
	for i := range constants.TotalCells {
		if b.GetCell(i) != 0 {
			continue
		}
		if b.GetCandidatesAt(i).Count() != 2 {
			extraCells = append(extraCells, i)
		}
	}

	if len(extraCells) != 1 {
		return nil
	}

	bugCell := extraCells[0]
	if b.GetCandidatesAt(bugCell).Count() != 3 {
		return nil
	}

	if !bugInvariantHolds(b, bugCell) {
		return nil
	}

	bugRow, bugCol := RowOf(bugCell), ColOf(bugCell)
	bugBox := BoxOf(bugCell)

	var restoreDigit, restoreHits int
	for _, digit := range b.GetCandidatesAt(bugCell).ToSlice() {
		rowCount := countDigitInUnit(b, RowIndices[bugRow], digit)
		colCount := countDigitInUnit(b, ColIndices[bugCol], digit)
		boxCount := countDigitInUnit(b, BoxIndices[bugBox], digit)
		if rowCount == 3 && colCount == 3 && boxCount == 3 {
			restoreHits++
			restoreDigit = digit
		}
	}

	if restoreHits != 1 {
		return nil
	}

	return &core.Move{
		Action:      "assign",
		Digit:       restoreDigit,
		Targets:     []core.CellRef{{Row: bugRow, Col: bugCol}},
		Explanation: fmt.Sprintf("BUG+1: All other cells are bi-value; R%dC%d must be %d to avoid multiple solutions", bugRow+1, bugCol+1, restoreDigit),
		Highlights: core.Highlights{
			Primary: []core.CellRef{{Row: bugRow, Col: bugCol}},
		},
	}
}

// countDigitInUnit counts the empty cells of a unit holding digit as a candidate.
func countDigitInUnit(b BoardInterface, cells []int, digit int) int {
	count := 0
	for _, idx := range cells {
		if b.GetCell(idx) != 0 {
			continue
		}
		if b.GetCandidatesAt(idx).Has(digit) {
			count++
		}
	}
	return count
}

// bugInvariantHolds verifies the pre-BUG deadly-pattern invariant across all 27
// units. A unit without the bug cell must carry every digit 0 or 2 times. The
// bug cell's own row, column, and box may additionally let a bug-cell candidate
// reach 3 (the restore overshoot); any other count there means this is not a
// true BUG+1 state.
func bugInvariantHolds(b BoardInterface, bugCell int) bool {
	bugRow, bugCol, bugBox := RowOf(bugCell), ColOf(bugCell), BoxOf(bugCell)
	bugCands := b.GetCandidatesAt(bugCell)
	unitKinds := [3][constants.GridSize][]int{RowIndices, ColIndices, BoxIndices}
	bugUnitKeys := [3]int{bugRow, bugCol, bugBox}

	for kind := range 3 {
		for u := range constants.GridSize {
			containsBug := u == bugUnitKeys[kind]
			for digit := 1; digit <= constants.GridSize; digit++ {
				count := countDigitInUnit(b, unitKinds[kind][u], digit)
				switch {
				case count == 0, count == 2:
				case count == 3 && containsBug && bugCands.Has(digit):
				default:
					return false
				}
			}
		}
	}
	return true
}
