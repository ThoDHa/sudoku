package human

// ============================================================================
// Board - Sudoku Puzzle State
// ============================================================================
//
// Board represents the current state of a Sudoku puzzle, including:
// - Cell values (0 = empty, 1-9 = filled)
// - Candidate digits for each cell (as bitmask)
// - Eliminated candidates (to prevent re-adding)
//
// For grid utilities (coordinates, peers, units), see grid.go
// For solving logic, see solver.go
//
// ============================================================================

// Board represents the Sudoku board state with candidates
type Board struct {
	Cells      [81]int        // 0 for empty, 1-9 for filled
	Candidates [81]Candidates // possible values for each cell (bitmask)
	Eliminated [81]Candidates // candidates that have been eliminated (don't re-add)
}

// ============================================================================
// Constructors
// ============================================================================

// NewBoard creates a board from givens and initializes candidates
func NewBoard(givens []int) *Board {
	b := &Board{}
	for i := 0; i < 81; i++ {
		b.Cells[i] = givens[i]
	}
	b.InitCandidates()
	return b
}

// NewBoardWithCandidates creates a board with pre-set candidates (for persisting eliminations)
// Does NOT auto-fill candidates - let FindNextMove handle that one at a time
func NewBoardWithCandidates(cells []int, candidates [][]int) *Board {
	b := &Board{}
	for i := 0; i < 81; i++ {
		b.Cells[i] = cells[i]
		if candidates != nil && i < len(candidates) && candidates[i] != nil {
			b.Candidates[i] = NewCandidates(candidates[i])
		}
		// Mark candidates that could be valid but aren't present as eliminated
		// This preserves eliminations from previous moves
		if cells[i] == 0 && candidates != nil && i < len(candidates) && candidates[i] != nil && len(candidates[i]) > 0 {
			for d := 1; d <= 9; d++ {
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
	for i := 0; i < 81; i++ {
		if b.Cells[i] == 0 {
			var cands Candidates
			for d := 1; d <= 9; d++ {
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
	row, col := idx/9, idx%9

	// Check row
	for c := 0; c < 9; c++ {
		if b.Cells[row*9+c] == digit {
			return false
		}
	}

	// Check column
	for r := 0; r < 9; r++ {
		if b.Cells[r*9+col] == digit {
			return false
		}
	}

	// Check box
	boxRow, boxCol := (row/3)*3, (col/3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			if b.Cells[r*9+c] == digit {
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

	row, col := idx/9, idx%9

	// Remove from row and mark as eliminated
	for c := 0; c < 9; c++ {
		peerIdx := row*9 + c
		if b.Candidates[peerIdx].Has(digit) {
			b.Candidates[peerIdx] = b.Candidates[peerIdx].Clear(digit)
			b.Eliminated[peerIdx] = b.Eliminated[peerIdx].Set(digit)
		}
	}

	// Remove from column and mark as eliminated
	for r := 0; r < 9; r++ {
		peerIdx := r*9 + col
		if b.Candidates[peerIdx].Has(digit) {
			b.Candidates[peerIdx] = b.Candidates[peerIdx].Clear(digit)
			b.Eliminated[peerIdx] = b.Eliminated[peerIdx].Set(digit)
		}
	}

	// Remove from box and mark as eliminated
	boxRow, boxCol := (row/3)*3, (col/3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			peerIdx := r*9 + c
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
	if idx < 0 || idx >= 81 {
		return
	}

	b.Cells[idx] = 0
	b.Eliminated[idx] = 0

	var cands Candidates
	for d := 1; d <= 9; d++ {
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
	for i := 0; i < 81; i++ {
		if b.Cells[i] == 0 {
			return false
		}
	}
	return b.IsValid()
}

// IsValid checks if the current board state has no conflicts (duplicates in row/col/box)
func (b *Board) IsValid() bool {
	// Check each row for duplicates
	for row := 0; row < 9; row++ {
		seen := make(map[int]bool)
		for col := 0; col < 9; col++ {
			digit := b.Cells[row*9+col]
			if digit != 0 {
				if seen[digit] {
					return false
				}
				seen[digit] = true
			}
		}
	}

	// Check each column for duplicates
	for col := 0; col < 9; col++ {
		seen := make(map[int]bool)
		for row := 0; row < 9; row++ {
			digit := b.Cells[row*9+col]
			if digit != 0 {
				if seen[digit] {
					return false
				}
				seen[digit] = true
			}
		}
	}

	// Check each 3x3 box for duplicates
	for boxRow := 0; boxRow < 3; boxRow++ {
		for boxCol := 0; boxCol < 3; boxCol++ {
			seen := make(map[int]bool)
			for r := boxRow * 3; r < boxRow*3+3; r++ {
				for c := boxCol * 3; c < boxCol*3+3; c++ {
					digit := b.Cells[r*9+c]
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
	result := make([]int, 81)
	copy(result, b.Cells[:])
	return result
}

// GetCandidates returns candidates as a 2D slice (for API responses)
func (b *Board) GetCandidates() [][]int {
	result := make([][]int, 81)
	for i := 0; i < 81; i++ {
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
	for i := 0; i < 81; i++ {
		if b.Candidates[i].Count() == n {
			cells = append(cells, i)
		}
	}
	return cells
}

// CellsWithCandidateRange returns all cells with min to max candidates (inclusive)
func (b *Board) CellsWithCandidateRange(min, max int) []int {
	var cells []int
	for i := 0; i < 81; i++ {
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
