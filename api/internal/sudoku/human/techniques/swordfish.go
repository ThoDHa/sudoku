package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Swordfish Detection
// ============================================================================
//
// Swordfish is a fish pattern that uses 3 rows and 3 columns.
// If a digit appears 2-3 times in each of 3 rows, and those positions
// align to exactly 3 columns, the digit can be eliminated from other
// cells in those columns (and vice versa for column-based Swordfish).

// DetectSwordfish finds Swordfish patterns
func DetectSwordfish(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		if move := detectSwordfishInRows(b, digit); move != nil {
			return move
		}
		if move := detectSwordfishInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectSwordfishInRows(b BoardInterface, digit int) *core.Move {
	// Find rows where digit appears in 2-3 columns
	rowPositions := make(map[int][]int)
	for row := 0; row < constants.GridSize; row++ {
		var cols []int
		for col := 0; col < constants.GridSize; col++ {
			if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
				cols = append(cols, col)
			}
		}
		if len(cols) >= 2 && len(cols) <= 3 {
			rowPositions[row] = cols
		}
	}

	var rows []int
	for row := range rowPositions {
		rows = append(rows, row)
	}

	if len(rows) < 3 {
		return nil
	}

	// Try all combinations of 3 rows
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			for k := j + 1; k < len(rows); k++ {
				r1, r2, r3 := rows[i], rows[j], rows[k]

				// Union of columns
				colSet := make(map[int]bool)
				for _, c := range rowPositions[r1] {
					colSet[c] = true
				}
				for _, c := range rowPositions[r2] {
					colSet[c] = true
				}
				for _, c := range rowPositions[r3] {
					colSet[c] = true
				}

				if len(colSet) != 3 {
					continue
				}

				var cols []int
				for c := range colSet {
					cols = append(cols, c)
				}

				// Find eliminations in these columns
				var eliminations []core.Candidate
				for _, col := range cols {
					for row := 0; row < constants.GridSize; row++ {
						if row == r1 || row == r2 || row == r3 {
							continue
						}
						if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
							eliminations = append(eliminations, core.Candidate{
								Row: row, Col: col, Digit: digit,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					var targets []core.CellRef
					for _, row := range []int{r1, r2, r3} {
						for _, col := range rowPositions[row] {
							targets = append(targets, core.CellRef{Row: row, Col: col})
						}
					}

					return &core.Move{
						Action:       "eliminate",
						Digit:        digit,
						Targets:      targets,
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Swordfish: %d in rows %d,%d,%d columns %d,%d,%d", digit, r1+1, r2+1, r3+1, cols[0]+1, cols[1]+1, cols[2]+1),
						Highlights: core.Highlights{
							Primary: targets,
						},
					}
				}
			}
		}
	}

	return nil
}

func detectSwordfishInCols(b BoardInterface, digit int) *core.Move {
	// Find columns where digit appears in 2-3 rows
	colPositions := make(map[int][]int)
	for col := 0; col < constants.GridSize; col++ {
		var rows []int
		for row := 0; row < constants.GridSize; row++ {
			if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
				rows = append(rows, row)
			}
		}
		if len(rows) >= 2 && len(rows) <= 3 {
			colPositions[col] = rows
		}
	}

	var cols []int
	for col := range colPositions {
		cols = append(cols, col)
	}

	if len(cols) < 3 {
		return nil
	}

	// Try all combinations of 3 columns
	for i := 0; i < len(cols); i++ {
		for j := i + 1; j < len(cols); j++ {
			for k := j + 1; k < len(cols); k++ {
				c1, c2, c3 := cols[i], cols[j], cols[k]

				// Union of rows
				rowSet := make(map[int]bool)
				for _, r := range colPositions[c1] {
					rowSet[r] = true
				}
				for _, r := range colPositions[c2] {
					rowSet[r] = true
				}
				for _, r := range colPositions[c3] {
					rowSet[r] = true
				}

				if len(rowSet) != 3 {
					continue
				}

				var rows []int
				for r := range rowSet {
					rows = append(rows, r)
				}

				// Find eliminations in these rows
				var eliminations []core.Candidate
				for _, row := range rows {
					for col := 0; col < constants.GridSize; col++ {
						if col == c1 || col == c2 || col == c3 {
							continue
						}
						if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
							eliminations = append(eliminations, core.Candidate{
								Row: row, Col: col, Digit: digit,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					var targets []core.CellRef
					for _, col := range []int{c1, c2, c3} {
						for _, row := range colPositions[col] {
							targets = append(targets, core.CellRef{Row: row, Col: col})
						}
					}

					return &core.Move{
						Action:       "eliminate",
						Digit:        digit,
						Targets:      targets,
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Swordfish: %d in columns %d,%d,%d rows %d,%d,%d", digit, c1+1, c2+1, c3+1, rows[0]+1, rows[1]+1, rows[2]+1),
						Highlights: core.Highlights{
							Primary: targets,
						},
					}
				}
			}
		}
	}

	return nil
}

// ============================================================================
// Finned Swordfish Detection
// ============================================================================
//
// Similar to regular Swordfish but with "fin" cells:
// - 3 rows where a digit appears in 2-4 positions
// - Positions align to exactly 3 columns (or vice versa)
// - One row has extra positions (the "fin") not in the main columns
// - Eliminate the digit from cells that are in one of the 3 columns AND see the fin cell

func DetectFinnedSwordfish(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		if move := detectFinnedSwordfishInRows(b, digit); move != nil {
			return move
		}
		if move := detectFinnedSwordfishInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectFinnedSwordfishInRows(b BoardInterface, digit int) *core.Move {
	// Find rows where digit appears in 2-4 columns (2-3 for base, up to 4 for finned row)
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
		if len(cols) >= 2 && len(cols) <= 4 {
			rows = append(rows, rowInfo{row, cols})
		}
	}

	if len(rows) < 3 {
		return nil
	}

	// Try all combinations of 3 rows
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			for k := j + 1; k < len(rows); k++ {
				r1, r2, r3 := rows[i], rows[j], rows[k]

				// Try each row as the potential finned row
				for _, configs := range [][]rowInfo{
					{r1, r2, r3}, // r1 is finned
					{r2, r1, r3}, // r2 is finned
					{r3, r1, r2}, // r3 is finned
				} {
					finnedRow := configs[0]
					baseRow1 := configs[1]
					baseRow2 := configs[2]

					// Base rows should have 2-3 candidates each
					if len(baseRow1.cols) > 3 || len(baseRow2.cols) > 3 {
						continue
					}

					// Collect base columns from the two base rows
					baseColSet := make(map[int]bool)
					for _, c := range baseRow1.cols {
						baseColSet[c] = true
					}
					for _, c := range baseRow2.cols {
						baseColSet[c] = true
					}

					// Base rows must use exactly 3 columns
					if len(baseColSet) != 3 {
						continue
					}

					// Find main columns (in baseColSet) and fin columns in the finned row
					var mainCols []int
					var finCols []int
					for _, c := range finnedRow.cols {
						if baseColSet[c] {
							mainCols = append(mainCols, c)
						} else {
							finCols = append(finCols, c)
						}
					}

					// Finned row must have at least 2 main columns and at least 1 fin
					if len(mainCols) < 2 || len(finCols) == 0 {
						continue
					}

					// All fins must be in the same box
					if len(finCols) > 1 {
						finBox := finCols[0] / constants.BoxSize
						sameBox := true
						for _, fc := range finCols[1:] {
							if fc/constants.BoxSize != finBox {
								sameBox = false
								break
							}
						}
						if !sameBox {
							continue
						}
					}

					// The fin(s) must share a box with at least one main column position in the finned row
					finRowInBox := finnedRow.row / constants.BoxSize

					// Find which main columns are in the same box as the fin
					var targetCols []int
					for _, mc := range mainCols {
						if mc/constants.BoxSize == finCols[0]/constants.BoxSize {
							targetCols = append(targetCols, mc)
						}
					}

					if len(targetCols) == 0 {
						continue
					}

					// Find eliminations: cells that are:
					// 1. In one of the 3 base columns (would be eliminated by regular swordfish)
					// 2. AND see the fin cell (in same box as fin)
					// 3. AND not part of the swordfish pattern
					var eliminations []core.Candidate
					swordfishRows := map[int]bool{
						finnedRow.row: true,
						baseRow1.row:  true,
						baseRow2.row:  true,
					}

					// Eliminations can only occur in the target columns (columns in same box as fin)
					// and only in rows within the fin's box (but not the swordfish rows)
					boxRowStart := finRowInBox * constants.BoxSize
					for _, tc := range targetCols {
						for row := boxRowStart; row < boxRowStart+constants.BoxSize; row++ {
							if swordfishRows[row] {
								continue
							}
							idx := row*constants.GridSize + tc
							if b.GetCandidatesAt(idx).Has(digit) {
								// Verify this cell sees the fin (it will if in same box)
								seesAllFins := true
								for _, fc := range finCols {
									finIdx := finnedRow.row*constants.GridSize + fc
									if !ArePeers(idx, finIdx) {
										seesAllFins = false
										break
									}
								}
								if seesAllFins {
									eliminations = append(eliminations, core.Candidate{
										Row: row, Col: tc, Digit: digit,
									})
								}
							}
						}
					}

					if len(eliminations) > 0 {
						// Build targets (all cells in the pattern)
						var targets []core.CellRef
						for _, c := range baseRow1.cols {
							targets = append(targets, core.CellRef{Row: baseRow1.row, Col: c})
						}
						for _, c := range baseRow2.cols {
							targets = append(targets, core.CellRef{Row: baseRow2.row, Col: c})
						}
						for _, c := range mainCols {
							targets = append(targets, core.CellRef{Row: finnedRow.row, Col: c})
						}

						// Fin cells as secondary
						var finCells []core.CellRef
						for _, fc := range finCols {
							finCells = append(finCells, core.CellRef{Row: finnedRow.row, Col: fc})
						}

						rowIndices := []int{baseRow1.row, baseRow2.row, finnedRow.row}

						return &core.Move{
							Action:       "eliminate",
							Digit:        digit,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("Finned Swordfish: %d in rows %d,%d,%d with fin at R%dC%d",
								digit, rowIndices[0]+1, rowIndices[1]+1, rowIndices[2]+1,
								finnedRow.row+1, finCols[0]+1),
							Highlights: core.Highlights{
								Primary:   targets,
								Secondary: finCells,
							},
						}
					}
				}
			}
		}
	}

	return nil
}

func detectFinnedSwordfishInCols(b BoardInterface, digit int) *core.Move {
	// Find columns where digit appears in 2-4 rows (2-3 for base, up to 4 for finned col)
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
		if len(rows) >= 2 && len(rows) <= 4 {
			cols = append(cols, colInfo{col, rows})
		}
	}

	if len(cols) < 3 {
		return nil
	}

	// Try all combinations of 3 columns
	for i := 0; i < len(cols); i++ {
		for j := i + 1; j < len(cols); j++ {
			for k := j + 1; k < len(cols); k++ {
				c1, c2, c3 := cols[i], cols[j], cols[k]

				// Try each column as the potential finned column
				for _, configs := range [][]colInfo{
					{c1, c2, c3}, // c1 is finned
					{c2, c1, c3}, // c2 is finned
					{c3, c1, c2}, // c3 is finned
				} {
					finnedCol := configs[0]
					baseCol1 := configs[1]
					baseCol2 := configs[2]

					// Base columns should have 2-3 candidates each
					if len(baseCol1.rows) > 3 || len(baseCol2.rows) > 3 {
						continue
					}

					// Collect base rows from the two base columns
					baseRowSet := make(map[int]bool)
					for _, r := range baseCol1.rows {
						baseRowSet[r] = true
					}
					for _, r := range baseCol2.rows {
						baseRowSet[r] = true
					}

					// Base columns must use exactly 3 rows
					if len(baseRowSet) != 3 {
						continue
					}

					// Find main rows (in baseRowSet) and fin rows in the finned column
					var mainRows []int
					var finRows []int
					for _, r := range finnedCol.rows {
						if baseRowSet[r] {
							mainRows = append(mainRows, r)
						} else {
							finRows = append(finRows, r)
						}
					}

					// Finned column must have at least 2 main rows and at least 1 fin
					if len(mainRows) < 2 || len(finRows) == 0 {
						continue
					}

					// All fins must be in the same box
					if len(finRows) > 1 {
						finBox := finRows[0] / constants.BoxSize
						sameBox := true
						for _, fr := range finRows[1:] {
							if fr/constants.BoxSize != finBox {
								sameBox = false
								break
							}
						}
						if !sameBox {
							continue
						}
					}

					// The fin(s) must share a box with at least one main row position in the finned column
					finColInBox := finnedCol.col / constants.BoxSize

					// Find which main rows are in the same box as the fin
					var targetRows []int
					for _, mr := range mainRows {
						if mr/constants.BoxSize == finRows[0]/constants.BoxSize {
							targetRows = append(targetRows, mr)
						}
					}

					if len(targetRows) == 0 {
						continue
					}

					// Find eliminations: cells that are:
					// 1. In one of the 3 base rows (would be eliminated by regular swordfish)
					// 2. AND see the fin cell (in same box as fin)
					// 3. AND not part of the swordfish pattern
					var eliminations []core.Candidate
					swordfishCols := map[int]bool{
						finnedCol.col: true,
						baseCol1.col:  true,
						baseCol2.col:  true,
					}

					// Eliminations can only occur in the target rows (rows in same box as fin)
					// and only in columns within the fin's box (but not the swordfish columns)
					boxColStart := finColInBox * constants.BoxSize
					for _, tr := range targetRows {
						for col := boxColStart; col < boxColStart+constants.BoxSize; col++ {
							if swordfishCols[col] {
								continue
							}
							idx := tr*constants.GridSize + col
							if b.GetCandidatesAt(idx).Has(digit) {
								// Verify this cell sees the fin (it will if in same box)
								seesAllFins := true
								for _, fr := range finRows {
									finIdx := fr*constants.GridSize + finnedCol.col
									if !ArePeers(idx, finIdx) {
										seesAllFins = false
										break
									}
								}
								if seesAllFins {
									eliminations = append(eliminations, core.Candidate{
										Row: tr, Col: col, Digit: digit,
									})
								}
							}
						}
					}

					if len(eliminations) > 0 {
						// Build targets (all cells in the pattern)
						var targets []core.CellRef
						for _, r := range baseCol1.rows {
							targets = append(targets, core.CellRef{Row: r, Col: baseCol1.col})
						}
						for _, r := range baseCol2.rows {
							targets = append(targets, core.CellRef{Row: r, Col: baseCol2.col})
						}
						for _, r := range mainRows {
							targets = append(targets, core.CellRef{Row: r, Col: finnedCol.col})
						}

						// Fin cells as secondary
						var finCells []core.CellRef
						for _, fr := range finRows {
							finCells = append(finCells, core.CellRef{Row: fr, Col: finnedCol.col})
						}

						colIndices := []int{baseCol1.col, baseCol2.col, finnedCol.col}

						return &core.Move{
							Action:       "eliminate",
							Digit:        digit,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("Finned Swordfish: %d in columns %d,%d,%d with fin at R%dC%d",
								digit, colIndices[0]+1, colIndices[1]+1, colIndices[2]+1,
								finRows[0]+1, finnedCol.col+1),
							Highlights: core.Highlights{
								Primary:   targets,
								Secondary: finCells,
							},
						}
					}
				}
			}
		}
	}

	return nil
}
