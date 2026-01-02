package techniques

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
func propagateSingles(b BoardInterface, startCell, startDigit int, maxSteps int) *propagationResult {
	result := newPropagationResult()

	// Clone the board to simulate
	sim := b.CloneBoard()

	// Make the initial placement
	sim.SetCell(startCell, startDigit)
	result.placements[startCell] = startDigit

	// Track which eliminations were caused by this chain
	for i := 0; i < 81; i++ {
		if i != startCell && b.GetCandidatesAt(i).Has(startDigit) && !sim.GetCandidatesAt(i).Has(startDigit) {
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
			if sim.GetCell(i) != 0 {
				continue
			}

			cands := sim.GetCandidatesAt(i)
			if cands.IsEmpty() {
				// Contradiction - no candidates left
				result.valid = false
				return result
			}

			if cands.Count() == 1 {
				digit, _ := cands.Only()

				// Record eliminations before placing
				recordEliminationsForPeers(sim, i, digit, result.eliminations)

				sim.SetCell(i, digit)
				result.placements[i] = digit
				progress = true
			}
		}

		// Check for hidden singles in each unit
		for _, unit := range AllUnits() {
			for digit := 1; digit <= 9; digit++ {
				var positions []int
				found := false
				for _, idx := range unit.Cells {
					if sim.GetCell(idx) == digit {
						found = true
						break
					}
					if sim.GetCandidatesAt(idx).Has(digit) {
						positions = append(positions, idx)
					}
				}
				if !found && len(positions) == 0 {
					// Contradiction - digit has nowhere to go in this unit
					result.valid = false
					return result
				}
				if !found && len(positions) == 1 {
					idx := positions[0]
					if sim.GetCell(idx) == 0 {
						// Record eliminations for all peers
						recordEliminationsForPeers(sim, idx, digit, result.eliminations)
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

// recordEliminationsForPeers records eliminations for all cells that see the given cell
func recordEliminationsForPeers(b BoardInterface, cellIdx, digit int, eliminations map[int]map[int]bool) {
	for _, unit := range getUnitsForCell(cellIdx) {
		for _, peerIdx := range unit.Cells {
			if peerIdx != cellIdx && b.GetCandidatesAt(peerIdx).Has(digit) {
				if eliminations[peerIdx] == nil {
					eliminations[peerIdx] = make(map[int]bool)
				}
				eliminations[peerIdx][digit] = true
			}
		}
	}
}

// getUnitsForCell returns the three units (row, col, box) that contain the given cell
func getUnitsForCell(cellIdx int) []Unit {
	row, col := cellIdx/9, cellIdx%9
	box := (row/3)*3 + col/3
	return []Unit{
		{Type: UnitRow, Index: row, Cells: RowIndices[row]},
		{Type: UnitCol, Index: col, Cells: ColIndices[col]},
		{Type: UnitBox, Index: box, Cells: BoxIndices[box]},
	}
}

// DetectForcingChain detects forcing chain patterns
// This technique examines cells with 2-3 candidates and follows implications
// If ALL branches lead to the same conclusion, that conclusion must be true
func DetectForcingChain(b BoardInterface) *core.Move {
	// Try cell forcing chains first (bivalue cells are most efficient)
	if move := detectCellForcingChain(b); move != nil {
		return move
	}

	// Try unit forcing chains
	return detectUnitForcingChain(b)
}

// detectCellForcingChain examines cells with 2-3 candidates
// For each candidate, propagate singles and find common conclusions
func detectCellForcingChain(b BoardInterface) *core.Move {
	// Find bivalue cells first (most likely to yield results), then trivalue
	for numCands := 2; numCands <= 3; numCands++ {
		for cell := 0; cell < 81; cell++ {
			if b.GetCell(cell) != 0 || b.GetCandidatesAt(cell).Count() != numCands {
				continue
			}

			cands := b.GetCandidatesAt(cell).ToSlice()
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
				if targetCell == cell || b.GetCell(targetCell) != 0 {
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
				if targetCell == cell || b.GetCell(targetCell) != 0 {
					continue
				}

				for digit := 1; digit <= 9; digit++ {
					if !b.GetCandidatesAt(targetCell).Has(digit) {
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
func detectUnitForcingChain(b BoardInterface) *core.Move {
	// Check each unit (rows, columns, boxes)
	for digit := 1; digit <= 9; digit++ {
		for _, unit := range AllUnits() {
			var positions []int
			for _, idx := range unit.Cells {
				if b.GetCandidatesAt(idx).Has(digit) {
					positions = append(positions, idx)
				}
			}

			if len(positions) >= 2 && len(positions) <= 3 {
				unitDesc := fmt.Sprintf("%s %d", unit.Type.String(), unit.Index+1)
				if move := tryUnitForcingChain(b, digit, positions, unitDesc); move != nil {
					return move
				}
			}
		}
	}

	return nil
}

// tryUnitForcingChain tries forcing chains for a digit in specific positions within a unit
func tryUnitForcingChain(b BoardInterface, digit int, positions []int, unitDesc string) *core.Move {
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
		if b.GetCell(targetCell) != 0 {
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
		if b.GetCell(targetCell) != 0 {
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
			if !b.GetCandidatesAt(targetCell).Has(elimDigit) {
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
					Explanation: fmt.Sprintf("Unit Forcing Chain: Wherever %d goes in %s: eliminate %d from R%dC%d.",
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
