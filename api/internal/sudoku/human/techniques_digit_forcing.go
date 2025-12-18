package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// maxDigitForcingPropagation is the maximum number of propagation steps per branch
const maxDigitForcingPropagation = 10

// digitForcingResult tracks the outcomes of placing a digit at a specific position
type digitForcingResult struct {
	placements  map[int]int // cell index -> digit placed
	eliminations map[int]map[int]bool // cell index -> set of eliminated digits
}

func newDigitForcingResult() *digitForcingResult {
	return &digitForcingResult{
		placements:   make(map[int]int),
		eliminations: make(map[int]map[int]bool),
	}
}

func (r *digitForcingResult) addPlacement(idx, digit int) {
	r.placements[idx] = digit
}

func (r *digitForcingResult) addElimination(idx, digit int) {
	if r.eliminations[idx] == nil {
		r.eliminations[idx] = make(map[int]bool)
	}
	r.eliminations[idx][digit] = true
}

// detectDigitForcingChain finds Digit Forcing Chain pattern.
// For a specific digit D in a unit where D can only go in 2-3 places:
// 1. For each possible position, assume D goes there
// 2. Propagate forced implications (naked singles, hidden singles)
// 3. Find conclusions common to ALL branches
func detectDigitForcingChain(b *Board) *core.Move {
	// Check each unit type: rows, columns, boxes
	for digit := 1; digit <= 9; digit++ {
		// Check rows
		for row := 0; row < 9; row++ {
			positions := getDigitPositionsInRow(b, row, digit)
			if len(positions) >= 2 && len(positions) <= 3 {
				if move := tryDigitForcingChain(b, digit, positions, "row", row); move != nil {
					return move
				}
			}
		}

		// Check columns
		for col := 0; col < 9; col++ {
			positions := getDigitPositionsInCol(b, col, digit)
			if len(positions) >= 2 && len(positions) <= 3 {
				if move := tryDigitForcingChain(b, digit, positions, "column", col); move != nil {
					return move
				}
			}
		}

		// Check boxes
		for box := 0; box < 9; box++ {
			positions := getDigitPositionsInBox(b, box, digit)
			if len(positions) >= 2 && len(positions) <= 3 {
				if move := tryDigitForcingChain(b, digit, positions, "box", box); move != nil {
					return move
				}
			}
		}
	}

	return nil
}

// getDigitPositionsInRow returns cell indices where digit is a candidate in the row
func getDigitPositionsInRow(b *Board, row, digit int) []int {
	var positions []int
	for col := 0; col < 9; col++ {
		idx := row*9 + col
		if b.Candidates[idx][digit] {
			positions = append(positions, idx)
		}
	}
	return positions
}

// getDigitPositionsInCol returns cell indices where digit is a candidate in the column
func getDigitPositionsInCol(b *Board, col, digit int) []int {
	var positions []int
	for row := 0; row < 9; row++ {
		idx := row*9 + col
		if b.Candidates[idx][digit] {
			positions = append(positions, idx)
		}
	}
	return positions
}

// getDigitPositionsInBox returns cell indices where digit is a candidate in the box
func getDigitPositionsInBox(b *Board, box, digit int) []int {
	var positions []int
	boxRow, boxCol := (box/3)*3, (box%3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			idx := r*9 + c
			if b.Candidates[idx][digit] {
				positions = append(positions, idx)
			}
		}
	}
	return positions
}

// tryDigitForcingChain attempts to find a common conclusion when placing digit
// at each of the possible positions
func tryDigitForcingChain(b *Board, digit int, positions []int, unitType string, unitIdx int) *core.Move {
	if len(positions) < 2 {
		return nil
	}

	// Propagate for each position and collect results
	results := make([]*digitForcingResult, len(positions))
	for i, pos := range positions {
		result := propagateFromPlacement(b, pos, digit)
		if result == nil {
			// Contradiction found - this position is invalid, but we don't handle that here
			return nil
		}
		results[i] = result
	}

	// Find common placements across all branches
	if move := findCommonPlacement(b, digit, positions, results, unitType, unitIdx); move != nil {
		return move
	}

	// Find common eliminations across all branches
	if move := findCommonElimination(b, digit, positions, results, unitType, unitIdx); move != nil {
		return move
	}

	return nil
}

// propagateFromPlacement simulates placing a digit and propagates forced implications
func propagateFromPlacement(b *Board, idx, digit int) *digitForcingResult {
	// Clone the board to simulate
	simBoard := b.Clone()
	result := newDigitForcingResult()

	// Place the initial digit
	simBoard.SetCell(idx, digit)
	result.addPlacement(idx, digit)

	// Track eliminated candidates from the initial placement
	row, col := idx/9, idx%9
	boxRow, boxCol := (row/3)*3, (col/3)*3

	// Record eliminations in row, column, and box
	for c := 0; c < 9; c++ {
		if c != col && b.Candidates[row*9+c][digit] {
			result.addElimination(row*9+c, digit)
		}
	}
	for r := 0; r < 9; r++ {
		if r != row && b.Candidates[r*9+col][digit] {
			result.addElimination(r*9+col, digit)
		}
	}
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			if (r != row || c != col) && b.Candidates[r*9+c][digit] {
				result.addElimination(r*9+c, digit)
			}
		}
	}

	// Propagate forced singles up to max steps
	for step := 0; step < maxDigitForcingPropagation; step++ {
		found := false

		// Look for naked singles
		for i := 0; i < 81; i++ {
			if simBoard.Cells[i] == 0 && len(simBoard.Candidates[i]) == 1 {
				var d int
				for cand := range simBoard.Candidates[i] {
					d = cand
				}
				simBoard.SetCell(i, d)
				result.addPlacement(i, d)

				// Record eliminations
				r, c := i/9, i%9
				br, bc := (r/3)*3, (c/3)*3
				for cc := 0; cc < 9; cc++ {
					if cc != c && b.Candidates[r*9+cc][d] && simBoard.Candidates[r*9+cc][d] == false {
						result.addElimination(r*9+cc, d)
					}
				}
				for rr := 0; rr < 9; rr++ {
					if rr != r && b.Candidates[rr*9+c][d] && simBoard.Candidates[rr*9+c][d] == false {
						result.addElimination(rr*9+c, d)
					}
				}
				for rr := br; rr < br+3; rr++ {
					for cc := bc; cc < bc+3; cc++ {
						if (rr != r || cc != c) && b.Candidates[rr*9+cc][d] && simBoard.Candidates[rr*9+cc][d] == false {
							result.addElimination(rr*9+cc, d)
						}
					}
				}

				found = true
				break
			}
		}

		if found {
			continue
		}

		// Look for hidden singles in rows
		for r := 0; r < 9; r++ {
			for d := 1; d <= 9; d++ {
				var possibleCells []int
				for c := 0; c < 9; c++ {
					i := r*9 + c
					if simBoard.Cells[i] == 0 && simBoard.Candidates[i][d] {
						possibleCells = append(possibleCells, i)
					}
				}
				if len(possibleCells) == 1 {
					i := possibleCells[0]
					if simBoard.Cells[i] == 0 {
						simBoard.SetCell(i, d)
						result.addPlacement(i, d)

						// Record eliminations from this placement
						rr, cc := i/9, i%9
						br, bc := (rr/3)*3, (cc/3)*3
						for ccc := 0; ccc < 9; ccc++ {
							if ccc != cc && b.Candidates[rr*9+ccc][d] {
								result.addElimination(rr*9+ccc, d)
							}
						}
						for rrr := 0; rrr < 9; rrr++ {
							if rrr != rr && b.Candidates[rrr*9+cc][d] {
								result.addElimination(rrr*9+cc, d)
							}
						}
						for rrr := br; rrr < br+3; rrr++ {
							for ccc := bc; ccc < bc+3; ccc++ {
								if (rrr != rr || ccc != cc) && b.Candidates[rrr*9+ccc][d] {
									result.addElimination(rrr*9+ccc, d)
								}
							}
						}

						found = true
						break
					}
				}
			}
			if found {
				break
			}
		}

		if found {
			continue
		}

		// Look for hidden singles in columns
		for c := 0; c < 9; c++ {
			for d := 1; d <= 9; d++ {
				var possibleCells []int
				for r := 0; r < 9; r++ {
					i := r*9 + c
					if simBoard.Cells[i] == 0 && simBoard.Candidates[i][d] {
						possibleCells = append(possibleCells, i)
					}
				}
				if len(possibleCells) == 1 {
					i := possibleCells[0]
					if simBoard.Cells[i] == 0 {
						simBoard.SetCell(i, d)
						result.addPlacement(i, d)

						rr, cc := i/9, i%9
						br, bc := (rr/3)*3, (cc/3)*3
						for ccc := 0; ccc < 9; ccc++ {
							if ccc != cc && b.Candidates[rr*9+ccc][d] {
								result.addElimination(rr*9+ccc, d)
							}
						}
						for rrr := 0; rrr < 9; rrr++ {
							if rrr != rr && b.Candidates[rrr*9+cc][d] {
								result.addElimination(rrr*9+cc, d)
							}
						}
						for rrr := br; rrr < br+3; rrr++ {
							for ccc := bc; ccc < bc+3; ccc++ {
								if (rrr != rr || ccc != cc) && b.Candidates[rrr*9+ccc][d] {
									result.addElimination(rrr*9+ccc, d)
								}
							}
						}

						found = true
						break
					}
				}
			}
			if found {
				break
			}
		}

		if found {
			continue
		}

		// Look for hidden singles in boxes
		for box := 0; box < 9; box++ {
			br, bc := (box/3)*3, (box%3)*3
			for d := 1; d <= 9; d++ {
				var possibleCells []int
				for rr := br; rr < br+3; rr++ {
					for cc := bc; cc < bc+3; cc++ {
						i := rr*9 + cc
						if simBoard.Cells[i] == 0 && simBoard.Candidates[i][d] {
							possibleCells = append(possibleCells, i)
						}
					}
				}
				if len(possibleCells) == 1 {
					i := possibleCells[0]
					if simBoard.Cells[i] == 0 {
						simBoard.SetCell(i, d)
						result.addPlacement(i, d)

						rr, cc := i/9, i%9
						boxR, boxC := (rr/3)*3, (cc/3)*3
						for ccc := 0; ccc < 9; ccc++ {
							if ccc != cc && b.Candidates[rr*9+ccc][d] {
								result.addElimination(rr*9+ccc, d)
							}
						}
						for rrr := 0; rrr < 9; rrr++ {
							if rrr != rr && b.Candidates[rrr*9+cc][d] {
								result.addElimination(rrr*9+cc, d)
							}
						}
						for rrr := boxR; rrr < boxR+3; rrr++ {
							for ccc := boxC; ccc < boxC+3; ccc++ {
								if (rrr != rr || ccc != cc) && b.Candidates[rrr*9+ccc][d] {
									result.addElimination(rrr*9+ccc, d)
								}
							}
						}

						found = true
						break
					}
				}
			}
			if found {
				break
			}
		}

		if !found {
			// No more forced singles to propagate
			break
		}
	}

	return result
}

// findCommonPlacement looks for a cell+digit that is placed in ALL branches
func findCommonPlacement(b *Board, digit int, positions []int, results []*digitForcingResult, unitType string, unitIdx int) *core.Move {
	if len(results) == 0 {
		return nil
	}

	// Use first result as base, check if placements exist in all others
	for idx, placedDigit := range results[0].placements {
		// Skip the starting positions themselves (they're different in each branch)
		isStartPos := false
		for _, pos := range positions {
			if idx == pos {
				isStartPos = true
				break
			}
		}
		if isStartPos {
			continue
		}

		// Skip if cell is already filled on original board
		if b.Cells[idx] != 0 {
			continue
		}

		// Check if this placement exists in all branches
		common := true
		for i := 1; i < len(results); i++ {
			if results[i].placements[idx] != placedDigit {
				common = false
				break
			}
		}

		if common {
			row, col := idx/9, idx%9

			// Build targets (the starting positions we're choosing between)
			var targets []core.CellRef
			for _, pos := range positions {
				targets = append(targets, core.CellRef{Row: pos / 9, Col: pos % 9})
			}

			return &core.Move{
				Action:  "assign",
				Digit:   placedDigit,
				Targets: []core.CellRef{{Row: row, Col: col}},
				Explanation: fmt.Sprintf(
					"Digit Forcing Chain: %d in %s %d can only go in %d positions; "+
						"trying each leads to R%dC%d=%d",
					digit, unitType, unitIdx+1, len(positions), row+1, col+1, placedDigit,
				),
				Highlights: core.Highlights{
					Primary:   []core.CellRef{{Row: row, Col: col}},
					Secondary: targets,
				},
			}
		}
	}

	return nil
}

// findCommonElimination looks for a cell+digit that is eliminated in ALL branches
func findCommonElimination(b *Board, digit int, positions []int, results []*digitForcingResult, unitType string, unitIdx int) *core.Move {
	if len(results) == 0 {
		return nil
	}

	// Collect all eliminations from the first result
	for idx, digits := range results[0].eliminations {
		// Skip the starting positions
		isStartPos := false
		for _, pos := range positions {
			if idx == pos {
				isStartPos = true
				break
			}
		}
		if isStartPos {
			continue
		}

		for elimDigit := range digits {
			// Skip if candidate doesn't exist on original board
			if !b.Candidates[idx][elimDigit] {
				continue
			}

			// Check if this elimination exists in all branches
			common := true
			for i := 1; i < len(results); i++ {
				if results[i].eliminations[idx] == nil || !results[i].eliminations[idx][elimDigit] {
					// Also check if the cell was placed with a different digit (which implies elimination)
					if results[i].placements[idx] == 0 || results[i].placements[idx] == elimDigit {
						common = false
						break
					}
				}
			}

			if common {
				row, col := idx/9, idx%9

				// Build targets (the starting positions we're choosing between)
				var targets []core.CellRef
				for _, pos := range positions {
					targets = append(targets, core.CellRef{Row: pos / 9, Col: pos % 9})
				}

				return &core.Move{
					Action:  "eliminate",
					Digit:   elimDigit,
					Targets: targets,
					Eliminations: []core.Candidate{
						{Row: row, Col: col, Digit: elimDigit},
					},
					Explanation: fmt.Sprintf(
						"Digit Forcing Chain: %d in %s %d can only go in %d positions; "+
							"trying each eliminates %d from R%dC%d",
						digit, unitType, unitIdx+1, len(positions), elimDigit, row+1, col+1,
					),
					Highlights: core.Highlights{
						Primary:   []core.CellRef{{Row: row, Col: col}},
						Secondary: targets,
					},
				}
			}
		}
	}

	return nil
}
