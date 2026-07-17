package human

import (
	"context"
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Solver - Sudoku Solving Orchestration
// ============================================================================
//
// Solver orchestrates the solving process by:
//   - Managing the technique registry
//   - Finding the next applicable move
//   - Applying moves to the board
//   - Tracking difficulty based on techniques used
//
// For board state, see board.go
// For grid utilities, see grid.go
// For technique implementations, see techniques/*.go
//
// ============================================================================

// Technique represents a solving technique
type Technique struct {
	Name   string
	Slug   string
	Tier   string // constants.TierSimple, TierMedium, TierHard, TierExtreme
	Detect func(b *Board) *core.Move
}

// ============================================================================
// Solver Struct
// ============================================================================

// Solver holds the technique registry and orchestrates solving
type Solver struct {
	registry *TechniqueRegistry
	// generationState tracks the candidate-generation / technique-application phase.
	// It is required because the autosolver runs in two phases: generate all
	// candidates (digit-first) then apply techniques. Persisting the state
	// across FindNextMove calls ensures deterministic phase transitions.
	generationState GenerationState
}

// NewSolver creates a solver with the technique registry
func NewSolver() *Solver {
	return &Solver{
		registry:        NewTechniqueRegistry(),
		generationState: StateNotStarted,
	}
}

// NewSolverWithRegistry creates a solver with a specific registry (for testing)
func NewSolverWithRegistry(registry *TechniqueRegistry) *Solver {
	return &Solver{
		registry:        registry,
		generationState: StateNotStarted,
	}
}

// Reset clears the solver's stateful fields to ensure each solving session
// starts fresh. This prevents state from one hint request affecting another.
func (s *Solver) Reset() {
	s.generationState = StateNotStarted
}

// GenerationState represents the solver's candidate-generation lifecycle
type GenerationState int

const (
	StateNotStarted GenerationState = iota
	StateCollectingCandidates
	StateCandidatesComplete
	StateApplyingTechniques
)

// ============================================================================
// Move Finding
// ============================================================================

// checkDuplicateForCell checks if the digit at cellIdx appears elsewhere in the given unit indices
func (s *Solver) checkDuplicateForCell(b *Board, cellIdx int, unitIndices []int, unitType UnitType, unitIndex int) *core.Move {
	digit := b.Cells[cellIdx]

	for _, otherIdx := range unitIndices {
		if otherIdx == cellIdx {
			continue
		}
		if b.Cells[otherIdx] == digit {
			return s.createDuplicateViolationMove(digit, cellIdx, otherIdx, unitType, unitIndex)
		}
	}
	return nil
}

// createDuplicateViolationMove creates a constraint violation move for duplicate digits
func (s *Solver) createDuplicateViolationMove(digit int, idx1, idx2 int, unitType UnitType, unitIndex int) *core.Move {
	row1, col1 := RowOf(idx1), ColOf(idx1)
	row2, col2 := RowOf(idx2), ColOf(idx2)

	var technique string
	var unitName string
	var secondary []core.CellRef

	switch unitType {
	case UnitRow:
		technique = "constraint-violation-duplicate-row"
		unitName = fmt.Sprintf("row %d", unitIndex+1)
		secondary = getRowCellRefs(unitIndex)
	case UnitCol:
		technique = "constraint-violation-duplicate-col"
		unitName = fmt.Sprintf("column %d", unitIndex+1)
		secondary = getColCellRefs(unitIndex)
	case UnitBox:
		technique = "constraint-violation-duplicate-box"
		unitName = fmt.Sprintf("box %d", unitIndex+1)
		secondary = getBoxCellRefs(unitIndex)
	}

	return &core.Move{
		Technique: technique,
		Action:    "contradiction",
		Digit:     digit,
		Targets: []core.CellRef{
			{Row: row1, Col: col1},
			{Row: row2, Col: col2},
		},
		Explanation: fmt.Sprintf("Constraint violation: %d appears twice in %s at R%dC%d and R%dC%d",
			digit, unitName, row1+1, col1+1, row2+1, col2+1),
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: row1, Col: col1}, {Row: row2, Col: col2}},
			Secondary: secondary,
		},
		Refs: core.TechniqueRef{
			Title: "Constraint Violation",
			Slug:  "constraint-violation",
			URL:   "",
		},
	}
}

// checkConstraintViolations detects logical constraint violations in the board
// Returns a constraint violation move if any violations are found, nil otherwise
//
//nolint:gocyclo // checkConstraintViolations walks rows, columns, and boxes to detect duplicate-digit conflicts and produce a single elimination move; the three unit iterations share the per-move accumulator and digit-position state.
func (s *Solver) checkConstraintViolations(b *Board) *core.Move {
	for i := range constants.TotalCells {
		if b.Cells[i] == 0 {
			continue
		}

		row := RowOf(i)
		col := ColOf(i)
		box := BoxOf(i)

		if move := s.checkDuplicateForCell(b, i, RowIndices[row], UnitRow, row); move != nil {
			return move
		}
		if move := s.checkDuplicateForCell(b, i, ColIndices[col], UnitCol, col); move != nil {
			return move
		}
		if move := s.checkDuplicateForCell(b, i, BoxIndices[box], UnitBox, box); move != nil {
			return move
		}
	}

	// Check for invalid candidates (candidates that conflict with existing values)
	for i := range constants.TotalCells {
		// If the cell is already filled, skip.
		if b.Cells[i] != 0 {
			continue
		}

		// If an empty cell has no candidates at all, this could be:
		// 1. A real contradiction (no valid digits can be placed due to constraints)
		// 2. Candidates haven't been filled yet (candidates generation incomplete)
		//
		// To distinguish: check if any digit COULD be placed at this cell.
		// If no digit can be placed (all blocked by row/col/box), it's a real contradiction.
		// If at least one digit could be placed but candidates are empty, we just need to fill them.
		if b.Candidates[i].IsEmpty() {
			row, col := i/constants.GridSize, i%constants.GridSize

			// Check if any digit could theoretically be placed here
			anyValidPlacement := false
			// Starting at 0 is a no-op: canPlace(i,0) is always false because the
			// empty cell i sits in its own row and equals digit 0.
			// mutator-disable-next-line numbers/decrementer
			for d := 1; d <= constants.GridSize; d++ {
				if b.canPlace(i, d) && !b.Eliminated[i].Has(d) {
					anyValidPlacement = true
					// break vs continue is equivalent here: both leave
					// anyValidPlacement true and the loop has no other side effect.
					// mutator-disable-next-line loop/break
					break
				}
			}

			// If no digit can be placed AND candidates are empty, it's a real contradiction
			if !anyValidPlacement {
				return &core.Move{
					Technique:   "contradiction",
					Action:      "contradiction",
					Digit:       0,
					Targets:     []core.CellRef{{Row: row, Col: col}},
					Explanation: fmt.Sprintf("No candidates available for R%dC%d: contradiction detected", row+1, col+1),
					Highlights:  core.Highlights{Primary: []core.CellRef{{Row: row, Col: col}}},
					Refs:        core.TechniqueRef{Title: "Contradiction", Slug: "contradiction"},
				}
			}
			// Otherwise, candidates just haven't been filled yet - this is normal
		}

		row, col := i/constants.GridSize, i%constants.GridSize

		// Check each candidate against the board state.
		// Starting at 0 is a no-op: Candidates.Has(0) is always false, so the d=0
		// iteration immediately continues without inspecting anything.
		// mutator-disable-next-line numbers/decrementer
		for d := 1; d <= constants.GridSize; d++ {
			if !b.Candidates[i].Has(d) {
				continue
			}

			// This candidate should not exist if there's already that digit in row/col/box
			if !b.canPlace(i, d) {
				// Find where the conflicting digit is
				var conflictCells []core.CellRef

				// Check row
				for c := range constants.GridSize {
					if b.Cells[row*constants.GridSize+c] == d {
						conflictCells = append(conflictCells, core.CellRef{Row: row, Col: c})
					}
				}

				// Check column
				for r := range constants.GridSize {
					if b.Cells[r*constants.GridSize+col] == d {
						conflictCells = append(conflictCells, core.CellRef{Row: r, Col: col})
					}
				}

				// Check box
				boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize
				for r := boxRow; r < boxRow+constants.BoxSize; r++ {
					for c := boxCol; c < boxCol+constants.BoxSize; c++ {
						if b.Cells[r*constants.GridSize+c] == d {
							conflictCells = append(conflictCells, core.CellRef{Row: r, Col: c})
						}
					}
				}

				return &core.Move{
					Technique:    "constraint-violation-invalid-candidate",
					Action:       "eliminate",
					Digit:        d,
					Targets:      []core.CellRef{{Row: row, Col: col}},
					Eliminations: []core.Candidate{{Row: row, Col: col, Digit: d}},
					Explanation: fmt.Sprintf("Invalid candidate: R%dC%d has candidate %d, but %d already exists in this cell's row, column, or box",
						row+1, col+1, d, d),
					Highlights: core.Highlights{
						Primary:   []core.CellRef{{Row: row, Col: col}},
						Secondary: conflictCells,
					},
					Refs: core.TechniqueRef{
						Title: "Invalid Candidate",
						Slug:  "constraint-violation",
						URL:   "",
					},
				}
			}
		}
	}

	return nil
}

// FindNextMove finds the next applicable move using simple-first strategy
func (s *Solver) FindNextMove(ctx context.Context, b *Board) *core.Move {
	// FIRST: Check for constraint violations before attempting any other moves
	if violation := s.checkConstraintViolations(b); violation != nil {
		return violation
	}

	// Use solver's persistent generation state to prevent infinite loops
	// (s.generationState is declared on the Solver struct)

	// Phase 1: Complete candidate filling unit by unit (row, column, box)
	// After completing each unit, check if any digit can only go in one cell (hidden single)
	// This is human-like behavior: fill candidates for a row, spot obvious placements, continue

	// Check if we're still in candidate generation phase
	if s.generationState == StateNotStarted || s.generationState == StateCollectingCandidates {
		// Try to fill a candidate move
		candidateMove := s.findNextCandidateMove(b)
		if candidateMove != nil {
			// Setting CollectingCandidates vs leaving NotStarted is equivalent: the
			// next call re-enters the same phase-1 branch either way, and
			// findNextCandidateMove scans board state directly.
			// mutator-disable-next-line statement/remove
			s.generationState = StateCollectingCandidates
			return candidateMove
		}

		// No more candidates to fill - mark generation as complete
		s.generationState = StateCandidatesComplete
	}

	// Phase 2: Check for singles ONLY after ALL candidate generation is complete
	// Only check for singles if we've completed candidate generation for ALL digits
	if s.generationState == StateCandidatesComplete {
		// This assignment is dead: ApplyingTechniques is overwritten by
		// StateNotStarted later in this same block before it is ever read.
		// mutator-disable-next-line statement/remove
		s.generationState = StateApplyingTechniques
		if singleMove := s.checkForSingles(b); singleMove != nil {
			// reset state back to NotStarted after entering technique application
			s.generationState = StateNotStarted
			return singleMove
		}
		// No technique found. Reset generation state so a reused solver starts
		// fresh on its next run.
		s.generationState = StateNotStarted
	}

	// If we get here and haven't returned a candidate move yet, there are
	// no candidate moves to apply and no techniques found: solver is stuck
	// or completed.

	// Return nil when no moves available (solver stuck)
	return nil
}

// findNextCandidateMove finds the next candidate to fill, processing digit-first
// This means all 1s are filled across the board, then all 2s, etc.
// After completing each digit, checks for hidden singles
// Returns nil when all candidates are filled
func (s *Solver) findNextCandidateMove(b *Board) *core.Move {
	// Process by digit first (all 1s, then all 2s, etc.)
	// This creates a visual effect where each digit "sweeps" across the board

	// Starting at 0 is a no-op: for digit 0, fillCandidatesForUnit finds no fill
	// (empty cells make digitExistsInCells(...,0) true) and checkHiddenSingleInUnit
	// returns nil at the first empty cell, so the d=0 sweep yields nothing.
	// mutator-disable-next-line numbers/decrementer
	for d := 1; d <= constants.GridSize; d++ {
		// Sweep rows, then columns, then boxes: for each unit type we first
		// fill candidates across all units of that type, then look for hidden
		// singles there. Order matters and is preserved per unit type.
		if mv := s.findCandidateMoveForUnitType(b, UnitRow, d); mv != nil {
			return mv
		}
		if mv := s.findCandidateMoveForUnitType(b, UnitCol, d); mv != nil {
			return mv
		}
		if mv := s.findCandidateMoveForUnitType(b, UnitBox, d); mv != nil {
			return mv
		}
	}

	return nil
}

// findCandidateMoveForUnitType sweeps one unit type for digit d: it fills
// candidates across every unit of the type, then re-checks each unit for a
// hidden single. Returns the first move found, or nil.
func (s *Solver) findCandidateMoveForUnitType(b *Board, unitType UnitType, d int) *core.Move {
	for i := range constants.GridSize {
		if mv := s.fillCandidatesForUnit(b, unitType, i, d); mv != nil {
			return mv
		}
	}
	for i := range constants.GridSize {
		if mv := s.checkHiddenSingleInUnit(b, unitType, i, d); mv != nil {
			return mv
		}
	}
	return nil
}

// fillCandidatesForUnit fills candidate d for all cells in a unit (row/col/box)
// Returns first candidate move found, or nil if unit is complete for this digit
func (s *Solver) fillCandidatesForUnit(b *Board, unitType UnitType, unitIndex, d int) *core.Move {
	cellIndices := unitCellIndices(unitType, unitIndex)

	for _, i := range cellIndices {
		if b.Cells[i] != 0 {
			continue
		}

		row, col := i/constants.GridSize, i%constants.GridSize

		if !digitExistsInCells(b, row, col, d) && !b.Candidates[i].Has(d) && !b.Eliminated[i].Has(d) {
			return &core.Move{
				Technique:   "fill-candidate",
				Action:      "candidate",
				Digit:       d,
				Targets:     []core.CellRef{{Row: row, Col: col}},
				Explanation: fmt.Sprintf("Added %d as a candidate to R%dC%d", d, row+1, col+1),
				Highlights: core.Highlights{
					Primary: []core.CellRef{{Row: row, Col: col}},
				},
				Refs: core.TechniqueRef{
					Title: "Fill Candidate",
					Slug:  "fill-candidate",
					URL:   "/technique/fill-candidate",
				},
			}
		}
	}
	return nil
}

// checkHiddenSingleInUnit checks if digit d can only go in one cell in a unit
func (s *Solver) checkHiddenSingleInUnit(b *Board, unitType UnitType, unitIndex, d int) *core.Move {
	cellIndices := unitCellIndices(unitType, unitIndex)

	var possibleCells []core.CellRef

	for _, i := range cellIndices {
		if b.Cells[i] == d {
			return nil
		}
		if b.Cells[i] == 0 && b.Candidates[i].Has(d) {
			possibleCells = append(possibleCells, core.CellRef{Row: i / constants.GridSize, Col: i % constants.GridSize})
		}
	}

	if len(possibleCells) != 1 {
		return nil
	}

	return buildHiddenSingleMove(possibleCells[0], unitType, unitIndex, d)
}

// buildHiddenSingleMove assembles the hidden-single assignment move for a cell
// that is the only candidate placement for d within its unit.
func buildHiddenSingleMove(cell core.CellRef, unitType UnitType, unitIndex, d int) *core.Move {
	return &core.Move{
		Technique:   "hidden-single",
		Action:      constants.ActionAssign,
		Digit:       d,
		Targets:     []core.CellRef{cell},
		Explanation: fmt.Sprintf("R%dC%d must be %d: only cell in %s %d that can contain %d", cell.Row+1, cell.Col+1, d, unitTypeName(unitType), unitIndex+1, d),
		Highlights: core.Highlights{
			Primary:   []core.CellRef{cell},
			Secondary: getUnitCellRefs(unitType, unitIndex),
		},
		Refs: core.TechniqueRef{
			Title: "Hidden Single",
			Slug:  "hidden-single",
			URL:   "/technique/hidden-single",
		},
	}
}

// checkForSingles performs single detection AFTER all candidates are filled
func (s *Solver) checkForSingles(b *Board) *core.Move {
	// Use existing technique library to find singles with complete candidate information
	// Try techniques by tier (this will find naked singles, hidden singles, etc.)

	for _, tier := range []string{constants.TierSimple, constants.TierMedium, constants.TierHard, constants.TierExtreme} {
		for _, t := range s.registry.GetByTier(tier) {
			if move := t.Detector(b); move != nil {
				move.Technique = t.Slug
				move.Refs = core.TechniqueRef{
					Title: t.Name,
					Slug:  t.Slug,
					URL:   "/technique/" + t.Slug,
				}
				return move
			}
		}
	}
	// no technique returned a move
	return nil // No singles found
}

// unitCellIndices returns the flat cell indices for a row, column, or box unit.
// Shared by candidate-fill and hidden-single detection so the unitType switch
// lives in one place.
func unitCellIndices(unitType UnitType, unitIndex int) []int {
	switch unitType {
	case UnitRow:
		return RowIndices[unitIndex]
	case UnitCol:
		return ColIndices[unitIndex]
	case UnitBox:
		return BoxIndices[unitIndex]
	}
	return nil
}

// unitTypeName returns the human-readable word for a unit type, used in move
// explanations such as "only cell in row 3".
func unitTypeName(unitType UnitType) string {
	switch unitType {
	case UnitRow:
		return "row"
	case UnitCol:
		return "column"
	case UnitBox:
		return "box"
	}
	return ""
}

// getUnitCellRefs generates CellRef slice for a unit (row/col/box)
func getUnitCellRefs(unitType UnitType, unitIndex int) []core.CellRef {
	switch unitType {
	case UnitRow:
		cells := make([]core.CellRef, constants.GridSize)
		for c := range constants.GridSize {
			cells[c] = core.CellRef{Row: unitIndex, Col: c}
		}
		return cells
	case UnitCol:
		cells := make([]core.CellRef, constants.GridSize)
		for r := range constants.GridSize {
			cells[r] = core.CellRef{Row: r, Col: unitIndex}
		}
		return cells
	case UnitBox:
		cells := make([]core.CellRef, 0, constants.GridSize)
		boxRow, boxCol := (unitIndex/constants.BoxSize)*constants.BoxSize, (unitIndex%constants.BoxSize)*constants.BoxSize
		for r := boxRow; r < boxRow+constants.BoxSize; r++ {
			for c := boxCol; c < boxCol+constants.BoxSize; c++ {
				cells = append(cells, core.CellRef{Row: r, Col: c})
			}
		}
		return cells
	}
	return nil
}

func getRowCellRefs(row int) []core.CellRef {
	return getUnitCellRefs(UnitRow, row)
}

func getColCellRefs(col int) []core.CellRef {
	return getUnitCellRefs(UnitCol, col)
}

func getBoxCellRefs(box int) []core.CellRef {
	return getUnitCellRefs(UnitBox, box)
}

func digitExistsInCells(b *Board, row, col, digit int) bool {
	for c := range constants.GridSize {
		if b.Cells[row*constants.GridSize+c] == digit {
			return true
		}
	}
	for r := range constants.GridSize {
		if b.Cells[r*constants.GridSize+col] == digit {
			return true
		}
	}
	boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			if b.Cells[r*constants.GridSize+c] == digit {
				return true
			}
		}
	}
	return false
}

// ============================================================================
// Move Application
// ============================================================================

// ApplyMove applies a move to the board
func (s *Solver) ApplyMove(b *Board, move *core.Move) {
	switch move.Action {
	case constants.ActionAssign:
		for _, target := range move.Targets {
			b.SetCell(target.Row*constants.GridSize+target.Col, move.Digit)
		}
	case constants.ActionEliminate:
		for _, elim := range move.Eliminations {
			b.RemoveCandidate(elim.Row*constants.GridSize+elim.Col, elim.Digit)
		}
	case "candidate":
		for _, target := range move.Targets {
			idx := target.Row*constants.GridSize + target.Col
			b.AddCandidate(idx, move.Digit)
		}
	}
	// "contradiction" action doesn't change the board
}

// ============================================================================
// Solving
// ============================================================================

// SolveWithSteps attempts to solve using human techniques, returning all moves
func (s *Solver) SolveWithSteps(ctx context.Context, b *Board, maxSteps int) ([]core.Move, string) {
	var moves []core.Move
	step := 0

	for step < maxSteps && !b.IsSolved() {
		move := s.FindNextMove(ctx, b)
		if move == nil {
			return moves, constants.StatusStalled
		}

		move.StepIndex = step
		s.ApplyMove(b, move)
		moves = append(moves, *move)

		if move.Action == "contradiction" {
			return moves, constants.StatusStalled
		}

		// Only count actual solving moves as steps, not candidate-filling
		if move.Technique != "fill-candidate" {
			step++
		}
	}

	if b.IsSolved() {
		return moves, constants.StatusCompleted
	}
	return moves, constants.StatusMaxStepsReached
}

// ============================================================================
// Registry Access
// ============================================================================

// GetTechniqueTier returns the tier of a technique by its slug
func (s *Solver) GetTechniqueTier(slug string) string {
	if tech := s.registry.GetBySlug(slug); tech != nil {
		return tech.Tier
	}
	return ""
}

// GetRegistry returns the technique registry for external access
func (s *Solver) GetRegistry() *TechniqueRegistry {
	return s.registry
}

// SetTechniqueEnabled enables or disables a technique by slug
func (s *Solver) SetTechniqueEnabled(slug string, enabled bool) bool {
	return s.registry.SetEnabled(slug, enabled)
}

// ============================================================================
// Difficulty Analysis
// ============================================================================

// AnalyzePuzzleDifficulty solves the puzzle and returns the required difficulty level
func (s *Solver) AnalyzePuzzleDifficulty(ctx context.Context, givens []int) (core.Difficulty, map[string]int, string) {
	b := NewBoard(givens)
	moves, status := s.SolveWithSteps(ctx, b, constants.MaxSolverSteps)

	if status != constants.StatusCompleted {
		return core.DifficultyImpossible, nil, status
	}

	techniqueCounts := make(map[string]int)
	highestTier := constants.TierSimple

	tierOrder := map[string]int{
		// Only relative order matters here and every tier maps to a distinct
		// integer, so shifting Simple from 0 to -1 preserves all comparisons.
		// mutator-disable-next-line numbers/decrementer
		constants.TierSimple: 0,
		constants.TierMedium: 1,
		constants.TierHard:   2,
		// Same reasoning: shifting Extreme from 3 to 4 preserves all comparisons.
		// mutator-disable-next-line numbers/incrementer
		constants.TierExtreme: 3,
	}

	for _, move := range moves {
		techniqueCounts[move.Technique]++
		tier := s.GetTechniqueTier(move.Technique)
		// tierOrder values are distinct per tier, so equality never holds for two
		// different tiers and >= would behave identically to >.
		// mutator-disable-next-line expression/comparison
		if tierOrder[tier] > tierOrder[highestTier] {
			highestTier = tier
		}
	}

	var requiredDifficulty core.Difficulty
	switch highestTier {
	case constants.TierSimple:
		requiredDifficulty = core.DifficultyEasy
	case constants.TierMedium:
		requiredDifficulty = core.DifficultyMedium
	case constants.TierHard:
		requiredDifficulty = core.DifficultyHard
	case constants.TierExtreme:
		requiredDifficulty = core.DifficultyExtreme
	}

	return requiredDifficulty, techniqueCounts, constants.StatusCompleted
}
