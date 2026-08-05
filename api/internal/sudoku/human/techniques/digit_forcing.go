package techniques

import (
	"fmt"
	"maps"
	"slices"

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
	// Equivalent mutant: no board holds digit 0 as a candidate, so sweeping from
	// 0 finds no positions in any unit and changes nothing.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		for _, unit := range AllUnits() {
			positions := b.CellsWithDigitInUnit(unit, digit)
			if move := tryDigitForcingChain(b, digit, positions, unit.Type.String(), unit.Index); move != nil {
				return move
			}
		}
	}
	return nil
}

// tryDigitForcingChain attempts to find a common conclusion when placing digit
// at each of the possible positions. Only a unit where the digit has two or
// three homes is worth branching on: a single home is a hidden single, and four
// or more branches practically never converge on a common conclusion.
func tryDigitForcingChain(b BoardInterface, digit int, positions []int, unitType string, unitIdx int) *core.Move {
	if len(positions) < 2 || len(positions) > 3 {
		return nil
	}

	// Propagate for each position and collect results
	results := make([]*digitForcingResult, len(positions))
	for i, pos := range positions {
		results[i] = propagateFromPlacement(b, pos, digit)
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
	simBoard := b.CloneBoard()
	result := newDigitForcingResult()
	placeAndRecordForcing(b, simBoard, result, idx, digit)

	for range maxDigitForcingPropagation {
		// Equivalent mutants: the loop is already bounded by the step count and
		// propagateOneForcingStep is stable once it reports no placement, so
		// dropping the break or turning it into a continue only spends the
		// remaining iterations doing nothing.
		// mutator-disable-next-line branch/if
		if !propagateOneForcingStep(b, simBoard, result) {
			// mutator-disable-next-line loop/break
			break
		}
	}
	return result
}

// propagateOneForcingStep performs at most one placement: a naked single if
// available, otherwise the first hidden single across rows, columns, then boxes.
// Returns true if a placement was made.
func propagateOneForcingStep(b, simBoard BoardInterface, result *digitForcingResult) bool {
	if i, d, ok := findNakedSingleForcing(simBoard); ok {
		placeAndRecordForcing(b, simBoard, result, i, d)
		return true
	}
	for _, units := range [][constants.GridSize][]int{RowIndices, ColIndices, BoxIndices} {
		if i, d, ok := findHiddenSingleForcing(simBoard, units); ok {
			placeAndRecordForcing(b, simBoard, result, i, d)
			return true
		}
	}
	return false
}

// findNakedSingleForcing returns the lowest-indexed empty cell with exactly one
// candidate, plus that candidate.
func findNakedSingleForcing(simBoard BoardInterface) (idx, digit int, ok bool) {
	for i := range constants.TotalCells {
		if simBoard.GetCell(i) == 0 && simBoard.GetCandidatesAt(i).Count() == 1 {
			d, _ := simBoard.GetCandidatesAt(i).Only()
			return i, d, true
		}
	}
	return
}

// findHiddenSingleForcing scans each unit (in order) for a digit with exactly
// one home among the unit's still-empty cells.
func findHiddenSingleForcing(simBoard BoardInterface, units [constants.GridSize][]int) (idx, digit int, ok bool) {
	for _, unit := range units {
		// Equivalent mutant: digit 0 is not a candidate any board can hold, so
		// starting the scan there finds no possible cells and changes nothing.
		// mutator-disable-next-line numbers/decrementer
		for d := 1; d <= constants.GridSize; d++ {
			var possibleCells []int
			for _, i := range unit {
				if simBoard.GetCell(i) == 0 && simBoard.GetCandidatesAt(i).Has(d) {
					possibleCells = append(possibleCells, i)
				}
			}
			if len(possibleCells) == 1 {
				return possibleCells[0], d, true
			}
		}
	}
	return
}

// placeAndRecordForcing places digit at idx on simBoard and records the placement
// plus every elimination of digit from peers that originally held digit as a
// candidate in b.
func placeAndRecordForcing(b, simBoard BoardInterface, result *digitForcingResult, idx, digit int) {
	simBoard.SetCell(idx, digit)
	result.addPlacement(idx, digit)
	recordPeerEliminationsForcing(b, result, idx, digit)
}

// recordPeerEliminationsForcing walks the row, column, and box containing idx
// and records an elimination of digit for every peer cell that held digit as a
// candidate in the original board b.
func recordPeerEliminationsForcing(b BoardInterface, result *digitForcingResult, idx, digit int) {
	row, col := idx/constants.GridSize, idx%constants.GridSize
	eliminateIfHasCandidate(b, result, RowIndices[row], idx, digit)
	eliminateIfHasCandidate(b, result, ColIndices[col], idx, digit)
	boxIdx := (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize
	eliminateIfHasCandidate(b, result, BoxIndices[boxIdx], idx, digit)
}

// eliminateIfHasCandidate records an elimination of digit for every cell in
// unitCells (except skipIdx) that held digit as a candidate in b.
func eliminateIfHasCandidate(b BoardInterface, result *digitForcingResult, unitCells []int, skipIdx, digit int) {
	for _, i := range unitCells {
		if i == skipIdx {
			continue
		}
		if b.GetCandidatesAt(i).Has(digit) {
			result.addElimination(i, digit)
		}
	}
}

// findCommonPlacement looks for a cell+digit that is placed in ALL branches
func findCommonPlacement(b BoardInterface, digit int, positions []int, results []*digitForcingResult, unitType string, unitIdx int) *core.Move {
	if len(results) == 0 {
		return nil
	}

	// Use the first result as base, checking whether its placements exist in all
	// others. Iterate in sorted key order so the placement returned is
	// deterministic across runs.
	placements := results[0].placements
	for _, idx := range slices.Sorted(maps.Keys(placements)) {
		placedDigit := placements[idx]
		if isStartPosition(idx, positions) {
			continue
		}
		if b.GetCell(idx) != 0 {
			continue
		}
		if !placementInAllResults(idx, placedDigit, results) {
			continue
		}
		row, col := idx/constants.GridSize, idx%constants.GridSize
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
				Secondary: targetsFromPositions(positions),
			},
		}
	}

	return nil
}

// isStartPosition reports whether idx is one of the chosen starting positions.
func isStartPosition(idx int, positions []int) bool {
	for _, pos := range positions {
		if idx == pos {
			return true
		}
	}
	return false
}

// placementInAllResults reports whether every result has placed placedDigit at idx.
func placementInAllResults(idx, placedDigit int, results []*digitForcingResult) bool {
	for i := 1; i < len(results); i++ {
		if results[i].placements[idx] != placedDigit {
			return false
		}
	}
	return true
}

// targetsFromPositions converts cell-index positions to CellRefs.
func targetsFromPositions(positions []int) []core.CellRef {
	targets := make([]core.CellRef, len(positions))
	for i, pos := range positions {
		targets[i] = core.CellRef{Row: pos / constants.GridSize, Col: pos % constants.GridSize}
	}
	return targets
}

// findCommonElimination looks for a cell+digit that is eliminated in ALL branches
func findCommonElimination(b BoardInterface, digit int, positions []int, results []*digitForcingResult, unitType string, unitIdx int) *core.Move {
	if len(results) == 0 {
		return nil
	}

	// Collect all eliminations from the first result. Iterate in sorted key
	// order so the first common elimination returned is deterministic across runs.
	elims := results[0].eliminations
	for _, idx := range slices.Sorted(maps.Keys(elims)) {
		if isStartPosition(idx, positions) {
			continue
		}
		for _, elimDigit := range slices.Sorted(maps.Keys(elims[idx])) {
			if !b.GetCandidatesAt(idx).Has(elimDigit) {
				continue
			}
			if !eliminationInAllResults(idx, elimDigit, results) {
				continue
			}
			row, col := idx/constants.GridSize, idx%constants.GridSize
			return &core.Move{
				Action:  "eliminate",
				Digit:   elimDigit,
				Targets: targetsFromPositions(positions),
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
					Secondary: targetsFromPositions(positions),
				},
			}
		}
	}

	return nil
}

// eliminationInAllResults reports whether every result either eliminates
// elimDigit from idx, or places a different digit at idx (which implies the
// elimination).
func eliminationInAllResults(idx, elimDigit int, results []*digitForcingResult) bool {
	for i := 1; i < len(results); i++ {
		if !resultEliminates(results[i], idx, elimDigit) {
			return false
		}
	}
	return true
}

// resultEliminates reports whether a single result eliminates elimDigit from idx
// either directly, or by placing a different digit there.
func resultEliminates(r *digitForcingResult, idx, elimDigit int) bool {
	if r.eliminations[idx][elimDigit] {
		return true
	}
	placed := r.placements[idx]
	return placed != 0 && placed != elimDigit
}
