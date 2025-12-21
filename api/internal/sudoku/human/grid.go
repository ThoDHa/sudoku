package human

import (
	"fmt"
	"strings"

	"sudoku-api/internal/core"
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
// Candidates Bitmask Type
// ============================================================================

// Candidates represents a bitmask of possible digits (1-9) for a Sudoku cell.
// Bit positions 1-9 correspond to digits 1-9. Bit 0 is unused.
type Candidates uint16

// NewCandidates creates a Candidates bitmask from a slice of digits
func NewCandidates(digits []int) Candidates {
	var c Candidates
	for _, d := range digits {
		if d >= 1 && d <= 9 {
			c = c.Set(d)
		}
	}
	return c
}

// AllCandidates returns a Candidates with all digits 1-9 set
func AllCandidates() Candidates {
	return Candidates(0b1111111110) // bits 1-9 set
}

// Has returns true if the digit is a candidate
func (c Candidates) Has(digit int) bool {
	if digit < 1 || digit > 9 {
		return false
	}
	return c&(1<<digit) != 0
}

// Set adds a digit as a candidate and returns the new bitmask
func (c Candidates) Set(digit int) Candidates {
	if digit < 1 || digit > 9 {
		return c
	}
	return c | (1 << digit)
}

// Clear removes a digit from candidates and returns the new bitmask
func (c Candidates) Clear(digit int) Candidates {
	if digit < 1 || digit > 9 {
		return c
	}
	return c &^ (1 << digit)
}

// Count returns the number of candidate digits
func (c Candidates) Count() int {
	count := 0
	for i := 1; i <= 9; i++ {
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
	for i := 1; i <= 9; i++ {
		if c&(1<<i) != 0 {
			return i, true
		}
	}
	return 0, false
}

// ToSlice returns the candidate digits as a sorted slice
func (c Candidates) ToSlice() []int {
	var result []int
	for i := 1; i <= 9; i++ {
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
// Precomputed Peer Data
// ============================================================================

var (
	// Peers contains all peer indices for each cell (row + col + box peers, excluding self)
	Peers [81][]int

	// RowPeers contains peer indices within the same row for each cell
	RowPeers [81][]int

	// ColPeers contains peer indices within the same column for each cell
	ColPeers [81][]int

	// BoxPeers contains peer indices within the same box for each cell
	BoxPeers [81][]int

	// RowIndices maps row number to all cell indices in that row
	RowIndices [9][]int

	// ColIndices maps column number to all cell indices in that column
	ColIndices [9][]int

	// BoxIndices maps box number to all cell indices in that box
	BoxIndices [9][]int
)

func init() {
	initializePeers()
}

// initializePeers precomputes all peer relationships
func initializePeers() {
	// Initialize row/col/box indices first
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			idx := r*9 + c
			RowIndices[r] = append(RowIndices[r], idx)
			ColIndices[c] = append(ColIndices[c], idx)

			boxNum := (r/3)*3 + c/3
			BoxIndices[boxNum] = append(BoxIndices[boxNum], idx)
		}
	}

	// For each cell, compute its peers
	for i := 0; i < 81; i++ {
		row, col := i/9, i%9
		boxNum := (row/3)*3 + col/3

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

// RowOf returns the row number (0-8) for a cell index
func RowOf(idx int) int {
	return idx / 9
}

// ColOf returns the column number (0-8) for a cell index
func ColOf(idx int) int {
	return idx % 9
}

// BoxOf returns the box number (0-8) for a cell index
func BoxOf(idx int) int {
	row, col := idx/9, idx%9
	return (row/3)*3 + col/3
}

// IndexOf returns the cell index for given row and column
func IndexOf(row, col int) int {
	return row*9 + col
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
// Unit Type and Helpers
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
	Index int   // 0-8, which row/col/box
	Cells []int // The 9 cell indices
}

// GetCellRefs returns the cells for a unit as CellRefs (for highlights)
func (u Unit) GetCellRefs() []core.CellRef {
	refs := make([]core.CellRef, len(u.Cells))
	for i, idx := range u.Cells {
		refs[i] = core.CellRef{Row: idx / 9, Col: idx % 9}
	}
	return refs
}

// AllUnits returns all 27 units (9 rows + 9 cols + 9 boxes)
func AllUnits() []Unit {
	units := make([]Unit, 0, 27)
	for i := 0; i < 9; i++ {
		units = append(units, Unit{Type: UnitRow, Index: i, Cells: RowIndices[i]})
		units = append(units, Unit{Type: UnitCol, Index: i, Cells: ColIndices[i]})
		units = append(units, Unit{Type: UnitBox, Index: i, Cells: BoxIndices[i]})
	}
	return units
}

// RowUnits returns just the 9 row units
func RowUnits() []Unit {
	units := make([]Unit, 9)
	for i := 0; i < 9; i++ {
		units[i] = Unit{Type: UnitRow, Index: i, Cells: RowIndices[i]}
	}
	return units
}

// ColUnits returns just the 9 column units
func ColUnits() []Unit {
	units := make([]Unit, 9)
	for i := 0; i < 9; i++ {
		units[i] = Unit{Type: UnitCol, Index: i, Cells: ColIndices[i]}
	}
	return units
}

// BoxUnits returns just the 9 box units
func BoxUnits() []Unit {
	units := make([]Unit, 9)
	for i := 0; i < 9; i++ {
		units[i] = Unit{Type: UnitBox, Index: i, Cells: BoxIndices[i]}
	}
	return units
}

// RowColUnits returns just rows and columns (used for line-based techniques)
func RowColUnits() []Unit {
	units := make([]Unit, 0, 18)
	for i := 0; i < 9; i++ {
		units = append(units, Unit{Type: UnitRow, Index: i, Cells: RowIndices[i]})
		units = append(units, Unit{Type: UnitCol, Index: i, Cells: ColIndices[i]})
	}
	return units
}

// MakeLineUnit creates a row or column unit for a given index
func MakeLineUnit(lineType UnitType, idx int) Unit {
	if lineType == UnitRow {
		return Unit{Type: UnitRow, Index: idx, Cells: RowIndices[idx]}
	}
	return Unit{Type: UnitCol, Index: idx, Cells: ColIndices[idx]}
}

// LineIndexFromPos returns the row or col index from a CellRef based on line type
func (u UnitType) LineIndexFromPos(pos core.CellRef) int {
	if u == UnitRow {
		return pos.Row
	}
	return pos.Col
}

// BoxIndexFromPos returns which box segment (0, 1, or 2) a position belongs to
func (u UnitType) BoxIndexFromPos(pos core.CellRef) int {
	if u == UnitRow {
		return pos.Col / 3
	}
	return pos.Row / 3
}

// AllInSameLine checks if all positions are in the same row or column
func AllInSameLine(lineType UnitType, positions []core.CellRef) (bool, int) {
	if len(positions) == 0 {
		return false, -1
	}
	lineIdx := lineType.LineIndexFromPos(positions[0])
	for _, p := range positions[1:] {
		if lineType.LineIndexFromPos(p) != lineIdx {
			return false, -1
		}
	}
	return true, lineIdx
}

// AllInSameBoxSegment checks if all positions are in the same box segment
func AllInSameBoxSegment(lineType UnitType, positions []core.CellRef) (bool, int) {
	if len(positions) == 0 {
		return false, -1
	}
	boxIdx := lineType.BoxIndexFromPos(positions[0])
	for _, p := range positions[1:] {
		if lineType.BoxIndexFromPos(p) != boxIdx {
			return false, -1
		}
	}
	return true, boxIdx
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

// RemoveInt removes first occurrence of val from slice
func RemoveInt(slice []int, val int) []int {
	for i, v := range slice {
		if v == val {
			return append(slice[:i], slice[i+1:]...)
		}
	}
	return slice
}

// UniqueInts returns slice with duplicates removed
func UniqueInts(slice []int) []int {
	seen := make(map[int]bool)
	result := make([]int, 0, len(slice))
	for _, v := range slice {
		if !seen[v] {
			seen[v] = true
			result = append(result, v)
		}
	}
	return result
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

// MakeEliminations creates eliminations for a digit in multiple cells
func MakeEliminations(cells []int, digit int) []core.Candidate {
	elims := make([]core.Candidate, len(cells))
	for i, cell := range cells {
		elims[i] = MakeElimination(cell, digit)
	}
	return elims
}

// MakeEliminationsMultiDigit creates eliminations for multiple digits in one cell
func MakeEliminationsMultiDigit(cell int, digits []int) []core.Candidate {
	elims := make([]core.Candidate, len(digits))
	for i, digit := range digits {
		elims[i] = MakeElimination(cell, digit)
	}
	return elims
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

// CommonPeersOf returns cells that are peers of ALL given cells
func CommonPeersOf(cells []int) []int {
	if len(cells) == 0 {
		return nil
	}
	if len(cells) == 1 {
		return Peers[cells[0]]
	}

	// Start with peers of first cell
	peerSet := make(map[int]bool)
	for _, p := range Peers[cells[0]] {
		peerSet[p] = true
	}

	// Intersect with peers of remaining cells
	for _, cell := range cells[1:] {
		newSet := make(map[int]bool)
		for _, p := range Peers[cell] {
			if peerSet[p] {
				newSet[p] = true
			}
		}
		peerSet = newSet
	}

	result := make([]int, 0, len(peerSet))
	for p := range peerSet {
		result = append(result, p)
	}
	return result
}

// AllSeeEachOther returns true if all cells in the slice can see each other
func AllSeeEachOther(cells []int) bool {
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			if !ArePeers(cells[i], cells[j]) {
				return false
			}
		}
	}
	return true
}

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

// ============================================================================
// Legacy Helpers (for gradual migration)
// ============================================================================

// getCandidateSlice converts a map[int]bool candidate map to a sorted slice.
// This is a legacy helper for code that still uses map[int]bool internally.
// For Candidates bitmask, use .ToSlice() method instead.
func getCandidateSlice(cands map[int]bool) []int {
	result := make([]int, 0, len(cands))
	for d := range cands {
		result = append(result, d)
	}
	// Sort for consistent output
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			if result[i] > result[j] {
				result[i], result[j] = result[j], result[i]
			}
		}
	}
	return result
}
