package techniques

import (
	"fmt"
	"maps"
	"slices"

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
	for i := range pairs {
		for j := i + 1; j < len(pairs); j++ {
			idx1, idx2 := pairs[i], pairs[j]
			if b.GetCandidatesAt(idx1) != b.GetCandidatesAt(idx2) {
				continue
			}
			digits := b.GetCandidatesAt(idx1).ToSlice()
			eliminations := pairEliminationsOutside(b, idx1, idx2, digits, indices)
			if len(eliminations) == 0 {
				continue
			}
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
					Secondary: ToCellRefs(indices),
				},
			}
		}
	}

	return nil
}

// pairEliminationsOutside collects candidates of digit in cells of indices that
// are not idx1 or idx2.
func pairEliminationsOutside(b BoardInterface, idx1, idx2 int, digits []int, indices []int) []core.Candidate {
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
	return eliminations
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

	// Find digits that appear in exactly 2 cells, in sorted order so the
	// hidden pair returned is deterministic across runs.
	var twoDigits []int
	for _, digit := range slices.Sorted(maps.Keys(digitPositions)) {
		if len(digitPositions[digit]) == 2 {
			twoDigits = append(twoDigits, digit)
		}
	}

	// Check for pairs
	for i := range twoDigits {
		for j := i + 1; j < len(twoDigits); j++ {
			d1, d2 := twoDigits[i], twoDigits[j]
			pos1, pos2 := digitPositions[d1], digitPositions[d2]
			if !samePositions(pos1, pos2) {
				continue
			}
			move := buildHiddenPairMove(b, d1, d2, pos1[0], pos1[1], unitType, unitNum, indices)
			if move != nil {
				return move
			}
		}
	}

	return nil
}

// samePositions reports whether two position slices of length 2 reference the
// same cell indices.
func samePositions(pos1, pos2 []int) bool {
	return len(pos1) == 2 && len(pos2) == 2 &&
		pos1[0] == pos2[0] && pos1[1] == pos2[1]
}

// buildHiddenPairMove eliminates digits other than (d1, d2) from the two paired
// cells and returns the elimination move if any candidates were eliminated.
// unitCells is used for secondary highlighting.
func buildHiddenPairMove(b BoardInterface, d1, d2, idx1, idx2 int, unitType string, unitNum int, unitCells []int) *core.Move {
	pairDigits := map[int]bool{d1: true, d2: true}
	var eliminations []core.Candidate
	for _, idx := range []int{idx1, idx2} {
		for _, d := range b.GetCandidatesAt(idx).ToSlice() {
			if !pairDigits[d] {
				eliminations = append(eliminations, core.Candidate{
					Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: d,
				})
			}
		}
	}
	if len(eliminations) == 0 {
		return nil
	}
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
			Secondary: ToCellRefs(unitCells),
		},
	}
}
