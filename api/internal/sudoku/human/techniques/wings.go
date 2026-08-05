package techniques

import (
	"fmt"
	"slices"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// DetectXYZWing finds XYZ-Wing pattern:
// : Pivot cell with candidates {X, Y, Z}
// : Wing1 with candidates {X, Z} that sees the pivot
// : Wing2 with candidates {Y, Z} that sees the pivot
// : Eliminate Z from cells that see all three (pivot and both wings)
//
// Logic: Either pivot is X (then wing1 is Z), pivot is Y (then wing2 is Z),
// or pivot is Z. In all cases, Z is in one of the three cells.
//
//nolint:gocyclo // XYZ-Wing searches pivot × wing1 × wing2 combinations across bivalue/trivalue cells with peer-elimination; each combination's elimination check consumes the pivot and wing candidate sets computed in the same iteration.
func DetectXYZWing(b BoardInterface) *core.Move {
	// Find cells with exactly 3 candidates (potential pivots)
	var trivalues []int
	for i := range constants.TotalCells {
		if b.GetCandidatesAt(i).Count() == 3 {
			trivalues = append(trivalues, i)
		}
	}

	// Find cells with exactly 2 candidates (potential wings)
	var bivalues []int
	for i := range constants.TotalCells {
		if b.GetCandidatesAt(i).Count() == 2 {
			bivalues = append(bivalues, i)
		}
	}

	for _, pivot := range trivalues {
		pivotCands := b.GetCandidatesAt(pivot).ToSlice()
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
				if !ArePeers(pivot, wing) {
					continue
				}

				wingCands := b.GetCandidatesAt(wing).ToSlice()
				// wing comes from bivalues, whose members all report Count()==2,
				// and ToSlice returns exactly Count() digits, so this length can
				// never differ from 2. The guard stays as a precondition for the
				// indexing below.
				// mutator-disable-next-line branch/if
				if len(wingCands) != 2 {
					// mutator-disable-next-line loop/break
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

			// Try all XZ-YZ wing pairs. A wing holds exactly two candidates, so
			// it cannot match both {xDigit, zDigit} and {yDigit, zDigit} while
			// xDigit != yDigit: the two wing lists are always disjoint.
			for _, xzWing := range xzWings {
				for _, yzWing := range yzWings {
					// Find cells that see ALL THREE cells (pivot, xzWing, yzWing)
					// and have zDigit as a candidate. The three pattern cells drop
					// out on their own, because ArePeers below returns false for
					// identical indices.
					var eliminations []core.Candidate
					for i := range constants.TotalCells {
						if !b.GetCandidatesAt(i).Has(zDigit) {
							continue
						}
						if ArePeers(i, pivot) && ArePeers(i, xzWing) && ArePeers(i, yzWing) {
							eliminations = append(eliminations, core.Candidate{
								Row: i / constants.GridSize, Col: i % constants.GridSize, Digit: zDigit,
							})
						}
					}

					if len(eliminations) > 0 {
						pr, pc := pivot/constants.GridSize, pivot%constants.GridSize
						xr, xc := xzWing/constants.GridSize, xzWing%constants.GridSize
						yr, yc := yzWing/constants.GridSize, yzWing%constants.GridSize

						return &core.Move{
							Action: "eliminate",
							Digit:  zDigit,
							Targets: []core.CellRef{
								{Row: pr, Col: pc},
								{Row: xr, Col: xc},
								{Row: yr, Col: yc},
							},
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("XYZ-Wing: pivot R%dC%d {%d,%d,%d} with wings R%dC%d {%d,%d} and R%dC%d {%d,%d}: eliminate %d.",
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

// DetectWXYZWing finds WXYZ-Wing pattern:
// A WXYZ-Wing is a group of 4 cells containing exactly 4 digits (W, X, Y, Z) total,
// where exactly ONE digit is "non-restricted" (not all instances can see each other).
// That non-restricted digit (Z) can be eliminated from any cell that sees ALL Z's in the pattern.
//
// Based on StrmCkr's definition from SudokuWiki:
// "WXYZ-Wings can be considered as a group of 4 cells and 4 digits, restricted to exactly
// two units, that has exactly one non-restricted common digit."
//
//nolint:gocyclo // WXYZ-Wing enumerates a 4-cell pattern (pivot + 3 wings) with restricted-common verification, sharing the pivot's candidate set and per-wing RC sets across the elimination phase.
func DetectWXYZWing(b BoardInterface) *core.Move {
	// Find all empty cells with 2-4 candidates
	var cells []int
	for i := range constants.TotalCells {
		n := b.GetCandidatesAt(i).Count()
		if n < 2 {
			continue
		}
		// The upper bound is a cost saving rather than a rule: a quad holding a
		// cell with five or more candidates unions to at least five digits and
		// is rejected by the count check below, so admitting such a cell would
		// only lengthen the search. Raising the bound or dropping the skip
		// therefore leaves the result unchanged.
		// mutator-disable-next-line branch/if,numbers/incrementer
		if n > 4 {
			continue
		}
		cells = append(cells, i)
	}

	// Try all combinations of 4 cells. Starting each index one past the
	// previous keeps the quad strictly ascending; a mutated start that repeats
	// or reorders an index yields a quad with a duplicated cell, and every such
	// quad is rejected below because a repeated cell cannot see itself, which
	// makes each of its digits non-restricted.
	for i, ci := range cells {
		// mutator-disable-next-line numbers/decrementer
		for j := i + 1; j < len(cells); j++ {
			cj := cells[j]
			// mutator-disable-next-line arithmetic/base,numbers/decrementer
			for k := j + 1; k < len(cells); k++ {
				ck := cells[k]
				// mutator-disable-next-line arithmetic/base,numbers/decrementer
				for l := k + 1; l < len(cells); l++ {
					quad := [4]int{ci, cj, ck, cells[l]}

					// Check if these 4 cells contain exactly 4 distinct digits total
					combined := b.GetCandidatesAt(quad[0]).Union(b.GetCandidatesAt(quad[1])).Union(b.GetCandidatesAt(quad[2])).Union(b.GetCandidatesAt(quad[3]))

					if combined.Count() != 4 {
						continue
					}

					// Get the 4 digits
					digits := combined.ToSlice()

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

					// Find cells in the quad that contain Z. A non-restricted digit
					// sits in at least two quad cells, because isDigitRestricted
					// reports any digit held by one cell or none as restricted.
					var zCells []int
					for _, cell := range quad {
						if b.GetCandidatesAt(cell).Has(z) {
							zCells = append(zCells, cell)
						}
					}

					// Eliminate Z from cells that see ALL Z-containing cells in the quad
					eliminations := FindEliminationsSeeing(b, z, quad[:], zCells...)

					if len(eliminations) > 0 {
						// Build targets (all 4 cells)
						targets := CellRefsFromIndices(quad[:]...)

						// Primary = cells with Z (wing cells), Secondary = the rest
						var primary, secondary []core.CellRef
						for _, cell := range quad {
							if b.GetCandidatesAt(cell).Has(z) {
								primary = append(primary, core.CellRef{Row: cell / constants.GridSize, Col: cell % constants.GridSize})
							} else {
								secondary = append(secondary, core.CellRef{Row: cell / constants.GridSize, Col: cell % constants.GridSize})
							}
						}

						return &core.Move{
							Action:       "eliminate",
							Digit:        z,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("WXYZ-Wing: cells {R%dC%d,R%dC%d,R%dC%d,R%dC%d} contain %v: eliminate non-restricted %d.",
								quad[0]/constants.GridSize+1, quad[0]%constants.GridSize+1, quad[1]/constants.GridSize+1, quad[1]%constants.GridSize+1,
								quad[2]/constants.GridSize+1, quad[2]%constants.GridSize+1, quad[3]/constants.GridSize+1, quad[3]%constants.GridSize+1,
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
			if i != j && ArePeers(cell, other) {
				seesAnother = true
				// Turning this into a continue only costs further iterations
				// that re-assign the same true.
				// mutator-disable-next-line loop/break
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
func isDigitRestricted(b BoardInterface, quad [4]int, digit int) bool {
	// Find all cells in quad containing this digit
	var digitCells []int
	for _, cell := range quad {
		if b.GetCandidatesAt(cell).Has(digit) {
			digitCells = append(digitCells, cell)
		}
	}

	// All pairs must see each other. A digit held by one quad cell or none has
	// no pair to check, so the loop below reports it restricted.
	for i := range digitCells {
		for j := i + 1; j < len(digitCells); j++ {
			if !ArePeers(digitCells[i], digitCells[j]) {
				return false // Found a pair that can't see each other
			}
		}
	}

	return true
}

// DetectALSXZ finds ALS-XZ pattern:
// - Two ALS (A and B) that share a "restricted common" digit X
// - X appears in both ALS, and all cells containing X in A see all cells containing X in B
// - Both ALS share another digit Z
// - Eliminate Z from cells that see all Z-cells in both ALS
func DetectALSXZ(b BoardInterface) *core.Move {
	allALS := FindAllALS(b, 4)

	// Try all pairs of ALS. Starting j one past i skips pairing an ALS with
	// itself, which the share check below would reject anyway.
	for i := range allALS {
		// mutator-disable-next-line numbers/decrementer
		for j := i + 1; j < len(allALS); j++ {
			alsA := allALS[i]
			alsB := allALS[j]

			// ALS must not share any cells
			if ALSShareCells(alsA, alsB) {
				continue
			}

			// Find common digits between the two ALS. A single common digit is
			// already rejected by the z loop below, which skips z == x and so
			// finds no elimination digit; the guard only saves the work.
			commonDigits := IntersectInts(alsA.Digits, alsB.Digits)
			// mutator-disable-next-line branch/if,numbers/decrementer
			if len(commonDigits) < 2 {
				continue // Need at least X (restricted common) and Z (elimination digit)
			}

			// Try each pair of common digits as (X, Z)
			for _, x := range commonDigits {
				// Check if X is a restricted common:
				// All cells with X in A must see all cells with X in B
				xCellsA := alsA.ByDigit[x]
				xCellsB := alsB.ByDigit[x]

				if !AllSeeAll(xCellsA, xCellsB) {
					continue
				}

				// For each other common digit Z, try to find eliminations
				for _, z := range commonDigits {
					if z == x {
						continue
					}

					zCellsA := alsA.ByDigit[z]
					zCellsB := alsB.ByDigit[z]

					// Build exclusion set (all cells in either ALS)
					exclude := slices.Concat(alsA.Cells, alsB.Cells)
					// Combine Z cells from both ALS
					allZCells := slices.Concat(zCellsA, zCellsB)

					// Find cells that see ALL Z-cells in both ALS
					eliminations := FindEliminationsSeeing(b, z, exclude, allZCells...)

					if len(eliminations) > 0 {
						// Build targets from both ALS cells
						targets := CellRefsFromIndices(slices.Concat(alsA.Cells, alsB.Cells)...)

						return &core.Move{
							Action:       "eliminate",
							Digit:        z,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("ALS-XZ: ALS A {%v} and ALS B {%v} with restricted common %d: eliminate %d.",
								FormatCells(alsA.Cells), FormatCells(alsB.Cells), x, z),
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
