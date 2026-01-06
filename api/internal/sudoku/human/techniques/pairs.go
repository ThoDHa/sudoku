package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// DetectNakedPair finds two cells in a unit with the same two candidates
func DetectNakedPair(b BoardInterface) *core.Move {
	for _, unit := range AllUnits() {
		if move := findNakedPairInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findNakedPairInUnit(b BoardInterface, indices []int, unitType string, unitNum int) *core.Move {
	// Find cells with exactly 2 candidates
	var pairs []int
	for _, idx := range indices {
		if b.GetCandidatesAt(idx).Count() == 2 {
			pairs = append(pairs, idx)
		}
	}

	// Check for matching pairs
	for i := 0; i < len(pairs); i++ {
		for j := i + 1; j < len(pairs); j++ {
			idx1, idx2 := pairs[i], pairs[j]
			if b.GetCandidatesAt(idx1) == b.GetCandidatesAt(idx2) {
				// Found a naked pair
				digits := b.GetCandidatesAt(idx1).ToSlice()
				var eliminations []core.Candidate

				for _, idx := range indices {
					if idx == idx1 || idx == idx2 {
						continue
					}
					for _, d := range digits {
						if b.GetCandidatesAt(idx).Has(d) {
							eliminations = append(eliminations, core.Candidate{
								Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: d,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					r1, c1 := idx1/constants.GridSize, idx1%constants.GridSize
					r2, c2 := idx2/constants.GridSize, idx2%constants.GridSize
					return &core.Move{
						Action: "eliminate",
						Digit:  0,
						Targets: []core.CellRef{
							{Row: r1, Col: c1},
							{Row: r2, Col: c2},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Naked Pair {%d,%d} in %s %d at R%dC%d and R%dC%d", digits[0], digits[1], unitType, unitNum, r1+1, c1+1, r2+1, c2+1),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: r1, Col: c1},
								{Row: r2, Col: c2},
							},
						},
					}
				}
			}
		}
	}

	return nil
}

// DetectHiddenPair finds two digits that only appear in two cells within a unit
func DetectHiddenPair(b BoardInterface) *core.Move {
	for _, unit := range AllUnits() {
		if move := findHiddenPairInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findHiddenPairInUnit(b BoardInterface, indices []int, unitType string, unitNum int) *core.Move {
	// Find positions for each digit
	digitPositions := make(map[int][]int)
	for digit := 1; digit <= constants.GridSize; digit++ {
		for _, idx := range indices {
			if b.GetCandidatesAt(idx).Has(digit) {
				digitPositions[digit] = append(digitPositions[digit], idx)
			}
		}
	}

	// Find digits that appear in exactly 2 cells
	var twoDigits []int
	for digit, positions := range digitPositions {
		if len(positions) == 2 {
			twoDigits = append(twoDigits, digit)
		}
	}

	// Check for pairs
	for i := 0; i < len(twoDigits); i++ {
		for j := i + 1; j < len(twoDigits); j++ {
			d1, d2 := twoDigits[i], twoDigits[j]
			pos1, pos2 := digitPositions[d1], digitPositions[d2]

			// Check if same two positions
			if len(pos1) == 2 && len(pos2) == 2 &&
				pos1[0] == pos2[0] && pos1[1] == pos2[1] {
				idx1, idx2 := pos1[0], pos1[1]

				// Check if there are other candidates to eliminate
				var eliminations []core.Candidate
				for _, idx := range []int{idx1, idx2} {
					for _, d := range b.GetCandidatesAt(idx).ToSlice() {
						if d != d1 && d != d2 {
							eliminations = append(eliminations, core.Candidate{
								Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: d,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					r1, c1 := idx1/constants.GridSize, idx1%constants.GridSize
					r2, c2 := idx2/constants.GridSize, idx2%constants.GridSize
					return &core.Move{
						Action: "eliminate",
						Digit:  0,
						Targets: []core.CellRef{
							{Row: r1, Col: c1},
							{Row: r2, Col: c2},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Hidden Pair {%d,%d} in %s %d at R%dC%d and R%dC%d", d1, d2, unitType, unitNum, r1+1, c1+1, r2+1, c2+1),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: r1, Col: c1},
								{Row: r2, Col: c2},
							},
						},
					}
				}
			}
		}
	}

	return nil
}
