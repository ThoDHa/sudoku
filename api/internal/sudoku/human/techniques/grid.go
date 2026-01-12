package techniques

import (
	"fmt"
	"sort"
	"strings"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Precomputed Peer Data - Dynamic sizing based on constants
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

// GetCellRefs returns the cells for a unit as CellRefs (for highlights)
func (u Unit) GetCellRefs() []core.CellRef {
	refs := make([]core.CellRef, len(u.Cells))
	for i, idx := range u.Cells {
		refs[i] = core.CellRef{Row: idx / constants.GridSize, Col: idx % constants.GridSize}
	}
	return refs
}

// AllUnits returns all units (16 rows + 16 cols + 16 boxes = 48 total)
func AllUnits() []Unit {
	units := make([]Unit, 0, constants.GridSize*3)
	for i := 0; i < constants.GridSize; i++ {
		units = append(units, Unit{Type: UnitRow, Index: i, Cells: RowIndices[i]})
		units = append(units, Unit{Type: UnitCol, Index: i, Cells: ColIndices[i]})
		units = append(units, Unit{Type: UnitBox, Index: i, Cells: BoxIndices[i]})
	}
	return units
}

// LineIndexFromPos returns the row or col index from a CellRef based on line type
func (u UnitType) LineIndexFromPos(pos core.CellRef) int {
	if u == UnitRow {
		return pos.Row
	}
	return pos.Col
}

// BoxIndexFromPos returns which box segment (0, 1, 2, or 3) a position belongs to
func (u UnitType) BoxIndexFromPos(pos core.CellRef) int {
	if u == UnitRow {
		return pos.Col / constants.BoxSize
	}
	return pos.Row / constants.BoxSize
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
// Cell Reference Helpers
// ============================================================================

// CellRefsFromIndices converts cell indices to CellRef slice
func CellRefsFromIndices(indices ...int) []core.CellRef {
	result := make([]core.CellRef, len(indices))
	for i, idx := range indices {
		result[i] = core.CellRef{Row: idx / constants.GridSize, Col: idx % constants.GridSize}
	}
	return result
}

// ============================================================================
// Elimination Helpers
// ============================================================================

// FindEliminationsSeeing finds cells with digit that see ALL specified mustSee cells.
// Cells in the exclude set are skipped. If exclude is nil, mustSee cells are excluded.
func FindEliminationsSeeing(b BoardInterface, digit int, exclude []int, mustSee ...int) []core.Candidate {
	// Build exclusion set
	excludeSet := make(map[int]bool)
	if exclude != nil {
		for _, idx := range exclude {
			excludeSet[idx] = true
		}
	} else {
		// Default: exclude the mustSee cells themselves
		for _, idx := range mustSee {
			excludeSet[idx] = true
		}
	}

	var eliminations []core.Candidate
	for idx := 0; idx < constants.TotalCells; idx++ {
		if excludeSet[idx] {
			continue
		}
		if !b.GetCandidatesAt(idx).Has(digit) {
			continue
		}
		seesAll := true
		for _, target := range mustSee {
			if !ArePeers(idx, target) {
				seesAll = false
				break
			}
		}
		if seesAll {
			eliminations = append(eliminations, core.Candidate{
				Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: digit,
			})
		}
	}
	return eliminations
}

// ============================================================================
// Almost Locked Set (ALS) Support
// ============================================================================

// ALS represents an Almost Locked Set: N cells with N+1 candidates
type ALS struct {
	Cells   []int         // Cell indices in the ALS
	Digits  []int         // Candidates in the ALS (N+1 digits for N cells)
	ByDigit map[int][]int // For each digit, which cells contain it
}

// FindAllALS finds all Almost Locked Sets in all units.
// An ALS is a set of N cells containing exactly N+1 different candidates.
// maxSize limits the ALS size (default 4 if <= 0).
func FindAllALS(b BoardInterface, maxSize int) []ALS {
	if maxSize <= 0 {
		maxSize = 4
	}

	var allALS []ALS

	// Build unit list in specific order: all rows, then all cols, then all boxes.
	// This order affects which ALS are found first and can impact technique results.
	units := make([][]int, 0, constants.GridSize*3)
	for i := 0; i < constants.GridSize; i++ {
		units = append(units, RowIndices[i])
	}
	for i := 0; i < constants.GridSize; i++ {
		units = append(units, ColIndices[i])
	}
	for i := 0; i < constants.GridSize; i++ {
		units = append(units, BoxIndices[i])
	}

	for _, unit := range units {
		// Get empty cells in this unit
		var emptyCells []int
		for _, idx := range unit {
			if b.GetCandidatesAt(idx).Count() > 0 {
				emptyCells = append(emptyCells, idx)
			}
		}

		// Find ALS of sizes 1 to maxSize
		for size := 1; size <= maxSize && size <= len(emptyCells); size++ {
			combos := Combinations(emptyCells, size)
			for _, combo := range combos {
				// Count combined candidates
				var combined Candidates
				for _, cell := range combo {
					combined = combined.Union(b.GetCandidatesAt(cell))
				}

				// ALS: N cells with N+1 candidates
				if combined.Count() == size+1 {
					digits := combined.ToSlice()

					// Build digit-to-cells map
					byDigit := make(map[int][]int)
					for _, cell := range combo {
						for _, d := range b.GetCandidatesAt(cell).ToSlice() {
							byDigit[d] = append(byDigit[d], cell)
						}
					}

					// Sort cells for consistency
					sortedCells := make([]int, len(combo))
					copy(sortedCells, combo)
					sort.Ints(sortedCells)

					allALS = append(allALS, ALS{
						Cells:   sortedCells,
						Digits:  digits,
						ByDigit: byDigit,
					})
				}
			}
		}
	}

	return allALS
}

// ALSShareCells returns true if two ALS share any cells
func ALSShareCells(a, b ALS) bool {
	for _, cellA := range a.Cells {
		for _, cellB := range b.Cells {
			if cellA == cellB {
				return true
			}
		}
	}
	return false
}
