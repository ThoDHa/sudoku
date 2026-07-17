package human

import (
	"sudoku-api/internal/sudoku/human/techniques"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Board - Sudoku Puzzle State
// ============================================================================
//
// Board represents the current state of a Sudoku puzzle, including:
// : Cell values (0 = empty, 1-9 = filled)
// : Candidate digits for each cell (as bitmask)
// : Eliminated candidates (to prevent re-adding)
//
// For grid utilities (coordinates, peers, units), see grid.go
// For solving logic, see solver.go
//
// ============================================================================

// Board represents the Sudoku board state with candidates
type Board struct {
	Cells      [constants.TotalCells]int        // 0 for empty, 1-9 for filled
	Candidates [constants.TotalCells]Candidates // possible values for each cell (bitmask)
	Eliminated [constants.TotalCells]Candidates // candidates that have been eliminated (don't re-add)
}

// ============================================================================
// Constructors
// ============================================================================

// NewBoard creates a board from givens and initializes candidates
func NewBoard(givens []int) *Board {
	b := &Board{}
	for i := range constants.TotalCells {
		b.Cells[i] = givens[i]
	}
	b.InitCandidates()
	return b
}

// NewBoardWithCandidates creates a board with pre-set candidates (for persisting eliminations)
// Does NOT auto-fill candidates - let FindNextMove handle that one at a time
func NewBoardWithCandidates(cells []int, candidates [][]int) *Board {
	b := &Board{}
	for i := range constants.TotalCells {
		b.Cells[i] = cells[i]
		// The nil guards are dead defense: NewCandidates(nil) is 0 (the zero value
		// already stored) and markMissingAsEliminated early-returns on an empty
		// candidate list, so removing either guard changes nothing.
		// mutator-disable-next-line expression/remove
		if candidates != nil && i < len(candidates) && candidates[i] != nil {
			b.Candidates[i] = NewCandidates(candidates[i])
			b.markMissingAsEliminated(i, cells[i], candidates[i])
		}
	}
	return b
}

// markMissingAsEliminated flags digits that could legally be placed at idx but
// are absent from the persisted candidate list. This preserves prior
// eliminations across board reloads.
func (b *Board) markMissingAsEliminated(idx, cell int, cands []int) {
	if cell != 0 || len(cands) == 0 {
		return
	}
	// Starting at 0 is a no-op: canPlace(idx,0) is always false because the empty
	// cell idx sits in its own row and equals digit 0, and Candidates.Has/Set(0)
	// are no-ops, so the d=0 iteration can never touch Eliminated.
	// mutator-disable-next-line numbers/decrementer
	for d := 1; d <= constants.GridSize; d++ {
		if b.canPlace(idx, d) && !b.Candidates[idx].Has(d) {
			b.Eliminated[idx] = b.Eliminated[idx].Set(d)
		}
	}
}

// ============================================================================
// Candidate Management
// ============================================================================

// InitCandidates populates candidates for empty cells based on current board state
func (b *Board) InitCandidates() {
	for i := range constants.TotalCells {
		if b.Cells[i] == 0 {
			var cands Candidates
			// Starting at 0 is a no-op: canPlace(i,0) is always false because the
			// empty cell i sits in its own row and equals digit 0, and Set(0) is a
			// no-op, so the d=0 iteration adds nothing.
			// mutator-disable-next-line numbers/decrementer
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

	for c := range constants.GridSize {
		if b.Cells[row*constants.GridSize+c] == digit {
			return false
		}
	}

	for r := range constants.GridSize {
		if b.Cells[r*constants.GridSize+col] == digit {
			return false
		}
	}

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

	for c := range constants.GridSize {
		peerIdx := row*constants.GridSize + c
		if b.Candidates[peerIdx].Has(digit) {
			b.Candidates[peerIdx] = b.Candidates[peerIdx].Clear(digit)
			b.Eliminated[peerIdx] = b.Eliminated[peerIdx].Set(digit)
		}
	}

	for r := range constants.GridSize {
		peerIdx := r*constants.GridSize + col
		if b.Candidates[peerIdx].Has(digit) {
			b.Candidates[peerIdx] = b.Candidates[peerIdx].Clear(digit)
			b.Eliminated[peerIdx] = b.Eliminated[peerIdx].Set(digit)
		}
	}

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
	// Starting at 0 is a no-op: canPlace(idx,0) is always false because the empty
	// cell idx sits in its own row and equals digit 0, and Set(0) is a no-op, so
	// the d=0 iteration adds nothing.
	// mutator-disable-next-line numbers/decrementer
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
	for i := range constants.TotalCells {
		if b.Cells[i] == 0 {
			return false
		}
	}
	return b.IsValid()
}

// IsValid checks if the current board state has no conflicts (duplicates in row/col/box)
func (b *Board) IsValid() bool {
	for i := range constants.GridSize {
		if !unitIsValid(b.Cells[:], techniques.RowIndices[i]) ||
			!unitIsValid(b.Cells[:], techniques.ColIndices[i]) ||
			!unitIsValid(b.Cells[:], techniques.BoxIndices[i]) {
			return false
		}
	}
	return true
}

// unitIsValid reports whether cells contains no duplicate non-zero values.
func unitIsValid(cells []int, unitCells []int) bool {
	seen := make(map[int]bool)
	for _, idx := range unitCells {
		digit := cells[idx]
		if digit == 0 {
			continue
		}
		if seen[digit] {
			return false
		}
		seen[digit] = true
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
	for i := range constants.TotalCells {
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
	for i := range constants.TotalCells {
		if b.Candidates[i].Count() == n {
			cells = append(cells, i)
		}
	}
	return cells
}

// CellsWithCandidateRange returns all cells with min to max candidates (inclusive)
func (b *Board) CellsWithCandidateRange(min, max int) []int {
	var cells []int
	for i := range constants.TotalCells {
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

// GetCell returns the digit at the given cell index (0 = empty, 1-9 = filled)
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
