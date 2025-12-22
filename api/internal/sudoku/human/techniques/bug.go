package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
)

// ============================================================================
// BUG (Bivalue Universal Grave) Detection
// ============================================================================
//
// A BUG is a pattern where all unsolved cells have exactly 2 candidates,
// creating multiple possible solutions (a "deadly pattern"). A valid puzzle
// must have exactly one solution, so if we're one cell away from a BUG
// (BUG+1), we can determine what that cell must be.
//
// BUG+1: All cells except one have exactly 2 candidates, and that one cell
// has 3 candidates. The "extra" digit (the one that appears 3 times in its
// row, column, or box) must be the solution for that cell.

// DetectBUG finds BUG (Bivalue Universal Grave) patterns
func DetectBUG(b BoardInterface) *core.Move {
	// Count cells with !=2 candidates
	var extraCells []int
	for i := 0; i < 81; i++ {
		if b.GetCell(i) != 0 {
			continue
		}
		if b.GetCandidatesAt(i).Count() != 2 {
			extraCells = append(extraCells, i)
		}
	}

	// BUG+1: exactly one cell with 3 candidates
	if len(extraCells) != 1 {
		return nil
	}

	bugCell := extraCells[0]
	if b.GetCandidatesAt(bugCell).Count() != 3 {
		return nil
	}

	// Check if all bi-value cells would form a BUG
	// In a BUG, every unsolved cell has exactly 2 candidates,
	// and each candidate appears exactly twice in every row, column, and box

	// Find the "extra" digit that appears 3 times in its row/col/box
	row, col := bugCell/9, bugCell%9
	box := (row/3)*3 + col/3

	for _, digit := range b.GetCandidatesAt(bugCell).ToSlice() {
		// Count occurrences in row
		rowCount := 0
		for c := 0; c < 9; c++ {
			if b.GetCandidatesAt(row*9 + c).Has(digit) {
				rowCount++
			}
		}

		// Count occurrences in column
		colCount := 0
		for r := 0; r < 9; r++ {
			if b.GetCandidatesAt(r*9 + col).Has(digit) {
				colCount++
			}
		}

		// Count occurrences in box
		boxCount := 0
		boxRow, boxCol := (box/3)*3, (box%3)*3
		for r := boxRow; r < boxRow+3; r++ {
			for c := boxCol; c < boxCol+3; c++ {
				if b.GetCandidatesAt(r*9 + c).Has(digit) {
					boxCount++
				}
			}
		}

		// If this digit appears 3 times in row, col, or box, it's the BUG digit
		if rowCount == 3 || colCount == 3 || boxCount == 3 {
			return &core.Move{
				Action:      "assign",
				Digit:       digit,
				Targets:     []core.CellRef{{Row: row, Col: col}},
				Explanation: fmt.Sprintf("BUG+1: All other cells are bi-value; R%dC%d must be %d to avoid multiple solutions", row+1, col+1, digit),
				Highlights: core.Highlights{
					Primary: []core.CellRef{{Row: row, Col: col}},
				},
			}
		}
	}

	return nil
}
