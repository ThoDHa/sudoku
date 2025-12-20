package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectNakedPair finds two cells in a unit with the same two candidates
func detectNakedPair(b *Board) *core.Move {
	// Check rows
	for row := 0; row < 9; row++ {
		if move := findNakedPairInUnit(b, getRowIndices(row), "row", row+1); move != nil {
			return move
		}
	}

	// Check columns
	for col := 0; col < 9; col++ {
		if move := findNakedPairInUnit(b, getColIndices(col), "column", col+1); move != nil {
			return move
		}
	}

	// Check boxes
	for box := 0; box < 9; box++ {
		if move := findNakedPairInUnit(b, getBoxIndices(box), "box", box+1); move != nil {
			return move
		}
	}

	return nil
}

func findNakedPairInUnit(b *Board, indices []int, unitType string, unitNum int) *core.Move {
	// Find cells with exactly 2 candidates
	var pairs []int
	for _, idx := range indices {
		if len(b.Candidates[idx]) == 2 {
			pairs = append(pairs, idx)
		}
	}

	// Check for matching pairs
	for i := 0; i < len(pairs); i++ {
		for j := i + 1; j < len(pairs); j++ {
			idx1, idx2 := pairs[i], pairs[j]
			if candidatesEqual(b.Candidates[idx1], b.Candidates[idx2]) {
				// Found a naked pair
				digits := getCandidateSlice(b.Candidates[idx1])
				var eliminations []core.Candidate

				for _, idx := range indices {
					if idx == idx1 || idx == idx2 {
						continue
					}
					for _, d := range digits {
						if b.Candidates[idx][d] {
							eliminations = append(eliminations, core.Candidate{
								Row: idx / 9, Col: idx % 9, Digit: d,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					r1, c1 := idx1/9, idx1%9
					r2, c2 := idx2/9, idx2%9
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

// detectHiddenPair finds two digits that only appear in two cells within a unit
func detectHiddenPair(b *Board) *core.Move {
	// Check rows
	for row := 0; row < 9; row++ {
		if move := findHiddenPairInUnit(b, getRowIndices(row), "row", row+1); move != nil {
			return move
		}
	}

	// Check columns
	for col := 0; col < 9; col++ {
		if move := findHiddenPairInUnit(b, getColIndices(col), "column", col+1); move != nil {
			return move
		}
	}

	// Check boxes
	for box := 0; box < 9; box++ {
		if move := findHiddenPairInUnit(b, getBoxIndices(box), "box", box+1); move != nil {
			return move
		}
	}

	return nil
}

func findHiddenPairInUnit(b *Board, indices []int, unitType string, unitNum int) *core.Move {
	// Find positions for each digit
	digitPositions := make(map[int][]int)
	for digit := 1; digit <= 9; digit++ {
		for _, idx := range indices {
			if b.Candidates[idx][digit] {
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
					for d := range b.Candidates[idx] {
						if d != d1 && d != d2 {
							eliminations = append(eliminations, core.Candidate{
								Row: idx / 9, Col: idx % 9, Digit: d,
							})
						}
					}
				}

				if len(eliminations) > 0 {
					r1, c1 := idx1/9, idx1%9
					r2, c2 := idx2/9, idx2%9
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

// Helper functions have been moved to helpers.go:
// - getRowIndices
// - getColIndices
// - getBoxIndices
// - candidatesEqual
// - getCandidateSlice
