package techniques

import (
	"fmt"
	"slices"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// Algorithmic Complexity Notes:
//
// DetectDeathBlossom: O(n³ × a × p) where:
//   - n = cells (81)
//   - a = ALS count (all Almost Locked Sets, up to ~1000 for 9x9 grid)
//   - p = petal combinations (exponential in number of stem candidates)
//   - For 2-candidate stems: O(n × a²) pairwise combinations
//   - For 3-candidate stems: O(n × a³) triplet combinations
//
// findPetalsForCandidate: O(n × a) where:
//   - Scans all ALS to find valid petals
//   - Checks peer relationships (O(1) per check)
//
// tryPetalCombinations: O(a^k) where k = stem candidates (2 or 3)
//   - 2-candidate: O(a²) pairs
//   - 3-candidate: O(a³) triplets
//
// findBlossomEliminations: O(n × p × m) where:
//   - n = cells (81)
//   - p = petals (2 or 3)
//   - m = z-cells per petal (typically 1-4)
//
// Overall complexity is O(n³) to O(n⁴), acceptable because:
//   - Only runs for Death Blossom detection (extreme technique, very rare)
//   - Fixed grid size (9x9) limits worst-case operations
//   - Early termination when eliminations found
//   - ALS discovery is expensive but cached across attempts

// DetectDeathBlossom finds Death Blossom pattern:
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
func DetectDeathBlossom(b BoardInterface) *core.Move {
	// Find all ALS with size 1-4 cells. Fewer than two cannot yield a blossom,
	// but no guard says so here: a set paired with itself is rejected by
	// ALSShareCells, and a stem candidate with no set at all contributes an
	// empty petal list that the combination loops never enter.
	allALS := FindAllALS(b, 4)

	// Find potential stem cells (2-3 candidates). Both bounds are cost filters
	// rather than correctness checks: a stem of any other size reaches
	// tryPetalCombinations, whose switch has no case for it, so no move can
	// follow. Each bound is stated separately so its equivalent mutant can be
	// named without silencing the killable one on the same line.
	var stems []int
	for i := range constants.TotalCells {
		n := b.GetCandidatesAt(i).Count()
		// mutator-disable-next-line numbers/decrementer,branch/if
		if n < 2 {
			continue
		}
		// mutator-disable-next-line numbers/incrementer,branch/if
		if n > 3 {
			continue
		}
		stems = append(stems, i)
	}

	for _, stem := range stems {
		stemCands := b.GetCandidatesAt(stem).ToSlice()

		// Try to find petal ALS for each stem candidate
		// Build a map: stem candidate -> list of valid petal ALS
		petalsByCandidate := make(map[int][]ALS)

		// A candidate with no petals is recorded with an empty list rather than
		// left out: the combination loops iterate each candidate's list, and an
		// empty one and an absent one both end the search for this stem.
		for _, cand := range stemCands {
			petalsByCandidate[cand] = findPetalsForCandidate(b, stem, cand, allALS)
		}

		// Every stem candidate needs a petal of its own, which is not checked
		// here: a candidate with none leaves an empty list, and the combination
		// loops below iterate each candidate's list in turn, so an empty one
		// ends the search for that stem without a move.

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
func findPetalsForCandidate(b BoardInterface, stem int, cand int, allALS []ALS) []ALS {
	var validPetals []ALS

	for _, als := range allALS {
		// ALS must not contain the stem cell
		if slices.Contains(als.Cells, stem) {
			continue
		}

		// Find cells in the ALS that contain this candidate. FindAllALS builds
		// Digits as the union of its cells' candidates and ByDigit from the same
		// cells, so a digit is listed exactly when some cell holds it: an empty
		// cell list is the whole of "the set does not carry this candidate".
		candCells := als.ByDigit[cand]
		if len(candCells) == 0 {
			continue
		}

		// ALL cells in the ALS that contain this candidate must see the stem.
		// This is critical for Death Blossom correctness:
		// When the stem candidate is placed, it eliminates that candidate from
		// all peer cells. For the petal ALS to "lock" (become a naked set),
		// ALL instances of the linking candidate in the petal must be eliminated.
		// If any cell with the candidate doesn't see the stem, it won't be
		// eliminated, and the ALS won't lock properly.
		allCandCellsSeeStem := true
		for _, cell := range candCells {
			if !ArePeers(cell, stem) {
				allCandCellsSeeStem = false
				// The flag is already false, so carrying on through the rest of
				// the cells reaches the same verdict at more cost.
				// mutator-disable-next-line loop/break
				break
			}
		}
		if !allCandCellsSeeStem {
			continue
		}

		validPetals = append(validPetals, als)
	}

	return validPetals
}

// tryPetalCombinations tries all combinations of petals and looks for eliminations
func tryPetalCombinations(b BoardInterface, stem int, stemCands []int, petalsByCandidate map[int][]ALS) *core.Move {
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
func tryTwoPetals(b BoardInterface, stem int, stemCands []int, petalsByCandidate map[int][]ALS) *core.Move {
	c1, c2 := stemCands[0], stemCands[1]

	for _, petal1 := range petalsByCandidate[c1] {
		for _, petal2 := range petalsByCandidate[c2] {
			// Petals must not share cells
			if ALSShareCells(petal1, petal2) {
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
func tryThreePetals(b BoardInterface, stem int, stemCands []int, petalsByCandidate map[int][]ALS) *core.Move {
	c1, c2, c3 := stemCands[0], stemCands[1], stemCands[2]

	for _, petal1 := range petalsByCandidate[c1] {
		for _, petal2 := range petalsByCandidate[c2] {
			if ALSShareCells(petal1, petal2) {
				continue
			}
			for _, petal3 := range petalsByCandidate[c3] {
				if ALSShareCells(petal1, petal3) || ALSShareCells(petal2, petal3) {
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
func findEliminationDigits(b BoardInterface, stem int, petals []ALS) []int {
	if len(petals) == 0 {
		return nil
	}

	// Start with digits from first petal
	commonDigits := NewCandidates(petals[0].Digits)

	// Intersect with other petals. Starting at zero would intersect the first
	// petal with itself before going on, which changes nothing.
	// mutator-disable-next-line numbers/decrementer
	for i := 1; i < len(petals); i++ {
		petalDigits := NewCandidates(petals[i].Digits)
		commonDigits = commonDigits.Intersect(petalDigits)
	}

	// Remove digits that appear in stem
	commonDigits = commonDigits.Subtract(b.GetCandidatesAt(stem))

	return commonDigits.ToSlice()
}

// findBlossomEliminations finds cells where digit z can be eliminated
// A cell can eliminate z if it sees ALL cells containing z in ALL petals
func findBlossomEliminations(b BoardInterface, stem int, petals []ALS, z int, stemCands []int) *core.Move {
	// Collect all cells containing z in all petals
	var allZCells []int
	for _, petal := range petals {
		zCells := petal.ByDigit[z]
		allZCells = append(allZCells, zCells...)
	}

	if len(allZCells) == 0 {
		return nil
	}

	// Find cells that see ALL zCells and have z as candidate. Nothing is
	// excluded by name: z is chosen from digits the stem does not hold, and a
	// petal cell holding z is itself one of the zCells, which no cell can see,
	// so both the stem and the petals drop out of the sweep on their own.
	eliminations := FindEliminationsSeeing(b, z, nil, allZCells...)

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
	stemRow, stemCol := stem/constants.GridSize, stem%constants.GridSize
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

// DEBUG: Add tracing to understand petal selection
var DebugDeathBlossom = false
