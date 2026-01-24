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
// : Managing the technique registry
// : Finding the next applicable move
// : Applying moves to the board
// : Tracking difficulty based on techniques used
//
// For board state, see board.go
// For grid utilities, see grid.go
// For technique implementations, see techniques_*.go
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
}

// NewSolver creates a solver with the technique registry
func NewSolver() *Solver {
	return &Solver{
		registry: NewTechniqueRegistry(),
	}
}

// NewSolverWithRegistry creates a solver with a specific registry (for testing)
func NewSolverWithRegistry(registry *TechniqueRegistry) *Solver {
	return &Solver{
		registry: registry,
	}
}

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
		if b.Cells[i] != 0 || b.Candidates[i].IsEmpty() {
			continue
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

	// Phase 1: Complete candidate filling for each digit first
	// Add candidates one at a time, scanning by DIGIT first (human-like behavior)
	// A human thinks: "Where can 1 go? Where can 2 go?" etc.
	// But don't re-add candidates that were previously eliminated
	// IMPORTANT: Complete ALL candidate filling for a digit before checking for singles
	for d := 1; d <= constants.GridSize; d++ {
		candidateMoves := make([]*core.Move, 0)

		// First pass: Collect all fill-candidate moves for this digit
		for i := 0; i < constants.TotalCells; i++ {
			if b.Cells[i] != 0 {
				continue
			}

			row, col := i/constants.GridSize, i%constants.GridSize

			// Only add if: can place AND not already a candidate AND not eliminated
			if b.canPlace(i, d) && !b.Candidates[i].Has(d) && !b.Eliminated[i].Has(d) {
				candidateMoves = append(candidateMoves, &core.Move{
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
				})
			}
		}

		// Return first candidate move if we have any
		if len(candidateMoves) > 0 {
			return candidateMoves[0]
		}
	}

	// Phase 2: Check for singles ONLY after candidate filling is complete
	// This ensures we have complete candidate information before making assignments
	return s.checkForSingles(b)
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
	return nil // No singles found
}

// checkHiddenSingleForDigitImmediate checks if digit d at cell idx is a hidden single
// by looking at all POTENTIAL placements (not just current candidates)
func (s *Solver) checkHiddenSingleForDigitImmediate(b *Board, idx, d int) *core.Move {
	row, col := idx/constants.GridSize, idx%constants.GridSize

	// Helper to check if digit d can potentially go in a cell
	canPlaceDigit := func(cellIdx, digit int) bool {
		if b.Cells[cellIdx] != 0 {
			return false
		}
		if b.Eliminated[cellIdx].Has(digit) {
			return false
		}
		return b.canPlace(cellIdx, digit)
	}

	// Check row
	rowCount := 0
	for c := 0; c < constants.GridSize; c++ {
		cellIdx := row*constants.GridSize + c
		if b.Cells[cellIdx] == d {
			rowCount = 99
			break
		}
		if canPlaceDigit(cellIdx, d) {
			rowCount++
		}
	}
	if rowCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In row %d, %d can only go in R%dC%d (hidden single)", row+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getRowCellRefs(row),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}

	// Check column
	colCount := 0
	for r := 0; r < constants.GridSize; r++ {
		cellIdx := r*constants.GridSize + col
		if b.Cells[cellIdx] == d {
			colCount = 99
			break
		}
		if canPlaceDigit(cellIdx, d) {
			colCount++
		}
	}
	if colCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In column %d, %d can only go in R%dC%d (hidden single)", col+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getColCellRefs(col),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}

	// Check box
	boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize
	boxNum := (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize
	boxCount := 0
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			cellIdx := r*constants.GridSize + c
			if b.Cells[cellIdx] == d {
				boxCount = 99
				break
			}
			if canPlaceDigit(cellIdx, d) {
				boxCount++
			}
		}
		if boxCount == 99 {
			break
		}
	}
	if boxCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In box %d, %d can only go in R%dC%d (hidden single)", boxNum+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getBoxCellRefs(boxNum),
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

// Helper functions for generating CellRef slices
func getRowCellRefs(row int) []core.CellRef {
	cells := make([]core.CellRef, constants.GridSize)
	for c := 0; c < constants.GridSize; c++ {
		cells[c] = core.CellRef{Row: row, Col: c}
	}
	return cells
}

func getColCellRefs(col int) []core.CellRef {
	cells := make([]core.CellRef, constants.GridSize)
	for r := 0; r < constants.GridSize; r++ {
		cells[r] = core.CellRef{Row: r, Col: col}
	}
	return cells
}

func getBoxCellRefs(box int) []core.CellRef {
	cells := make([]core.CellRef, 0, constants.GridSize)
	boxRow, boxCol := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			cells = append(cells, core.CellRef{Row: r, Col: c})
		}
	}
	return cells
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
