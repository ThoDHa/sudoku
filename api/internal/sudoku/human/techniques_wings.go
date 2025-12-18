package human

import (
	"fmt"
	"sort"

	"sudoku-api/internal/core"
)

// detectXYZWing finds XYZ-Wing pattern:
// - Pivot cell with candidates {X, Y, Z}
// - Wing1 with candidates {X, Z} that sees the pivot
// - Wing2 with candidates {Y, Z} that sees the pivot
// - Eliminate Z from cells that see all three (pivot and both wings)
//
// Logic: Either pivot is X (then wing1 is Z), pivot is Y (then wing2 is Z),
// or pivot is Z. In all cases, Z is in one of the three cells.
func detectXYZWing(b *Board) *core.Move {
	// Find cells with exactly 3 candidates (potential pivots)
	var trivalues []int
	for i := 0; i < 81; i++ {
		if len(b.Candidates[i]) == 3 {
			trivalues = append(trivalues, i)
		}
	}

	// Find cells with exactly 2 candidates (potential wings)
	var bivalues []int
	for i := 0; i < 81; i++ {
		if len(b.Candidates[i]) == 2 {
			bivalues = append(bivalues, i)
		}
	}

	for _, pivot := range trivalues {
		pivotCands := getCandidateSlice(b.Candidates[pivot])
		// pivotCands = [X, Y, Z] (sorted)
		x, y, z := pivotCands[0], pivotCands[1], pivotCands[2]

		// Try all permutations of which candidate is Z (the common digit)
		for _, zDigit := range []int{x, y, z} {
			// The other two digits
			var others []int
			for _, d := range pivotCands {
				if d != zDigit {
					others = append(others, d)
				}
			}
			xDigit, yDigit := others[0], others[1]

			// Find wings that see the pivot
			var xzWings, yzWings []int

			for _, wing := range bivalues {
				if wing == pivot {
					continue
				}
				if !sees(pivot, wing) {
					continue
				}

				wingCands := getCandidateSlice(b.Candidates[wing])
				if len(wingCands) != 2 {
					continue
				}

				// Check if wing has {X, Z}
				if (wingCands[0] == xDigit && wingCands[1] == zDigit) ||
					(wingCands[0] == zDigit && wingCands[1] == xDigit) {
					xzWings = append(xzWings, wing)
				}

				// Check if wing has {Y, Z}
				if (wingCands[0] == yDigit && wingCands[1] == zDigit) ||
					(wingCands[0] == zDigit && wingCands[1] == yDigit) {
					yzWings = append(yzWings, wing)
				}
			}

			// Try all XZ-YZ wing pairs
			for _, xzWing := range xzWings {
				for _, yzWing := range yzWings {
					if xzWing == yzWing {
						continue
					}

					// Find cells that see ALL THREE cells (pivot, xzWing, yzWing)
					// and have zDigit as a candidate
					var eliminations []core.Candidate
					for i := 0; i < 81; i++ {
						if i == pivot || i == xzWing || i == yzWing {
							continue
						}
						if !b.Candidates[i][zDigit] {
							continue
						}
						if sees(i, pivot) && sees(i, xzWing) && sees(i, yzWing) {
							eliminations = append(eliminations, core.Candidate{
								Row: i / 9, Col: i % 9, Digit: zDigit,
							})
						}
					}

					if len(eliminations) > 0 {
						pr, pc := pivot/9, pivot%9
						xr, xc := xzWing/9, xzWing%9
						yr, yc := yzWing/9, yzWing%9

						return &core.Move{
							Action: "eliminate",
							Digit:  zDigit,
							Targets: []core.CellRef{
								{Row: pr, Col: pc},
								{Row: xr, Col: xc},
								{Row: yr, Col: yc},
							},
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("XYZ-Wing: pivot R%dC%d {%d,%d,%d} with wings R%dC%d {%d,%d} and R%dC%d {%d,%d}; eliminate %d",
								pr+1, pc+1, xDigit, yDigit, zDigit,
								xr+1, xc+1, xDigit, zDigit,
								yr+1, yc+1, yDigit, zDigit,
								zDigit),
							Highlights: core.Highlights{
								Primary: []core.CellRef{
									{Row: pr, Col: pc},
									{Row: xr, Col: xc},
									{Row: yr, Col: yc},
								},
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// detectWXYZWing finds WXYZ-Wing pattern:
// - 4 cells in a single unit (row, column, or box) with combined candidates = 4 digits
// - One "restricted common" digit Z can be eliminated from cells seeing all Z-cells
//
// For a valid WXYZ-Wing, the 4 cells must all be in the same row, column, or box
// to ensure they form a proper locked set.
func detectWXYZWing(b *Board) *core.Move {
	// Check each unit for WXYZ-Wing patterns
	units := [][]int{}
	for row := 0; row < 9; row++ {
		units = append(units, getRowIndices(row))
	}
	for col := 0; col < 9; col++ {
		units = append(units, getColIndices(col))
	}
	for box := 0; box < 9; box++ {
		units = append(units, getBoxIndices(box))
	}

	for _, unit := range units {
		// Find cells in this unit with 2-4 candidates
		var candidates []int
		for _, idx := range unit {
			n := len(b.Candidates[idx])
			if n >= 2 && n <= 4 {
				candidates = append(candidates, idx)
			}
		}

		if len(candidates) < 4 {
			continue
		}

		// Try all combinations of 4 cells from this unit
		combos := combinations(candidates, 4)
		for _, cells := range combos {
			// Check if combined candidates are exactly 4 digits
			combined := make(map[int]bool)
			for _, cell := range cells {
				for d := range b.Candidates[cell] {
					combined[d] = true
				}
			}

			if len(combined) != 4 {
				continue
			}

			digits := getCandidateSlice(combined)

			// For each digit, check if it's a "restricted common"
			// A digit Z is restricted common if all cells containing Z see each other
			// (they're in the same unit, so they all see each other by definition)
			for _, z := range digits {
				// Find cells containing z
				var zCells []int
				for _, cell := range cells {
					if b.Candidates[cell][z] {
						zCells = append(zCells, cell)
					}
				}

				if len(zCells) < 2 {
					continue
				}

				// All zCells see each other (they're in the same unit)
				// Find cells that see ALL zCells and have z as candidate
				var eliminations []core.Candidate
				for idx := 0; idx < 81; idx++ {
					// Skip the 4 wing cells
					isWingCell := false
					for _, cell := range cells {
						if idx == cell {
							isWingCell = true
							break
						}
					}
					if isWingCell {
						continue
					}

					if !b.Candidates[idx][z] {
						continue
					}

					// Must see all zCells
					seesAll := true
					for _, zCell := range zCells {
						if !sees(idx, zCell) {
							seesAll = false
							break
						}
					}

					if seesAll {
						eliminations = append(eliminations, core.Candidate{
							Row: idx / 9, Col: idx % 9, Digit: z,
						})
					}
				}

				if len(eliminations) > 0 {
					targets := make([]core.CellRef, 4)
					for idx, cell := range cells {
						targets[idx] = core.CellRef{Row: cell / 9, Col: cell % 9}
					}

					return &core.Move{
						Action:       "eliminate",
						Digit:        z,
						Targets:      targets,
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("WXYZ-Wing: cells with {%d,%d,%d,%d}, eliminate %d", digits[0], digits[1], digits[2], digits[3], z),
						Highlights: core.Highlights{
							Primary: targets,
						},
					}
				}
			}
		}
	}

	return nil
}

// Almost Locked Set (ALS) representation
type ALS struct {
	Cells   []int          // Cell indices in the ALS
	Digits  []int          // Candidates in the ALS (N+1 digits for N cells)
	ByDigit map[int][]int  // For each digit, which cells contain it
}

// findAllALS finds all Almost Locked Sets in the board
// An ALS is a set of N cells in a unit that together have exactly N+1 candidates
func findAllALS(b *Board) []ALS {
	var allALS []ALS

	// Check each unit type
	units := [][]int{}
	for row := 0; row < 9; row++ {
		units = append(units, getRowIndices(row))
	}
	for col := 0; col < 9; col++ {
		units = append(units, getColIndices(col))
	}
	for box := 0; box < 9; box++ {
		units = append(units, getBoxIndices(box))
	}

	for _, unit := range units {
		// Get empty cells in this unit
		var emptyCells []int
		for _, idx := range unit {
			if len(b.Candidates[idx]) > 0 {
				emptyCells = append(emptyCells, idx)
			}
		}

		// Find ALS of sizes 1 to 4 (larger ones are rare and expensive)
		for size := 1; size <= 4 && size <= len(emptyCells); size++ {
			// Generate all combinations of 'size' cells
			combos := combinations(emptyCells, size)
			for _, combo := range combos {
				// Count combined candidates
				combined := make(map[int]bool)
				for _, cell := range combo {
					for d := range b.Candidates[cell] {
						combined[d] = true
					}
				}

				// ALS: N cells with N+1 candidates
				if len(combined) == size+1 {
					digits := getCandidateSlice(combined)

					// Build digit-to-cells map
					byDigit := make(map[int][]int)
					for _, cell := range combo {
						for d := range b.Candidates[cell] {
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

// combinations generates all combinations of k elements from slice
func combinations(slice []int, k int) [][]int {
	if k == 0 {
		return [][]int{{}}
	}
	if len(slice) < k {
		return nil
	}

	var result [][]int

	// Include first element
	for _, rest := range combinations(slice[1:], k-1) {
		combo := make([]int, k)
		combo[0] = slice[0]
		copy(combo[1:], rest)
		result = append(result, combo)
	}

	// Exclude first element
	result = append(result, combinations(slice[1:], k)...)

	return result
}

// detectALSXZ finds ALS-XZ pattern:
// - Two ALS (A and B) that share a "restricted common" digit X
// - X appears in both ALS, and all cells containing X in A see all cells containing X in B
// - Both ALS share another digit Z
// - Eliminate Z from cells that see all Z-cells in both ALS
func detectALSXZ(b *Board) *core.Move {
	allALS := findAllALS(b)

	// Try all pairs of ALS
	for i := 0; i < len(allALS); i++ {
		for j := i + 1; j < len(allALS); j++ {
			alsA := allALS[i]
			alsB := allALS[j]

			// ALS must not share any cells
			if alsShareCells(alsA, alsB) {
				continue
			}

			// Find common digits between the two ALS
			commonDigits := findCommonDigits(alsA.Digits, alsB.Digits)
			if len(commonDigits) < 2 {
				continue // Need at least X (restricted common) and Z (elimination digit)
			}

			// Try each pair of common digits as (X, Z)
			for _, x := range commonDigits {
				// Check if X is a restricted common:
				// All cells with X in A must see all cells with X in B
				xCellsA := alsA.ByDigit[x]
				xCellsB := alsB.ByDigit[x]

				if !allSeeAll(xCellsA, xCellsB) {
					continue
				}

				// For each other common digit Z, try to find eliminations
				for _, z := range commonDigits {
					if z == x {
						continue
					}

					zCellsA := alsA.ByDigit[z]
					zCellsB := alsB.ByDigit[z]

					// Find cells that see ALL Z-cells in both ALS
					var eliminations []core.Candidate
					for idx := 0; idx < 81; idx++ {
						// Skip cells in either ALS
						if containsInt(alsA.Cells, idx) || containsInt(alsB.Cells, idx) {
							continue
						}

						if !b.Candidates[idx][z] {
							continue
						}

						// Must see all Z cells in both ALS
						seesAllZ := true
						for _, zCell := range zCellsA {
							if !sees(idx, zCell) {
								seesAllZ = false
								break
							}
						}
						if seesAllZ {
							for _, zCell := range zCellsB {
								if !sees(idx, zCell) {
									seesAllZ = false
									break
								}
							}
						}

						if seesAllZ {
							eliminations = append(eliminations, core.Candidate{
								Row: idx / 9, Col: idx % 9, Digit: z,
							})
						}
					}

					if len(eliminations) > 0 {
						// Build targets from both ALS cells
						var targets []core.CellRef
						for _, cell := range alsA.Cells {
							targets = append(targets, core.CellRef{Row: cell / 9, Col: cell % 9})
						}
						for _, cell := range alsB.Cells {
							targets = append(targets, core.CellRef{Row: cell / 9, Col: cell % 9})
						}

						return &core.Move{
							Action:       "eliminate",
							Digit:        z,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("ALS-XZ: ALS A {%v} and ALS B {%v} with restricted common %d; eliminate %d",
								formatCells(alsA.Cells), formatCells(alsB.Cells), x, z),
							Highlights: core.Highlights{
								Primary: targets,
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// Helper functions for ALS

func alsShareCells(a, b ALS) bool {
	for _, cellA := range a.Cells {
		for _, cellB := range b.Cells {
			if cellA == cellB {
				return true
			}
		}
	}
	return false
}

func findCommonDigits(a, b []int) []int {
	set := make(map[int]bool)
	for _, d := range a {
		set[d] = true
	}

	var common []int
	for _, d := range b {
		if set[d] {
			common = append(common, d)
		}
	}
	return common
}

func allSeeAll(cellsA, cellsB []int) bool {
	for _, a := range cellsA {
		for _, b := range cellsB {
			if !sees(a, b) {
				return false
			}
		}
	}
	return true
}

func containsInt(slice []int, val int) bool {
	for _, v := range slice {
		if v == val {
			return true
		}
	}
	return false
}

func formatCells(cells []int) string {
	var parts []string
	for _, cell := range cells {
		parts = append(parts, fmt.Sprintf("R%dC%d", cell/9+1, cell%9+1))
	}
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += ","
		}
		result += p
	}
	return result
}
