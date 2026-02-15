package human

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// checkConstraintViolationsOptimized checks for duplicates and invalid candidates using bitmask optimization
// Complexity: O(81) for first pass + O(81 × 9) for candidates = O(810)
// Uses bit operations for O(1) presence checks, no heap allocations
func (s *Solver) checkConstraintViolationsOptimized(b *Board) *core.Move {
	// Bitmask arrays for digit presence: rowBits[digit] = bitmask of which rows contain that digit
	rowBits := [constants.GridSize + 1]uint16{}
	colBits := [constants.GridSize + 1]uint16{}
	boxBits := [constants.GridSize + 1]uint16{}

	// Position tracking for conflict resolution
	rowPos := [constants.GridSize + 1]uint16{}
	colPos := [constants.GridSize + 1]uint16{}
	boxPos := [constants.GridSize + 1]uint16{}

	// First pass: build bitmasks and detect duplicates in single sweep (81 operations)
	for i := 0; i < constants.TotalCells; i++ {
		if b.Cells[i] == 0 {
			continue
		}

		digit := b.Cells[i]
		row, col := i/constants.GridSize, i%constants.GridSize
		boxNum := (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize

		// Check for duplicates using bitmask (O(1))
		if rowBits[digit]&(1<<row) != 0 {
			// Duplicate in row
			duplicateCol := int(rowPos[digit])
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

		if colBits[digit]&(1<<col) != 0 {
			// Duplicate in column
			duplicateRow := int(colPos[digit])
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

		if boxBits[digit]&(1<<boxNum) != 0 {
			// Duplicate in box
			boxIndex := boxPos[digit]
			duplicateBoxRow := int(boxIndex) / constants.GridSize
			duplicateBoxCol := int(boxIndex) % constants.GridSize
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

		// Record digit presence using bitmasks
		rowBits[digit] |= (1 << row)
		colBits[digit] |= (1 << col)
		boxBits[digit] |= (1 << boxNum)
		rowPos[digit] = uint16(col)
		colPos[digit] = uint16(row)
		boxPos[digit] = uint16(i)
	}

	// Check for invalid candidates
	for i := 0; i < constants.TotalCells; i++ {
		if b.Cells[i] != 0 {
			continue
		}

		if b.Candidates[i].IsEmpty() {
			row, col := i/constants.GridSize, i%constants.GridSize

			anyValidPlacement := false
			for d := 1; d <= constants.GridSize; d++ {
				if b.canPlace(i, d) && !b.Eliminated[i].Has(d) {
					anyValidPlacement = true
					break
				}
			}

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
		}

		row, col := i/constants.GridSize, i%constants.GridSize

		for d := 1; d <= constants.GridSize; d++ {
			if !b.Candidates[i].Has(d) {
				continue
			}

			if !b.canPlace(i, d) {
				// Find where conflicting digit is using precomputed bitmasks (O(1) lookup)
				var conflictCells []core.CellRef

				if rowBits[d]&(1<<row) != 0 {
					conflictCol := int(rowPos[d])
					conflictCells = append(conflictCells, core.CellRef{Row: row, Col: conflictCol})
				}

				if colBits[d]&(1<<col) != 0 {
					conflictRow := int(colPos[d])
					conflictCells = append(conflictCells, core.CellRef{Row: conflictRow, Col: col})
				}

				boxNum := (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize
				if boxBits[d]&(1<<boxNum) != 0 {
					boxIndex := boxPos[d]
					conflictRow := int(boxIndex) / constants.GridSize
					conflictCol := int(boxIndex) % constants.GridSize
					conflictCells = append(conflictCells, core.CellRef{Row: conflictRow, Col: conflictCol})
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
					},
				}
			}
		}
	}

	return nil
}
