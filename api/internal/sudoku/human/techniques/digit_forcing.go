package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// maxDigitForcingPropagation is the maximum number of propagation steps per branch
const maxDigitForcingPropagation = 10

// digitForcingResult tracks the outcomes of placing a digit at a specific position
type digitForcingResult struct {
	placements   map[int]int          // cell index -> digit placed
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

// DetectDigitForcingChain finds Digit Forcing Chain pattern.
// For a specific digit D in a unit where D can only go in 2-3 places:
// 1. For each possible position, assume D goes there
// 2. Propagate forced implications (naked singles, hidden singles)
// 3. Find conclusions common to ALL branches
func DetectDigitForcingChain(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		for _, unit := range AllUnits() {
			positions := b.CellsWithDigitInUnit(unit, digit)
			if len(positions) >= 2 && len(positions) <= 3 {
				if move := tryDigitForcingChain(b, digit, positions, unit.Type.String(), unit.Index); move != nil {
					return move
				}
			}
		}
	}
	return nil
}

// tryDigitForcingChain attempts to find a common conclusion when placing digit
// at each of the possible positions
func tryDigitForcingChain(b BoardInterface, digit int, positions []int, unitType string, unitIdx int) *core.Move {
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
	return findCommonElimination(b, digit, positions, results, unitType, unitIdx)
}

// propagateFromPlacement simulates placing a digit and propagates forced implications
func propagateFromPlacement(b BoardInterface, idx, digit int) *digitForcingResult {
	// Clone the board to simulate
	simBoard := b.CloneBoard()
	result := newDigitForcingResult()

	// Place the initial digit
	simBoard.SetCell(idx, digit)
	result.addPlacement(idx, digit)

	// Track eliminated candidates from the initial placement
	row, col := idx/constants.GridSize, idx%constants.GridSize
	boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize

	// Record eliminations in row, column, and box
	for c := 0; c < constants.GridSize; c++ {
		if c != col && b.GetCandidatesAt(row*constants.GridSize+c).Has(digit) {
			result.addElimination(row*constants.GridSize+c, digit)
		}
	}
	for r := 0; r < constants.GridSize; r++ {
		if r != row && b.GetCandidatesAt(r*constants.GridSize+col).Has(digit) {
			result.addElimination(r*constants.GridSize+col, digit)
		}
	}
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			if (r != row || c != col) && b.GetCandidatesAt(r*constants.GridSize+c).Has(digit) {
				result.addElimination(r*constants.GridSize+c, digit)
			}
		}
	}

	// Propagate forced singles up to max steps
	for step := 0; step < maxDigitForcingPropagation; step++ {
		found := false

		// Look for naked singles
		for i := 0; i < constants.TotalCells; i++ {
			if simBoard.GetCell(i) == 0 && simBoard.GetCandidatesAt(i).Count() == 1 {
				d, _ := simBoard.GetCandidatesAt(i).Only()
				simBoard.SetCell(i, d)
				result.addPlacement(i, d)

				// Record eliminations
				r, c := i/constants.GridSize, i%constants.GridSize
				br, bc := (r/constants.BoxSize)*constants.BoxSize, (c/constants.BoxSize)*constants.BoxSize
				for cc := 0; cc < constants.GridSize; cc++ {
					if cc != c && b.GetCandidatesAt(r*constants.GridSize+cc).Has(d) && !simBoard.GetCandidatesAt(r*constants.GridSize+cc).Has(d) {
						result.addElimination(r*constants.GridSize+cc, d)
					}
				}
				for rr := 0; rr < constants.GridSize; rr++ {
					if rr != r && b.GetCandidatesAt(rr*constants.GridSize+c).Has(d) && !simBoard.GetCandidatesAt(rr*constants.GridSize+c).Has(d) {
						result.addElimination(rr*constants.GridSize+c, d)
					}
				}
				for rr := br; rr < br+constants.BoxSize; rr++ {
					for cc := bc; cc < bc+constants.BoxSize; cc++ {
						if (rr != r || cc != c) && b.GetCandidatesAt(rr*constants.GridSize+cc).Has(d) && !simBoard.GetCandidatesAt(rr*constants.GridSize+cc).Has(d) {
							result.addElimination(rr*constants.GridSize+cc, d)
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
		for r := 0; r < constants.GridSize; r++ {
			for d := 1; d <= constants.GridSize; d++ {
				var possibleCells []int
				for c := 0; c < constants.GridSize; c++ {
					i := r*constants.GridSize + c
					if simBoard.GetCell(i) == 0 && simBoard.GetCandidatesAt(i).Has(d) {
						possibleCells = append(possibleCells, i)
					}
				}
				if len(possibleCells) == 1 {
					i := possibleCells[0]
					if simBoard.GetCell(i) == 0 {
						simBoard.SetCell(i, d)
						result.addPlacement(i, d)

						// Record eliminations from this placement
						rr, cc := i/constants.GridSize, i%constants.GridSize
						br, bc := (rr/constants.BoxSize)*constants.BoxSize, (cc/constants.BoxSize)*constants.BoxSize
						for ccc := 0; ccc < constants.GridSize; ccc++ {
							if ccc != cc && b.GetCandidatesAt(rr*constants.GridSize+ccc).Has(d) {
								result.addElimination(rr*constants.GridSize+ccc, d)
							}
						}
						for rrr := 0; rrr < constants.GridSize; rrr++ {
							if rrr != rr && b.GetCandidatesAt(rrr*constants.GridSize+cc).Has(d) {
								result.addElimination(rrr*constants.GridSize+cc, d)
							}
						}
						for rrr := br; rrr < br+constants.BoxSize; rrr++ {
							for ccc := bc; ccc < bc+constants.BoxSize; ccc++ {
								if (rrr != rr || ccc != cc) && b.GetCandidatesAt(rrr*constants.GridSize+ccc).Has(d) {
									result.addElimination(rrr*constants.GridSize+ccc, d)
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
		for c := 0; c < constants.GridSize; c++ {
			for d := 1; d <= constants.GridSize; d++ {
				var possibleCells []int
				for r := 0; r < constants.GridSize; r++ {
					i := r*constants.GridSize + c
					if simBoard.GetCell(i) == 0 && simBoard.GetCandidatesAt(i).Has(d) {
						possibleCells = append(possibleCells, i)
					}
				}
				if len(possibleCells) == 1 {
					i := possibleCells[0]
					if simBoard.GetCell(i) == 0 {
						simBoard.SetCell(i, d)
						result.addPlacement(i, d)

						rr, cc := i/constants.GridSize, i%constants.GridSize
						br, bc := (rr/constants.BoxSize)*constants.BoxSize, (cc/constants.BoxSize)*constants.BoxSize
						for ccc := 0; ccc < constants.GridSize; ccc++ {
							if ccc != cc && b.GetCandidatesAt(rr*constants.GridSize+ccc).Has(d) {
								result.addElimination(rr*constants.GridSize+ccc, d)
							}
						}
						for rrr := 0; rrr < constants.GridSize; rrr++ {
							if rrr != rr && b.GetCandidatesAt(rrr*constants.GridSize+cc).Has(d) {
								result.addElimination(rrr*constants.GridSize+cc, d)
							}
						}
						for rrr := br; rrr < br+constants.BoxSize; rrr++ {
							for ccc := bc; ccc < bc+constants.BoxSize; ccc++ {
								if (rrr != rr || ccc != cc) && b.GetCandidatesAt(rrr*constants.GridSize+ccc).Has(d) {
									result.addElimination(rrr*constants.GridSize+ccc, d)
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
		for box := 0; box < constants.GridSize; box++ {
			br, bc := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize
			for d := 1; d <= constants.GridSize; d++ {
				var possibleCells []int
				for rr := br; rr < br+constants.BoxSize; rr++ {
					for cc := bc; cc < bc+constants.BoxSize; cc++ {
						i := rr*constants.GridSize + cc
						if simBoard.GetCell(i) == 0 && simBoard.GetCandidatesAt(i).Has(d) {
							possibleCells = append(possibleCells, i)
						}
					}
				}
				if len(possibleCells) == 1 {
					i := possibleCells[0]
					if simBoard.GetCell(i) == 0 {
						simBoard.SetCell(i, d)
						result.addPlacement(i, d)

						rr, cc := i/constants.GridSize, i%constants.GridSize
						boxR, boxC := (rr/constants.BoxSize)*constants.BoxSize, (cc/constants.BoxSize)*constants.BoxSize
						for ccc := 0; ccc < constants.GridSize; ccc++ {
							if ccc != cc && b.GetCandidatesAt(rr*constants.GridSize+ccc).Has(d) {
								result.addElimination(rr*constants.GridSize+ccc, d)
							}
						}
						for rrr := 0; rrr < constants.GridSize; rrr++ {
							if rrr != rr && b.GetCandidatesAt(rrr*constants.GridSize+cc).Has(d) {
								result.addElimination(rrr*constants.GridSize+cc, d)
							}
						}
						for rrr := boxR; rrr < boxR+constants.BoxSize; rrr++ {
							for ccc := boxC; ccc < boxC+constants.BoxSize; ccc++ {
								if (rrr != rr || ccc != cc) && b.GetCandidatesAt(rrr*constants.GridSize+ccc).Has(d) {
									result.addElimination(rrr*constants.GridSize+ccc, d)
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
func findCommonPlacement(b BoardInterface, digit int, positions []int, results []*digitForcingResult, unitType string, unitIdx int) *core.Move {
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
		if b.GetCell(idx) != 0 {
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
			row, col := idx/constants.GridSize, idx%constants.GridSize

			// Build targets (the starting positions we're choosing between)
			var targets []core.CellRef
			for _, pos := range positions {
				targets = append(targets, core.CellRef{Row: pos / constants.GridSize, Col: pos % constants.GridSize})
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
func findCommonElimination(b BoardInterface, digit int, positions []int, results []*digitForcingResult, unitType string, unitIdx int) *core.Move {
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
			if !b.GetCandidatesAt(idx).Has(elimDigit) {
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
				row, col := idx/constants.GridSize, idx%constants.GridSize

				// Build targets (the starting positions we're choosing between)
				var targets []core.CellRef
				for _, pos := range positions {
					targets = append(targets, core.CellRef{Row: pos / constants.GridSize, Col: pos % constants.GridSize})
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
