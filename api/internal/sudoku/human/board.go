package human

import "sudoku-api/pkg/constants"

// ============================================================================
// Board - Sudoku Puzzle State
// ============================================================================
//
// Board represents the current state of a Sudoku puzzle, including:
// : Cell values (0 = empty, 1-16 = filled)
// : Candidate digits for each cell (as bitmask)
// : Eliminated candidates (to prevent re-adding)
//
// For grid utilities (coordinates, peers, units), see grid.go
// For solving logic, see solver.go
//
// ============================================================================

// Board represents the Sudoku board state with candidates
type Board struct {
	Cells      [constants.TotalCells]int        // 0 for empty, 1-16 for filled
	Candidates [constants.TotalCells]Candidates // possible values for each cell (bitmask)
	Eliminated [constants.TotalCells]Candidates // candidates that have been eliminated (don't re-add)
}

// ============================================================================
// Constructors
// ============================================================================

// NewBoard creates a board from givens and initializes candidates
func NewBoard(givens []int) *Board {
	b := &Board{}
	for i := 0; i < constants.TotalCells; i++ {
		b.Cells[i] = givens[i]
	}
	b.InitCandidates()
	return b
}

// NewBoardWithCandidates creates a board with pre-set candidates (for persisting eliminations)
// Does NOT auto-fill candidates - let FindNextMove handle that one at a time
func NewBoardWithCandidates(cells []int, candidates [][]int) *Board {
	b := &Board{}
	for i := 0; i < constants.TotalCells; i++ {
		b.Cells[i] = cells[i]
		if candidates != nil && i < len(candidates) && candidates[i] != nil {
			b.Candidates[i] = NewCandidates(candidates[i])
		}
		// Mark candidates that could be valid but aren't present as eliminated
		// This preserves eliminations from previous moves
		if cells[i] == 0 && candidates != nil && i < len(candidates) && candidates[i] != nil && len(candidates[i]) > 0 {
			for d := 1; d <= constants.GridSize; d++ {
				if b.canPlace(i, d) && !b.Candidates[i].Has(d) {
					b.Eliminated[i] = b.Eliminated[i].Set(d)
				}
			}
		}
	}
	return b
}

// ============================================================================
// Candidate Management
// ============================================================================

// InitCandidates populates candidates for empty cells based on current board state
func (b *Board) InitCandidates() {
	for i := 0; i < constants.TotalCells; i++ {
		if b.Cells[i] == 0 {
			var cands Candidates
			for d := 1; d <= constants.GridSize; d++ {
				if b.canPlace(i, d) {
					cands = cands.Set(d)
				}
			}
			b.Candidates[i] = cands
		} else {
			b.Candidates[i] = 0
		}
	}
}

// canPlace checks if a digit can be placed at idx (no conflicts in row/col/box)
func (b *Board) canPlace(idx, digit int) bool {
	row, col := idx/constants.GridSize, idx%constants.GridSize

	for c := 0; c < constants.GridSize; c++ {
		if b.Cells[row*constants.GridSize+c] == digit {
			return false
		}
	}

	for r := 0; r < constants.GridSize; r++ {
		if b.Cells[r*constants.GridSize+col] == digit {
			return false
		}
	}

	// Check box
	boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			if b.Cells[r*constants.GridSize+c] == digit {
				return false
			}
		}
	}

	return true
}

// ============================================================================
// Cell Mutation
// ============================================================================

// SetCell places a digit and updates candidates in all affected peers
func (b *Board) SetCell(idx, digit int) {
	b.Cells[idx] = digit
	b.Candidates[idx] = 0 // Clear candidates for filled cell
	b.Eliminated[idx] = 0 // Clear eliminated for filled cell

	row, col := idx/constants.GridSize, idx%constants.GridSize

	for c := 0; c < constants.GridSize; c++ {
		peerIdx := row*constants.GridSize + c
		if b.Candidates[peerIdx].Has(digit) {
			b.Candidates[peerIdx] = b.Candidates[peerIdx].Clear(digit)
			b.Eliminated[peerIdx] = b.Eliminated[peerIdx].Set(digit)
		}
	}

	for r := 0; r < constants.GridSize; r++ {
		peerIdx := r*constants.GridSize + col
		if b.Candidates[peerIdx].Has(digit) {
			b.Candidates[peerIdx] = b.Candidates[peerIdx].Clear(digit)
			b.Eliminated[peerIdx] = b.Eliminated[peerIdx].Set(digit)
		}
	}

	// Remove from box and mark as eliminated
	boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			peerIdx := r*constants.GridSize + c
			if b.Candidates[peerIdx].Has(digit) {
				b.Candidates[peerIdx] = b.Candidates[peerIdx].Clear(digit)
				b.Eliminated[peerIdx] = b.Eliminated[peerIdx].Set(digit)
			}
		}
	}
}

// ClearCell removes a digit from a cell and recalculates candidates for that cell
// This is used when fixing user errors
func (b *Board) ClearCell(idx int) {
	if idx < 0 || idx >= constants.TotalCells {
		return
	}

	b.Cells[idx] = 0
	b.Eliminated[idx] = 0

	var cands Candidates
	for d := 1; d <= constants.GridSize; d++ {
		if b.canPlace(idx, d) {
			cands = cands.Set(d)
		}
	}
	b.Candidates[idx] = cands
}

// RemoveCandidate removes a candidate from a cell and marks it as eliminated
func (b *Board) RemoveCandidate(idx, digit int) bool {
	if b.Candidates[idx].Has(digit) {
		b.Candidates[idx] = b.Candidates[idx].Clear(digit)
		b.Eliminated[idx] = b.Eliminated[idx].Set(digit)
		return true
	}
	return false
}

// AddCandidate adds a candidate to a cell
func (b *Board) AddCandidate(idx, digit int) {
	b.Candidates[idx] = b.Candidates[idx].Set(digit)
}

// ============================================================================
// Board State Queries
// ============================================================================

// IsSolved returns true if all cells are filled AND the solution is valid
func (b *Board) IsSolved() bool {
	for i := 0; i < constants.TotalCells; i++ {
		if b.Cells[i] == 0 {
			return false
		}
	}
	return b.IsValid()
}

// IsValid checks if the current board state has no conflicts (duplicates in row/col/box)
func (b *Board) IsValid() bool {
	for row := 0; row < constants.GridSize; row++ {
		seen := make(map[int]bool)
		for col := 0; col < constants.GridSize; col++ {
			digit := b.Cells[row*constants.GridSize+col]
			if digit != 0 {
				if seen[digit] {
					return false
				}
				seen[digit] = true
			}
		}
	}

	for col := 0; col < constants.GridSize; col++ {
		seen := make(map[int]bool)
		for row := 0; row < constants.GridSize; row++ {
			digit := b.Cells[row*constants.GridSize+col]
			if digit != 0 {
				if seen[digit] {
					return false
				}
				seen[digit] = true
			}
		}
	}

	for boxRow := 0; boxRow < constants.BoxSize; boxRow++ {
		for boxCol := 0; boxCol < constants.BoxSize; boxCol++ {
			seen := make(map[int]bool)
			for r := boxRow * constants.BoxSize; r < boxRow*constants.BoxSize+constants.BoxSize; r++ {
				for c := boxCol * constants.BoxSize; c < boxCol*constants.BoxSize+constants.BoxSize; c++ {
					digit := b.Cells[r*constants.GridSize+c]
					if digit != 0 {
						if seen[digit] {
							return false
						}
						seen[digit] = true
					}
				}
			}
		}
	}

	return true
}

// ============================================================================
// Cloning and Export
// ============================================================================

// Clone creates a deep copy of the board
func (b *Board) Clone() *Board {
	nb := &Board{}
	copy(nb.Cells[:], b.Cells[:])
	copy(nb.Candidates[:], b.Candidates[:])
	copy(nb.Eliminated[:], b.Eliminated[:])
	return nb
}

// GetCells returns cells as a slice (for API responses)
func (b *Board) GetCells() []int {
	result := make([]int, constants.TotalCells)
	copy(result, b.Cells[:])
	return result
}

// GetCandidates returns candidates as a 2D slice (for API responses)
func (b *Board) GetCandidates() [][]int {
	result := make([][]int, constants.TotalCells)
	for i := 0; i < constants.TotalCells; i++ {
		result[i] = b.Candidates[i].ToSlice()
	}
	return result
}

// ============================================================================
// Query Helpers
// ============================================================================

// CellsWithNCandidates returns all cells with exactly n candidates
func (b *Board) CellsWithNCandidates(n int) []int {
	var cells []int
	for i := 0; i < constants.TotalCells; i++ {
		if b.Candidates[i].Count() == n {
			cells = append(cells, i)
		}
	}
	return cells
}

// CellsWithCandidateRange returns all cells with min to max candidates (inclusive)
func (b *Board) CellsWithCandidateRange(min, max int) []int {
	var cells []int
	for i := 0; i < constants.TotalCells; i++ {
		count := b.Candidates[i].Count()
		if count >= min && count <= max {
			cells = append(cells, i)
		}
	}
	return cells
}

// CellsWithDigitInUnit returns cells in the unit that have digit as a candidate
func (b *Board) CellsWithDigitInUnit(unit Unit, digit int) []int {
	var cells []int
	for _, idx := range unit.Cells {
		if b.Candidates[idx].Has(digit) {
			cells = append(cells, idx)
		}
	}
	return cells
}

// ============================================================================
// BoardInterface Implementation
// ============================================================================

// GetCell returns the digit at the given cell index (0 = empty, 1-16 = filled)
func (b *Board) GetCell(idx int) int {
	return b.Cells[idx]
}

// GetCandidatesAt returns the candidates bitmask for the given cell index
// Note: Named differently to avoid conflict with existing GetCandidates() [][]int
func (b *Board) GetCandidatesAt(idx int) Candidates {
	return b.Candidates[idx]
}

// CloneBoard creates a deep copy of the board, returning BoardInterface
// This is used by techniques that need to simulate moves (forcing chains, etc.)
func (b *Board) CloneBoard() BoardInterface {
	return b.Clone()
}
