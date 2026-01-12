package human

import (
	"fmt"
	"strings"

	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/human/techniques"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// SDK - Stateless Utility Functions for Sudoku Techniques
// ============================================================================
//
// This file contains pure utility functions with NO Board dependency.
// All functions here operate on cell indices, coordinates, or data structures.
//
// For Board-specific methods, see board.go
//
// ============================================================================

// ============================================================================
// Type Aliases from techniques package
// ============================================================================
//
// These type aliases allow the human package to use types defined in the
// techniques package, ensuring compatibility with BoardInterface.
//
// ============================================================================

// Candidates is an alias for techniques.Candidates - a bitmask of possible digits
type Candidates = techniques.Candidates

// UnitType is an alias for techniques.UnitType
type UnitType = techniques.UnitType

// Unit is an alias for techniques.Unit
type Unit = techniques.Unit

// BoardInterface is an alias for techniques.BoardInterface
type BoardInterface = techniques.BoardInterface

// UnitType constants from techniques package
const (
	UnitRow = techniques.UnitRow
	UnitCol = techniques.UnitCol
	UnitBox = techniques.UnitBox
)

// NewCandidates creates a Candidates bitmask from a slice of digits
func NewCandidates(digits []int) Candidates {
	return techniques.NewCandidates(digits)
}

// AllCandidates returns a Candidates with all digits 1-16 set
func AllCandidates() Candidates {
	return techniques.AllCandidates()
}

// ============================================================================
// Precomputed Peer Data
// ============================================================================

var (
	// Peers contains all peer indices for each cell (row + col + box peers, excluding self)
	Peers [constants.TotalCells][]int

	// RowPeers contains peer indices within the same row for each cell
	RowPeers [constants.TotalCells][]int

	// ColPeers contains peer indices within the same column for each cell
	ColPeers [constants.TotalCells][]int

	// BoxPeers contains peer indices within the same box for each cell
	BoxPeers [constants.TotalCells][]int

	// RowIndices maps row number to all cell indices in that row
	RowIndices [constants.GridSize][]int

	// ColIndices maps column number to all cell indices in that column
	ColIndices [constants.GridSize][]int

	// BoxIndices maps box number to all cell indices in that box
	BoxIndices [constants.GridSize][]int
)

func init() {
	initializePeers()
}

// initializePeers precomputes all peer relationships
func initializePeers() {
	// Initialize row/col/box indices first
	for r := 0; r < constants.GridSize; r++ {
		for c := 0; c < constants.GridSize; c++ {
			idx := r*constants.GridSize + c
			RowIndices[r] = append(RowIndices[r], idx)
			ColIndices[c] = append(ColIndices[c], idx)

			boxNum := (r/constants.BoxSize)*constants.BoxSize + c/constants.BoxSize
			BoxIndices[boxNum] = append(BoxIndices[boxNum], idx)
		}
	}

	// For each cell, compute its peers
	for i := 0; i < constants.TotalCells; i++ {
		row, col := i/constants.GridSize, i%constants.GridSize
		boxNum := (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize

		// Collect unique peers (avoiding duplicates)
		peerSet := make(map[int]bool)

		// Row peers
		for _, idx := range RowIndices[row] {
			if idx != i {
				RowPeers[i] = append(RowPeers[i], idx)
				peerSet[idx] = true
			}
		}

		// Column peers
		for _, idx := range ColIndices[col] {
			if idx != i {
				ColPeers[i] = append(ColPeers[i], idx)
				peerSet[idx] = true
			}
		}

		// Box peers
		for _, idx := range BoxIndices[boxNum] {
			if idx != i {
				BoxPeers[i] = append(BoxPeers[i], idx)
				peerSet[idx] = true
			}
		}

		// All unique peers
		for peerIdx := range peerSet {
			Peers[i] = append(Peers[i], peerIdx)
		}
	}
}

// ============================================================================
// Coordinate Helpers
// ============================================================================

// RowOf returns the row number (0-15) for a cell index
func RowOf(idx int) int {
	return idx / constants.GridSize
}

// ColOf returns the column number (0-15) for a cell index
func ColOf(idx int) int {
	return idx % constants.GridSize
}

// BoxOf returns the box number (0-15) for a cell index
func BoxOf(idx int) int {
	row, col := idx/constants.GridSize, idx%constants.GridSize
	return (row/constants.BoxSize)*constants.BoxSize + col/constants.BoxSize
}

// IndexOf returns the cell index for given row and column
func IndexOf(row, col int) int {
	return row*constants.GridSize + col
}

// ToCellRef converts a cell index to a CellRef
func ToCellRef(idx int) core.CellRef {
	return core.CellRef{Row: RowOf(idx), Col: ColOf(idx)}
}

// ToCellRefs converts a slice of cell indices to CellRefs
func ToCellRefs(cells []int) []core.CellRef {
	refs := make([]core.CellRef, len(cells))
	for i, idx := range cells {
		refs[i] = ToCellRef(idx)
	}
	return refs
}

// FromCellRef converts a CellRef to a cell index
func FromCellRef(ref core.CellRef) int {
	return IndexOf(ref.Row, ref.Col)
}

// ============================================================================
// Peer Relationship Checks
// ============================================================================

// AreRowPeers returns true if two cells are in the same row
func AreRowPeers(idx1, idx2 int) bool {
	return RowOf(idx1) == RowOf(idx2)
}

// AreColPeers returns true if two cells are in the same column
func AreColPeers(idx1, idx2 int) bool {
	return ColOf(idx1) == ColOf(idx2)
}

// AreBoxPeers returns true if two cells are in the same box
func AreBoxPeers(idx1, idx2 int) bool {
	return BoxOf(idx1) == BoxOf(idx2)
}

// ArePeers returns true if two cells can see each other (same row, col, or box)
// and are not the same cell
func ArePeers(idx1, idx2 int) bool {
	if idx1 == idx2 {
		return false
	}
	return AreRowPeers(idx1, idx2) || AreColPeers(idx1, idx2) || AreBoxPeers(idx1, idx2)
}

// ============================================================================
// Unit Helpers
// ============================================================================

// AllUnits returns all 48 units (16 rows + 16 cols + 16 boxes)
func AllUnits() []Unit {
	units := make([]Unit, 0, constants.GridSize*3)
	for i := 0; i < constants.GridSize; i++ {
		units = append(units, Unit{Type: UnitRow, Index: i, Cells: RowIndices[i]})
		units = append(units, Unit{Type: UnitCol, Index: i, Cells: ColIndices[i]})
		units = append(units, Unit{Type: UnitBox, Index: i, Cells: BoxIndices[i]})
	}
	return units
}

// ============================================================================
// Formatting Utilities
// ============================================================================

// FormatCell formats a cell index as "R{row}C{col}" (1-indexed for display)
func FormatCell(cell int) string {
	return fmt.Sprintf("R%dC%d", RowOf(cell)+1, ColOf(cell)+1)
}

// FormatCells formats multiple cells as comma-separated "R{row}C{col}"
func FormatCells(cells []int) string {
	if len(cells) == 0 {
		return ""
	}
	parts := make([]string, len(cells))
	for i, cell := range cells {
		parts[i] = FormatCell(cell)
	}
	return strings.Join(parts, ", ")
}

// FormatRef formats a CellRef as "R{row}C{col}" (1-indexed for display)
func FormatRef(ref core.CellRef) string {
	return fmt.Sprintf("R%dC%d", ref.Row+1, ref.Col+1)
}

// FormatRefs formats multiple CellRefs as comma-separated
func FormatRefs(refs []core.CellRef) string {
	if len(refs) == 0 {
		return ""
	}
	parts := make([]string, len(refs))
	for i, ref := range refs {
		parts[i] = FormatRef(ref)
	}
	return strings.Join(parts, ", ")
}

// FormatDigit formats a digit
func FormatDigit(digit int) string {
	return fmt.Sprintf("%d", digit)
}

// FormatDigits formats digits as comma-separated
func FormatDigits(digits []int) string {
	if len(digits) == 0 {
		return ""
	}
	parts := make([]string, len(digits))
	for i, d := range digits {
		parts[i] = fmt.Sprintf("%d", d)
	}
	return strings.Join(parts, ", ")
}

// FormatDigitsCompact formats digits without separators (e.g., "123")
func FormatDigitsCompact(digits []int) string {
	var sb strings.Builder
	for _, d := range digits {
		sb.WriteByte('0' + byte(d))
	}
	return sb.String()
}

// ============================================================================
// Slice Utilities
// ============================================================================

// ContainsInt returns true if slice contains val
func ContainsInt(slice []int, val int) bool {
	for _, v := range slice {
		if v == val {
			return true
		}
	}
	return false
}

// IntersectInts returns intersection of two slices
func IntersectInts(a, b []int) []int {
	bSet := make(map[int]bool)
	for _, v := range b {
		bSet[v] = true
	}
	var result []int
	for _, v := range a {
		if bSet[v] {
			result = append(result, v)
		}
	}
	return result
}

// ============================================================================
// Combinations
// ============================================================================

// Combinations generates all k-element combinations of slice
func Combinations(slice []int, k int) [][]int {
	if k <= 0 || k > len(slice) {
		return nil
	}
	return combinationsHelper(slice, k, 0, nil)
}

func combinationsHelper(slice []int, k, start int, current []int) [][]int {
	if len(current) == k {
		result := make([]int, k)
		copy(result, current)
		return [][]int{result}
	}

	var results [][]int
	for i := start; i <= len(slice)-(k-len(current)); i++ {
		results = append(results, combinationsHelper(slice, k, i+1, append(current, slice[i]))...)
	}
	return results
}

// ============================================================================
// Elimination Helpers
// ============================================================================

// MakeElimination creates a Candidate (elimination) from cell index and digit
func MakeElimination(cell, digit int) core.Candidate {
	return core.Candidate{
		Row:   RowOf(cell),
		Col:   ColOf(cell),
		Digit: digit,
	}
}

// DedupeEliminations removes duplicate eliminations
func DedupeEliminations(elims []core.Candidate) []core.Candidate {
	if len(elims) <= 1 {
		return elims
	}
	seen := make(map[string]bool)
	result := make([]core.Candidate, 0, len(elims))
	for _, e := range elims {
		key := fmt.Sprintf("%d:%d:%d", e.Row, e.Col, e.Digit)
		if !seen[key] {
			seen[key] = true
			result = append(result, e)
		}
	}
	return result
}

// ============================================================================
// Common Peers Calculation (stateless version)
// ============================================================================

// AllSeeAll returns true if every cell in cellsA sees every cell in cellsB
func AllSeeAll(cellsA, cellsB []int) bool {
	for _, a := range cellsA {
		for _, b := range cellsB {
			if !ArePeers(a, b) {
				return false
			}
		}
	}
	return true
}
