package human

import "sudoku-api/internal/core"

// Precomputed peer relationships for efficiency
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

// Cell coordinate helpers

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

// FromCellRef converts a CellRef to a cell index
func FromCellRef(ref core.CellRef) int {
	return IndexOf(ref.Row, ref.Col)
}

// Peer relationship checks

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

// ArePeers returns true if two cells can see each other (same row, col, or box) and are not the same cell
func ArePeers(idx1, idx2 int) bool {
	if idx1 == idx2 {
		return false
	}
	return AreRowPeers(idx1, idx2) || AreColPeers(idx1, idx2) || AreBoxPeers(idx1, idx2)
}

// Unit helpers for technique implementations

// GetRowCells returns CellRef slice for all cells in a row
func GetRowCells(row int) []core.CellRef {
	cells := make([]core.CellRef, 9)
	for c := 0; c < 9; c++ {
		cells[c] = core.CellRef{Row: row, Col: c}
	}
	return cells
}

// GetColCells returns CellRef slice for all cells in a column
func GetColCells(col int) []core.CellRef {
	cells := make([]core.CellRef, 9)
	for r := 0; r < 9; r++ {
		cells[r] = core.CellRef{Row: r, Col: col}
	}
	return cells
}

// GetBoxCells returns CellRef slice for all cells in a box
func GetBoxCells(box int) []core.CellRef {
	cells := make([]core.CellRef, 0, 9)
	boxRow, boxCol := (box/3)*3, (box%3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			cells = append(cells, core.CellRef{Row: r, Col: c})
		}
	}
	return cells
}

// GetRowIndices returns all cell indices for a row
func GetRowIndices(row int) []int {
	return RowIndices[row]
}

// GetColIndices returns all cell indices for a column
func GetColIndices(col int) []int {
	return ColIndices[col]
}

// GetBoxIndices returns all cell indices for a box
func GetBoxIndices(box int) []int {
	return BoxIndices[box]
}

// ForEachRowPeer calls fn for each peer of idx in the same row
func ForEachRowPeer(idx int, fn func(peerIdx int)) {
	for _, peerIdx := range RowPeers[idx] {
		fn(peerIdx)
	}
}

// ForEachColPeer calls fn for each peer of idx in the same column
func ForEachColPeer(idx int, fn func(peerIdx int)) {
	for _, peerIdx := range ColPeers[idx] {
		fn(peerIdx)
	}
}

// ForEachBoxPeer calls fn for each peer of idx in the same box
func ForEachBoxPeer(idx int, fn func(peerIdx int)) {
	for _, peerIdx := range BoxPeers[idx] {
		fn(peerIdx)
	}
}

// ForEachPeer calls fn for each peer of idx (row + col + box peers)
func ForEachPeer(idx int, fn func(peerIdx int)) {
	for _, peerIdx := range Peers[idx] {
		fn(peerIdx)
	}
}
