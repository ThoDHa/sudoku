package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// sees() function has been moved to helpers.go

// detectSwordfish finds Swordfish pattern: 3 rows where a digit appears in 2-3 positions,
// and those positions share exactly 3 columns (or vice versa for columns)
func detectSwordfish(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		// Check rows for Swordfish
		if move := detectSwordfishInRows(b, digit); move != nil {
			return move
		}
		// Check columns for Swordfish
		if move := detectSwordfishInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectSwordfishInRows(b *Board, digit int) *core.Move {
	// Find rows where digit appears in 2-3 columns
	rowPositions := make(map[int][]int)
	for row := 0; row < 9; row++ {
		var cols []int
		for col := 0; col < 9; col++ {
			if b.Candidates[row*9+col].Has(digit) {
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
					for row := 0; row < 9; row++ {
						if row == r1 || row == r2 || row == r3 {
							continue
						}
						if b.Candidates[row*9+col].Has(digit) {
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

func detectSwordfishInCols(b *Board, digit int) *core.Move {
	// Find columns where digit appears in 2-3 rows
	colPositions := make(map[int][]int)
	for col := 0; col < 9; col++ {
		var rows []int
		for row := 0; row < 9; row++ {
			if b.Candidates[row*9+col].Has(digit) {
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
					for col := 0; col < 9; col++ {
						if col == c1 || col == c2 || col == c3 {
							continue
						}
						if b.Candidates[row*9+col].Has(digit) {
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

// detectSkyscraper finds Skyscraper pattern: two conjugate pairs sharing one end
func detectSkyscraper(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		// Find rows with exactly 2 candidates for this digit
		var rowPairs []struct {
			row  int
			cols [2]int
		}

		for row := 0; row < 9; row++ {
			var cols []int
			for col := 0; col < 9; col++ {
				if b.Candidates[row*9+col].Has(digit) {
					cols = append(cols, col)
				}
			}
			if len(cols) == 2 {
				rowPairs = append(rowPairs, struct {
					row  int
					cols [2]int
				}{row, [2]int{cols[0], cols[1]}})
			}
		}

		// Look for skyscraper patterns
		for i := 0; i < len(rowPairs); i++ {
			for j := i + 1; j < len(rowPairs); j++ {
				r1 := rowPairs[i]
				r2 := rowPairs[j]

				// Check if they share exactly one column
				shared := -1
				unshared1, unshared2 := -1, -1

				if r1.cols[0] == r2.cols[0] {
					shared = r1.cols[0]
					unshared1, unshared2 = r1.cols[1], r2.cols[1]
				} else if r1.cols[0] == r2.cols[1] {
					shared = r1.cols[0]
					unshared1, unshared2 = r1.cols[1], r2.cols[0]
				} else if r1.cols[1] == r2.cols[0] {
					shared = r1.cols[1]
					unshared1, unshared2 = r1.cols[0], r2.cols[1]
				} else if r1.cols[1] == r2.cols[1] {
					shared = r1.cols[1]
					unshared1, unshared2 = r1.cols[0], r2.cols[0]
				}

				if shared == -1 || unshared1 == unshared2 {
					continue
				}

				// The unshared ends must be in different boxes for a proper skyscraper
				box1 := (r1.row/3)*3 + unshared1/3
				box2 := (r2.row/3)*3 + unshared2/3
				if box1 == box2 {
					continue
				}

				// Find eliminations: cells that see both unshared ends
				var eliminations []core.Candidate
				for idx := 0; idx < 81; idx++ {
					if !b.Candidates[idx].Has(digit) {
						continue
					}
					row, col := idx/9, idx%9
					if (row == r1.row && col == unshared1) || (row == r2.row && col == unshared2) {
						continue
					}

					// Check if sees both unshared ends
					seesEnd1 := ArePeers(idx, r1.row*9+unshared1)
					seesEnd2 := ArePeers(idx, r2.row*9+unshared2)

					if seesEnd1 && seesEnd2 {
						eliminations = append(eliminations, core.Candidate{
							Row: row, Col: col, Digit: digit,
						})
					}
				}

				if len(eliminations) > 0 {
					return &core.Move{
						Action: "eliminate",
						Digit:  digit,
						Targets: []core.CellRef{
							{Row: r1.row, Col: r1.cols[0]},
							{Row: r1.row, Col: r1.cols[1]},
							{Row: r2.row, Col: r2.cols[0]},
							{Row: r2.row, Col: r2.cols[1]},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Skyscraper: %d with base in column %d", digit, shared+1),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: r1.row, Col: r1.cols[0]},
								{Row: r1.row, Col: r1.cols[1]},
								{Row: r2.row, Col: r2.cols[0]},
								{Row: r2.row, Col: r2.cols[1]},
							},
						},
					}
				}
			}
		}
	}

	return nil
}

// detectFinnedXWing finds Finned X-Wing patterns
func detectFinnedXWing(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
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

func detectFinnedXWingInRows(b *Board, digit int) *core.Move {
	// Find rows with 2-3 candidates for this digit
	type rowInfo struct {
		row  int
		cols []int
	}
	var rows []rowInfo

	for row := 0; row < 9; row++ {
		var cols []int
		for col := 0; col < 9; col++ {
			if b.Candidates[row*9+col].Has(digit) {
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
			finRowBox := finRow.row / 3
			finColBox := finCol / 3

			// Find which base column the fin shares a box with
			targetCol := -1
			if c1/3 == finColBox {
				targetCol = c1
			} else if c2/3 == finColBox {
				targetCol = c2
			}

			if targetCol == -1 {
				continue
			}

			// Eliminations: cells in targetCol that are in the same box-row as the fin
			// and see the base row's targetCol cell
			var eliminations []core.Candidate
			boxRowStart := finRowBox * 3
			for r := boxRowStart; r < boxRowStart+3; r++ {
				if r == finRow.row || r == baseRow.row {
					continue
				}
				idx := r*9 + targetCol
				if b.Candidates[idx].Has(digit) {
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

func detectFinnedXWingInCols(b *Board, digit int) *core.Move {
	// Find columns with 2-3 candidates for this digit
	type colInfo struct {
		col  int
		rows []int
	}
	var cols []colInfo

	for col := 0; col < 9; col++ {
		var rows []int
		for row := 0; row < 9; row++ {
			if b.Candidates[row*9+col].Has(digit) {
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
			finColBox := finCol.col / 3
			finRowBox := finRow / 3

			// Find which base row the fin shares a box with
			targetRow := -1
			if r1/3 == finRowBox {
				targetRow = r1
			} else if r2/3 == finRowBox {
				targetRow = r2
			}

			if targetRow == -1 {
				continue
			}

			// Eliminations: cells in targetRow that are in the same box-column as the fin
			var eliminations []core.Candidate
			boxColStart := finColBox * 3
			for c := boxColStart; c < boxColStart+3; c++ {
				if c == finCol.col || c == baseCol.col {
					continue
				}
				idx := targetRow*9 + c
				if b.Candidates[idx].Has(digit) {
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

// detectUniqueRectangle finds Unique Rectangle Type 1 patterns
// A UR occurs when 4 cells form a rectangle across EXACTLY 2 boxes, and 3 corners
// are bivalue with the same 2 digits. The 4th corner must have extra candidates
// to avoid a deadly pattern (multiple solutions).
func detectUniqueRectangle(b *Board) *core.Move {
	// For each pair of digits
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
			// Find all cells that have both d1 and d2 as candidates
			var cells []int
			for i := 0; i < 81; i++ {
				if b.Candidates[i].Has(d1) && b.Candidates[i].Has(d2) {
					cells = append(cells, i)
				}
			}

			if len(cells) < 4 {
				continue
			}

			// Try all combinations of 4 cells that form a rectangle spanning exactly 2 boxes
			for i := 0; i < len(cells); i++ {
				for j := i + 1; j < len(cells); j++ {
					r1, c1 := cells[i]/9, cells[i]%9
					r2, c2 := cells[j]/9, cells[j]%9

					// Must be in same row
					if r1 != r2 {
						continue
					}
					// Columns must be different
					if c1 == c2 {
						continue
					}

					// Look for matching cells in a different row
					for k := j + 1; k < len(cells); k++ {
						for l := k + 1; l < len(cells); l++ {
							r3, c3 := cells[k]/9, cells[k]%9
							r4, c4 := cells[l]/9, cells[l]%9

							// These two must be in the same row
							if r3 != r4 {
								continue
							}
							// Different row than r1
							if r3 == r1 {
								continue
							}
							// Columns must match c1 and c2
							if (c3 != c1 || c4 != c2) && (c3 != c2 || c4 != c1) {
								continue
							}

							// Check that the rectangle spans exactly 2 boxes
							// Box for each corner
							box1 := (r1/3)*3 + c1/3
							box2 := (r1/3)*3 + c2/3
							box3 := (r3/3)*3 + c3/3
							box4 := (r3/3)*3 + c4/3

							// Count unique boxes
							boxes := make(map[int]bool)
							boxes[box1] = true
							boxes[box2] = true
							boxes[box3] = true
							boxes[box4] = true

							// Must span exactly 2 boxes
							if len(boxes) != 2 {
								continue
							}

							// Now we have 4 cells forming a rectangle in exactly 2 boxes
							corners := []int{cells[i], cells[j], cells[k], cells[l]}

							// Count how many are bivalue (exactly d1 and d2)
							bivalueCount := 0
							nonBivalueIdx := -1
							for _, corner := range corners {
								if b.Candidates[corner].Count() == 2 {
									bivalueCount++
								} else if b.Candidates[corner].Count() > 2 {
									nonBivalueIdx = corner
								}
							}

							// Type 1 UR: exactly 3 bivalue corners, 1 with extra candidates
							if bivalueCount == 3 && nonBivalueIdx != -1 {
								row, col := nonBivalueIdx/9, nonBivalueIdx%9
								eliminations := []core.Candidate{
									{Row: row, Col: col, Digit: d1},
									{Row: row, Col: col, Digit: d2},
								}

								var targets []core.CellRef
								for _, corner := range corners {
									targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
								}

								return &core.Move{
									Action:       "eliminate",
									Digit:        0,
									Targets:      targets,
									Eliminations: eliminations,
									Explanation:  fmt.Sprintf("Unique Rectangle Type 1: %d/%d would form deadly pattern; eliminate from R%dC%d", d1, d2, row+1, col+1),
									Highlights: core.Highlights{
										Primary:   targets[:3], // The 3 bivalue corners
										Secondary: []core.CellRef{{Row: row, Col: col}},
									},
								}
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// detectUniqueRectangleType2 finds UR Type 2 patterns
// 4 cells forming a rectangle across 2 boxes
// 2 diagonal corners are bivalue with {A,B}
// Other 2 corners have {A,B} plus one extra candidate X (same extra in both)
// Eliminate X from cells that see BOTH corners with extra candidates
func detectUniqueRectangleType2(b *Board) *core.Move {
	// For each pair of digits
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
			// Find all cells that have both d1 and d2 as candidates
			var cells []int
			for i := 0; i < 81; i++ {
				if b.Candidates[i].Has(d1) && b.Candidates[i].Has(d2) {
					cells = append(cells, i)
				}
			}

			if len(cells) < 4 {
				continue
			}

			// Try all combinations of 4 cells that form a rectangle
			for i := 0; i < len(cells); i++ {
				for j := i + 1; j < len(cells); j++ {
					r1, c1 := cells[i]/9, cells[i]%9
					r2, c2 := cells[j]/9, cells[j]%9

					// Must be in same row
					if r1 != r2 {
						continue
					}
					// Columns must be different
					if c1 == c2 {
						continue
					}

					// Look for matching cells in a different row
					for k := j + 1; k < len(cells); k++ {
						for l := k + 1; l < len(cells); l++ {
							r3, c3 := cells[k]/9, cells[k]%9
							r4, c4 := cells[l]/9, cells[l]%9

							// These two must be in the same row
							if r3 != r4 {
								continue
							}
							// Different row than r1
							if r3 == r1 {
								continue
							}
							// Columns must match c1 and c2
							if (c3 != c1 || c4 != c2) && (c3 != c2 || c4 != c1) {
								continue
							}

							// Check that the rectangle spans exactly 2 boxes
							box1 := (r1/3)*3 + c1/3
							box2 := (r1/3)*3 + c2/3
							box3 := (r3/3)*3 + c3/3
							box4 := (r3/3)*3 + c4/3
							boxes := make(map[int]bool)
							boxes[box1] = true
							boxes[box2] = true
							boxes[box3] = true
							boxes[box4] = true
							if len(boxes) != 2 {
								continue
							}

							// Now we have 4 cells forming a rectangle
							// Order them: corners[0] and corners[3] are diagonal, corners[1] and corners[2] are diagonal
							var corners [4]int
							corners[0] = cells[i] // (r1, c1)
							corners[1] = cells[j] // (r1, c2)
							if c3 == c1 {
								corners[2] = cells[k] // (r3, c1)
								corners[3] = cells[l] // (r3, c2)
							} else {
								corners[2] = cells[l] // (r3, c1)
								corners[3] = cells[k] // (r3, c2)
							}

							// Check Type 2: 2 corners in same row/col are bivalue (floor), other 2 have same extra (roof)
							// Row pairs: [0,1] (row r1) and [2,3] (row r3)
							// Column pairs: [0,2] (col c1) and [1,3] (col c2)
							// NOTE: Diagonal pairs {0,3} and {1,2} are WRONG - roof cells must share a unit for eliminations
							for _, floorPair := range [][2]int{{0, 1}, {2, 3}, {0, 2}, {1, 3}} {
								var roofPair [2]int
								switch {
								case floorPair[0] == 0 && floorPair[1] == 1:
									roofPair = [2]int{2, 3} // floor is row r1, roof is row r3
								case floorPair[0] == 2 && floorPair[1] == 3:
									roofPair = [2]int{0, 1} // floor is row r3, roof is row r1
								case floorPair[0] == 0 && floorPair[1] == 2:
									roofPair = [2]int{1, 3} // floor is col c1, roof is col c2
								case floorPair[0] == 1 && floorPair[1] == 3:
									roofPair = [2]int{0, 2} // floor is col c2, roof is col c1
								}

								// Check if floor corners are bivalue with exactly {d1, d2}
								isBivalue0 := b.Candidates[corners[floorPair[0]]].Count() == 2
								isBivalue1 := b.Candidates[corners[floorPair[1]]].Count() == 2

								if !isBivalue0 || !isBivalue1 {
									continue
								}

								// Check if roof corners have extras
								cands0 := b.Candidates[corners[roofPair[0]]]
								cands1 := b.Candidates[corners[roofPair[1]]]

								if cands0.Count() <= 2 || cands1.Count() <= 2 {
									continue
								}

								// Find extras (candidates beyond d1 and d2)
								var extras0, extras1 []int
								for _, d := range cands0.ToSlice() {
									if d != d1 && d != d2 {
										extras0 = append(extras0, d)
									}
								}
								for _, d := range cands1.ToSlice() {
									if d != d1 && d != d2 {
										extras1 = append(extras1, d)
									}
								}

								// Type 2: both roof cells have exactly one extra, and it's the same digit
								if len(extras0) != 1 || len(extras1) != 1 {
									continue
								}
								if extras0[0] != extras1[0] {
									continue
								}

								extraDigit := extras0[0]
								roofCorner0 := corners[roofPair[0]]
								roofCorner1 := corners[roofPair[1]]

								// Eliminate extraDigit from cells that see BOTH roof corners
								var eliminations []core.Candidate
								for idx := 0; idx < 81; idx++ {
									if idx == roofCorner0 || idx == roofCorner1 {
										continue
									}
									if !b.Candidates[idx].Has(extraDigit) {
										continue
									}
									if ArePeers(idx, roofCorner0) && ArePeers(idx, roofCorner1) {
										eliminations = append(eliminations, core.Candidate{
											Row: idx / 9, Col: idx % 9, Digit: extraDigit,
										})
									}
								}

								if len(eliminations) > 0 {
									var targets []core.CellRef
									for _, corner := range corners {
										targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
									}

									return &core.Move{
										Action:       "eliminate",
										Digit:        extraDigit,
										Targets:      targets,
										Eliminations: eliminations,
										Explanation: fmt.Sprintf("Unique Rectangle Type 2: %d/%d with extra %d; eliminate %d from cells seeing both R%dC%d and R%dC%d",
											d1, d2, extraDigit, extraDigit, roofCorner0/9+1, roofCorner0%9+1, roofCorner1/9+1, roofCorner1%9+1),
										Highlights: core.Highlights{
											Primary:   []core.CellRef{{Row: corners[floorPair[0]] / 9, Col: corners[floorPair[0]] % 9}, {Row: corners[floorPair[1]] / 9, Col: corners[floorPair[1]] % 9}},
											Secondary: []core.CellRef{{Row: roofCorner0 / 9, Col: roofCorner0 % 9}, {Row: roofCorner1 / 9, Col: roofCorner1 % 9}},
										},
									}
								}
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// detectUniqueRectangleType3 finds UR Type 3 patterns
// Similar setup to Type 2 but the two corners with extras form a "pseudo-cell"
// If their combined extras would form a naked pair/triple with other cells in the unit, make that elimination
func detectUniqueRectangleType3(b *Board) *core.Move {
	// For each pair of digits
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
			// Find all cells that have both d1 and d2 as candidates
			var cells []int
			for i := 0; i < 81; i++ {
				if b.Candidates[i].Has(d1) && b.Candidates[i].Has(d2) {
					cells = append(cells, i)
				}
			}

			if len(cells) < 4 {
				continue
			}

			// Try all combinations of 4 cells that form a rectangle
			for i := 0; i < len(cells); i++ {
				for j := i + 1; j < len(cells); j++ {
					r1, c1 := cells[i]/9, cells[i]%9
					r2, c2 := cells[j]/9, cells[j]%9

					// Must be in same row
					if r1 != r2 {
						continue
					}
					// Columns must be different
					if c1 == c2 {
						continue
					}

					// Look for matching cells in a different row
					for k := j + 1; k < len(cells); k++ {
						for l := k + 1; l < len(cells); l++ {
							r3, c3 := cells[k]/9, cells[k]%9
							r4, c4 := cells[l]/9, cells[l]%9

							// These two must be in the same row
							if r3 != r4 {
								continue
							}
							// Different row than r1
							if r3 == r1 {
								continue
							}
							// Columns must match c1 and c2
							if (c3 != c1 || c4 != c2) && (c3 != c2 || c4 != c1) {
								continue
							}

							// Check that the rectangle spans exactly 2 boxes
							box1 := (r1/3)*3 + c1/3
							box2 := (r1/3)*3 + c2/3
							box3 := (r3/3)*3 + c3/3
							box4 := (r3/3)*3 + c4/3
							boxes := make(map[int]bool)
							boxes[box1] = true
							boxes[box2] = true
							boxes[box3] = true
							boxes[box4] = true
							if len(boxes) != 2 {
								continue
							}

							// Order corners properly
							var corners [4]int
							corners[0] = cells[i]
							corners[1] = cells[j]
							if c3 == c1 {
								corners[2] = cells[k]
								corners[3] = cells[l]
							} else {
								corners[2] = cells[l]
								corners[3] = cells[k]
							}

							// Check Type 3: 2 corners in same row/col are bivalue (floor), other 2 have extras (roof)
							// Row pairs: [0,1] (row r1) and [2,3] (row r3)
							// Column pairs: [0,2] (col c1) and [1,3] (col c2)
							// NOTE: Diagonal pairs {0,3} and {1,2} are WRONG - roof cells must share a unit
							for _, floorPair := range [][2]int{{0, 1}, {2, 3}, {0, 2}, {1, 3}} {
								var roofPair [2]int
								switch {
								case floorPair[0] == 0 && floorPair[1] == 1:
									roofPair = [2]int{2, 3} // floor is row r1, roof is row r3
								case floorPair[0] == 2 && floorPair[1] == 3:
									roofPair = [2]int{0, 1} // floor is row r3, roof is row r1
								case floorPair[0] == 0 && floorPair[1] == 2:
									roofPair = [2]int{1, 3} // floor is col c1, roof is col c2
								case floorPair[0] == 1 && floorPair[1] == 3:
									roofPair = [2]int{0, 2} // floor is col c2, roof is col c1
								}

								// Check if floor corners are bivalue
								if b.Candidates[corners[floorPair[0]]].Count() != 2 || b.Candidates[corners[floorPair[1]]].Count() != 2 {
									continue
								}

								// Get extras from the roof corners (they share a row/col and can form pseudo-cell)
								roofCorner0 := corners[roofPair[0]]
								roofCorner1 := corners[roofPair[1]]

								if b.Candidates[roofCorner0].Count() <= 2 && b.Candidates[roofCorner1].Count() <= 2 {
									continue
								}

								// Combine extras from both corners (excluding d1, d2)
								urDigits := NewCandidates([]int{d1, d2})
								combinedExtras := b.Candidates[roofCorner0].Subtract(urDigits).Union(
									b.Candidates[roofCorner1].Subtract(urDigits))

								if combinedExtras.Count() == 0 || combinedExtras.Count() > 3 {
									continue
								}

								extraSlice := combinedExtras.ToSlice()

								// The two roof corners must share a unit (row, col, or box) to form a pseudo-cell
								// Check which units they share
								row0, col0 := roofCorner0/9, roofCorner0%9
								row1, col1 := roofCorner1/9, roofCorner1%9
								box0 := (row0/3)*3 + col0/3
								box1 := (row1/3)*3 + col1/3

								type unitInfo struct {
									unitType string
									indices  []int
								}
								var sharedUnits []unitInfo

								if row0 == row1 {
									sharedUnits = append(sharedUnits, unitInfo{"row", RowIndices[row0]})
								}
								if col0 == col1 {
									sharedUnits = append(sharedUnits, unitInfo{"column", ColIndices[col0]})
								}
								if box0 == box1 {
									sharedUnits = append(sharedUnits, unitInfo{"box", BoxIndices[box0]})
								}

								// For each shared unit, look for naked subset with the pseudo-cell
								for _, unit := range sharedUnits {
									// Naked pair: combined extras have 2 digits, find 1 other cell with subset of these
									// Naked triple: combined extras have 3 digits, find 2 other cells, or 2 digits find 1 cell that together form triple

									if len(extraSlice) == 2 {
										// Look for naked pair: one other cell with exactly these 2 candidates
										for _, idx := range unit.indices {
											if idx == roofCorner0 || idx == roofCorner1 {
												continue
											}
											if b.Cells[idx] != 0 {
												continue
											}

											cellCands := b.Candidates[idx].ToSlice()
											if len(cellCands) != 2 {
												continue
											}
											if cellCands[0] == extraSlice[0] && cellCands[1] == extraSlice[1] {
												// Found naked pair with pseudo-cell
												// Eliminate these digits from other cells in the unit
												var eliminations []core.Candidate
												for _, elimIdx := range unit.indices {
													if elimIdx == roofCorner0 || elimIdx == roofCorner1 || elimIdx == idx {
														continue
													}
													if b.Cells[elimIdx] != 0 {
														continue
													}
													for _, d := range extraSlice {
														if b.Candidates[elimIdx].Has(d) {
															eliminations = append(eliminations, core.Candidate{
																Row: elimIdx / 9, Col: elimIdx % 9, Digit: d,
															})
														}
													}
												}

												if len(eliminations) > 0 {
													var targets []core.CellRef
													for _, corner := range corners {
														targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
													}

													return &core.Move{
														Action:       "eliminate",
														Digit:        0,
														Targets:      targets,
														Eliminations: eliminations,
														Explanation: fmt.Sprintf("Unique Rectangle Type 3: %d/%d; pseudo-cell with %v forms naked pair with R%dC%d in %s",
															d1, d2, extraSlice, idx/9+1, idx%9+1, unit.unitType),
														Highlights: core.Highlights{
															Primary:   []core.CellRef{{Row: corners[floorPair[0]] / 9, Col: corners[floorPair[0]] % 9}, {Row: corners[floorPair[1]] / 9, Col: corners[floorPair[1]] % 9}},
															Secondary: []core.CellRef{{Row: roofCorner0 / 9, Col: roofCorner0 % 9}, {Row: roofCorner1 / 9, Col: roofCorner1 % 9}, {Row: idx / 9, Col: idx % 9}},
														},
													}
												}
											}
										}
									}

									if len(extraSlice) >= 2 && len(extraSlice) <= 3 {
										// Look for naked triple: find cells that together with pseudo-cell form a triple
										// Need (3 - 1) = 2 more cells if extras has 2 or 3 digits
										var candidateCells []int
										for _, idx := range unit.indices {
											if idx == roofCorner0 || idx == roofCorner1 {
												continue
											}
											if b.Cells[idx] != 0 {
												continue
											}
											// Cell must have only candidates from extraSlice (subset)
											cellCands := b.Candidates[idx]
											if cellCands.Count() < 2 || cellCands.Count() > 3 {
												continue
											}
											isSubset := true
											for _, d := range cellCands.ToSlice() {
												if !combinedExtras.Has(d) {
													isSubset = false
													break
												}
											}
											if isSubset {
												candidateCells = append(candidateCells, idx)
											}
										}

										// For naked triple, we need exactly 2 more cells (pseudo-cell counts as 1)
										if len(extraSlice) == 3 && len(candidateCells) >= 2 {
											// Try pairs of candidate cells
											for ci := 0; ci < len(candidateCells); ci++ {
												for cj := ci + 1; cj < len(candidateCells); cj++ {
													idx1, idx2 := candidateCells[ci], candidateCells[cj]

													// Combined candidates of pseudo-cell + these 2 cells must be exactly 3 digits
													allCands := combinedExtras.Union(b.Candidates[idx1]).Union(b.Candidates[idx2])

													if allCands.Count() != 3 {
														continue
													}

													tripleDigits := allCands.ToSlice()

													// Eliminate these 3 digits from other cells in unit
													var eliminations []core.Candidate
													for _, elimIdx := range unit.indices {
														if elimIdx == roofCorner0 || elimIdx == roofCorner1 || elimIdx == idx1 || elimIdx == idx2 {
															continue
														}
														if b.Cells[elimIdx] != 0 {
															continue
														}
														for _, d := range tripleDigits {
															if b.Candidates[elimIdx].Has(d) {
																eliminations = append(eliminations, core.Candidate{
																	Row: elimIdx / 9, Col: elimIdx % 9, Digit: d,
																})
															}
														}
													}

													if len(eliminations) > 0 {
														var targets []core.CellRef
														for _, corner := range corners {
															targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
														}

														return &core.Move{
															Action:       "eliminate",
															Digit:        0,
															Targets:      targets,
															Eliminations: eliminations,
															Explanation: fmt.Sprintf("Unique Rectangle Type 3: %d/%d; pseudo-cell forms naked triple with R%dC%d and R%dC%d in %s",
																d1, d2, idx1/9+1, idx1%9+1, idx2/9+1, idx2%9+1, unit.unitType),
															Highlights: core.Highlights{
																Primary:   []core.CellRef{{Row: corners[floorPair[0]] / 9, Col: corners[floorPair[0]] % 9}, {Row: corners[floorPair[1]] / 9, Col: corners[floorPair[1]] % 9}},
																Secondary: []core.CellRef{{Row: roofCorner0 / 9, Col: roofCorner0 % 9}, {Row: roofCorner1 / 9, Col: roofCorner1 % 9}, {Row: idx1 / 9, Col: idx1 % 9}, {Row: idx2 / 9, Col: idx2 % 9}},
															},
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// detectUniqueRectangleType4 finds UR Type 4 patterns
// Two corners with just {A,B}, two corners with {A,B,+extras}
// If one of A or B is confined to the UR cells within a row/column,
// the other can be eliminated from the extra corners
func detectUniqueRectangleType4(b *Board) *core.Move {
	// For each pair of digits
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
			// Find all cells that have both d1 and d2 as candidates
			var cells []int
			for i := 0; i < 81; i++ {
				if b.Candidates[i].Has(d1) && b.Candidates[i].Has(d2) {
					cells = append(cells, i)
				}
			}

			if len(cells) < 4 {
				continue
			}

			// Try all combinations of 4 cells that form a rectangle
			for i := 0; i < len(cells); i++ {
				for j := i + 1; j < len(cells); j++ {
					r1, c1 := cells[i]/9, cells[i]%9
					r2, c2 := cells[j]/9, cells[j]%9

					// Must be in same row
					if r1 != r2 {
						continue
					}
					// Columns must be different
					if c1 == c2 {
						continue
					}

					// Look for matching cells in a different row
					for k := j + 1; k < len(cells); k++ {
						for l := k + 1; l < len(cells); l++ {
							r3, c3 := cells[k]/9, cells[k]%9
							r4, c4 := cells[l]/9, cells[l]%9

							// These two must be in the same row
							if r3 != r4 {
								continue
							}
							// Different row than r1
							if r3 == r1 {
								continue
							}
							// Columns must match c1 and c2
							if (c3 != c1 || c4 != c2) && (c3 != c2 || c4 != c1) {
								continue
							}

							// Check that the rectangle spans exactly 2 boxes
							box1 := (r1/3)*3 + c1/3
							box2 := (r1/3)*3 + c2/3
							box3 := (r3/3)*3 + c3/3
							box4 := (r3/3)*3 + c4/3

							boxes := make(map[int]bool)
							boxes[box1] = true
							boxes[box2] = true
							boxes[box3] = true
							boxes[box4] = true

							if len(boxes) != 2 {
								continue
							}

							// Order corners: (r1,c1), (r1,c2), (r3,c1), (r3,c2)
							var corners [4]int
							corners[0] = cells[i]
							corners[1] = cells[j]
							if c3 == c1 {
								corners[2] = cells[k]
								corners[3] = cells[l]
							} else {
								corners[2] = cells[l]
								corners[3] = cells[k]
							}

							// Type 4: 2 corners (in same row or col) are bivalue with {d1,d2}
							// The other 2 have extras
							// Pairs in same row: (0,1) and (2,3)
							// Pairs in same col: (0,2) and (1,3)
							pairConfigs := []struct {
								bivalue [2]int
								extras  [2]int
							}{
								{[2]int{0, 1}, [2]int{2, 3}}, // row r1 bivalue, row r3 extras
								{[2]int{2, 3}, [2]int{0, 1}}, // row r3 bivalue, row r1 extras
								{[2]int{0, 2}, [2]int{1, 3}}, // col c1 bivalue, col c2 extras
								{[2]int{1, 3}, [2]int{0, 2}}, // col c2 bivalue, col c1 extras
							}

							for _, config := range pairConfigs {
								bv0, bv1 := corners[config.bivalue[0]], corners[config.bivalue[1]]
								ex0, ex1 := corners[config.extras[0]], corners[config.extras[1]]

								// Check bivalue corners have exactly {d1, d2}
								if b.Candidates[bv0].Count() != 2 || b.Candidates[bv1].Count() != 2 {
									continue
								}

								// Check extra corners have more than {d1, d2}
								if b.Candidates[ex0].Count() <= 2 || b.Candidates[ex1].Count() <= 2 {
									continue
								}

								// The extra corners must share a row or column
								exRow0, exCol0 := ex0/9, ex0%9
								exRow1, exCol1 := ex1/9, ex1%9

								// Check if d1 or d2 is confined to UR cells in the shared row/column
								// For the row containing extra corners
								if exRow0 == exRow1 {
									row := exRow0
									// Check if d1 appears only in UR cells in this row
									d1OnlyInUR := true
									d2OnlyInUR := true
									for c := 0; c < 9; c++ {
										idx := row*9 + c
										if idx == ex0 || idx == ex1 {
											continue
										}
										if b.Candidates[idx].Has(d1) {
											d1OnlyInUR = false
										}
										if b.Candidates[idx].Has(d2) {
											d2OnlyInUR = false
										}
									}

									if d1OnlyInUR && !d2OnlyInUR {
										// d1 confined to UR, eliminate d2 from extra corners
										var eliminations []core.Candidate
										if b.Candidates[ex0].Has(d2) {
											eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d2})
										}
										if b.Candidates[ex1].Has(d2) {
											eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d2})
										}

										if len(eliminations) > 0 {
											var targets []core.CellRef
											for _, corner := range corners {
												targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
											}

											return &core.Move{
												Action:       "eliminate",
												Digit:        d2,
												Targets:      targets,
												Eliminations: eliminations,
												Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d; %d confined to UR in row %d, eliminate %d",
													d1, d2, d1, row+1, d2),
												Highlights: core.Highlights{
													Primary:   []core.CellRef{{Row: bv0 / 9, Col: bv0 % 9}, {Row: bv1 / 9, Col: bv1 % 9}},
													Secondary: []core.CellRef{{Row: ex0 / 9, Col: ex0 % 9}, {Row: ex1 / 9, Col: ex1 % 9}},
												},
											}
										}
									}

									if d2OnlyInUR && !d1OnlyInUR {
										// d2 confined to UR, eliminate d1 from extra corners
										var eliminations []core.Candidate
										if b.Candidates[ex0].Has(d1) {
											eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d1})
										}
										if b.Candidates[ex1].Has(d1) {
											eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d1})
										}

										if len(eliminations) > 0 {
											var targets []core.CellRef
											for _, corner := range corners {
												targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
											}

											return &core.Move{
												Action:       "eliminate",
												Digit:        d1,
												Targets:      targets,
												Eliminations: eliminations,
												Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d; %d confined to UR in row %d, eliminate %d",
													d1, d2, d2, row+1, d1),
												Highlights: core.Highlights{
													Primary:   []core.CellRef{{Row: bv0 / 9, Col: bv0 % 9}, {Row: bv1 / 9, Col: bv1 % 9}},
													Secondary: []core.CellRef{{Row: ex0 / 9, Col: ex0 % 9}, {Row: ex1 / 9, Col: ex1 % 9}},
												},
											}
										}
									}
								}

								// For the column containing extra corners
								if exCol0 == exCol1 {
									col := exCol0
									// Check if d1 appears only in UR cells in this column
									d1OnlyInUR := true
									d2OnlyInUR := true
									for r := 0; r < 9; r++ {
										idx := r*9 + col
										if idx == ex0 || idx == ex1 {
											continue
										}
										if b.Candidates[idx].Has(d1) {
											d1OnlyInUR = false
										}
										if b.Candidates[idx].Has(d2) {
											d2OnlyInUR = false
										}
									}

									if d1OnlyInUR && !d2OnlyInUR {
										// d1 confined to UR, eliminate d2 from extra corners
										var eliminations []core.Candidate
										if b.Candidates[ex0].Has(d2) {
											eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d2})
										}
										if b.Candidates[ex1].Has(d2) {
											eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d2})
										}

										if len(eliminations) > 0 {
											var targets []core.CellRef
											for _, corner := range corners {
												targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
											}

											return &core.Move{
												Action:       "eliminate",
												Digit:        d2,
												Targets:      targets,
												Eliminations: eliminations,
												Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d; %d confined to UR in column %d, eliminate %d",
													d1, d2, d1, col+1, d2),
												Highlights: core.Highlights{
													Primary:   []core.CellRef{{Row: bv0 / 9, Col: bv0 % 9}, {Row: bv1 / 9, Col: bv1 % 9}},
													Secondary: []core.CellRef{{Row: ex0 / 9, Col: ex0 % 9}, {Row: ex1 / 9, Col: ex1 % 9}},
												},
											}
										}
									}

									if d2OnlyInUR && !d1OnlyInUR {
										// d2 confined to UR, eliminate d1 from extra corners
										var eliminations []core.Candidate
										if b.Candidates[ex0].Has(d1) {
											eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d1})
										}
										if b.Candidates[ex1].Has(d1) {
											eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d1})
										}

										if len(eliminations) > 0 {
											var targets []core.CellRef
											for _, corner := range corners {
												targets = append(targets, core.CellRef{Row: corner / 9, Col: corner % 9})
											}

											return &core.Move{
												Action:       "eliminate",
												Digit:        d1,
												Targets:      targets,
												Eliminations: eliminations,
												Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d; %d confined to UR in column %d, eliminate %d",
													d1, d2, d2, col+1, d1),
												Highlights: core.Highlights{
													Primary:   []core.CellRef{{Row: bv0 / 9, Col: bv0 % 9}, {Row: bv1 / 9, Col: bv1 % 9}},
													Secondary: []core.CellRef{{Row: ex0 / 9, Col: ex0 % 9}, {Row: ex1 / 9, Col: ex1 % 9}},
												},
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// detectFinnedSwordfish finds Finned Swordfish patterns
// Similar to regular Swordfish but with "fin" cells:
// - 3 rows where a digit appears in 2-3 positions
// - Positions align to exactly 3 columns (or vice versa)
// - One row has an extra position (the "fin") that's not in the main columns
// - Eliminate the digit from cells that are in one of the 3 columns AND see the fin cell
func detectFinnedSwordfish(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		if move := detectFinnedSwordfishInRows(b, digit); move != nil {
			return move
		}
		if move := detectFinnedSwordfishInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectFinnedSwordfishInRows(b *Board, digit int) *core.Move {
	// Find rows where digit appears in 2-4 columns (2-3 for base, up to 4 for finned row)
	type rowInfo struct {
		row  int
		cols []int
	}
	var rows []rowInfo

	for row := 0; row < 9; row++ {
		var cols []int
		for col := 0; col < 9; col++ {
			if b.Candidates[row*9+col].Has(digit) {
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
				for finIdx, configs := range [][]rowInfo{
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
						finBox := finCols[0] / 3
						sameBox := true
						for _, fc := range finCols[1:] {
							if fc/3 != finBox {
								sameBox = false
								break
							}
						}
						if !sameBox {
							continue
						}
					}

					// The fin(s) must share a box with at least one main column position in the finned row
					finRowInBox := finnedRow.row / 3

					// Find which main columns are in the same box as the fin
					var targetCols []int
					for _, mc := range mainCols {
						if mc/3 == finCols[0]/3 {
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
					boxRowStart := finRowInBox * 3
					for _, tc := range targetCols {
						for row := boxRowStart; row < boxRowStart+3; row++ {
							if swordfishRows[row] {
								continue
							}
							idx := row*9 + tc
							if b.Candidates[idx].Has(digit) {
								// Verify this cell sees the fin (it will if in same box)
								seesAllFins := true
								for _, fc := range finCols {
									finIdx := finnedRow.row*9 + fc
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
						_ = finIdx // suppress unused warning from loop variable

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

func detectFinnedSwordfishInCols(b *Board, digit int) *core.Move {
	// Find columns where digit appears in 2-4 rows (2-3 for base, up to 4 for finned col)
	type colInfo struct {
		col  int
		rows []int
	}
	var cols []colInfo

	for col := 0; col < 9; col++ {
		var rows []int
		for row := 0; row < 9; row++ {
			if b.Candidates[row*9+col].Has(digit) {
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
				for finIdx, configs := range [][]colInfo{
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
						finBox := finRows[0] / 3
						sameBox := true
						for _, fr := range finRows[1:] {
							if fr/3 != finBox {
								sameBox = false
								break
							}
						}
						if !sameBox {
							continue
						}
					}

					// The fin(s) must share a box with at least one main row position in the finned column
					finColInBox := finnedCol.col / 3

					// Find which main rows are in the same box as the fin
					var targetRows []int
					for _, mr := range mainRows {
						if mr/3 == finRows[0]/3 {
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
					boxColStart := finColInBox * 3
					for _, tr := range targetRows {
						for col := boxColStart; col < boxColStart+3; col++ {
							if swordfishCols[col] {
								continue
							}
							idx := tr*9 + col
							if b.Candidates[idx].Has(digit) {
								// Verify this cell sees the fin (it will if in same box)
								seesAllFins := true
								for _, fr := range finRows {
									finIdx := fr*9 + finnedCol.col
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
						_ = finIdx // suppress unused warning from loop variable

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

// detectBUG finds BUG (Bivalue Universal Grave) patterns
func detectBUG(b *Board) *core.Move {
	// Count cells with !=2 candidates
	var extraCells []int
	for i := 0; i < 81; i++ {
		if b.Cells[i] != 0 {
			continue
		}
		if b.Candidates[i].Count() != 2 {
			extraCells = append(extraCells, i)
		}
	}

	// BUG+1: exactly one cell with 3 candidates
	if len(extraCells) != 1 {
		return nil
	}

	bugCell := extraCells[0]
	if b.Candidates[bugCell].Count() != 3 {
		return nil
	}

	// Check if all bi-value cells would form a BUG
	// In a BUG, every unsolved cell has exactly 2 candidates,
	// and each candidate appears exactly twice in every row, column, and box

	// Find the "extra" digit that appears 3 times in its row/col/box
	row, col := bugCell/9, bugCell%9
	box := (row/3)*3 + col/3

	for _, digit := range b.Candidates[bugCell].ToSlice() {
		// Count occurrences in row
		rowCount := 0
		for c := 0; c < 9; c++ {
			if b.Candidates[row*9+c].Has(digit) {
				rowCount++
			}
		}

		// Count occurrences in column
		colCount := 0
		for r := 0; r < 9; r++ {
			if b.Candidates[r*9+col].Has(digit) {
				colCount++
			}
		}

		// Count occurrences in box
		boxCount := 0
		boxRow, boxCol := (box/3)*3, (box%3)*3
		for r := boxRow; r < boxRow+3; r++ {
			for c := boxCol; c < boxCol+3; c++ {
				if b.Candidates[r*9+c].Has(digit) {
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
