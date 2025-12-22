package human

// ============================================================================
// BoardInterface - Abstract Board Operations for Techniques
// ============================================================================
//
// BoardInterface defines the operations that solving techniques need from a board.
// This decouples techniques from the concrete Board implementation, enabling:
// - Better testability (mock boards)
// - Flexibility for different board implementations
// - Clear contract for what techniques actually need
//
// Method naming avoids conflicts with existing Board methods:
// - GetCell(idx) instead of direct Cells[idx] access
// - GetCandidatesAt(idx) instead of direct Candidates[idx] access
// - CloneBoard() instead of Clone() to return interface type
//
// ============================================================================

// BoardInterface defines the board operations needed by solving techniques
type BoardInterface interface {
	// Cell state queries
	GetCell(idx int) int                  // Returns 0 for empty, 1-9 for filled
	GetCandidatesAt(idx int) Candidates   // Returns candidate bitmask for cell

	// Unit queries
	CellsWithDigitInUnit(unit Unit, digit int) []int

	// Mutation (for simulation in forcing chains)
	CloneBoard() BoardInterface
	SetCell(idx, digit int)
}

// Compile-time check that Board implements BoardInterface
var _ BoardInterface = (*Board)(nil)
