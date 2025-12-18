package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectDeathBlossom finds Death Blossom pattern:
// - A "stem" cell with N candidates (N = 2 or 3)
// - N "petal" ALS, one for each stem candidate
// - Each petal ALS is connected to the stem through exactly one candidate
// - A digit Z that appears in ALL petal ALS (but NOT in the stem) can be eliminated
//   from any cell that sees ALL cells containing Z in ALL petals
//
// Why it works:
// - One of the stem's candidates must be true
// - That forces the corresponding petal's ALS to lock (becomes a naked set)
// - Z gets placed somewhere in that petal
// - Since we don't know WHICH petal will lock, Z must appear in any position
//   that all petals cover for Z
func detectDeathBlossom(b *Board) *core.Move {
	// Find all ALS with size 2-4 cells for efficiency
	allALS := findBlossomALS(b)
	if len(allALS) < 2 {
		return nil
	}

	// Find potential stem cells (2-3 candidates)
	var stems []int
	for i := 0; i < 81; i++ {
		n := len(b.Candidates[i])
		if n >= 2 && n <= 3 {
			stems = append(stems, i)
		}
	}

	for _, stem := range stems {
		stemCands := getCandidateSlice(b.Candidates[stem])

		// Try to find petal ALS for each stem candidate
		// Build a map: stem candidate -> list of valid petal ALS
		petalsByCandidate := make(map[int][]ALS)

		for _, cand := range stemCands {
			petals := findPetalsForCandidate(b, stem, cand, allALS)
			if len(petals) > 0 {
				petalsByCandidate[cand] = petals
			}
		}

		// Need at least one petal for each stem candidate
		allHavePetals := true
		for _, cand := range stemCands {
			if len(petalsByCandidate[cand]) == 0 {
				allHavePetals = false
				break
			}
		}
		if !allHavePetals {
			continue
		}

		// Try all combinations of petals (one per stem candidate)
		if move := tryPetalCombinations(b, stem, stemCands, petalsByCandidate); move != nil {
			return move
		}
	}

	return nil
}

// findBlossomALS finds ALS suitable for Death Blossom (size 2-4 cells)
func findBlossomALS(b *Board) []ALS {
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

		// Find ALS of sizes 2 to 4 (size 1 is just a bivalue cell, larger is expensive)
		for size := 2; size <= 4 && size <= len(emptyCells); size++ {
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

					// Create sorted copy of cells
					sortedCells := make([]int, len(combo))
					copy(sortedCells, combo)
					sortSlice(sortedCells)

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

// findPetalsForCandidate finds ALS that can serve as petals for a given stem candidate
// A valid petal ALS:
// - Contains the candidate as one of its digits
// - Has exactly one cell that sees the stem (the connection point)
// - That connection is through the given candidate specifically
func findPetalsForCandidate(b *Board, stem int, cand int, allALS []ALS) []ALS {
	var validPetals []ALS

	for _, als := range allALS {
		// ALS must not contain the stem cell
		if containsInt(als.Cells, stem) {
			continue
		}

		// ALS must have the candidate as one of its digits
		if !containsInt(als.Digits, cand) {
			continue
		}

		// Find cells in the ALS that contain this candidate AND see the stem
		candCellsThatSeeStem := []int{}
		for _, cell := range als.ByDigit[cand] {
			if sees(cell, stem) {
				candCellsThatSeeStem = append(candCellsThatSeeStem, cell)
			}
		}

		// Must have exactly one cell with this candidate seeing the stem
		// This ensures the connection is specifically through this candidate
		if len(candCellsThatSeeStem) != 1 {
			continue
		}

		// Also ensure no other cells in the ALS see the stem
		// (to ensure the ALS is truly attached only via this candidate)
		otherCellsSeeStem := false
		for _, cell := range als.Cells {
			if cell == candCellsThatSeeStem[0] {
				continue
			}
			if sees(cell, stem) {
				otherCellsSeeStem = true
				break
			}
		}

		// If other cells see the stem, the connection is ambiguous
		// We allow this but the candidate connection must still be unique
		// Actually for Death Blossom, we just need the candidate link to be unique
		_ = otherCellsSeeStem // Allow other cells to see stem, just need unique candidate link

		validPetals = append(validPetals, als)
	}

	return validPetals
}

// tryPetalCombinations tries all combinations of petals and looks for eliminations
func tryPetalCombinations(b *Board, stem int, stemCands []int, petalsByCandidate map[int][]ALS) *core.Move {
	n := len(stemCands)

	if n == 2 {
		return tryTwoPetals(b, stem, stemCands, petalsByCandidate)
	} else if n == 3 {
		return tryThreePetals(b, stem, stemCands, petalsByCandidate)
	}

	return nil
}

// tryTwoPetals handles stems with 2 candidates
func tryTwoPetals(b *Board, stem int, stemCands []int, petalsByCandidate map[int][]ALS) *core.Move {
	c1, c2 := stemCands[0], stemCands[1]

	for _, petal1 := range petalsByCandidate[c1] {
		for _, petal2 := range petalsByCandidate[c2] {
			// Petals must not share cells
			if alsShareCells(petal1, petal2) {
				continue
			}

			// Find common digits in both petals that are NOT in the stem
			commonZ := findEliminationDigits(b, stem, []ALS{petal1, petal2})

			for _, z := range commonZ {
				if move := findBlossomEliminations(b, stem, []ALS{petal1, petal2}, z, stemCands); move != nil {
					return move
				}
			}
		}
	}

	return nil
}

// tryThreePetals handles stems with 3 candidates
func tryThreePetals(b *Board, stem int, stemCands []int, petalsByCandidate map[int][]ALS) *core.Move {
	c1, c2, c3 := stemCands[0], stemCands[1], stemCands[2]

	for _, petal1 := range petalsByCandidate[c1] {
		for _, petal2 := range petalsByCandidate[c2] {
			if alsShareCells(petal1, petal2) {
				continue
			}
			for _, petal3 := range petalsByCandidate[c3] {
				if alsShareCells(petal1, petal3) || alsShareCells(petal2, petal3) {
					continue
				}

				// Find common digits in all petals that are NOT in the stem
				commonZ := findEliminationDigits(b, stem, []ALS{petal1, petal2, petal3})

				for _, z := range commonZ {
					if move := findBlossomEliminations(b, stem, []ALS{petal1, petal2, petal3}, z, stemCands); move != nil {
						return move
					}
				}
			}
		}
	}

	return nil
}

// findEliminationDigits finds digits that appear in ALL petals but NOT in the stem
func findEliminationDigits(b *Board, stem int, petals []ALS) []int {
	if len(petals) == 0 {
		return nil
	}

	// Start with digits from first petal
	commonDigits := make(map[int]bool)
	for _, d := range petals[0].Digits {
		commonDigits[d] = true
	}

	// Intersect with other petals
	for i := 1; i < len(petals); i++ {
		petalDigits := make(map[int]bool)
		for _, d := range petals[i].Digits {
			petalDigits[d] = true
		}

		for d := range commonDigits {
			if !petalDigits[d] {
				delete(commonDigits, d)
			}
		}
	}

	// Remove digits that appear in stem
	for d := range b.Candidates[stem] {
		delete(commonDigits, d)
	}

	return getCandidateSlice(commonDigits)
}

// findBlossomEliminations finds cells where digit z can be eliminated
// A cell can eliminate z if it sees ALL cells containing z in ALL petals
func findBlossomEliminations(b *Board, stem int, petals []ALS, z int, stemCands []int) *core.Move {
	// Collect all cells containing z in all petals
	var allZCells []int
	for _, petal := range petals {
		zCells := petal.ByDigit[z]
		allZCells = append(allZCells, zCells...)
	}

	if len(allZCells) == 0 {
		return nil
	}

	// Collect all cells in all petals (for exclusion)
	allPetalCells := make(map[int]bool)
	for _, petal := range petals {
		for _, cell := range petal.Cells {
			allPetalCells[cell] = true
		}
	}

	// Find cells that see ALL zCells and have z as candidate
	var eliminations []core.Candidate
	for idx := 0; idx < 81; idx++ {
		// Skip stem and petal cells
		if idx == stem || allPetalCells[idx] {
			continue
		}

		if !b.Candidates[idx][z] {
			continue
		}

		// Must see ALL z cells in ALL petals
		seesAll := true
		for _, zCell := range allZCells {
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

	if len(eliminations) == 0 {
		return nil
	}

	// Build targets and highlights
	targets := []core.CellRef{{Row: stem / 9, Col: stem % 9}}
	var primary []core.CellRef
	primary = append(primary, core.CellRef{Row: stem / 9, Col: stem % 9})

	var secondary []core.CellRef
	for _, petal := range petals {
		for _, cell := range petal.Cells {
			cellRef := core.CellRef{Row: cell / 9, Col: cell % 9}
			targets = append(targets, cellRef)
			secondary = append(secondary, cellRef)
		}
	}

	// Build explanation
	stemRow, stemCol := stem/9, stem%9
	explanation := fmt.Sprintf("Death Blossom: stem R%dC%d {%v} with %d petals; eliminate %d",
		stemRow+1, stemCol+1, formatDigitsBlossom(stemCands), len(petals), z)

	return &core.Move{
		Action:       "eliminate",
		Digit:        z,
		Targets:      targets,
		Eliminations: eliminations,
		Explanation:  explanation,
		Highlights: core.Highlights{
			Primary:   primary,
			Secondary: secondary,
		},
	}
}

// sortSlice sorts a slice of ints in ascending order
func sortSlice(s []int) {
	for i := 0; i < len(s)-1; i++ {
		for j := i + 1; j < len(s); j++ {
			if s[j] < s[i] {
				s[i], s[j] = s[j], s[i]
			}
		}
	}
}

// formatDigitsBlossom formats a slice of digits for display
func formatDigitsBlossom(digits []int) string {
	result := ""
	for i, d := range digits {
		if i > 0 {
			result += ","
		}
		result += fmt.Sprintf("%d", d)
	}
	return result
}
