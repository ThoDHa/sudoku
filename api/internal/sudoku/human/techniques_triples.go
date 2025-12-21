package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectNakedTriple finds three cells in a unit with candidates that are a subset of three digits
func detectNakedTriple(b *Board) *core.Move {
	for _, unit := range AllUnits() {
		if move := findNakedTripleInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findNakedTripleInUnit(b *Board, indices []int, unitType string, unitNum int) *core.Move {
	// Find cells with 2-3 candidates
	var candidates []int
	for _, idx := range indices {
		n := b.Candidates[idx].Count()
		if n >= 2 && n <= 3 {
			candidates = append(candidates, idx)
		}
	}

	if len(candidates) < 3 {
		return nil
	}

	// Try all combinations of 3
	for i := 0; i < len(candidates); i++ {
		for j := i + 1; j < len(candidates); j++ {
			for k := j + 1; k < len(candidates); k++ {
				idx1, idx2, idx3 := candidates[i], candidates[j], candidates[k]

				// Union of candidates
				union := b.Candidates[idx1].Union(b.Candidates[idx2]).Union(b.Candidates[idx3])

				if union.Count() != 3 {
					continue
				}

				digits := union.ToSlice()

				// Find eliminations
				var eliminations []core.Candidate
				for _, idx := range indices {
					if idx == idx1 || idx == idx2 || idx == idx3 {
						continue
					}
					for _, d := range digits {
						if b.Candidates[idx].Has(d) {
							eliminations = append(eliminations, core.Candidate{
								Row: idx / 9, Col: idx % 9, Digit: d,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					return &core.Move{
						Action: "eliminate",
						Targets: []core.CellRef{
							{Row: idx1 / 9, Col: idx1 % 9},
							{Row: idx2 / 9, Col: idx2 % 9},
							{Row: idx3 / 9, Col: idx3 % 9},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Naked Triple {%d,%d,%d} in %s %d", digits[0], digits[1], digits[2], unitType, unitNum),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: idx1 / 9, Col: idx1 % 9},
								{Row: idx2 / 9, Col: idx2 % 9},
								{Row: idx3 / 9, Col: idx3 % 9},
							},
						},
					}
				}
			}
		}
	}

	return nil
}

// detectHiddenTriple finds three digits that only appear in three cells within a unit
func detectHiddenTriple(b *Board) *core.Move {
	for _, unit := range AllUnits() {
		if move := findHiddenTripleInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findHiddenTripleInUnit(b *Board, indices []int, unitType string, unitNum int) *core.Move {
	digitPositions := make(map[int][]int)
	for digit := 1; digit <= 9; digit++ {
		for _, idx := range indices {
			if b.Candidates[idx].Has(digit) {
				digitPositions[digit] = append(digitPositions[digit], idx)
			}
		}
	}

	// Find digits that appear in 2-3 cells
	var smallDigits []int
	for digit, positions := range digitPositions {
		if len(positions) >= 2 && len(positions) <= 3 {
			smallDigits = append(smallDigits, digit)
		}
	}

	if len(smallDigits) < 3 {
		return nil
	}

	// Try all combinations of 3 digits
	for i := 0; i < len(smallDigits); i++ {
		for j := i + 1; j < len(smallDigits); j++ {
			for k := j + 1; k < len(smallDigits); k++ {
				d1, d2, d3 := smallDigits[i], smallDigits[j], smallDigits[k]

				// Union of positions
				posUnion := make(map[int]bool)
				for _, idx := range digitPositions[d1] {
					posUnion[idx] = true
				}
				for _, idx := range digitPositions[d2] {
					posUnion[idx] = true
				}
				for _, idx := range digitPositions[d3] {
					posUnion[idx] = true
				}

				if len(posUnion) != 3 {
					continue
				}

				// Found a hidden triple
				var cells []int
				for idx := range posUnion {
					cells = append(cells, idx)
				}

				var eliminations []core.Candidate
				for _, idx := range cells {
					for _, d := range b.Candidates[idx].ToSlice() {
						if d != d1 && d != d2 && d != d3 {
							eliminations = append(eliminations, core.Candidate{
								Row: idx / 9, Col: idx % 9, Digit: d,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					return &core.Move{
						Action: "eliminate",
						Targets: []core.CellRef{
							{Row: cells[0] / 9, Col: cells[0] % 9},
							{Row: cells[1] / 9, Col: cells[1] % 9},
							{Row: cells[2] / 9, Col: cells[2] % 9},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Hidden Triple {%d,%d,%d} in %s %d", d1, d2, d3, unitType, unitNum),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: cells[0] / 9, Col: cells[0] % 9},
								{Row: cells[1] / 9, Col: cells[1] % 9},
								{Row: cells[2] / 9, Col: cells[2] % 9},
							},
						},
					}
				}
			}
		}
	}

	return nil
}

// detectNakedQuad finds four cells with candidates that are a subset of four digits
func detectNakedQuad(b *Board) *core.Move {
	for _, unit := range AllUnits() {
		if move := findNakedQuadInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findNakedQuadInUnit(b *Board, indices []int, unitType string, unitNum int) *core.Move {
	var candidates []int
	for _, idx := range indices {
		n := b.Candidates[idx].Count()
		if n >= 2 && n <= 4 {
			candidates = append(candidates, idx)
		}
	}

	if len(candidates) < 4 {
		return nil
	}

	for i := 0; i < len(candidates); i++ {
		for j := i + 1; j < len(candidates); j++ {
			for k := j + 1; k < len(candidates); k++ {
				for l := k + 1; l < len(candidates); l++ {
					idxs := []int{candidates[i], candidates[j], candidates[k], candidates[l]}

					union := b.Candidates[idxs[0]].Union(b.Candidates[idxs[1]]).Union(b.Candidates[idxs[2]]).Union(b.Candidates[idxs[3]])

					if union.Count() != 4 {
						continue
					}

					digits := union.ToSlice()

					var eliminations []core.Candidate
					for _, idx := range indices {
						isQuad := false
						for _, qi := range idxs {
							if idx == qi {
								isQuad = true
								break
							}
						}
						if isQuad {
							continue
						}
						for _, d := range digits {
							if b.Candidates[idx].Has(d) {
								eliminations = append(eliminations, core.Candidate{
									Row: idx / 9, Col: idx % 9, Digit: d,
								})
							}
						}
					}

					if len(eliminations) > 0 {
						return &core.Move{
							Action: "eliminate",
							Targets: []core.CellRef{
								{Row: idxs[0] / 9, Col: idxs[0] % 9},
								{Row: idxs[1] / 9, Col: idxs[1] % 9},
								{Row: idxs[2] / 9, Col: idxs[2] % 9},
								{Row: idxs[3] / 9, Col: idxs[3] % 9},
							},
							Eliminations: eliminations,
							Explanation:  fmt.Sprintf("Naked Quad {%d,%d,%d,%d} in %s %d", digits[0], digits[1], digits[2], digits[3], unitType, unitNum),
							Highlights: core.Highlights{
								Primary: []core.CellRef{
									{Row: idxs[0] / 9, Col: idxs[0] % 9},
									{Row: idxs[1] / 9, Col: idxs[1] % 9},
									{Row: idxs[2] / 9, Col: idxs[2] % 9},
									{Row: idxs[3] / 9, Col: idxs[3] % 9},
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

// detectHiddenQuad finds four digits that only appear in four cells
func detectHiddenQuad(b *Board) *core.Move {
	for _, unit := range AllUnits() {
		if move := findHiddenQuadInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findHiddenQuadInUnit(b *Board, indices []int, unitType string, unitNum int) *core.Move {
	digitPositions := make(map[int][]int)
	for digit := 1; digit <= 9; digit++ {
		for _, idx := range indices {
			if b.Candidates[idx].Has(digit) {
				digitPositions[digit] = append(digitPositions[digit], idx)
			}
		}
	}

	// Find digits that appear in 2-4 cells
	var smallDigits []int
	for digit, positions := range digitPositions {
		if len(positions) >= 2 && len(positions) <= 4 {
			smallDigits = append(smallDigits, digit)
		}
	}

	if len(smallDigits) < 4 {
		return nil
	}

	// Try all combinations of 4 digits
	for i := 0; i < len(smallDigits); i++ {
		for j := i + 1; j < len(smallDigits); j++ {
			for k := j + 1; k < len(smallDigits); k++ {
				for l := k + 1; l < len(smallDigits); l++ {
					d1, d2, d3, d4 := smallDigits[i], smallDigits[j], smallDigits[k], smallDigits[l]

					// Union of positions
					posUnion := make(map[int]bool)
					for _, idx := range digitPositions[d1] {
						posUnion[idx] = true
					}
					for _, idx := range digitPositions[d2] {
						posUnion[idx] = true
					}
					for _, idx := range digitPositions[d3] {
						posUnion[idx] = true
					}
					for _, idx := range digitPositions[d4] {
						posUnion[idx] = true
					}

					if len(posUnion) != 4 {
						continue
					}

					// Found a hidden quad
					var cells []int
					for idx := range posUnion {
						cells = append(cells, idx)
					}

					var eliminations []core.Candidate
					for _, idx := range cells {
						for _, d := range b.Candidates[idx].ToSlice() {
							if d != d1 && d != d2 && d != d3 && d != d4 {
								eliminations = append(eliminations, core.Candidate{
									Row: idx / 9, Col: idx % 9, Digit: d,
								})
							}
						}
					}

					if len(eliminations) > 0 {
						return &core.Move{
							Action: "eliminate",
							Targets: []core.CellRef{
								{Row: cells[0] / 9, Col: cells[0] % 9},
								{Row: cells[1] / 9, Col: cells[1] % 9},
								{Row: cells[2] / 9, Col: cells[2] % 9},
								{Row: cells[3] / 9, Col: cells[3] % 9},
							},
							Eliminations: eliminations,
							Explanation:  fmt.Sprintf("Hidden Quad {%d,%d,%d,%d} in %s %d", d1, d2, d3, d4, unitType, unitNum),
							Highlights: core.Highlights{
								Primary: []core.CellRef{
									{Row: cells[0] / 9, Col: cells[0] % 9},
									{Row: cells[1] / 9, Col: cells[1] % 9},
									{Row: cells[2] / 9, Col: cells[2] % 9},
									{Row: cells[3] / 9, Col: cells[3] % 9},
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
