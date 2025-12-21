package human

import (
	"fmt"
	"strings"

	"sudoku-api/internal/core"
)

// ============================================================================
// Board SDK - Canonical Interface for Technique Implementations
// ============================================================================
//
// This file provides the canonical interface for accessing board state.
// All technique implementations should use these methods.
//
// The Board now uses Candidates bitmask type instead of map[int]bool.
// These methods provide a clean interface that hides the implementation.
//
// ============================================================================

// ----------------------------------------------------------------------------
// Cell State Methods
// ----------------------------------------------------------------------------

// IsEmpty returns true if the cell has no value (is 0)
func (b *Board) IsEmpty(cell int) bool {
	return b.Cells[cell] == 0
}

// IsFilled returns true if the cell has a value (non-zero)
func (b *Board) IsFilled(cell int) bool {
	return b.Cells[cell] != 0
}

// Value returns the value of a cell (0-9, where 0 means empty)
func (b *Board) Value(cell int) int {
	return b.Cells[cell]
}

// ----------------------------------------------------------------------------
// Candidate Methods
// ----------------------------------------------------------------------------

// HasCandidate returns true if the cell has the given digit as a candidate
func (b *Board) HasCandidate(cell, digit int) bool {
	return b.Candidates[cell].Has(digit)
}

// CandidateCount returns the number of candidates for a cell
func (b *Board) CandidateCount(cell int) int {
	return b.Candidates[cell].Count()
}

// OnlyCandidate returns the single candidate if there's exactly one,
// otherwise returns (0, false)
func (b *Board) OnlyCandidate(cell int) (int, bool) {
	return b.Candidates[cell].Only()
}

// CandidateSlice returns the candidates for a cell as a sorted slice
func (b *Board) CandidateSlice(cell int) []int {
	return b.Candidates[cell].ToSlice()
}

// CandidatesAt returns the candidates for a cell as a Candidates bitmask
func (b *Board) CandidatesAt(cell int) Candidates {
	return b.Candidates[cell]
}

// CandidatesMatch returns true if two cells have the same candidates
func (b *Board) CandidatesMatch(cell1, cell2 int) bool {
	return b.Candidates[cell1] == b.Candidates[cell2]
}

// HasAnyCandidates returns true if the cell has any candidates
func (b *Board) HasAnyCandidates(cell int) bool {
	return !b.Candidates[cell].IsEmpty()
}

// ----------------------------------------------------------------------------
// Cell Finding Methods
// ----------------------------------------------------------------------------

// CellsWithCandidate returns all cells that have the given digit as a candidate
func (b *Board) CellsWithCandidate(digit int) []int {
	var cells []int
	for i := 0; i < 81; i++ {
		if b.Candidates[i].Has(digit) {
			cells = append(cells, i)
		}
	}
	return cells
}

// CellsWithCandidateInUnit returns cells in the unit that have the digit as candidate
func (b *Board) CellsWithCandidateInUnit(unit Unit, digit int) []int {
	var cells []int
	for _, cell := range unit.Cells {
		if b.Candidates[cell].Has(digit) {
			cells = append(cells, cell)
		}
	}
	return cells
}

// CellsWithCandidateIn returns cells from indices that have the digit as candidate
func (b *Board) CellsWithCandidateIn(indices []int, digit int) []int {
	var cells []int
	for _, cell := range indices {
		if b.Candidates[cell].Has(digit) {
			cells = append(cells, cell)
		}
	}
	return cells
}

// EmptyCells returns all empty cells on the board
func (b *Board) EmptyCells() []int {
	var cells []int
	for i := 0; i < 81; i++ {
		if b.Cells[i] == 0 {
			cells = append(cells, i)
		}
	}
	return cells
}

// EmptyCellsIn returns empty cells from the given indices
func (b *Board) EmptyCellsIn(indices []int) []int {
	var cells []int
	for _, cell := range indices {
		if b.Cells[cell] == 0 {
			cells = append(cells, cell)
		}
	}
	return cells
}

// EmptyCellsInUnit returns all empty cells in a unit
func (b *Board) EmptyCellsInUnit(unit Unit) []int {
	return b.EmptyCellsIn(unit.Cells)
}

// BivalueCells returns all cells with exactly 2 candidates
func (b *Board) BivalueCells() []int {
	var cells []int
	for i := 0; i < 81; i++ {
		if b.Candidates[i].Count() == 2 {
			cells = append(cells, i)
		}
	}
	return cells
}

// ----------------------------------------------------------------------------
// Peer Methods (use precomputed data from peers.go)
// ----------------------------------------------------------------------------

// SeesCell returns true if cell1 can see cell2 (same row, col, or box, different cells)
// This is the canonical "sees" check - use this instead of the sees() function in helpers.go
func (b *Board) SeesCell(cell1, cell2 int) bool {
	return ArePeers(cell1, cell2)
}

// PeersOf returns all peers of a cell
func (b *Board) PeersOf(cell int) []int {
	return Peers[cell]
}

// CommonPeers returns cells that are peers of ALL given cells
func (b *Board) CommonPeers(cells []int) []int {
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

// CommonPeersWithCandidate returns common peers that have the given candidate
func (b *Board) CommonPeersWithCandidate(cells []int, digit int) []int {
	peers := b.CommonPeers(cells)
	var result []int
	for _, p := range peers {
		if b.Candidates[p].Has(digit) {
			result = append(result, p)
		}
	}
	return result
}

// AllSeeEachOther returns true if all cells in the slice can see each other
func (b *Board) AllSeeEachOther(cells []int) bool {
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			if !ArePeers(cells[i], cells[j]) {
				return false
			}
		}
	}
	return true
}

// ----------------------------------------------------------------------------
// Unit Methods
// ----------------------------------------------------------------------------

// UnitsContaining returns all units (row, col, box) that contain the cell
func (b *Board) UnitsContaining(cell int) []Unit {
	row := RowOf(cell)
	col := ColOf(cell)
	box := BoxOf(cell)
	return []Unit{
		{Type: UnitRow, Index: row, Cells: RowIndices[row]},
		{Type: UnitCol, Index: col, Cells: ColIndices[col]},
		{Type: UnitBox, Index: box, Cells: BoxIndices[box]},
	}
}

// DigitPositionsInUnit returns cell indices where digit appears as candidate in unit
func (b *Board) DigitPositionsInUnit(unit Unit, digit int) []int {
	return b.CellsWithCandidateIn(unit.Cells, digit)
}

// ----------------------------------------------------------------------------
// Coordinate Helpers (wrappers around peers.go functions for Board API consistency)
// ----------------------------------------------------------------------------

// Row returns the row (0-8) for a cell index
func (b *Board) Row(cell int) int { return RowOf(cell) }

// Col returns the column (0-8) for a cell index
func (b *Board) Col(cell int) int { return ColOf(cell) }

// Box returns the box (0-8) for a cell index
func (b *Board) Box(cell int) int { return BoxOf(cell) }

// CellAt returns the cell index for row and column
func (b *Board) CellAt(row, col int) int { return IndexOf(row, col) }

// CellRef returns a CellRef for a cell index
func (b *Board) CellRef(cell int) core.CellRef { return ToCellRef(cell) }

// CellFromRef returns a cell index from a CellRef
func (b *Board) CellFromRef(ref core.CellRef) int { return FromCellRef(ref) }

// IndicesToRefs converts cell indices to CellRefs
func (b *Board) IndicesToRefs(indices []int) []core.CellRef {
	refs := make([]core.CellRef, len(indices))
	for i, idx := range indices {
		refs[i] = ToCellRef(idx)
	}
	return refs
}

// RefsToIndices converts CellRefs to cell indices
func (b *Board) RefsToIndices(refs []core.CellRef) []int {
	indices := make([]int, len(refs))
	for i, ref := range refs {
		indices[i] = FromCellRef(ref)
	}
	return indices
}

// ============================================================================
// Package-Level Utility Functions
// ============================================================================

// ----------------------------------------------------------------------------
// Formatting
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Slice Utilities
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Combinations
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Elimination Helpers
// ----------------------------------------------------------------------------

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
