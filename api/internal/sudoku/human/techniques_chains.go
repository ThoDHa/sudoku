package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectJellyfish finds Jellyfish pattern: 4 rows where a digit appears in 2-4 positions,
// and those positions share exactly 4 columns (or vice versa)
func detectJellyfish(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		// Check rows
		if move := detectJellyfishInRows(b, digit); move != nil {
			return move
		}
		// Check columns
		if move := detectJellyfishInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectJellyfishInRows(b *Board, digit int) *core.Move {
	rowPositions := make(map[int][]int)
	for row := 0; row < 9; row++ {
		var cols []int
		for col := 0; col < 9; col++ {
			if b.Candidates[row*9+col][digit] {
				cols = append(cols, col)
			}
		}
		if len(cols) >= 2 && len(cols) <= 4 {
			rowPositions[row] = cols
		}
	}

	var rows []int
	for row := range rowPositions {
		rows = append(rows, row)
	}

	if len(rows) < 4 {
		return nil
	}

	// Try all combinations of 4 rows
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			for k := j + 1; k < len(rows); k++ {
				for l := k + 1; l < len(rows); l++ {
					r1, r2, r3, r4 := rows[i], rows[j], rows[k], rows[l]

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
					for _, c := range rowPositions[r4] {
						colSet[c] = true
					}

					if len(colSet) != 4 {
						continue
					}

					var cols []int
					for c := range colSet {
						cols = append(cols, c)
					}

					var eliminations []core.Candidate
					for _, col := range cols {
						for row := 0; row < 9; row++ {
							if row == r1 || row == r2 || row == r3 || row == r4 {
								continue
							}
							if b.Candidates[row*9+col][digit] {
								eliminations = append(eliminations, core.Candidate{
									Row: row, Col: col, Digit: digit,
								})
							}
						}
					}

					if len(eliminations) > 0 {
						var targets []core.CellRef
						for _, row := range []int{r1, r2, r3, r4} {
							for _, col := range rowPositions[row] {
								targets = append(targets, core.CellRef{Row: row, Col: col})
							}
						}

						return &core.Move{
							Action:       "eliminate",
							Digit:        digit,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation:  fmt.Sprintf("Jellyfish: %d in rows %d,%d,%d,%d", digit, r1+1, r2+1, r3+1, r4+1),
							Highlights: core.Highlights{
								Primary: targets,
							},
						}
					}
				}
			}
		}
	}

	return nil
}

func detectJellyfishInCols(b *Board, digit int) *core.Move {
	colPositions := make(map[int][]int)
	for col := 0; col < 9; col++ {
		var rows []int
		for row := 0; row < 9; row++ {
			if b.Candidates[row*9+col][digit] {
				rows = append(rows, row)
			}
		}
		if len(rows) >= 2 && len(rows) <= 4 {
			colPositions[col] = rows
		}
	}

	var cols []int
	for col := range colPositions {
		cols = append(cols, col)
	}

	if len(cols) < 4 {
		return nil
	}

	for i := 0; i < len(cols); i++ {
		for j := i + 1; j < len(cols); j++ {
			for k := j + 1; k < len(cols); k++ {
				for l := k + 1; l < len(cols); l++ {
					c1, c2, c3, c4 := cols[i], cols[j], cols[k], cols[l]

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
					for _, r := range colPositions[c4] {
						rowSet[r] = true
					}

					if len(rowSet) != 4 {
						continue
					}

					var rows []int
					for r := range rowSet {
						rows = append(rows, r)
					}

					var eliminations []core.Candidate
					for _, row := range rows {
						for col := 0; col < 9; col++ {
							if col == c1 || col == c2 || col == c3 || col == c4 {
								continue
							}
							if b.Candidates[row*9+col][digit] {
								eliminations = append(eliminations, core.Candidate{
									Row: row, Col: col, Digit: digit,
								})
							}
						}
					}

					if len(eliminations) > 0 {
						var targets []core.CellRef
						for _, col := range []int{c1, c2, c3, c4} {
							for _, row := range colPositions[col] {
								targets = append(targets, core.CellRef{Row: row, Col: col})
							}
						}

						return &core.Move{
							Action:       "eliminate",
							Digit:        digit,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation:  fmt.Sprintf("Jellyfish: %d in columns %d,%d,%d,%d", digit, c1+1, c2+1, c3+1, c4+1),
							Highlights: core.Highlights{
								Primary: targets,
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// detectXChain finds X-Chain pattern: a chain of conjugate pairs for a single digit
func detectXChain(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		// Build conjugate pair graph
		conjugates := buildConjugateGraph(b, digit)
		if len(conjugates) == 0 {
			continue
		}

		// Find chains of length 4+ (even length required for elimination)
		for start := range conjugates {
			if move := findXChainFrom(b, digit, start, conjugates); move != nil {
				return move
			}
		}
	}
	return nil
}

func buildConjugateGraph(b *Board, digit int) map[int][]int {
	conjugates := make(map[int][]int)

	// Check rows
	for row := 0; row < 9; row++ {
		var cells []int
		for col := 0; col < 9; col++ {
			if b.Candidates[row*9+col][digit] {
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
			if b.Candidates[row*9+col][digit] {
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
				if b.Candidates[r*9+c][digit] {
					cells = append(cells, r*9+c)
				}
			}
		}
		if len(cells) == 2 {
			conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
			conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
		}
	}

	return conjugates
}

func findXChainFrom(b *Board, digit int, start int, conjugates map[int][]int) *core.Move {
	// BFS to find chains
	type chainNode struct {
		cell  int
		path  []int
		color int // 0 = ON, 1 = OFF
	}

	visited := make(map[int]bool)
	queue := []chainNode{{start, []int{start}, 0}}

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		if visited[node.cell] {
			continue
		}
		visited[node.cell] = true

		// Look for eliminations: cells that see both ends of an even-length chain
		if len(node.path) >= 4 && len(node.path)%2 == 0 {
			chainStart := node.path[0]
			chainEnd := node.cell

			for i := 0; i < 81; i++ {
				if !b.Candidates[i][digit] {
					continue
				}
				// Skip cells in the chain
				inChain := false
				for _, c := range node.path {
					if i == c {
						inChain = true
						break
					}
				}
				if inChain {
					continue
				}

				// Must see both ends
				if sees(i, chainStart) && sees(i, chainEnd) {
					var targets []core.CellRef
					for _, c := range node.path {
						targets = append(targets, core.CellRef{Row: c / 9, Col: c % 9})
					}

					return &core.Move{
						Action:  "eliminate",
						Digit:   digit,
						Targets: targets,
						Eliminations: []core.Candidate{
							{Row: i / 9, Col: i % 9, Digit: digit},
						},
						Explanation: fmt.Sprintf("X-Chain: %d eliminated from R%dC%d (sees both ends of chain)", digit, i/9+1, i%9+1),
						Highlights: core.Highlights{
							Primary:   targets,
							Secondary: []core.CellRef{{Row: i / 9, Col: i % 9}},
						},
					}
				}
			}
		}

		// Continue building chain
		for _, next := range conjugates[node.cell] {
			if !visited[next] {
				newPath := make([]int, len(node.path)+1)
				copy(newPath, node.path)
				newPath[len(node.path)] = next
				queue = append(queue, chainNode{next, newPath, 1 - node.color})
			}
		}
	}

	return nil
}

// detectXYChain finds XY-Chain pattern: a chain of bivalue cells
func detectXYChain(b *Board) *core.Move {
	// Find all bivalue cells
	var bivalue []int
	for i := 0; i < 81; i++ {
		if len(b.Candidates[i]) == 2 {
			bivalue = append(bivalue, i)
		}
	}

	if len(bivalue) < 3 {
		return nil
	}

	// Build adjacency: two bivalue cells are connected if they share a unit and a candidate
	adj := make(map[int][]struct {
		cell       int
		sharedCand int
	})

	for _, c1 := range bivalue {
		for _, c2 := range bivalue {
			if c1 >= c2 || !sees(c1, c2) {
				continue
			}
			// Find shared candidate
			for d := range b.Candidates[c1] {
				if b.Candidates[c2][d] {
					adj[c1] = append(adj[c1], struct {
						cell       int
						sharedCand int
					}{c2, d})
					adj[c2] = append(adj[c2], struct {
						cell       int
						sharedCand int
					}{c1, d})
					break
				}
			}
		}
	}

	// DFS to find chains
	for _, start := range bivalue {
		if move := findXYChainFrom(b, start, adj); move != nil {
			return move
		}
	}

	return nil
}

func findXYChainFrom(b *Board, start int, adj map[int][]struct {
	cell       int
	sharedCand int
}) *core.Move {
	cands := getCandidateSlice(b.Candidates[start])
	if len(cands) != 2 {
		return nil
	}

	// Try chains starting with each candidate
	for _, startCand := range cands {
		type node struct {
			cell    int
			path    []int
			endCand int // the "dangling" candidate at the end
		}

		visited := make(map[int]bool)
		// Start with the other candidate as the "dangling" one
		otherCand := cands[0]
		if startCand == cands[0] {
			otherCand = cands[1]
		}

		queue := []node{{start, []int{start}, otherCand}}

		for len(queue) > 0 {
			n := queue[0]
			queue = queue[1:]

			if visited[n.cell] {
				continue
			}
			visited[n.cell] = true

			// Check for eliminations: if start's startCand == end's endCand,
			// cells seeing both can eliminate that digit
			if len(n.path) >= 3 && startCand == n.endCand {
				chainStart := n.path[0]
				chainEnd := n.cell

				for i := 0; i < 81; i++ {
					if !b.Candidates[i][startCand] {
						continue
					}
					inChain := false
					for _, c := range n.path {
						if i == c {
							inChain = true
							break
						}
					}
					if inChain {
						continue
					}

					if sees(i, chainStart) && sees(i, chainEnd) {
						var targets []core.CellRef
						for _, c := range n.path {
							targets = append(targets, core.CellRef{Row: c / 9, Col: c % 9})
						}

						return &core.Move{
							Action:  "eliminate",
							Digit:   startCand,
							Targets: targets,
							Eliminations: []core.Candidate{
								{Row: i / 9, Col: i % 9, Digit: startCand},
							},
							Explanation: fmt.Sprintf("XY-Chain: %d eliminated from R%dC%d", startCand, i/9+1, i%9+1),
							Highlights: core.Highlights{
								Primary:   targets,
								Secondary: []core.CellRef{{Row: i / 9, Col: i % 9}},
							},
						}
					}
				}
			}

			// Extend chain
			for _, neighbor := range adj[n.cell] {
				if visited[neighbor.cell] {
					continue
				}
				// The shared candidate must be the current endCand
				if neighbor.sharedCand != n.endCand {
					continue
				}

				// New end candidate is the other candidate of the neighbor cell
				neighborCands := getCandidateSlice(b.Candidates[neighbor.cell])
				if len(neighborCands) != 2 {
					continue
				}
				newEndCand := neighborCands[0]
				if neighborCands[0] == neighbor.sharedCand {
					newEndCand = neighborCands[1]
				}

				newPath := make([]int, len(n.path)+1)
				copy(newPath, n.path)
				newPath[len(n.path)] = neighbor.cell
				queue = append(queue, node{neighbor.cell, newPath, newEndCand})
			}
		}
	}

	return nil
}

// detectWWing finds W-Wing pattern: two bivalue cells with same candidates,
// connected by a strong link on one of the candidates
func detectWWing(b *Board) *core.Move {
	// Find all bivalue cells
	var bivalue []struct {
		idx    int
		digits [2]int
	}

	for i := 0; i < 81; i++ {
		if len(b.Candidates[i]) == 2 {
			cands := getCandidateSlice(b.Candidates[i])
			bivalue = append(bivalue, struct {
				idx    int
				digits [2]int
			}{i, [2]int{cands[0], cands[1]}})
		}
	}

	// Look for pairs with same candidates
	for i := 0; i < len(bivalue); i++ {
		for j := i + 1; j < len(bivalue); j++ {
			bv1, bv2 := bivalue[i], bivalue[j]
			if bv1.digits != bv2.digits {
				continue
			}
			if sees(bv1.idx, bv2.idx) {
				continue // They shouldn't see each other directly
			}

			d1, d2 := bv1.digits[0], bv1.digits[1]

			// Check if there's a strong link on d1 or d2 connecting them
			for _, linkDigit := range []int{d1, d2} {
				elimDigit := d1
				if linkDigit == d1 {
					elimDigit = d2
				}

				// Find cells with linkDigit that see bv1 and are part of a conjugate pair
				for row := 0; row < 9; row++ {
					var cells []int
					for col := 0; col < 9; col++ {
						if b.Candidates[row*9+col][linkDigit] {
							cells = append(cells, row*9+col)
						}
					}
					if len(cells) != 2 {
						continue
					}

					// Check if one cell sees bv1 and the other sees bv2
					var link1, link2 int = -1, -1
					if sees(cells[0], bv1.idx) && sees(cells[1], bv2.idx) {
						link1, link2 = cells[0], cells[1]
					} else if sees(cells[1], bv1.idx) && sees(cells[0], bv2.idx) {
						link1, link2 = cells[1], cells[0]
					}

					if link1 != -1 {
						// W-Wing found! Eliminate elimDigit from cells seeing both bv1 and bv2
						var eliminations []core.Candidate
						for idx := 0; idx < 81; idx++ {
							if !b.Candidates[idx][elimDigit] {
								continue
							}
							if idx == bv1.idx || idx == bv2.idx || idx == link1 || idx == link2 {
								continue
							}
							if sees(idx, bv1.idx) && sees(idx, bv2.idx) {
								eliminations = append(eliminations, core.Candidate{
									Row: idx / 9, Col: idx % 9, Digit: elimDigit,
								})
							}
						}

						if len(eliminations) > 0 {
							return &core.Move{
								Action: "eliminate",
								Digit:  elimDigit,
								Targets: []core.CellRef{
									{Row: bv1.idx / 9, Col: bv1.idx % 9},
									{Row: bv2.idx / 9, Col: bv2.idx % 9},
									{Row: link1 / 9, Col: link1 % 9},
									{Row: link2 / 9, Col: link2 % 9},
								},
								Eliminations: eliminations,
								Explanation:  fmt.Sprintf("W-Wing: {%d,%d} cells connected by strong link on %d", d1, d2, linkDigit),
								Highlights: core.Highlights{
									Primary: []core.CellRef{
										{Row: bv1.idx / 9, Col: bv1.idx % 9},
										{Row: bv2.idx / 9, Col: bv2.idx % 9},
									},
									Secondary: []core.CellRef{
										{Row: link1 / 9, Col: link1 % 9},
										{Row: link2 / 9, Col: link2 % 9},
									},
								},
							}
						}
					}
				}

				// Also check columns and boxes for strong links
				for col := 0; col < 9; col++ {
					var cells []int
					for row := 0; row < 9; row++ {
						if b.Candidates[row*9+col][linkDigit] {
							cells = append(cells, row*9+col)
						}
					}
					if len(cells) != 2 {
						continue
					}

					var link1, link2 int = -1, -1
					if sees(cells[0], bv1.idx) && sees(cells[1], bv2.idx) {
						link1, link2 = cells[0], cells[1]
					} else if sees(cells[1], bv1.idx) && sees(cells[0], bv2.idx) {
						link1, link2 = cells[1], cells[0]
					}

					if link1 != -1 {
						var eliminations []core.Candidate
						for idx := 0; idx < 81; idx++ {
							if !b.Candidates[idx][elimDigit] {
								continue
							}
							if idx == bv1.idx || idx == bv2.idx || idx == link1 || idx == link2 {
								continue
							}
							if sees(idx, bv1.idx) && sees(idx, bv2.idx) {
								eliminations = append(eliminations, core.Candidate{
									Row: idx / 9, Col: idx % 9, Digit: elimDigit,
								})
							}
						}

						if len(eliminations) > 0 {
							return &core.Move{
								Action: "eliminate",
								Digit:  elimDigit,
								Targets: []core.CellRef{
									{Row: bv1.idx / 9, Col: bv1.idx % 9},
									{Row: bv2.idx / 9, Col: bv2.idx % 9},
									{Row: link1 / 9, Col: link1 % 9},
									{Row: link2 / 9, Col: link2 % 9},
								},
								Eliminations: eliminations,
								Explanation:  fmt.Sprintf("W-Wing: {%d,%d} cells connected by strong link on %d", d1, d2, linkDigit),
								Highlights: core.Highlights{
									Primary: []core.CellRef{
										{Row: bv1.idx / 9, Col: bv1.idx % 9},
										{Row: bv2.idx / 9, Col: bv2.idx % 9},
									},
									Secondary: []core.CellRef{
										{Row: link1 / 9, Col: link1 % 9},
										{Row: link2 / 9, Col: link2 % 9},
									},
								},
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// detectEmptyRectangle finds Empty Rectangle pattern
// An empty rectangle is a box where all candidates for a digit are in an L-shape
// (all in one row + one column within the box). Combined with a strong link (conjugate pair)
// in a line outside the box, this can eliminate candidates.
func detectEmptyRectangle(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		for box := 0; box < 9; box++ {
			boxRowStart, boxColStart := (box/3)*3, (box%3)*3

			// Find positions of digit in this box
			var positions []int
			for r := boxRowStart; r < boxRowStart+3; r++ {
				for c := boxColStart; c < boxColStart+3; c++ {
					if b.Candidates[r*9+c][digit] {
						positions = append(positions, r*9+c)
					}
				}
			}

			if len(positions) < 2 || len(positions) > 4 {
				continue
			}

			// Check if positions form an ER (all in one row OR one column within box,
			// or in an L-shape where there's a "pivot" row and column)
			rowCount := make(map[int]int)
			colCount := make(map[int]int)
			for _, pos := range positions {
				rowCount[pos/9]++
				colCount[pos%9]++
			}

			// For ER, we need positions that can be covered by one row + one column
			// Try each combination of pivot row and column within the box
			for erRow := boxRowStart; erRow < boxRowStart+3; erRow++ {
				for erCol := boxColStart; erCol < boxColStart+3; erCol++ {
					// Check if all positions are in erRow or erCol
					validER := true
					for _, pos := range positions {
						r, c := pos/9, pos%9
						if r != erRow && c != erCol {
							validER = false
							break
						}
					}
					if !validER {
						continue
					}

					// We need at least one position in erRow (not at erCol) and one in erCol (not at erRow)
					// to form a proper L-shape
					hasRowArm := false
					hasColArm := false
					for _, pos := range positions {
						r, c := pos/9, pos%9
						if r == erRow && c != erCol {
							hasRowArm = true
						}
						if c == erCol && r != erRow {
							hasColArm = true
						}
					}
					if !hasRowArm || !hasColArm {
						continue // Need both arms for a proper ER
					}

					// We have an empty rectangle with pivot at erRow, erCol
					// Now look for a conjugate pair (strong link) outside the box

					// Strategy 1: Find a conjugate pair in a COLUMN outside the box
					// where one end is in erRow, and eliminate from the other end's row
					// intersecting with erCol
					for linkCol := 0; linkCol < 9; linkCol++ {
						if linkCol >= boxColStart && linkCol < boxColStart+3 {
							continue // Skip columns in the ER box
						}

						// Find all candidates in this column
						var colPositions []int
						for r := 0; r < 9; r++ {
							if b.Candidates[r*9+linkCol][digit] {
								colPositions = append(colPositions, r)
							}
						}

						// Need exactly 2 candidates to form a conjugate pair
						if len(colPositions) != 2 {
							continue
						}

						// Check if one of them is in erRow
						var linkRow int = -1
						for _, r := range colPositions {
							if r == erRow {
								// Found the connection - the other position is the link
								for _, r2 := range colPositions {
									if r2 != erRow {
										linkRow = r2
									}
								}
								break
							}
						}

						if linkRow < 0 {
							continue // No connection to erRow
						}

						// Now we can eliminate from (linkRow, erCol) if it has the digit
						// AND the target is outside the ER box
						if linkRow >= boxRowStart && linkRow < boxRowStart+3 {
							continue // Target would be inside the ER box
						}
						targetIdx := linkRow*9 + erCol
						if b.Candidates[targetIdx][digit] {
							var targets []core.CellRef
							for _, p := range positions {
								targets = append(targets, core.CellRef{Row: p / 9, Col: p % 9})
							}

							return &core.Move{
								Action:  "eliminate",
								Digit:   digit,
								Targets: targets,
								Eliminations: []core.Candidate{
									{Row: linkRow, Col: erCol, Digit: digit},
								},
								Explanation: fmt.Sprintf("Empty Rectangle: %d in box %d with conjugate pair in C%d eliminates R%dC%d",
									digit, box+1, linkCol+1, linkRow+1, erCol+1),
								Highlights: core.Highlights{
									Primary:   targets,
									Secondary: []core.CellRef{{Row: linkRow, Col: erCol}},
								},
							}
						}
					}

					// Strategy 2: Find a conjugate pair in a ROW outside the box
					// where one end is in erCol, and eliminate from the other end's column
					// intersecting with erRow
					for linkRow := 0; linkRow < 9; linkRow++ {
						if linkRow >= boxRowStart && linkRow < boxRowStart+3 {
							continue // Skip rows in the ER box
						}

						// Find all candidates in this row
						var rowPositions []int
						for c := 0; c < 9; c++ {
							if b.Candidates[linkRow*9+c][digit] {
								rowPositions = append(rowPositions, c)
							}
						}

						// Need exactly 2 candidates to form a conjugate pair
						if len(rowPositions) != 2 {
							continue
						}

						// Check if one of them is in erCol
						var linkCol int = -1
						for _, c := range rowPositions {
							if c == erCol {
								// Found the connection - the other position is the link
								for _, c2 := range rowPositions {
									if c2 != erCol {
										linkCol = c2
									}
								}
								break
							}
						}

						if linkCol < 0 {
							continue // No connection to erCol
						}

						// The elimination target must be outside the ER box
						if linkCol >= boxColStart && linkCol < boxColStart+3 {
							continue // Target would be inside the ER box
						}

						// Now we can eliminate from (erRow, linkCol) if it has the digit
						targetIdx := erRow*9 + linkCol
						if b.Candidates[targetIdx][digit] {
							var targets []core.CellRef
							for _, p := range positions {
								targets = append(targets, core.CellRef{Row: p / 9, Col: p % 9})
							}

							return &core.Move{
								Action:  "eliminate",
								Digit:   digit,
								Targets: targets,
								Eliminations: []core.Candidate{
									{Row: erRow, Col: linkCol, Digit: digit},
								},
								Explanation: fmt.Sprintf("Empty Rectangle: %d in box %d with conjugate pair in R%d eliminates R%dC%d",
									digit, box+1, linkRow+1, erRow+1, linkCol+1),
								Highlights: core.Highlights{
									Primary:   targets,
									Secondary: []core.CellRef{{Row: erRow, Col: linkCol}},
								},
							}
						}
					}
				}
			}
		}
	}

	return nil
}
