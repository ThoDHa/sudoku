package human

import "sort"

// ============================================================================
// Unit Index Helpers
// ============================================================================

// getRowIndices returns the cell indices for a given row (0-8)
func getRowIndices(row int) []int {
	indices := make([]int, 9)
	for c := 0; c < 9; c++ {
		indices[c] = row*9 + c
	}
	return indices
}

// getColIndices returns the cell indices for a given column (0-8)
func getColIndices(col int) []int {
	indices := make([]int, 9)
	for r := 0; r < 9; r++ {
		indices[r] = r*9 + col
	}
	return indices
}

// getBoxIndices returns the cell indices for a given box (0-8)
// Boxes are numbered left-to-right, top-to-bottom:
// 0 1 2
// 3 4 5
// 6 7 8
func getBoxIndices(box int) []int {
	indices := make([]int, 0, 9)
	boxRow, boxCol := (box/3)*3, (box%3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			indices = append(indices, r*9+c)
		}
	}
	return indices
}

// ============================================================================
// Cell Relationship Helpers
// ============================================================================

// sees returns true if two cells can "see" each other, meaning they
// share the same row, column, or box. Returns false if comparing
// the same cell to itself.
func sees(idx1, idx2 int) bool {
	if idx1 == idx2 {
		return false
	}
	r1, c1 := idx1/9, idx1%9
	r2, c2 := idx2/9, idx2%9

	// Same row
	if r1 == r2 {
		return true
	}
	// Same column
	if c1 == c2 {
		return true
	}
	// Same box
	if (r1/3 == r2/3) && (c1/3 == c2/3) {
		return true
	}
	return false
}

// ============================================================================
// Candidate Helpers
// ============================================================================

// candidatesEqual returns true if two candidate maps contain the same digits
func candidatesEqual(a, b map[int]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}

// getCandidateSlice converts a candidate map to a sorted slice of digits
func getCandidateSlice(cands map[int]bool) []int {
	result := make([]int, 0, len(cands))
	for d := range cands {
		result = append(result, d)
	}
	sort.Ints(result)
	return result
}
