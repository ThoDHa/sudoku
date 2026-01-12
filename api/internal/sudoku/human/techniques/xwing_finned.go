package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Finned X-Wing Detection
// ============================================================================
//
// A Finned X-Wing is like a regular X-Wing but with one extra candidate (the "fin")
// in one of the rows/columns. The fin restricts where eliminations can occur:
// only cells that see both the X-Wing corner AND the fin can be eliminated.

// DetectFinnedXWing finds Finned X-Wing patterns
func DetectFinnedXWing(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		// Check row-based finned X-wing
		if move := detectFinnedXWingInRows(b, digit); move != nil {
			return move
		}
		// Check column-based finned X-wing
		if move := detectFinnedXWingInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectFinnedXWingInRows(b BoardInterface, digit int) *core.Move {
	// Find rows with 2-3 candidates for this digit
	type rowInfo struct {
		row  int
		cols []int
	}
	var rows []rowInfo

	for row := 0; row < constants.GridSize; row++ {
		var cols []int
		for col := 0; col < constants.GridSize; col++ {
			if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
				cols = append(cols, col)
			}
		}
		if len(cols) >= 2 && len(cols) <= 3 {
			rows = append(rows, rowInfo{row, cols})
		}
	}

	// Try pairs of rows
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			r1, r2 := rows[i], rows[j]

			// One row should have exactly 2, the other 2 or 3
			// The row with 3 has the fin
			var baseRow, finRow rowInfo
			if len(r1.cols) == 2 && len(r2.cols) == 3 {
				baseRow, finRow = r1, r2
			} else if len(r1.cols) == 3 && len(r2.cols) == 2 {
				baseRow, finRow = r2, r1
			} else if len(r1.cols) == 2 && len(r2.cols) == 2 {
				// Both have 2 - not a finned X-wing
				continue
			} else {
				continue
			}

			// Find common columns and fin column
			c1, c2 := baseRow.cols[0], baseRow.cols[1]
			finCol := -1
			hasC1, hasC2 := false, false

			for _, c := range finRow.cols {
				switch c {
				case c1:
					hasC1 = true
				case c2:
					hasC2 = true
				default:
					finCol = c
				}
			}

			if !hasC1 || !hasC2 || finCol == -1 {
				continue
			}

			// The fin must be in the same box as one of the base columns in the fin row
			finRowBox := finRow.row / constants.BoxSize
			finColBox := finCol / constants.BoxSize

			// Find which base column the fin shares a box with
			targetCol := -1
			if c1/constants.BoxSize == finColBox {
				targetCol = c1
			} else if c2/constants.BoxSize == finColBox {
				targetCol = c2
			}

			if targetCol == -1 {
				continue
			}

			// Eliminations: cells in targetCol that are in the same box-row as the fin
			// and see the base row's targetCol cell
			var eliminations []core.Candidate
			boxRowStart := finRowBox * constants.BoxSize
			for r := boxRowStart; r < boxRowStart+constants.BoxSize; r++ {
				if r == finRow.row || r == baseRow.row {
					continue
				}
				idx := r*constants.GridSize + targetCol
				if b.GetCandidatesAt(idx).Has(digit) {
					eliminations = append(eliminations, core.Candidate{Row: r, Col: targetCol, Digit: digit})
				}
			}

			if len(eliminations) > 0 {
				return &core.Move{
					Action: "eliminate",
					Digit:  digit,
					Targets: []core.CellRef{
						{Row: baseRow.row, Col: c1}, {Row: baseRow.row, Col: c2},
						{Row: finRow.row, Col: c1}, {Row: finRow.row, Col: c2},
						{Row: finRow.row, Col: finCol},
					},
					Eliminations: eliminations,
					Explanation:  fmt.Sprintf("Finned X-Wing: %d in rows %d,%d with fin at R%dC%d", digit, baseRow.row+1, finRow.row+1, finRow.row+1, finCol+1),
					Highlights: core.Highlights{
						Primary: []core.CellRef{
							{Row: baseRow.row, Col: c1}, {Row: baseRow.row, Col: c2},
							{Row: finRow.row, Col: c1}, {Row: finRow.row, Col: c2},
						},
						Secondary: []core.CellRef{{Row: finRow.row, Col: finCol}},
					},
				}
			}
		}
	}

	return nil
}

func detectFinnedXWingInCols(b BoardInterface, digit int) *core.Move {
	// Find columns with 2-3 candidates for this digit
	type colInfo struct {
		col  int
		rows []int
	}
	var cols []colInfo

	for col := 0; col < constants.GridSize; col++ {
		var rows []int
		for row := 0; row < constants.GridSize; row++ {
			if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
				rows = append(rows, row)
			}
		}
		if len(rows) >= 2 && len(rows) <= 3 {
			cols = append(cols, colInfo{col, rows})
		}
	}

	// Try pairs of columns
	for i := 0; i < len(cols); i++ {
		for j := i + 1; j < len(cols); j++ {
			c1, c2 := cols[i], cols[j]

			// One column should have exactly 2 rows, the other 2 or 3
			var baseCol, finCol colInfo
			if len(c1.rows) == 2 && len(c2.rows) == 3 {
				baseCol, finCol = c1, c2
			} else if len(c1.rows) == 3 && len(c2.rows) == 2 {
				baseCol, finCol = c2, c1
			} else if len(c1.rows) == 2 && len(c2.rows) == 2 {
				continue
			} else {
				continue
			}

			// Find common rows and fin row
			r1, r2 := baseCol.rows[0], baseCol.rows[1]
			finRow := -1
			hasR1, hasR2 := false, false

			for _, r := range finCol.rows {
				switch r {
				case r1:
					hasR1 = true
				case r2:
					hasR2 = true
				default:
					finRow = r
				}
			}

			if !hasR1 || !hasR2 || finRow == -1 {
				continue
			}

			// The fin must be in the same box as one of the base rows in the fin column
			finColBox := finCol.col / constants.BoxSize
			finRowBox := finRow / constants.BoxSize

			// Find which base row the fin shares a box with
			targetRow := -1
			if r1/constants.BoxSize == finRowBox {
				targetRow = r1
			} else if r2/constants.BoxSize == finRowBox {
				targetRow = r2
			}

			if targetRow == -1 {
				continue
			}

			// Eliminations: cells in targetRow that are in the same box-column as the fin
			var eliminations []core.Candidate
			boxColStart := finColBox * constants.BoxSize
			for c := boxColStart; c < boxColStart+constants.BoxSize; c++ {
				if c == finCol.col || c == baseCol.col {
					continue
				}
				idx := targetRow*constants.GridSize + c
				if b.GetCandidatesAt(idx).Has(digit) {
					eliminations = append(eliminations, core.Candidate{Row: targetRow, Col: c, Digit: digit})
				}
			}

			if len(eliminations) > 0 {
				return &core.Move{
					Action: "eliminate",
					Digit:  digit,
					Targets: []core.CellRef{
						{Row: r1, Col: baseCol.col}, {Row: r2, Col: baseCol.col},
						{Row: r1, Col: finCol.col}, {Row: r2, Col: finCol.col},
						{Row: finRow, Col: finCol.col},
					},
					Eliminations: eliminations,
					Explanation:  fmt.Sprintf("Finned X-Wing: %d in columns %d,%d with fin at R%dC%d", digit, baseCol.col+1, finCol.col+1, finRow+1, finCol.col+1),
					Highlights: core.Highlights{
						Primary: []core.CellRef{
							{Row: r1, Col: baseCol.col}, {Row: r2, Col: baseCol.col},
							{Row: r1, Col: finCol.col}, {Row: r2, Col: finCol.col},
						},
						Secondary: []core.CellRef{{Row: finRow, Col: finCol.col}},
					},
				}
			}
		}
	}

	return nil
}
