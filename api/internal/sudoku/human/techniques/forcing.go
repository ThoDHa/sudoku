package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
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
// This is NOT backtracking, it only follows deterministic implications
//
//nolint:gocyclo // propagateSingles threads a simulation board through a propagation loop, interleaving naked-single and hidden-single detection with peer-elimination recording; each propagation step mutates the same simulation board and accumulates eliminations seen across steps.
func propagateSingles(b BoardInterface, startCell, startDigit int, maxSteps int) *propagationResult {
	result := newPropagationResult()

	// Clone the board to simulate
	sim := b.CloneBoard()

	// Make the initial placement
	sim.SetCell(startCell, startDigit)
	result.placements[startCell] = startDigit

	// Track which eliminations were caused by this chain
	for i := range constants.TotalCells {
		if i != startCell && b.GetCandidatesAt(i).Has(startDigit) && !sim.GetCandidatesAt(i).Has(startDigit) {
			if result.eliminations[i] == nil {
				result.eliminations[i] = make(map[int]bool)
			}
			result.eliminations[i][startDigit] = true
		}
	}

	// Propagate singles up to maxSteps
	for range maxSteps {
		progress := false

		// Check for naked singles
		for i := range constants.TotalCells {
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
			for digit := 1; digit <= constants.GridSize; digit++ {
				var positions []int
				found := false
				for _, idx := range unit.Cells {
					if sim.GetCell(idx) == digit {
						found = true
						// Scanning on instead of breaking only lengthens
						// positions, and every later use of positions is gated
						// on !found, so the exit is a cost saving.
						// mutator-disable-next-line loop/break
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
			// Both weakenings of this exit leave the loop spinning over an
			// unchanged board for the remaining rounds and returning the same
			// result, so the exit bounds cost rather than behavior.
			// mutator-disable-next-line branch/if,loop/break
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
	row, col := cellIdx/constants.GridSize, cellIdx%constants.GridSize
	box := (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize
	return []Unit{
		{Type: UnitRow, Index: row, Cells: RowIndices[row]},
		{Type: UnitCol, Index: col, Cells: ColIndices[col]},
		{Type: UnitBox, Index: box, Cells: BoxIndices[box]},
	}
}

// forcingCommonPlacement returns the digit that every branch places in
// targetCell. The second result is false when the branches disagree, when any
// branch leaves targetCell unplaced, or when there are no branches at all.
func forcingCommonPlacement(results []*propagationResult, targetCell int) (int, bool) {
	commonDigit := 0
	for _, res := range results {
		digit, ok := res.placements[targetCell]
		if !ok || (commonDigit != 0 && digit != commonDigit) {
			return commonDigit, false
		}
		commonDigit = digit
	}
	return commonDigit, commonDigit != 0
}

// forcingAllBranchesEliminate reports whether every branch removes digit from
// targetCell. A branch removes it either by recording the elimination outright
// or by placing some other digit in that cell.
func forcingAllBranchesEliminate(results []*propagationResult, targetCell, digit int) bool {
	for _, res := range results {
		if res.eliminations[targetCell][digit] {
			continue
		}
		if placedDigit, ok := res.placements[targetCell]; ok && placedDigit != digit {
			continue
		}
		return false
	}
	return true
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
//
//nolint:gocyclo // Cell-forcing chain detection tries each candidate of each cell as a forcing hypothesis, accumulating per-hypothesis propagation results and comparing them across hypotheses for common placements/eliminations; the per-hypothesis results and the comparison state are tightly coupled.
func detectCellForcingChain(b BoardInterface) *core.Move {
	// Find bivalue cells first (most likely to yield results), then trivalue
	for numCands := 2; numCands <= 3; numCands++ {
		for cell := range constants.TotalCells {
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

			// Check if any branch leads to contradiction, we can place the other value
			if !allValid && numCands == 2 {
				for i, res := range results {
					if !res.valid {
						// The other candidate must be correct
						otherDigit := cands[1-i]
						row, col := cell/constants.GridSize, cell%constants.GridSize
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
			for targetCell := range constants.TotalCells {
				// Neither half of this guard can change the outcome. The
				// hypothesis cell takes a different digit in every branch, so
				// forcingCommonPlacement never finds agreement there; and
				// propagateSingles only places cells that were empty, so a
				// filled cell is never in any branch's placements. The guard
				// stays because it skips those cells cheaply.
				// mutator-disable-next-line expression/remove
				if targetCell == cell || b.GetCell(targetCell) != 0 {
					// mutator-disable-next-line branch/if
					continue
				}

				if commonDigit, ok := forcingCommonPlacement(results, targetCell); ok {
					row, col := cell/constants.GridSize, cell%constants.GridSize
					targetRow, targetCol := targetCell/constants.GridSize, targetCell%constants.GridSize
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
			for targetCell := range constants.TotalCells {
				// As above: the hypothesis cell holds a different digit in each
				// branch, so no digit is eliminated from it by all of them, and
				// a filled cell has no live candidate to reach the check below.
				// mutator-disable-next-line expression/remove
				if targetCell == cell || b.GetCell(targetCell) != 0 {
					// mutator-disable-next-line branch/if
					continue
				}

				// Starting at 0 changes nothing: Candidates.Has rejects every
				// digit outside 1..GridSize, so the extra iteration is skipped.
				// mutator-disable-next-line numbers/decrementer
				for digit := 1; digit <= constants.GridSize; digit++ {
					if !b.GetCandidatesAt(targetCell).Has(digit) {
						continue
					}

					if forcingAllBranchesEliminate(results, targetCell, digit) {
						row, col := cell/constants.GridSize, cell%constants.GridSize
						targetRow, targetCol := targetCell/constants.GridSize, targetCell%constants.GridSize
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
	// Check each unit (rows, columns, boxes). Starting at 0 changes nothing:
	// Candidates.Has rejects it, so digit 0 collects no positions and the
	// position-count guard below rejects every unit for it.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
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
//
//nolint:gocyclo // Unit-forcing chain threads per-position propagation results and shared comparison state (digit, unit description, candidate positions) through the multi-position scan and the cross-position commonality checks; the results slice and unit metadata are shared across phases.
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
				row, col := cell/constants.GridSize, cell%constants.GridSize
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
	for targetCell := range constants.TotalCells {
		if b.GetCell(targetCell) != 0 {
			// propagateSingles only places cells that were empty, so a filled
			// cell is never in any branch's placements; skipping it saves the
			// lookup rather than filtering anything out.
			// mutator-disable-next-line branch/if
			continue
		}

		// The forcing positions themselves need no filtering here: they all sit
		// in one unit, so a branch that places digit at one of them clears digit
		// from the others, and no two branches can agree on any digit there.
		if commonDigit, ok := forcingCommonPlacement(results, targetCell); ok {
			targetRow, targetCol := targetCell/constants.GridSize, targetCell%constants.GridSize
			var highlights []core.CellRef
			for _, pos := range positions {
				highlights = append(highlights, core.CellRef{Row: pos / constants.GridSize, Col: pos % constants.GridSize})
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
	for targetCell := range constants.TotalCells {
		if b.GetCell(targetCell) != 0 {
			continue
		}

		isForcing := false
		for _, pos := range positions {
			if pos == targetCell {
				isForcing = true
				// Scanning the remaining positions cannot unset the flag, so
				// the exit is a cost saving with no effect.
				// mutator-disable-next-line loop/break
				break
			}
		}
		if isForcing {
			continue
		}

		// Starting at 0 changes nothing: Candidates.Has rejects every digit
		// outside 1..GridSize, so the extra iteration is skipped.
		// mutator-disable-next-line numbers/decrementer
		for elimDigit := 1; elimDigit <= constants.GridSize; elimDigit++ {
			if !b.GetCandidatesAt(targetCell).Has(elimDigit) {
				continue
			}

			if forcingAllBranchesEliminate(results, targetCell, elimDigit) {
				targetRow, targetCol := targetCell/constants.GridSize, targetCell%constants.GridSize
				var highlights []core.CellRef
				for _, pos := range positions {
					highlights = append(highlights, core.CellRef{Row: pos / constants.GridSize, Col: pos % constants.GridSize})
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
