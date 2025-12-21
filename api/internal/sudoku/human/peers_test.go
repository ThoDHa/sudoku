package human

import (
	"sudoku-api/internal/core"
	"testing"
)

func TestRowOf(t *testing.T) {
	tests := []struct {
		idx      int
		expected int
	}{
		{0, 0},  // top-left
		{8, 0},  // top-right
		{9, 1},  // second row, first col
		{80, 8}, // bottom-right
		{40, 4}, // middle
	}

	for _, test := range tests {
		if got := RowOf(test.idx); got != test.expected {
			t.Errorf("RowOf(%d) = %d, want %d", test.idx, got, test.expected)
		}
	}
}

func TestColOf(t *testing.T) {
	tests := []struct {
		idx      int
		expected int
	}{
		{0, 0},  // top-left
		{8, 8},  // top-right
		{9, 0},  // second row, first col
		{80, 8}, // bottom-right
		{40, 4}, // middle
	}

	for _, test := range tests {
		if got := ColOf(test.idx); got != test.expected {
			t.Errorf("ColOf(%d) = %d, want %d", test.idx, got, test.expected)
		}
	}
}

func TestBoxOf(t *testing.T) {
	tests := []struct {
		idx      int
		expected int
	}{
		{0, 0},  // top-left box
		{2, 0},  // top-left box
		{6, 2},  // top-right box
		{8, 2},  // top-right box
		{27, 3}, // middle-left box
		{40, 4}, // center box
		{53, 5}, // middle-right box
		{72, 6}, // bottom-left box
		{76, 7}, // bottom-middle box
		{80, 8}, // bottom-right box
	}

	for _, test := range tests {
		if got := BoxOf(test.idx); got != test.expected {
			t.Errorf("BoxOf(%d) = %d, want %d", test.idx, got, test.expected)
		}
	}
}

func TestIndexOf(t *testing.T) {
	tests := []struct {
		row, col int
		expected int
	}{
		{0, 0, 0},
		{0, 8, 8},
		{1, 0, 9},
		{8, 8, 80},
		{4, 4, 40},
	}

	for _, test := range tests {
		if got := IndexOf(test.row, test.col); got != test.expected {
			t.Errorf("IndexOf(%d, %d) = %d, want %d", test.row, test.col, got, test.expected)
		}
	}
}

func TestToCellRef(t *testing.T) {
	tests := []struct {
		idx      int
		expected core.CellRef
	}{
		{0, core.CellRef{Row: 0, Col: 0}},
		{8, core.CellRef{Row: 0, Col: 8}},
		{40, core.CellRef{Row: 4, Col: 4}},
		{80, core.CellRef{Row: 8, Col: 8}},
	}

	for _, test := range tests {
		if got := ToCellRef(test.idx); got != test.expected {
			t.Errorf("ToCellRef(%d) = %v, want %v", test.idx, got, test.expected)
		}
	}
}

func TestFromCellRef(t *testing.T) {
	tests := []struct {
		ref      core.CellRef
		expected int
	}{
		{core.CellRef{Row: 0, Col: 0}, 0},
		{core.CellRef{Row: 0, Col: 8}, 8},
		{core.CellRef{Row: 4, Col: 4}, 40},
		{core.CellRef{Row: 8, Col: 8}, 80},
	}

	for _, test := range tests {
		if got := FromCellRef(test.ref); got != test.expected {
			t.Errorf("FromCellRef(%v) = %d, want %d", test.ref, got, test.expected)
		}
	}
}

func TestArePeers(t *testing.T) {
	tests := []struct {
		idx1, idx2 int
		expected   bool
		reason     string
	}{
		{0, 1, true, "same row"},
		{0, 9, true, "same column"},
		{0, 10, true, "same box"},
		{0, 20, true, "same box (0 and 20 are both in box 0)"},
		{40, 44, true, "same row"},
		{40, 76, true, "same column"},
		{40, 32, true, "same box"},
		{0, 80, false, "no relationship (opposite corners)"},
		{5, 5, false, "same cell"},
	}

	for _, test := range tests {
		if got := ArePeers(test.idx1, test.idx2); got != test.expected {
			t.Errorf("ArePeers(%d, %d) = %t, want %t (%s)", test.idx1, test.idx2, got, test.expected, test.reason)
		}
	}
}

func TestRowPeersCount(t *testing.T) {
	// Each cell should have exactly 8 row peers
	for i := 0; i < 81; i++ {
		if len(RowPeers[i]) != 8 {
			t.Errorf("Cell %d has %d row peers, want 8", i, len(RowPeers[i]))
		}
	}
}

func TestColPeersCount(t *testing.T) {
	// Each cell should have exactly 8 column peers
	for i := 0; i < 81; i++ {
		if len(ColPeers[i]) != 8 {
			t.Errorf("Cell %d has %d column peers, want 8", i, len(ColPeers[i]))
		}
	}
}

func TestBoxPeersCount(t *testing.T) {
	// Each cell should have exactly 8 box peers
	for i := 0; i < 81; i++ {
		if len(BoxPeers[i]) != 8 {
			t.Errorf("Cell %d has %d box peers, want 8", i, len(BoxPeers[i]))
		}
	}
}

func TestTotalPeersCount(t *testing.T) {
	// Each cell should have exactly 20 total peers (8+8+8 with 4 overlaps)
	// Corner cells: 8 (row) + 8 (col) + 8 (box) - 4 (overlaps) = 20
	// Edge cells: 8 + 8 + 8 - 4 = 20
	// Center cells: 8 + 8 + 8 - 4 = 20
	for i := 0; i < 81; i++ {
		if len(Peers[i]) != 20 {
			t.Errorf("Cell %d has %d total peers, want 20", i, len(Peers[i]))
		}
	}
}

func TestRowIndices(t *testing.T) {
	// Test a few rows
	row0 := []int{0, 1, 2, 3, 4, 5, 6, 7, 8}
	if !slicesEqual(RowIndices[0], row0) {
		t.Errorf("Row 0 indices = %v, want %v", RowIndices[0], row0)
	}

	row8 := []int{72, 73, 74, 75, 76, 77, 78, 79, 80}
	if !slicesEqual(RowIndices[8], row8) {
		t.Errorf("Row 8 indices = %v, want %v", RowIndices[8], row8)
	}
}

func TestColIndices(t *testing.T) {
	// Test a few columns
	col0 := []int{0, 9, 18, 27, 36, 45, 54, 63, 72}
	if !slicesEqual(ColIndices[0], col0) {
		t.Errorf("Column 0 indices = %v, want %v", ColIndices[0], col0)
	}

	col8 := []int{8, 17, 26, 35, 44, 53, 62, 71, 80}
	if !slicesEqual(ColIndices[8], col8) {
		t.Errorf("Column 8 indices = %v, want %v", ColIndices[8], col8)
	}
}

func TestBoxIndices(t *testing.T) {
	// Test a few boxes
	box0 := []int{0, 1, 2, 9, 10, 11, 18, 19, 20}
	if !slicesEqual(BoxIndices[0], box0) {
		t.Errorf("Box 0 indices = %v, want %v", BoxIndices[0], box0)
	}

	box8 := []int{60, 61, 62, 69, 70, 71, 78, 79, 80}
	if !slicesEqual(BoxIndices[8], box8) {
		t.Errorf("Box 8 indices = %v, want %v", BoxIndices[8], box8)
	}
}

// Helper function to compare slices
func slicesEqual(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
