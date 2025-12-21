package human

import (
	"fmt"
	"sort"

	"sudoku-api/internal/core"
)

// detectXWing finds X-Wing pattern: a digit in exactly 2 positions in 2 rows,
// and those positions share the same columns
func detectXWing(b *Board) *core.Move {
	// Check rows for X-Wing
	for digit := 1; digit <= 9; digit++ {
		// Find rows where digit appears in exactly 2 columns
		rowPositions := make(map[int][]int)
		for row := 0; row < 9; row++ {
			var cols []int
			for col := 0; col < 9; col++ {
				if b.Candidates[row*9+col].Has(digit) {
					cols = append(cols, col)
				}
			}
			if len(cols) == 2 {
				rowPositions[row] = cols
			}
		}

		// Look for matching row pairs
		var rows []int
		for row := range rowPositions {
			rows = append(rows, row)
		}

		for i := 0; i < len(rows); i++ {
			for j := i + 1; j < len(rows); j++ {
				r1, r2 := rows[i], rows[j]
				cols1, cols2 := rowPositions[r1], rowPositions[r2]

				if cols1[0] == cols2[0] && cols1[1] == cols2[1] {
					c1, c2 := cols1[0], cols1[1]

					// Find eliminations in the columns
					var eliminations []core.Candidate
					for row := 0; row < 9; row++ {
						if row == r1 || row == r2 {
							continue
						}
						if b.Candidates[row*9+c1].Has(digit) {
							eliminations = append(eliminations, core.Candidate{Row: row, Col: c1, Digit: digit})
						}
						if b.Candidates[row*9+c2].Has(digit) {
							eliminations = append(eliminations, core.Candidate{Row: row, Col: c2, Digit: digit})
						}
					}

					if len(eliminations) > 0 {
						return &core.Move{
							Action: "eliminate",
							Digit:  digit,
							Targets: []core.CellRef{
								{Row: r1, Col: c1}, {Row: r1, Col: c2},
								{Row: r2, Col: c1}, {Row: r2, Col: c2},
							},
							Eliminations: eliminations,
							Explanation:  fmt.Sprintf("X-Wing: %d in rows %d,%d columns %d,%d", digit, r1+1, r2+1, c1+1, c2+1),
							Highlights: core.Highlights{
								Primary: []core.CellRef{
									{Row: r1, Col: c1}, {Row: r1, Col: c2},
									{Row: r2, Col: c1}, {Row: r2, Col: c2},
								},
							},
						}
					}
				}
			}
		}

		// Check columns for X-Wing
		colPositions := make(map[int][]int)
		for col := 0; col < 9; col++ {
			var rows []int
			for row := 0; row < 9; row++ {
				if b.Candidates[row*9+col].Has(digit) {
					rows = append(rows, row)
				}
			}
			if len(rows) == 2 {
				colPositions[col] = rows
			}
		}

		var cols []int
		for col := range colPositions {
			cols = append(cols, col)
		}

		for i := 0; i < len(cols); i++ {
			for j := i + 1; j < len(cols); j++ {
				c1, c2 := cols[i], cols[j]
				rows1, rows2 := colPositions[c1], colPositions[c2]

				if rows1[0] == rows2[0] && rows1[1] == rows2[1] {
					r1, r2 := rows1[0], rows1[1]

					var eliminations []core.Candidate
					for col := 0; col < 9; col++ {
						if col == c1 || col == c2 {
							continue
						}
						if b.Candidates[r1*9+col].Has(digit) {
							eliminations = append(eliminations, core.Candidate{Row: r1, Col: col, Digit: digit})
						}
						if b.Candidates[r2*9+col].Has(digit) {
							eliminations = append(eliminations, core.Candidate{Row: r2, Col: col, Digit: digit})
						}
					}

					if len(eliminations) > 0 {
						return &core.Move{
							Action: "eliminate",
							Digit:  digit,
							Targets: []core.CellRef{
								{Row: r1, Col: c1}, {Row: r1, Col: c2},
								{Row: r2, Col: c1}, {Row: r2, Col: c2},
							},
							Eliminations: eliminations,
							Explanation:  fmt.Sprintf("X-Wing: %d in columns %d,%d rows %d,%d", digit, c1+1, c2+1, r1+1, r2+1),
							Highlights: core.Highlights{
								Primary: []core.CellRef{
									{Row: r1, Col: c1}, {Row: r1, Col: c2},
									{Row: r2, Col: c1}, {Row: r2, Col: c2},
								},
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// detectXYWing finds XY-Wing pattern: pivot cell with candidates XY,
// two wings with candidates XZ and YZ, eliminate Z from cells seeing both wings
func detectXYWing(b *Board) *core.Move {
	// Find cells with exactly 2 candidates (potential pivots or wings)
	var bivalues []int
	for i := 0; i < 81; i++ {
		if b.Candidates[i].Count() == 2 {
			bivalues = append(bivalues, i)
		}
	}

	for _, pivot := range bivalues {
		pivotCands := b.Candidates[pivot].ToSlice()
		if len(pivotCands) != 2 {
			continue
		}
		x, y := pivotCands[0], pivotCands[1]

		// Find wings that see the pivot
		var xzWings, yzWings []int

		for _, wing := range bivalues {
			if wing == pivot {
				continue
			}
			if !ArePeers(pivot, wing) {
				continue
			}

			wingCands := b.Candidates[wing].ToSlice()
			if len(wingCands) != 2 {
				continue
			}

			hasX := wingCands[0] == x || wingCands[1] == x
			hasY := wingCands[0] == y || wingCands[1] == y

			if hasX && !hasY {
				xzWings = append(xzWings, wing)
			} else if hasY && !hasX {
				yzWings = append(yzWings, wing)
			}
		}

		// Try all XZ-YZ pairs
		for _, xzWing := range xzWings {
			xzCands := b.Candidates[xzWing].ToSlice()
			var z1 int
			if xzCands[0] == x {
				z1 = xzCands[1]
			} else {
				z1 = xzCands[0]
			}

			for _, yzWing := range yzWings {
				yzCands := b.Candidates[yzWing].ToSlice()
				var z2 int
				if yzCands[0] == y {
					z2 = yzCands[1]
				} else {
					z2 = yzCands[0]
				}

				if z1 != z2 {
					continue
				}
				z := z1

				// Find cells that see both wings and have z as candidate
				var eliminations []core.Candidate
				for i := 0; i < 81; i++ {
					if i == pivot || i == xzWing || i == yzWing {
						continue
					}
					if !b.Candidates[i].Has(z) {
						continue
					}
					if ArePeers(i, xzWing) && ArePeers(i, yzWing) {
						eliminations = append(eliminations, core.Candidate{
							Row: i / 9, Col: i % 9, Digit: z,
						})
					}
				}

				if len(eliminations) > 0 {
					return &core.Move{
						Action: "eliminate",
						Digit:  z,
						Targets: []core.CellRef{
							{Row: pivot / 9, Col: pivot % 9},
							{Row: xzWing / 9, Col: xzWing % 9},
							{Row: yzWing / 9, Col: yzWing % 9},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("XY-Wing: pivot at R%dC%d with wings, eliminates %d", pivot/9+1, pivot%9+1, z),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: pivot / 9, Col: pivot % 9},
								{Row: xzWing / 9, Col: xzWing % 9},
								{Row: yzWing / 9, Col: yzWing % 9},
							},
						},
					}
				}
			}
		}
	}

	return nil
}

// detectSimpleColoring uses single-digit coloring to find eliminations
func detectSimpleColoring(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		// Find conjugate pairs (cells where digit appears exactly twice in a unit)
		conjugates := make(map[int][]int) // cell -> connected cells

		// Check rows
		for row := 0; row < 9; row++ {
			var cells []int
			for col := 0; col < 9; col++ {
				if b.Candidates[row*9+col].Has(digit) {
					cells = append(cells, row*9+col)
				}
			}
			if len(cells) == 2 {
				conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
				conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
			}
		}

		// Check columns
		for col := 0; col < 9; col++ {
			var cells []int
			for row := 0; row < 9; row++ {
				if b.Candidates[row*9+col].Has(digit) {
					cells = append(cells, row*9+col)
				}
			}
			if len(cells) == 2 {
				conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
				conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
			}
		}

		// Check boxes
		for box := 0; box < 9; box++ {
			var cells []int
			boxRow, boxCol := (box/3)*3, (box%3)*3
			for r := boxRow; r < boxRow+3; r++ {
				for c := boxCol; c < boxCol+3; c++ {
					if b.Candidates[r*9+c].Has(digit) {
						cells = append(cells, r*9+c)
					}
				}
			}
			if len(cells) == 2 {
				conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
				conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
			}
		}

		if len(conjugates) == 0 {
			continue
		}

		// Get sorted list of starting cells for deterministic iteration
		var startCells []int
		for cell := range conjugates {
			startCells = append(startCells, cell)
		}
		sort.Ints(startCells)

		// Color each connected component separately
		colors := make(map[int]int) // cell -> color (1 or 2)

		for _, start := range startCells {
			if colors[start] != 0 {
				continue
			}

			// BFS to color THIS connected component only
			var color1, color2 []int // Reset for each component!
			queue := []int{start}
			colors[start] = 1
			color1 = append(color1, start)

			for len(queue) > 0 {
				cell := queue[0]
				queue = queue[1:]
				currentColor := colors[cell]
				nextColor := 3 - currentColor

				for _, neighbor := range conjugates[cell] {
					if colors[neighbor] == 0 {
						colors[neighbor] = nextColor
						if nextColor == 1 {
							color1 = append(color1, neighbor)
						} else {
							color2 = append(color2, neighbor)
						}
						queue = append(queue, neighbor)
					}
				}
			}

			// Need at least one cell of each color for a valid chain
			if len(color1) == 0 || len(color2) == 0 {
				continue
			}

			// Check for eliminations: cells that see both colors OF THIS COMPONENT
			for i := 0; i < 81; i++ {
				if !b.Candidates[i].Has(digit) || colors[i] != 0 {
					continue
				}

				seesColor1 := false
				seesColor2 := false
				for _, c1 := range color1 {
					if ArePeers(i, c1) {
						seesColor1 = true
						break
					}
				}
				for _, c2 := range color2 {
					if ArePeers(i, c2) {
						seesColor2 = true
						break
					}
				}

				if seesColor1 && seesColor2 {
					return &core.Move{
						Action: "eliminate",
						Digit:  digit,
						Targets: []core.CellRef{
							{Row: i / 9, Col: i % 9},
						},
						Eliminations: []core.Candidate{
							{Row: i / 9, Col: i % 9, Digit: digit},
						},
						Explanation: fmt.Sprintf("Simple Coloring: cell R%dC%d sees both colors for %d", i/9+1, i%9+1, digit),
						Highlights: core.Highlights{
							Primary:   []core.CellRef{{Row: i / 9, Col: i % 9}},
							Secondary: cellRefsFromIndices(append(color1, color2...)),
						},
					}
				}
			}
		}
	}

	return nil
}

func cellRefsFromIndices(indices []int) []core.CellRef {
	refs := make([]core.CellRef, len(indices))
	for i, idx := range indices {
		refs[i] = core.CellRef{Row: idx / 9, Col: idx % 9}
	}
	return refs
}
