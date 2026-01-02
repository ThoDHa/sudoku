package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
)

// DetectNakedSingle finds a cell with only one candidate
func DetectNakedSingle(b BoardInterface) *core.Move {
	for i := 0; i < 81; i++ {
		if b.GetCell(i) == 0 && b.GetCandidatesAt(i).Count() == 1 {
			digit, _ := b.GetCandidatesAt(i).Only()
			row, col := i/9, i%9
			return &core.Move{
				Action:      "assign",
				Digit:       digit,
				Targets:     []core.CellRef{{Row: row, Col: col}},
				Explanation: fmt.Sprintf("Cell R%dC%d has only one candidate: %d", row+1, col+1, digit),
				Highlights: core.Highlights{
					Primary: []core.CellRef{{Row: row, Col: col}},
				},
			}
		}
	}
	return nil
}

// DetectHiddenSingle finds a digit that can only go in one cell within a unit
func DetectHiddenSingle(b BoardInterface) *core.Move {
	// Check rows
	for row := 0; row < 9; row++ {
		for digit := 1; digit <= 9; digit++ {
			var positions []int
			for col := 0; col < 9; col++ {
				idx := row*9 + col
				if b.GetCell(idx) == digit {
					positions = nil
					break
				}
				if b.GetCandidatesAt(idx).Has(digit) {
					positions = append(positions, col)
				}
			}
			if len(positions) == 1 {
				col := positions[0]
				idx := row*9 + col
				if b.GetCandidatesAt(idx).Count() > 1 {
					return &core.Move{
						Action:      "assign",
						Digit:       digit,
						Targets:     []core.CellRef{{Row: row, Col: col}},
						Explanation: fmt.Sprintf("In row %d, %d can only go in R%dC%d", row+1, digit, row+1, col+1),
						Highlights: core.Highlights{
							Primary:   []core.CellRef{{Row: row, Col: col}},
							Secondary: ToCellRefs(RowIndices[row]),
						},
					}
				}
			}
		}
	}

	// Check columns
	for col := 0; col < 9; col++ {
		for digit := 1; digit <= 9; digit++ {
			var positions []int
			for row := 0; row < 9; row++ {
				idx := row*9 + col
				if b.GetCell(idx) == digit {
					positions = nil
					break
				}
				if b.GetCandidatesAt(idx).Has(digit) {
					positions = append(positions, row)
				}
			}
			if len(positions) == 1 {
				row := positions[0]
				idx := row*9 + col
				if b.GetCandidatesAt(idx).Count() > 1 {
					return &core.Move{
						Action:      "assign",
						Digit:       digit,
						Targets:     []core.CellRef{{Row: row, Col: col}},
						Explanation: fmt.Sprintf("In column %d, %d can only go in R%dC%d", col+1, digit, row+1, col+1),
						Highlights: core.Highlights{
							Primary:   []core.CellRef{{Row: row, Col: col}},
							Secondary: ToCellRefs(ColIndices[col]),
						},
					}
				}
			}
		}
	}

	// Check boxes
	for box := 0; box < 9; box++ {
		boxRow, boxCol := (box/3)*3, (box%3)*3
		for digit := 1; digit <= 9; digit++ {
			var positions []core.CellRef
			found := false
			for r := boxRow; r < boxRow+3; r++ {
				for c := boxCol; c < boxCol+3; c++ {
					idx := r*9 + c
					if b.GetCell(idx) == digit {
						found = true
						break
					}
					if b.GetCandidatesAt(idx).Has(digit) {
						positions = append(positions, core.CellRef{Row: r, Col: c})
					}
				}
				if found {
					break
				}
			}
			if !found && len(positions) == 1 {
				pos := positions[0]
				idx := pos.Row*9 + pos.Col
				if b.GetCandidatesAt(idx).Count() > 1 {
					return &core.Move{
						Action:      "assign",
						Digit:       digit,
						Targets:     []core.CellRef{pos},
						Explanation: fmt.Sprintf("In box %d, %d can only go in R%dC%d", box+1, digit, pos.Row+1, pos.Col+1),
						Highlights: core.Highlights{
							Primary:   []core.CellRef{pos},
							Secondary: ToCellRefs(BoxIndices[box]),
						},
					}
				}
			}
		}
	}

	return nil
}

// DetectPointingPair finds candidates in a box that are confined to one row/column
func DetectPointingPair(b BoardInterface) *core.Move {
	for box := 0; box < 9; box++ {
		boxRow, boxCol := (box/3)*3, (box%3)*3

		for digit := 1; digit <= 9; digit++ {
			var positions []core.CellRef
			for r := boxRow; r < boxRow+3; r++ {
				for c := boxCol; c < boxCol+3; c++ {
					if b.GetCandidatesAt(r*9 + c).Has(digit) {
						positions = append(positions, core.CellRef{Row: r, Col: c})
					}
				}
			}

			if len(positions) < 2 || len(positions) > 3 {
				continue
			}

			// Check if all in same row
			sameRow := true
			row := positions[0].Row
			for _, p := range positions[1:] {
				if p.Row != row {
					sameRow = false
					break
				}
			}

			if sameRow {
				var eliminations []core.Candidate
				for c := 0; c < 9; c++ {
					if c >= boxCol && c < boxCol+3 {
						continue
					}
					if b.GetCandidatesAt(row*9 + c).Has(digit) {
						eliminations = append(eliminations, core.Candidate{Row: row, Col: c, Digit: digit})
					}
				}
				if len(eliminations) > 0 {
					return &core.Move{
						Action:       "eliminate",
						Digit:        digit,
						Targets:      positions,
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("In box %d, %d is confined to row %d: eliminate %d from rest of row %d.", box+1, digit, row+1, digit, row+1),
						Highlights: core.Highlights{
							Primary:   positions,
							Secondary: ToCellRefs(RowIndices[row]),
						},
					}
				}
			}

			// Check if all in same column
			sameCol := true
			col := positions[0].Col
			for _, p := range positions[1:] {
				if p.Col != col {
					sameCol = false
					break
				}
			}

			if sameCol {
				var eliminations []core.Candidate
				for r := 0; r < 9; r++ {
					if r >= boxRow && r < boxRow+3 {
						continue
					}
					if b.GetCandidatesAt(r*9 + col).Has(digit) {
						eliminations = append(eliminations, core.Candidate{Row: r, Col: col, Digit: digit})
					}
				}
				if len(eliminations) > 0 {
					return &core.Move{
						Action:       "eliminate",
						Digit:        digit,
						Targets:      positions,
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("In box %d, %d is confined to column %d: eliminate %d from rest of column %d.", box+1, digit, col+1, digit, col+1),
						Highlights: core.Highlights{
							Primary:   positions,
							Secondary: ToCellRefs(ColIndices[col]),
						},
					}
				}
			}
		}
	}
	return nil
}

// DetectBoxLineReduction finds candidates in a row/column confined to one box
func DetectBoxLineReduction(b BoardInterface) *core.Move {
	// Check rows
	for row := 0; row < 9; row++ {
		for digit := 1; digit <= 9; digit++ {
			var positions []core.CellRef
			for col := 0; col < 9; col++ {
				if b.GetCandidatesAt(row*9 + col).Has(digit) {
					positions = append(positions, core.CellRef{Row: row, Col: col})
				}
			}

			if len(positions) < 2 || len(positions) > 3 {
				continue
			}

			// Check if all in same box
			boxCol := (positions[0].Col / 3) * 3
			sameBox := true
			for _, p := range positions[1:] {
				if (p.Col/3)*3 != boxCol {
					sameBox = false
					break
				}
			}

			if sameBox {
				boxRow := (row / 3) * 3
				var eliminations []core.Candidate
				for r := boxRow; r < boxRow+3; r++ {
					if r == row {
						continue
					}
					for c := boxCol; c < boxCol+3; c++ {
						if b.GetCandidatesAt(r*9 + c).Has(digit) {
							eliminations = append(eliminations, core.Candidate{Row: r, Col: c, Digit: digit})
						}
					}
				}
				if len(eliminations) > 0 {
					return &core.Move{
						Action:       "eliminate",
						Digit:        digit,
						Targets:      positions,
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("In row %d, %d is confined to one box: eliminate %d from rest of box.", row+1, digit, digit),
						Highlights: core.Highlights{
							Primary:   positions,
							Secondary: ToCellRefs(BoxIndices[(row/3)*3+boxCol/3]),
						},
					}
				}
			}
		}
	}

	// Check columns
	for col := 0; col < 9; col++ {
		for digit := 1; digit <= 9; digit++ {
			var positions []core.CellRef
			for row := 0; row < 9; row++ {
				if b.GetCandidatesAt(row*9 + col).Has(digit) {
					positions = append(positions, core.CellRef{Row: row, Col: col})
				}
			}

			if len(positions) < 2 || len(positions) > 3 {
				continue
			}

			// Check if all in same box
			boxRow := (positions[0].Row / 3) * 3
			sameBox := true
			for _, p := range positions[1:] {
				if (p.Row/3)*3 != boxRow {
					sameBox = false
					break
				}
			}

			if sameBox {
				boxCol := (col / 3) * 3
				var eliminations []core.Candidate
				for r := boxRow; r < boxRow+3; r++ {
					for c := boxCol; c < boxCol+3; c++ {
						if c == col {
							continue
						}
						if b.GetCandidatesAt(r*9 + c).Has(digit) {
							eliminations = append(eliminations, core.Candidate{Row: r, Col: c, Digit: digit})
						}
					}
				}
				if len(eliminations) > 0 {
					return &core.Move{
						Action:       "eliminate",
						Digit:        digit,
						Targets:      positions,
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("In column %d, %d is confined to one box: eliminate %d from rest of box.", col+1, digit, digit),
						Highlights: core.Highlights{
							Primary:   positions,
							Secondary: ToCellRefs(BoxIndices[boxRow/3*3+col/3]),
						},
					}
				}
			}
		}
	}

	return nil
}
