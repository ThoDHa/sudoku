package techniques

import (
	"fmt"
	"maps"
	"slices"
	"strconv"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// DetectNakedTriple finds three cells in a unit with candidates that are a subset of three digits
func DetectNakedTriple(b BoardInterface) *core.Move {
	for _, unit := range AllUnits() {
		if move := findNakedTripleInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findNakedTripleInUnit(b BoardInterface, indices []int, unitType string, unitNum int) *core.Move {
	return findNakedSubsetInUnit(b, 3, "Naked Triple", indices, unitType, unitNum)
}

// findNakedSubsetInUnit searches a unit for N cells whose candidates union to
// exactly N digits, and returns the elimination move for those digits in the
// unit's other cells. subsetSize is 3 (triple) or 4 (quad); name labels the
// technique in the explanation.
func findNakedSubsetInUnit(b BoardInterface, subsetSize int, name string, indices []int, unitType string, unitNum int) *core.Move {
	var candidates []int
	for _, idx := range indices {
		n := b.GetCandidatesAt(idx).Count()
		// A solved cell or a naked single cannot be a subset member.
		if n < 2 {
			continue
		}
		// A cell holding more digits than the subset can contain is rejected by
		// the union check in tryNakedSubset, so this bound only keeps the
		// combination count down. Letting such a cell through changes no result.
		// mutator-disable-next-line branch/if
		if n > subsetSize {
			continue
		}
		candidates = append(candidates, idx)
	}
	// Too few cells to choose from is not checked here: combinationsSizeK
	// returns without a single call when the size exceeds the pool.
	var found *core.Move
	combinationsSizeK(candidates, subsetSize, func(combo []int) bool {
		m := tryNakedSubset(b, combo, indices, unitType, unitNum, name)
		if m != nil {
			found = m
			return true
		}
		return false
	})
	return found
}

// tryNakedSubset validates one combination of cells as a naked subset and
// returns the elimination move if the union of candidates equals subsetSize and
// produces eliminations in other unit cells.
func tryNakedSubset(b BoardInterface, subsetCells []int, unitCells []int, unitType string, unitNum int, name string) *core.Move {
	var union Candidates
	for _, c := range subsetCells {
		union = union.Union(b.GetCandidatesAt(c))
	}
	if union.Count() != len(subsetCells) {
		return nil
	}
	digits := union.ToSlice()
	skip := map[int]bool{}
	for _, c := range subsetCells {
		skip[c] = true
	}
	var eliminations []core.Candidate
	for _, idx := range unitCells {
		if skip[idx] {
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
	if len(eliminations) == 0 {
		return nil
	}
	targets := indicesToCellRefs(subsetCells)
	return &core.Move{
		Action:       "eliminate",
		Targets:      targets,
		Eliminations: eliminations,
		Explanation:  fmt.Sprintf("%s %s in %s %d", name, formatDigitsBraced(digits), unitType, unitNum),
		Highlights:   core.Highlights{Primary: targets},
	}
}

// combinationsSizeK iterates all k-combinations of items in lexicographic order,
// invoking fn for each. fn returns true to stop iteration early.
func combinationsSizeK(items []int, k int, fn func(combo []int) bool) {
	n := len(items)
	if k < 0 || k > n {
		return
	}
	indices := make([]int, k)
	for i := range k {
		indices[i] = i
	}
	combo := make([]int, k)
	for {
		for i, idx := range indices {
			combo[i] = items[idx]
		}
		if fn(combo) {
			return
		}
		if !advanceCombination(indices, n) {
			return
		}
	}
}

// advanceCombination moves indices to the next lexicographic k-combination of
// n items, returning false when the last combination has been passed.
func advanceCombination(indices []int, n int) bool {
	k := len(indices)
	i := k - 1
	for i >= 0 && indices[i] == i+n-k {
		i--
	}
	if i < 0 {
		return false
	}
	indices[i]++
	for j := i + 1; j < k; j++ {
		indices[j] = indices[j-1] + 1
	}
	return true
}

// indicesToCellRefs converts a slice of cell indices to CellRefs.
func indicesToCellRefs(cells []int) []core.CellRef {
	refs := make([]core.CellRef, len(cells))
	for i, c := range cells {
		refs[i] = core.CellRef{Row: c / constants.GridSize, Col: c % constants.GridSize}
	}
	return refs
}

// formatDigitsBraced formats digits as "{1,2,3}" (compact, no spaces).
func formatDigitsBraced(digits []int) string {
	var b []byte
	b = append(b, '{')
	for i, d := range digits {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, strconv.Itoa(d)...)
	}
	b = append(b, '}')
	return string(b)
}

// DetectHiddenTriple finds three digits that only appear in three cells within a unit
func DetectHiddenTriple(b BoardInterface) *core.Move {
	for _, unit := range AllUnits() {
		if move := findHiddenTripleInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findHiddenTripleInUnit(b BoardInterface, indices []int, unitType string, unitNum int) *core.Move {
	return findHiddenSubsetInUnit(b, 3, "Hidden Triple", indices, unitType, unitNum)
}

// findHiddenSubsetInUnit searches a unit for N digits whose candidate positions
// union to exactly N cells, and returns the elimination move for the cells'
// other candidates. subsetSize is 3 (triple) or 4 (quad); name labels the
// technique in the explanation.
func findHiddenSubsetInUnit(b BoardInterface, subsetSize int, name string, indices []int, unitType string, unitNum int) *core.Move {
	digitPositions := map[int][]int{}
	// Lowering the first digit only adds passes for digits no cell can hold:
	// Candidates.Has rejects anything below 1.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		for _, idx := range indices {
			if b.GetCandidatesAt(idx).Has(digit) {
				digitPositions[digit] = append(digitPositions[digit], idx)
			}
		}
	}
	// Sorted so the subset combination tried first is deterministic across runs.
	var smallDigits []int
	for _, digit := range slices.Sorted(maps.Keys(digitPositions)) {
		positions := digitPositions[digit]
		// A digit with one position is a hidden single, not a subset member.
		if len(positions) < 2 {
			continue
		}
		// A digit spread over more cells than the subset holds is rejected by
		// the position-union check in tryHiddenSubset, so this bound only keeps
		// the combination count down. Letting such a digit through changes no
		// result.
		// mutator-disable-next-line branch/if
		if len(positions) > subsetSize {
			continue
		}
		smallDigits = append(smallDigits, digit)
	}
	// Too few digits to choose from is not checked here: combinationsSizeK
	// returns without a single call when the size exceeds the pool.
	var found *core.Move
	combinationsSizeK(smallDigits, subsetSize, func(combo []int) bool {
		m := tryHiddenSubset(b, combo, digitPositions, unitType, unitNum, name)
		if m != nil {
			found = m
			return true
		}
		return false
	})
	return found
}

// tryHiddenSubset validates one combination of digits as a hidden subset and
// returns the elimination move if the union of their positions equals the digit
// count and produces eliminations of other digits in those cells.
func tryHiddenSubset(b BoardInterface, subsetDigits []int, digitPositions map[int][]int, unitType string, unitNum int, name string) *core.Move {
	posUnion := map[int]bool{}
	for _, d := range subsetDigits {
		for _, idx := range digitPositions[d] {
			posUnion[idx] = true
		}
	}
	if len(posUnion) != len(subsetDigits) {
		return nil
	}
	// Sorted so the returned Eliminations and Targets arrays are deterministic.
	cells := slices.Sorted(maps.Keys(posUnion))
	digitSet := NewCandidates(subsetDigits)
	var eliminations []core.Candidate
	for _, idx := range cells {
		for _, d := range b.GetCandidatesAt(idx).ToSlice() {
			if !digitSet.Has(d) {
				eliminations = append(eliminations, core.Candidate{
					Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: d,
				})
			}
		}
	}
	if len(eliminations) == 0 {
		return nil
	}
	targets := indicesToCellRefs(cells)
	return &core.Move{
		Action:       "eliminate",
		Targets:      targets,
		Eliminations: eliminations,
		Explanation:  fmt.Sprintf("%s %s in %s %d", name, formatDigitsBraced(subsetDigits), unitType, unitNum),
		Highlights:   core.Highlights{Primary: targets},
	}
}

// DetectNakedQuad finds four cells with candidates that are a subset of four digits
func DetectNakedQuad(b BoardInterface) *core.Move {
	for _, unit := range AllUnits() {
		if move := findNakedQuadInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findNakedQuadInUnit(b BoardInterface, indices []int, unitType string, unitNum int) *core.Move {
	return findNakedSubsetInUnit(b, 4, "Naked Quad", indices, unitType, unitNum)
}

// DetectHiddenQuad finds four digits that only appear in four cells
func DetectHiddenQuad(b BoardInterface) *core.Move {
	for _, unit := range AllUnits() {
		if move := findHiddenQuadInUnit(b, unit.Cells, unit.Type.String(), unit.Index+1); move != nil {
			return move
		}
	}
	return nil
}

func findHiddenQuadInUnit(b BoardInterface, indices []int, unitType string, unitNum int) *core.Move {
	return findHiddenSubsetInUnit(b, 4, "Hidden Quad", indices, unitType, unitNum)
}
