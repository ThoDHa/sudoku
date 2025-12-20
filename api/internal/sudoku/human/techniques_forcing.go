package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// Maximum propagation depth to prevent excessive computation
const maxPropagationDepth = 12

// propagationResult tracks what happens when we assume a value
type propagationResult struct {
	placements   map[int]int          // cell index -> digit placed
	eliminations map[int]map[int]bool // cell index -> eliminated digits
	valid        bool                 // false if contradiction found
}

// newPropagationResult creates an empty propagation result
func newPropagationResult() *propagationResult {
	return &propagationResult{
		placements:   make(map[int]int),
		eliminations: make(map[int]map[int]bool),
		valid:        true,
	}
}

// propagateSingles propagates naked and hidden singles from a starting assumption
// This is NOT backtracking - it only follows deterministic implications
func propagateSingles(b *Board, startCell, startDigit int, maxSteps int) *propagationResult {
	result := newPropagationResult()

	// Clone the board to simulate
	sim := b.Clone()

	// Make the initial placement
	sim.SetCell(startCell, startDigit)
	result.placements[startCell] = startDigit

	// Track which eliminations were caused by this chain
	for i := 0; i < 81; i++ {
		if i != startCell && b.Candidates[i][startDigit] && !sim.Candidates[i][startDigit] {
			if result.eliminations[i] == nil {
				result.eliminations[i] = make(map[int]bool)
			}
			result.eliminations[i][startDigit] = true
		}
	}

	// Propagate singles up to maxSteps
	for step := 0; step < maxSteps; step++ {
		progress := false

		// Check for naked singles
		for i := 0; i < 81; i++ {
			if sim.Cells[i] != 0 {
				continue
			}

			cands := sim.Candidates[i]
			if len(cands) == 0 {
				// Contradiction - no candidates left
				result.valid = false
				return result
			}

			if len(cands) == 1 {
				var digit int
				for d := range cands {
					digit = d
				}

				// Record eliminations before placing
				row, col := i/9, i%9
				// Check cells that will lose this candidate
				for c := 0; c < 9; c++ {
					idx := row*9 + c
					if idx != i && sim.Candidates[idx][digit] {
						if result.eliminations[idx] == nil {
							result.eliminations[idx] = make(map[int]bool)
						}
						result.eliminations[idx][digit] = true
					}
				}
				for r := 0; r < 9; r++ {
					idx := r*9 + col
					if idx != i && sim.Candidates[idx][digit] {
						if result.eliminations[idx] == nil {
							result.eliminations[idx] = make(map[int]bool)
						}
						result.eliminations[idx][digit] = true
					}
				}
				boxRow, boxCol := (row/3)*3, (col/3)*3
				for r := boxRow; r < boxRow+3; r++ {
					for c := boxCol; c < boxCol+3; c++ {
						idx := r*9 + c
						if idx != i && sim.Candidates[idx][digit] {
							if result.eliminations[idx] == nil {
								result.eliminations[idx] = make(map[int]bool)
							}
							result.eliminations[idx][digit] = true
						}
					}
				}

				sim.SetCell(i, digit)
				result.placements[i] = digit
				progress = true
			}
		}

		// Check for hidden singles in each unit
		// Rows
		for row := 0; row < 9; row++ {
			for digit := 1; digit <= 9; digit++ {
				var positions []int
				for col := 0; col < 9; col++ {
					idx := row*9 + col
					if sim.Cells[idx] == digit {
						positions = nil
						break
					}
					if sim.Candidates[idx][digit] {
						positions = append(positions, idx)
					}
				}
				if len(positions) == 0 && !hasDigitInRow(sim, row, digit) {
					// Contradiction
					result.valid = false
					return result
				}
				if len(positions) == 1 {
					idx := positions[0]
					if sim.Cells[idx] == 0 {
						// Record eliminations
						for c := 0; c < 9; c++ {
							cidx := row*9 + c
							if cidx != idx && sim.Candidates[cidx][digit] {
								if result.eliminations[cidx] == nil {
									result.eliminations[cidx] = make(map[int]bool)
								}
								result.eliminations[cidx][digit] = true
							}
						}
						col := idx % 9
						for r := 0; r < 9; r++ {
							ridx := r*9 + col
							if ridx != idx && sim.Candidates[ridx][digit] {
								if result.eliminations[ridx] == nil {
									result.eliminations[ridx] = make(map[int]bool)
								}
								result.eliminations[ridx][digit] = true
							}
						}
						boxRow, boxCol := (row/3)*3, (col/3)*3
						for r := boxRow; r < boxRow+3; r++ {
							for c := boxCol; c < boxCol+3; c++ {
								bidx := r*9 + c
								if bidx != idx && sim.Candidates[bidx][digit] {
									if result.eliminations[bidx] == nil {
										result.eliminations[bidx] = make(map[int]bool)
									}
									result.eliminations[bidx][digit] = true
								}
							}
						}
						sim.SetCell(idx, digit)
						result.placements[idx] = digit
						progress = true
					}
				}
			}
		}

		// Columns
		for col := 0; col < 9; col++ {
			for digit := 1; digit <= 9; digit++ {
				var positions []int
				for row := 0; row < 9; row++ {
					idx := row*9 + col
					if sim.Cells[idx] == digit {
						positions = nil
						break
					}
					if sim.Candidates[idx][digit] {
						positions = append(positions, idx)
					}
				}
				if len(positions) == 0 && !hasDigitInCol(sim, col, digit) {
					result.valid = false
					return result
				}
				if len(positions) == 1 {
					idx := positions[0]
					if sim.Cells[idx] == 0 {
						row := idx / 9
						for c := 0; c < 9; c++ {
							cidx := row*9 + c
							if cidx != idx && sim.Candidates[cidx][digit] {
								if result.eliminations[cidx] == nil {
									result.eliminations[cidx] = make(map[int]bool)
								}
								result.eliminations[cidx][digit] = true
							}
						}
						for r := 0; r < 9; r++ {
							ridx := r*9 + col
							if ridx != idx && sim.Candidates[ridx][digit] {
								if result.eliminations[ridx] == nil {
									result.eliminations[ridx] = make(map[int]bool)
								}
								result.eliminations[ridx][digit] = true
							}
						}
						boxRow, boxCol := (row/3)*3, (col/3)*3
						for r := boxRow; r < boxRow+3; r++ {
							for c := boxCol; c < boxCol+3; c++ {
								bidx := r*9 + c
								if bidx != idx && sim.Candidates[bidx][digit] {
									if result.eliminations[bidx] == nil {
										result.eliminations[bidx] = make(map[int]bool)
									}
									result.eliminations[bidx][digit] = true
								}
							}
						}
						sim.SetCell(idx, digit)
						result.placements[idx] = digit
						progress = true
					}
				}
			}
		}

		// Boxes
		for box := 0; box < 9; box++ {
			boxRow, boxCol := (box/3)*3, (box%3)*3
			for digit := 1; digit <= 9; digit++ {
				var positions []int
				found := false
				for r := boxRow; r < boxRow+3; r++ {
					for c := boxCol; c < boxCol+3; c++ {
						idx := r*9 + c
						if sim.Cells[idx] == digit {
							found = true
							break
						}
						if sim.Candidates[idx][digit] {
							positions = append(positions, idx)
						}
					}
					if found {
						break
					}
				}
				if !found && len(positions) == 0 {
					result.valid = false
					return result
				}
				if !found && len(positions) == 1 {
					idx := positions[0]
					if sim.Cells[idx] == 0 {
						row, col := idx/9, idx%9
						for c := 0; c < 9; c++ {
							cidx := row*9 + c
							if cidx != idx && sim.Candidates[cidx][digit] {
								if result.eliminations[cidx] == nil {
									result.eliminations[cidx] = make(map[int]bool)
								}
								result.eliminations[cidx][digit] = true
							}
						}
						for r := 0; r < 9; r++ {
							ridx := r*9 + col
							if ridx != idx && sim.Candidates[ridx][digit] {
								if result.eliminations[ridx] == nil {
									result.eliminations[ridx] = make(map[int]bool)
								}
								result.eliminations[ridx][digit] = true
							}
						}
						for r := boxRow; r < boxRow+3; r++ {
							for c := boxCol; c < boxCol+3; c++ {
								bidx := r*9 + c
								if bidx != idx && sim.Candidates[bidx][digit] {
									if result.eliminations[bidx] == nil {
										result.eliminations[bidx] = make(map[int]bool)
									}
									result.eliminations[bidx][digit] = true
								}
							}
						}
						sim.SetCell(idx, digit)
						result.placements[idx] = digit
						progress = true
					}
				}
			}
		}

		if !progress {
			break
		}
	}

	return result
}

// hasDigitInRow checks if digit is already placed in row
func hasDigitInRow(b *Board, row, digit int) bool {
	for c := 0; c < 9; c++ {
		if b.Cells[row*9+c] == digit {
			return true
		}
	}
	return false
}

// hasDigitInCol checks if digit is already placed in column
func hasDigitInCol(b *Board, col, digit int) bool {
	for r := 0; r < 9; r++ {
		if b.Cells[r*9+col] == digit {
			return true
		}
	}
	return false
}

// detectForcingChain detects forcing chain patterns
// This technique examines cells with 2-3 candidates and follows implications
// If ALL branches lead to the same conclusion, that conclusion must be true
func detectForcingChain(b *Board) *core.Move {
	// Try cell forcing chains first (bivalue cells are most efficient)
	if move := detectCellForcingChain(b); move != nil {
		return move
	}

	// Try unit forcing chains
	return detectUnitForcingChain(b)
}

// detectCellForcingChain examines cells with 2-3 candidates
// For each candidate, propagate singles and find common conclusions
func detectCellForcingChain(b *Board) *core.Move {
	// Find bivalue cells first (most likely to yield results), then trivalue
	for numCands := 2; numCands <= 3; numCands++ {
		for cell := 0; cell < 81; cell++ {
			if b.Cells[cell] != 0 || len(b.Candidates[cell]) != numCands {
				continue
			}

			cands := getCandidateSlice(b.Candidates[cell])
			results := make([]*propagationResult, len(cands))
			allValid := true

			// Propagate for each candidate
			for i, digit := range cands {
				results[i] = propagateSingles(b, cell, digit, maxPropagationDepth)
				if !results[i].valid {
					allValid = false
				}
			}

			// If any branch leads to contradiction, we can place the other value
			if !allValid && numCands == 2 {
				for i, res := range results {
					if !res.valid {
						// The other candidate must be correct
						otherDigit := cands[1-i]
						row, col := cell/9, cell%9
						return &core.Move{
							Action:  "assign",
							Digit:   otherDigit,
							Targets: []core.CellRef{{Row: row, Col: col}},
							Explanation: fmt.Sprintf("Cell Forcing Chain: If R%dC%d=%d, contradiction follows. Therefore R%dC%d=%d",
								row+1, col+1, cands[i], row+1, col+1, otherDigit),
							Highlights: core.Highlights{
								Primary: []core.CellRef{{Row: row, Col: col}},
							},
						}
					}
				}
			}

			// Skip if any branch is invalid (handled above for bivalue)
			validCount := 0
			for _, res := range results {
				if res.valid {
					validCount++
				}
			}
			if validCount < len(cands) {
				continue
			}

			// Find common placements across all branches
			for targetCell := 0; targetCell < 81; targetCell++ {
				if targetCell == cell || b.Cells[targetCell] != 0 {
					continue
				}

				// Check if all branches place the same digit in this cell
				commonDigit := -1
				for i, res := range results {
					if digit, ok := res.placements[targetCell]; ok {
						if i == 0 {
							commonDigit = digit
						} else if digit != commonDigit {
							commonDigit = -1
							break
						}
					} else {
						commonDigit = -1
						break
					}
				}

				if commonDigit > 0 {
					row, col := cell/9, cell%9
					targetRow, targetCol := targetCell/9, targetCell%9
					return &core.Move{
						Action:  "assign",
						Digit:   commonDigit,
						Targets: []core.CellRef{{Row: targetRow, Col: targetCol}},
						Explanation: fmt.Sprintf("Cell Forcing Chain: All candidates in R%dC%d lead to R%dC%d=%d",
							row+1, col+1, targetRow+1, targetCol+1, commonDigit),
						Highlights: core.Highlights{
							Primary:   []core.CellRef{{Row: targetRow, Col: targetCol}},
							Secondary: []core.CellRef{{Row: row, Col: col}},
						},
					}
				}
			}

			// Find common eliminations across all branches
			for targetCell := 0; targetCell < 81; targetCell++ {
				if targetCell == cell || b.Cells[targetCell] != 0 {
					continue
				}

				for digit := 1; digit <= 9; digit++ {
					if !b.Candidates[targetCell][digit] {
						continue
					}

					// Check if all branches eliminate this digit from this cell
					allEliminate := true
					for _, res := range results {
						if res.eliminations[targetCell] == nil || !res.eliminations[targetCell][digit] {
							// Also check if cell was placed with a different digit
							if placedDigit, ok := res.placements[targetCell]; ok && placedDigit != digit {
								continue // This counts as eliminated
							}
							allEliminate = false
							break
						}
					}

					if allEliminate {
						row, col := cell/9, cell%9
						targetRow, targetCol := targetCell/9, targetCell%9
						return &core.Move{
							Action:  "eliminate",
							Digit:   digit,
							Targets: []core.CellRef{{Row: row, Col: col}},
							Eliminations: []core.Candidate{
								{Row: targetRow, Col: targetCol, Digit: digit},
							},
							Explanation: fmt.Sprintf("Cell Forcing Chain: All candidates in R%dC%d lead to eliminating %d from R%dC%d",
								row+1, col+1, digit, targetRow+1, targetCol+1),
							Highlights: core.Highlights{
								Primary:   []core.CellRef{{Row: row, Col: col}},
								Secondary: []core.CellRef{{Row: targetRow, Col: targetCol}},
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// detectUnitForcingChain examines units where a digit can only go in 2-3 cells
// For each possible placement, propagate and find common conclusions
func detectUnitForcingChain(b *Board) *core.Move {
	// Check each unit (rows, columns, boxes)
	for digit := 1; digit <= 9; digit++ {
		// Rows
		for row := 0; row < 9; row++ {
			var positions []int
			for col := 0; col < 9; col++ {
				idx := row*9 + col
				if b.Candidates[idx][digit] {
					positions = append(positions, idx)
				}
			}

			if len(positions) >= 2 && len(positions) <= 3 {
				if move := tryUnitForcingChain(b, digit, positions, fmt.Sprintf("row %d", row+1)); move != nil {
					return move
				}
			}
		}

		// Columns
		for col := 0; col < 9; col++ {
			var positions []int
			for row := 0; row < 9; row++ {
				idx := row*9 + col
				if b.Candidates[idx][digit] {
					positions = append(positions, idx)
				}
			}

			if len(positions) >= 2 && len(positions) <= 3 {
				if move := tryUnitForcingChain(b, digit, positions, fmt.Sprintf("column %d", col+1)); move != nil {
					return move
				}
			}
		}

		// Boxes
		for box := 0; box < 9; box++ {
			boxRow, boxCol := (box/3)*3, (box%3)*3
			var positions []int
			for r := boxRow; r < boxRow+3; r++ {
				for c := boxCol; c < boxCol+3; c++ {
					idx := r*9 + c
					if b.Candidates[idx][digit] {
						positions = append(positions, idx)
					}
				}
			}

			if len(positions) >= 2 && len(positions) <= 3 {
				if move := tryUnitForcingChain(b, digit, positions, fmt.Sprintf("box %d", box+1)); move != nil {
					return move
				}
			}
		}
	}

	return nil
}

// tryUnitForcingChain tries forcing chains for a digit in specific positions within a unit
func tryUnitForcingChain(b *Board, digit int, positions []int, unitDesc string) *core.Move {
	results := make([]*propagationResult, len(positions))

	// Propagate for each possible position
	for i, cell := range positions {
		results[i] = propagateSingles(b, cell, digit, maxPropagationDepth)
	}

	// Check if any leads to contradiction
	validCount := 0
	for _, res := range results {
		if res.valid {
			validCount++
		}
	}

	// If only one position is valid, that's where the digit must go
	if validCount == 1 && len(positions) >= 2 {
		for i, res := range results {
			if res.valid {
				cell := positions[i]
				row, col := cell/9, cell%9
				return &core.Move{
					Action:  "assign",
					Digit:   digit,
					Targets: []core.CellRef{{Row: row, Col: col}},
					Explanation: fmt.Sprintf("Unit Forcing Chain: In %s, %d at other positions leads to contradiction. R%dC%d=%d",
						unitDesc, digit, row+1, col+1, digit),
					Highlights: core.Highlights{
						Primary: []core.CellRef{{Row: row, Col: col}},
					},
				}
			}
		}
	}

	if validCount < len(positions) {
		return nil // Some branches invalid, skip common conclusion search
	}

	// Find common placements
	for targetCell := 0; targetCell < 81; targetCell++ {
		if b.Cells[targetCell] != 0 {
			continue
		}

		// Skip cells that are part of the forcing positions
		isForcing := false
		for _, pos := range positions {
			if pos == targetCell {
				isForcing = true
				break
			}
		}
		if isForcing {
			continue
		}

		// Check if all branches place the same digit
		commonDigit := -1
		for i, res := range results {
			if placedDigit, ok := res.placements[targetCell]; ok {
				if i == 0 {
					commonDigit = placedDigit
				} else if placedDigit != commonDigit {
					commonDigit = -1
					break
				}
			} else {
				commonDigit = -1
				break
			}
		}

		if commonDigit > 0 {
			targetRow, targetCol := targetCell/9, targetCell%9
			var highlights []core.CellRef
			for _, pos := range positions {
				highlights = append(highlights, core.CellRef{Row: pos / 9, Col: pos % 9})
			}
			return &core.Move{
				Action:  "assign",
				Digit:   commonDigit,
				Targets: []core.CellRef{{Row: targetRow, Col: targetCol}},
				Explanation: fmt.Sprintf("Unit Forcing Chain: Wherever %d goes in %s, R%dC%d=%d",
					digit, unitDesc, targetRow+1, targetCol+1, commonDigit),
				Highlights: core.Highlights{
					Primary:   []core.CellRef{{Row: targetRow, Col: targetCol}},
					Secondary: highlights,
				},
			}
		}
	}

	// Find common eliminations
	for targetCell := 0; targetCell < 81; targetCell++ {
		if b.Cells[targetCell] != 0 {
			continue
		}

		isForcing := false
		for _, pos := range positions {
			if pos == targetCell {
				isForcing = true
				break
			}
		}
		if isForcing {
			continue
		}

		for elimDigit := 1; elimDigit <= 9; elimDigit++ {
			if !b.Candidates[targetCell][elimDigit] {
				continue
			}

			allEliminate := true
			for _, res := range results {
				eliminated := false
				if res.eliminations[targetCell] != nil && res.eliminations[targetCell][elimDigit] {
					eliminated = true
				}
				if placedDigit, ok := res.placements[targetCell]; ok && placedDigit != elimDigit {
					eliminated = true
				}
				if !eliminated {
					allEliminate = false
					break
				}
			}

			if allEliminate {
				targetRow, targetCol := targetCell/9, targetCell%9
				var highlights []core.CellRef
				for _, pos := range positions {
					highlights = append(highlights, core.CellRef{Row: pos / 9, Col: pos % 9})
				}
				return &core.Move{
					Action:  "eliminate",
					Digit:   elimDigit,
					Targets: highlights,
					Eliminations: []core.Candidate{
						{Row: targetRow, Col: targetCol, Digit: elimDigit},
					},
					Explanation: fmt.Sprintf("Unit Forcing Chain: Wherever %d goes in %s, %d is eliminated from R%dC%d",
						digit, unitDesc, elimDigit, targetRow+1, targetCol+1),
					Highlights: core.Highlights{
						Primary:   highlights,
						Secondary: []core.CellRef{{Row: targetRow, Col: targetCol}},
					},
				}
			}
		}
	}

	return nil
}
