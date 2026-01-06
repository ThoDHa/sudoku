// Package techniques contains Sudoku solving technique implementations.
//
// Techniques are decoupled from the concrete Board implementation via BoardInterface.
// This allows for better testability and flexibility.
package techniques

import "sudoku-api/pkg/constants"

// Candidates represents a bitmask of possible digits (1-N) for a Sudoku cell.
// Bit positions 1-N correspond to digits 1-N. Bit 0 is unused.
type Candidates uint16

// NewCandidates creates a Candidates bitmask from a slice of digits
func NewCandidates(digits []int) Candidates {
	var c Candidates
	for _, d := range digits {
		if d >= 1 && d <= constants.GridSize {
			c = c.Set(d)
		}
	}
	return c
}

// AllCandidates returns a Candidates with all digits 1-N set
func AllCandidates() Candidates {
	var c Candidates
	for i := 1; i <= constants.GridSize; i++ {
		c = c.Set(i)
	}
	return c
}

// Has returns true if the digit is a candidate
func (c Candidates) Has(digit int) bool {
	if digit < 1 || digit > constants.GridSize {
		return false
	}
	return c&(1<<digit) != 0
}

// Set adds a digit as a candidate and returns the new bitmask
func (c Candidates) Set(digit int) Candidates {
	if digit < 1 || digit > constants.GridSize {
		return c
	}
	return c | (1 << digit)
}

// Clear removes a digit from candidates and returns the new bitmask
func (c Candidates) Clear(digit int) Candidates {
	if digit < 1 || digit > constants.GridSize {
		return c
	}
	return c &^ (1 << digit)
}

// Count returns the number of candidate digits
func (c Candidates) Count() int {
	count := 0
	for i := 1; i <= constants.GridSize; i++ {
		if c&(1<<i) != 0 {
			count++
		}
	}
	return count
}

// Only returns the single digit if there's exactly one candidate,
// otherwise returns (0, false)
func (c Candidates) Only() (int, bool) {
	if c.Count() != 1 {
		return 0, false
	}
	for i := 1; i <= constants.GridSize; i++ {
		if c&(1<<i) != 0 {
			return i, true
		}
	}
	return 0, false
}

// ToSlice returns the candidate digits as a sorted slice
func (c Candidates) ToSlice() []int {
	var result []int
	for i := 1; i <= constants.GridSize; i++ {
		if c&(1<<i) != 0 {
			result = append(result, i)
		}
	}
	return result
}

// IsEmpty returns true if there are no candidates
func (c Candidates) IsEmpty() bool {
	return c == 0
}

// Intersect returns candidates that are present in both bitmasks
func (c Candidates) Intersect(other Candidates) Candidates {
	return c & other
}

// Union returns candidates that are present in either bitmask
func (c Candidates) Union(other Candidates) Candidates {
	return c | other
}

// Subtract returns candidates that are in c but not in other
func (c Candidates) Subtract(other Candidates) Candidates {
	return c &^ other
}

// Equals returns true if the two candidate sets are identical
func (c Candidates) Equals(other Candidates) bool {
	return c == other
}

// String returns a string representation for debugging
func (c Candidates) String() string {
	if c == 0 {
		return "{}"
	}
	digits := c.ToSlice()
	result := "{"
	for i, d := range digits {
		if i > 0 {
			result += ","
		}
		result += string('0' + rune(d))
	}
	result += "}"
	return result
}

// ============================================================================
// Unit Types
// ============================================================================

// UnitType represents row, column, or box
type UnitType int

const (
	UnitRow UnitType = iota
	UnitCol
	UnitBox
)

func (u UnitType) String() string {
	switch u {
	case UnitRow:
		return "row"
	case UnitCol:
		return "column"
	case UnitBox:
		return "box"
	}
	return ""
}

// Unit represents a single row, column, or box
type Unit struct {
	Type  UnitType
	Index int   // 0-15, which row/col/box
	Cells []int // The GridSize cell indices
}

// ============================================================================
// BoardInterface - Abstract Board Operations for Techniques
// ============================================================================

// BoardInterface defines the board operations needed by solving techniques
type BoardInterface interface {
	// Cell state queries
	GetCell(idx int) int                // Returns 0 for empty, 1-16 for filled
	GetCandidatesAt(idx int) Candidates // Returns candidate bitmask for cell

	// Unit queries
	CellsWithDigitInUnit(unit Unit, digit int) []int

	// Mutation (for simulation in forcing chains)
	CloneBoard() BoardInterface
	SetCell(idx, digit int)
	RemoveCandidate(idx, digit int) bool
}
