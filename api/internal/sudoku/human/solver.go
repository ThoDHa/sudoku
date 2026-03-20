package human

import (
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

// TechniqueTierToDifficulty maps technique tiers to puzzle difficulties
var TechniqueTierToDifficulty = map[string]core.Difficulty{
	constants.TierSimple:  core.DifficultyEasy,
	constants.TierMedium:  core.DifficultyMedium,
	constants.TierHard:    core.DifficultyExtreme,
	constants.TierExtreme: core.DifficultyImpossible,
}

// DifficultyAllowedTiers maps puzzle difficulty to allowed technique tiers
var DifficultyAllowedTiers = map[core.Difficulty][]string{
	core.DifficultyEasy:       {constants.TierSimple},
	core.DifficultyMedium:     {constants.TierSimple, constants.TierMedium},
	core.DifficultyHard:       {constants.TierSimple, constants.TierMedium, constants.TierHard},
	core.DifficultyExtreme:    {constants.TierSimple, constants.TierMedium, constants.TierHard},
	core.DifficultyImpossible: {constants.TierSimple, constants.TierMedium, constants.TierHard, constants.TierExtreme},
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
	// candidateIndex tracks which candidate move to return next during generation.
	// This prevents infinite loops by ensuring we don't return the same candidate
	// move repeatedly across multiple FindNextMove calls.
	candidateIndex int
}

// NewSolver creates a solver with the technique registry
func NewSolver() *Solver {
	return &Solver{
		registry:        NewTechniqueRegistry(),
		generationState: StateNotStarted,
		candidateIndex:  0,
	}
}

// NewSolverWithRegistry creates a solver with a specific registry (for testing)
func NewSolverWithRegistry(registry *TechniqueRegistry) *Solver {
	return &Solver{
		registry:        registry,
		generationState: StateNotStarted,
		candidateIndex:  0,
	}
}

// Reset clears the solver's stateful fields to ensure each solving session
// starts fresh. This prevents state from one hint request affecting another.
func (s *Solver) Reset() {
	s.generationState = StateNotStarted
	s.candidateIndex = 0
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

// checkConstraintViolations detects logical constraint violations in the board
// Returns a constraint violation move if any violations are found, nil otherwise
func (s *Solver) checkConstraintViolations(b *Board) *core.Move {
	// Check for duplicate values in rows, columns, and boxes
	for i := 0; i < constants.TotalCells; i++ {
		if b.Cells[i] == 0 {
			continue
		}

		digit := b.Cells[i]
		row, col := i/constants.GridSize, i%constants.GridSize

		// Check for duplicates in row
		duplicateCol := -1
		for c := 0; c < constants.GridSize; c++ {
			if c != col && b.Cells[row*constants.GridSize+c] == digit {
				duplicateCol = c
				break
			}
		}
		if duplicateCol >= 0 {
			return &core.Move{
				Technique: "constraint-violation-duplicate-row",
				Action:    "contradiction",
				Digit:     digit,
				Targets: []core.CellRef{
					{Row: row, Col: col},
					{Row: row, Col: duplicateCol},
				},
				Explanation: fmt.Sprintf("Constraint violation: %d appears twice in row %d at R%dC%d and R%dC%d",
					digit, row+1, row+1, col+1, row+1, duplicateCol+1),
				Highlights: core.Highlights{
					Primary:   []core.CellRef{{Row: row, Col: col}, {Row: row, Col: duplicateCol}},
					Secondary: getRowCellRefs(row),
				},
				Refs: core.TechniqueRef{
					Title: "Constraint Violation",
					Slug:  "constraint-violation",
					URL:   "",
				},
			}
		}

		// Check for duplicates in column
		duplicateRow := -1
		for r := 0; r < constants.GridSize; r++ {
			if r != row && b.Cells[r*constants.GridSize+col] == digit {
				duplicateRow = r
				break
			}
		}
		if duplicateRow >= 0 {
			return &core.Move{
				Technique: "constraint-violation-duplicate-col",
				Action:    "contradiction",
				Digit:     digit,
				Targets: []core.CellRef{
					{Row: row, Col: col},
					{Row: duplicateRow, Col: col},
				},
				Explanation: fmt.Sprintf("Constraint violation: %d appears twice in column %d at R%dC%d and R%dC%d",
					digit, col+1, row+1, col+1, duplicateRow+1, col+1),
				Highlights: core.Highlights{
					Primary:   []core.CellRef{{Row: row, Col: col}, {Row: duplicateRow, Col: col}},
					Secondary: getColCellRefs(col),
				},
				Refs: core.TechniqueRef{
					Title: "Constraint Violation",
					Slug:  "constraint-violation",
					URL:   "",
				},
			}
		}

		// Check for duplicates in box
		boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize
		boxNum := (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize
		var duplicateBoxRow, duplicateBoxCol int = -1, -1
		for r := boxRow; r < boxRow+constants.BoxSize; r++ {
			for c := boxCol; c < boxCol+constants.BoxSize; c++ {
				if (r != row || c != col) && b.Cells[r*constants.GridSize+c] == digit {
					duplicateBoxRow, duplicateBoxCol = r, c
					break
				}
			}
			if duplicateBoxRow >= 0 {
				break
			}
		}
		if duplicateBoxRow >= 0 {
			return &core.Move{
				Technique: "constraint-violation-duplicate-box",
				Action:    "contradiction",
				Digit:     digit,
				Targets: []core.CellRef{
					{Row: row, Col: col},
					{Row: duplicateBoxRow, Col: duplicateBoxCol},
				},
				Explanation: fmt.Sprintf("Constraint violation: %d appears twice in box %d at R%dC%d and R%dC%d",
					digit, boxNum+1, row+1, col+1, duplicateBoxRow+1, duplicateBoxCol+1),
				Highlights: core.Highlights{
					Primary:   []core.CellRef{{Row: row, Col: col}, {Row: duplicateBoxRow, Col: duplicateBoxCol}},
					Secondary: getBoxCellRefs(boxNum),
				},
				Refs: core.TechniqueRef{
					Title: "Constraint Violation",
					Slug:  "constraint-violation",
					URL:   "",
				},
			}
		}
	}

	// Check for invalid candidates (candidates that conflict with existing values)
	for i := 0; i < constants.TotalCells; i++ {
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
			for d := 1; d <= constants.GridSize; d++ {
				if b.canPlace(i, d) && !b.Eliminated[i].Has(d) {
					anyValidPlacement = true
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

		// Check each candidate against the board state
		for d := 1; d <= constants.GridSize; d++ {
			if !b.Candidates[i].Has(d) {
				continue
			}

			// This candidate should not exist if there's already that digit in row/col/box
			if !b.canPlace(i, d) {
				// Find where the conflicting digit is
				var conflictCells []core.CellRef

				// Check row
				for c := 0; c < constants.GridSize; c++ {
					if b.Cells[row*constants.GridSize+c] == d {
						conflictCells = append(conflictCells, core.CellRef{Row: row, Col: c})
					}
				}

				// Check column
				for r := 0; r < constants.GridSize; r++ {
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
func (s *Solver) FindNextMove(b *Board) *core.Move {
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
			s.generationState = StateCollectingCandidates
			return candidateMove
		}

		// No more candidates to fill - mark generation as complete
		s.generationState = StateCandidatesComplete
	}

	// Phase 2: Check for singles ONLY after ALL candidate generation is complete
	// Only check for singles if we've completed candidate generation for ALL digits
	if s.generationState == StateCandidatesComplete {
		s.generationState = StateApplyingTechniques
		if singleMove := s.checkForSingles(b); singleMove != nil {
			// reset state back to NotStarted after entering technique application
			s.generationState = StateNotStarted
			return singleMove
		}
		// No technique found. Reset generation state to allow normal solver flow
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

	for d := 1; d <= constants.GridSize; d++ {
		// Fill this digit across all rows
		for row := 0; row < constants.GridSize; row++ {
			candidateMove := s.fillCandidatesForRowDigit(b, row, d)
			if candidateMove != nil {
				return candidateMove
			}
		}

		// After filling digit d in all rows, check for hidden singles for this digit
		for row := 0; row < constants.GridSize; row++ {
			if hiddenSingle := s.checkHiddenSingleInRow(b, row, d); hiddenSingle != nil {
				return hiddenSingle
			}
		}

		// Fill this digit across all columns (catches any missed by row iteration)
		for col := 0; col < constants.GridSize; col++ {
			candidateMove := s.fillCandidatesForColDigit(b, col, d)
			if candidateMove != nil {
				return candidateMove
			}
		}

		// Check for hidden singles in columns for this digit
		for col := 0; col < constants.GridSize; col++ {
			if hiddenSingle := s.checkHiddenSingleInCol(b, col, d); hiddenSingle != nil {
				return hiddenSingle
			}
		}

		// Fill this digit across all boxes (catches any missed)
		for box := 0; box < constants.GridSize; box++ {
			candidateMove := s.fillCandidatesForBoxDigit(b, box, d)
			if candidateMove != nil {
				return candidateMove
			}
		}

		// Check for hidden singles in boxes for this digit
		for box := 0; box < constants.GridSize; box++ {
			if hiddenSingle := s.checkHiddenSingleInBox(b, box, d); hiddenSingle != nil {
				return hiddenSingle
			}
		}
	}

	return nil
}

// fillCandidatesForUnit fills candidate d for all cells in a unit (row/col/box)
// Returns first candidate move found, or nil if unit is complete for this digit
func (s *Solver) fillCandidatesForUnit(b *Board, unitType UnitType, unitIndex, d int) *core.Move {
	var cellIndices []int

	switch unitType {
	case UnitRow:
		cellIndices = RowIndices[unitIndex]
	case UnitCol:
		cellIndices = ColIndices[unitIndex]
	case UnitBox:
		cellIndices = BoxIndices[unitIndex]
	}

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

// fillCandidatesForRowDigit fills candidate d for all cells in row that need it
// Returns first candidate move found, or nil if row is complete for this digit
func (s *Solver) fillCandidatesForRowDigit(b *Board, row, d int) *core.Move {
	return s.fillCandidatesForUnit(b, UnitRow, row, d)
}

// fillCandidatesForColDigit fills candidate d for all cells in column that need it
func (s *Solver) fillCandidatesForColDigit(b *Board, col, d int) *core.Move {
	return s.fillCandidatesForUnit(b, UnitCol, col, d)
}

// fillCandidatesForBoxDigit fills candidate d for all cells in box that need it
func (s *Solver) fillCandidatesForBoxDigit(b *Board, box, d int) *core.Move {
	return s.fillCandidatesForUnit(b, UnitBox, box, d)
}

// checkHiddenSingleInUnit checks if digit d can only go in one cell in a unit
func (s *Solver) checkHiddenSingleInUnit(b *Board, unitType UnitType, unitIndex, d int) *core.Move {
	var cellIndices []int

	switch unitType {
	case UnitRow:
		cellIndices = RowIndices[unitIndex]
	case UnitCol:
		cellIndices = ColIndices[unitIndex]
	case UnitBox:
		cellIndices = BoxIndices[unitIndex]
	}

	var possibleCells []core.CellRef

	for _, i := range cellIndices {
		if b.Cells[i] == d {
			return nil
		}
		if b.Cells[i] == 0 && b.Candidates[i].Has(d) {
			possibleCells = append(possibleCells, core.CellRef{Row: i / constants.GridSize, Col: i % constants.GridSize})
		}
	}

	if len(possibleCells) == 1 {
		cell := possibleCells[0]
		unitName := ""
		switch unitType {
		case UnitRow:
			unitName = "row"
		case UnitCol:
			unitName = "column"
		case UnitBox:
			unitName = "box"
		}
		return &core.Move{
			Technique:   "hidden-single",
			Action:      constants.ActionAssign,
			Digit:       d,
			Targets:     []core.CellRef{cell},
			Explanation: fmt.Sprintf("R%dC%d must be %d: only cell in %s %d that can contain %d", cell.Row+1, cell.Col+1, d, unitName, unitIndex+1, d),
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

	return nil
}

// checkHiddenSingleInRow checks if digit d can only go in one cell in the row
func (s *Solver) checkHiddenSingleInRow(b *Board, row, d int) *core.Move {
	return s.checkHiddenSingleInUnit(b, UnitRow, row, d)
}

// checkHiddenSingleInCol checks if digit d can only go in one cell in the column
func (s *Solver) checkHiddenSingleInCol(b *Board, col, d int) *core.Move {
	return s.checkHiddenSingleInUnit(b, UnitCol, col, d)
}

// checkHiddenSingleInBox checks if digit d can only go in one cell in the box
func (s *Solver) checkHiddenSingleInBox(b *Board, box, d int) *core.Move {
	return s.checkHiddenSingleInUnit(b, UnitBox, box, d)
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
					URL:   fmt.Sprintf("/technique/%s", t.Slug),
				}
				return move
			}
		}
	}
	// no technique returned a move
	return nil // No singles found
}

// checkHiddenSingleForDigitImmediate checks if digit d at cell idx is a hidden single
// by looking at all POTENTIAL placements (not just current candidates)
// Note: checkHiddenSingleForDigitImmediate was removed as it was unused.
// If a future optimization requires immediate hidden-single checks without
// relying on precomputed candidates, reintroduce a focused helper here.

// getUnitCellRefs generates CellRef slice for a unit (row/col/box)
func getUnitCellRefs(unitType UnitType, unitIndex int) []core.CellRef {
	switch unitType {
	case UnitRow:
		cells := make([]core.CellRef, constants.GridSize)
		for c := 0; c < constants.GridSize; c++ {
			cells[c] = core.CellRef{Row: unitIndex, Col: c}
		}
		return cells
	case UnitCol:
		cells := make([]core.CellRef, constants.GridSize)
		for r := 0; r < constants.GridSize; r++ {
			cells[r] = core.CellRef{Row: r, Col: unitIndex}
		}
		return cells
	case UnitBox:
		cells := make([]core.CellRef, 0, constants.GridSize)
		boxRow, boxCol := (unitIndex/constants.BoxSize)*constants.BoxSize, (unitIndex/constants.BoxSize)*constants.BoxSize
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
	for c := 0; c < constants.GridSize; c++ {
		if b.Cells[row*constants.GridSize+c] == digit {
			return true
		}
	}
	for r := 0; r < constants.GridSize; r++ {
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
func (s *Solver) SolveWithSteps(b *Board, maxSteps int) ([]core.Move, string) {
	var moves []core.Move
	step := 0

	for step < maxSteps && !b.IsSolved() {
		move := s.FindNextMove(b)
		if move == nil {
			return moves, constants.StatusStalled
		}

		move.StepIndex = step
		s.ApplyMove(b, move)
		moves = append(moves, *move)

		if move.Technique == "contradiction" {
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
func (s *Solver) AnalyzePuzzleDifficulty(givens []int) (core.Difficulty, map[string]int, string) {
	b := NewBoard(givens)
	moves, status := s.SolveWithSteps(b, constants.MaxSolverSteps)

	if status != constants.StatusCompleted {
		return "", nil, status
	}

	techniqueCounts := make(map[string]int)
	highestTier := constants.TierSimple

	tierOrder := map[string]int{
		constants.TierSimple:  0,
		constants.TierMedium:  1,
		constants.TierHard:    2,
		constants.TierExtreme: 3,
	}

	for _, move := range moves {
		techniqueCounts[move.Technique]++
		tier := s.GetTechniqueTier(move.Technique)
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
		requiredDifficulty = core.DifficultyExtreme
	case constants.TierExtreme:
		requiredDifficulty = core.DifficultyImpossible
	}

	return requiredDifficulty, techniqueCounts, constants.StatusCompleted
}
