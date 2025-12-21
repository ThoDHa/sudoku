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
		if b.Candidates[i].Count() == 3 {
			trivalues = append(trivalues, i)
		}
	}

	// Find cells with exactly 2 candidates (potential wings)
	var bivalues []int
	for i := 0; i < 81; i++ {
		if b.Candidates[i].Count() == 2 {
			bivalues = append(bivalues, i)
		}
	}

	for _, pivot := range trivalues {
		pivotCands := b.Candidates[pivot].ToSlice()
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

				wingCands := b.Candidates[wing].ToSlice()
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
						if !b.Candidates[i].Has(zDigit) {
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
// A WXYZ-Wing is a group of 4 cells containing exactly 4 digits (W, X, Y, Z) total,
// where exactly ONE digit is "non-restricted" (not all instances can see each other).
// That non-restricted digit (Z) can be eliminated from any cell that sees ALL Z's in the pattern.
//
// Based on StrmCkr's definition from SudokuWiki:
// "WXYZ-Wings can be considered as a group of 4 cells and 4 digits, restricted to exactly
// two units, that has exactly one non-restricted common digit."
func detectWXYZWing(b *Board) *core.Move {
	// Find all empty cells with 2-4 candidates
	var cells []int
	for i := 0; i < 81; i++ {
		n := b.Candidates[i].Count()
		if n >= 2 && n <= 4 {
			cells = append(cells, i)
		}
	}

	if len(cells) < 4 {
		return nil
	}

	// Try all combinations of 4 cells
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			for k := j + 1; k < len(cells); k++ {
				for l := k + 1; l < len(cells); l++ {
					quad := [4]int{cells[i], cells[j], cells[k], cells[l]}

					// Check if these 4 cells contain exactly 4 distinct digits total
					combined := make(map[int]bool)
					for _, cell := range quad {
						for _, d := range b.Candidates[cell].ToSlice() {
							combined[d] = true
						}
					}

					if len(combined) != 4 {
						continue
					}

					// Get the 4 digits
					digits := getCandidateSlice(combined)

					// Check connectivity: cells must be interlinked (form a valid pattern)
					// At minimum, each cell must see at least one other cell in the quad
					if !isConnectedQuad(quad) {
						continue
					}

					// Find which digits are restricted vs non-restricted
					// Restricted: ALL instances in the quad can see each other
					// Non-restricted: At least one instance CANNOT see another
					var nonRestrictedDigits []int
					for _, d := range digits {
						if !isDigitRestricted(b, quad, d) {
							nonRestrictedDigits = append(nonRestrictedDigits, d)
						}
					}

					// WXYZ-Wing requires EXACTLY ONE non-restricted digit
					if len(nonRestrictedDigits) != 1 {
						continue
					}

					z := nonRestrictedDigits[0]

					// Find cells in the quad that contain Z
					var zCells []int
					for _, cell := range quad {
						if b.Candidates[cell].Has(z) {
							zCells = append(zCells, cell)
						}
					}

					if len(zCells) == 0 {
						continue
					}

					// Eliminate Z from cells that see ALL Z-containing cells in the quad
					var eliminations []core.Candidate
					for idx := 0; idx < 81; idx++ {
						// Skip cells in the quad
						isInQuad := false
						for _, qc := range quad {
							if idx == qc {
								isInQuad = true
								break
							}
						}
						if isInQuad {
							continue
						}

						if !b.Candidates[idx].Has(z) {
							continue
						}

						// Must see ALL z-containing cells
						seesAll := true
						for _, zc := range zCells {
							if !sees(idx, zc) {
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
						// Build targets (all 4 cells)
						var targets []core.CellRef
						for _, cell := range quad {
							targets = append(targets, core.CellRef{Row: cell / 9, Col: cell % 9})
						}

						// Find the hinge (cell with most candidates, or any with all 4)
						hingeIdx := quad[0]
						for _, cell := range quad {
							if b.Candidates[cell].Count() > b.Candidates[hingeIdx].Count() {
								hingeIdx = cell
							}
						}

						// Primary = cells with Z (wing cells), Secondary = hinge
						var primary, secondary []core.CellRef
						for _, cell := range quad {
							if b.Candidates[cell].Has(z) {
								primary = append(primary, core.CellRef{Row: cell / 9, Col: cell % 9})
							} else {
								secondary = append(secondary, core.CellRef{Row: cell / 9, Col: cell % 9})
							}
						}

						return &core.Move{
							Action:       "eliminate",
							Digit:        z,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("WXYZ-Wing: cells {R%dC%d,R%dC%d,R%dC%d,R%dC%d} contain %v; %d is non-restricted and can be eliminated",
								quad[0]/9+1, quad[0]%9+1, quad[1]/9+1, quad[1]%9+1,
								quad[2]/9+1, quad[2]%9+1, quad[3]/9+1, quad[3]%9+1,
								digits, z),
							Highlights: core.Highlights{
								Primary:   primary,
								Secondary: secondary,
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// isConnectedQuad checks if a quad of cells forms a valid connected pattern
// Each cell should see at least one other cell in the quad
func isConnectedQuad(quad [4]int) bool {
	for i, cell := range quad {
		seesAnother := false
		for j, other := range quad {
			if i != j && sees(cell, other) {
				seesAnother = true
				break
			}
		}
		if !seesAnother {
			return false
		}
	}
	return true
}

// isDigitRestricted checks if all instances of a digit in the quad can see each other
func isDigitRestricted(b *Board, quad [4]int, digit int) bool {
	// Find all cells in quad containing this digit
	var digitCells []int
	for _, cell := range quad {
		if b.Candidates[cell].Has(digit) {
			digitCells = append(digitCells, cell)
		}
	}

	// If only 0 or 1 cell has the digit, it's trivially restricted
	if len(digitCells) <= 1 {
		return true
	}

	// All pairs must see each other
	for i := 0; i < len(digitCells); i++ {
		for j := i + 1; j < len(digitCells); j++ {
			if !sees(digitCells[i], digitCells[j]) {
				return false // Found a pair that can't see each other
			}
		}
	}

	return true
}

// Almost Locked Set (ALS) representation
type ALS struct {
	Cells   []int         // Cell indices in the ALS
	Digits  []int         // Candidates in the ALS (N+1 digits for N cells)
	ByDigit map[int][]int // For each digit, which cells contain it
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
			if b.Candidates[idx].Count() > 0 {
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
					for _, d := range b.Candidates[cell].ToSlice() {
						combined[d] = true
					}
				}

				// ALS: N cells with N+1 candidates
				if len(combined) == size+1 {
					digits := getCandidateSlice(combined)

					// Build digit-to-cells map
					byDigit := make(map[int][]int)
					for _, cell := range combo {
						for _, d := range b.Candidates[cell].ToSlice() {
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

						if !b.Candidates[idx].Has(z) {
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
