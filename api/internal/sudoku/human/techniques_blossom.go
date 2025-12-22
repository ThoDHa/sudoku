package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectDeathBlossom finds Death Blossom pattern:
//   - A "stem" cell with N candidates (N = 2 or 3)
//   - N "petal" ALS, one for each stem candidate
//   - Each petal ALS is connected to the stem through exactly one candidate
//   - A digit Z that appears in ALL petal ALS (but NOT in the stem) can be eliminated
//     from any cell that sees ALL cells containing Z in ALL petals
//
// Why it works:
//   - One of the stem's candidates must be true
//   - That forces the corresponding petal's ALS to lock (becomes a naked set)
//   - Z gets placed somewhere in that petal
//   - Since we don't know WHICH petal will lock, Z must appear in any position
//     that all petals cover for Z
func detectDeathBlossom(b *Board) *core.Move {
	// Find all ALS with size 1-4 cells
	allALS := FindAllALS(b, 4)
	if len(allALS) < 2 {
		return nil
	}

	// Find potential stem cells (2-3 candidates)
	var stems []int
	for i := 0; i < 81; i++ {
		n := b.Candidates[i].Count()
		if n >= 2 && n <= 3 {
			stems = append(stems, i)
		}
	}

	for _, stem := range stems {
		stemCands := b.Candidates[stem].ToSlice()

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

// findPetalsForCandidate finds ALS that can serve as petals for a given stem candidate
// A valid petal ALS:
// - Contains the candidate as one of its digits
// - Has exactly one cell that sees the stem (the connection point)
// - That connection is through the given candidate specifically
func findPetalsForCandidate(b *Board, stem int, cand int, allALS []ALS) []ALS {
	var validPetals []ALS

	for _, als := range allALS {
		// ALS must not contain the stem cell
		if ContainsInt(als.Cells, stem) {
			continue
		}

		// ALS must have the candidate as one of its digits
		if !ContainsInt(als.Digits, cand) {
			continue
		}

		// Find cells in the ALS that contain this candidate AND see the stem
		candCellsThatSeeStem := []int{}
		for _, cell := range als.ByDigit[cand] {
			if ArePeers(cell, stem) {
				candCellsThatSeeStem = append(candCellsThatSeeStem, cell)
			}
		}

		// At least one cell with this candidate must see the stem
		// This ensures the ALS is connected to the stem through this candidate
		if len(candCellsThatSeeStem) == 0 {
			continue
		}

		// Note: Other cells in the ALS may also see the stem - that's fine.
		// What matters is that this candidate provides a connection.

		validPetals = append(validPetals, als)
	}

	return validPetals
}

// tryPetalCombinations tries all combinations of petals and looks for eliminations
func tryPetalCombinations(b *Board, stem int, stemCands []int, petalsByCandidate map[int][]ALS) *core.Move {
	n := len(stemCands)

	switch n {
	case 2:
		return tryTwoPetals(b, stem, stemCands, petalsByCandidate)
	case 3:
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
	commonDigits := NewCandidates(petals[0].Digits)

	// Intersect with other petals
	for i := 1; i < len(petals); i++ {
		petalDigits := NewCandidates(petals[i].Digits)
		commonDigits = commonDigits.Intersect(petalDigits)
	}

	// Remove digits that appear in stem
	commonDigits = commonDigits.Subtract(b.Candidates[stem])

	return commonDigits.ToSlice()
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

	// Collect all cells to exclude (stem + all petal cells)
	exclude := []int{stem}
	for _, petal := range petals {
		exclude = append(exclude, petal.Cells...)
	}

	// Find cells that see ALL zCells and have z as candidate
	eliminations := FindEliminationsSeeing(b, z, exclude, allZCells...)

	if len(eliminations) == 0 {
		return nil
	}

	// Build targets and highlights
	stemRef := CellRefsFromIndices(stem)[0]
	targets := []core.CellRef{stemRef}
	primary := []core.CellRef{stemRef}

	var petalCells []int
	for _, petal := range petals {
		petalCells = append(petalCells, petal.Cells...)
	}
	secondary := CellRefsFromIndices(petalCells...)
	targets = append(targets, secondary...)

	// Build explanation
	stemRow, stemCol := stem/9, stem%9
	explanation := fmt.Sprintf("Death Blossom: stem R%dC%d {%v} with %d petals; eliminate %d",
		stemRow+1, stemCol+1, FormatDigits(stemCands), len(petals), z)

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
