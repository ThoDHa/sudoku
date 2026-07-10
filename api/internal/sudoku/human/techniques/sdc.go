package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// DetectSueDeCoq finds Sue de Coq (Two-Sector Disjoint Subset) patterns.
//
// A Sue de Coq occurs at the intersection of a box and a line (row/column):
//   - The intersection has 2-3 cells with N candidates total
//   - Find an Almost Locked Set (ALS) in the REST of the box (not in the line)
//     that shares some candidates with the intersection
//   - Find an ALS in the REST of the line (not in the box) that shares other candidates
//   - If the two ALS together cover all N candidates with no overlap, eliminations can be made:
//   - Eliminate ALS-A candidates from rest of box
//   - Eliminate ALS-B candidates from rest of line
func DetectSueDeCoq(b BoardInterface) *core.Move {
	// Try each box
	for box := 0; box < constants.GridSize; box++ {
		boxRow, boxCol := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize

		// Try rows intersecting this box
		for r := boxRow; r < boxRow+constants.BoxSize; r++ {
			if move := detectSueDeCoqIntersection(b, box, r, true); move != nil {
				return move
			}
		}

		// Try columns intersecting this box
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			if move := detectSueDeCoqIntersection(b, box, c, false); move != nil {
				return move
			}
		}
	}

	return nil
}

// detectSueDeCoqIntersection checks for Sue de Coq at a box/line intersection
// isRow indicates whether lineIdx is a row (true) or column (false)
func detectSueDeCoqIntersection(b BoardInterface, box int, lineIdx int, isRow bool) *core.Move {
	boxRow, boxCol := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize

	// Get intersection cells (cells that are in both box and line)
	intersectionCells := sdcIntersectionCells(b, boxRow, boxCol, lineIdx, isRow)

	// Need 2 or 3 intersection cells
	if len(intersectionCells) < 2 || len(intersectionCells) > 3 {
		return nil
	}

	// Get combined candidates of intersection cells
	var intersectionCands Candidates
	for _, idx := range intersectionCells {
		intersectionCands = intersectionCands.Union(b.GetCandidatesAt(idx))
	}
	intersectionDigits := intersectionCands.ToSlice()

	// For a valid Sue de Coq with N intersection cells:
	// We need at least N+2 candidates (to cover with 2 ALS)
	// The simpler case: 2 cells with 4 candidates, each ALS covers 2
	if len(intersectionDigits) < len(intersectionCells)+2 {
		return nil
	}

	// Get box remainder cells (in box but not in intersection)
	boxRemainderCells := sdcBoxRemainder(b, boxRow, boxCol, intersectionCells)

	// Get line remainder cells (in line but not in intersection)
	lineRemainderCells := sdcLineRemainder(b, boxRow, boxCol, lineIdx, isRow)

	// Find ALS candidates in box remainder that share candidates with intersection
	boxALSList := findALSInCells(b, boxRemainderCells, intersectionDigits)

	// Find ALS candidates in line remainder that share candidates with intersection
	lineALSList := findALSInCells(b, lineRemainderCells, intersectionDigits)

	// Try all combinations of box-ALS and line-ALS
	for _, boxALS := range boxALSList {
		for _, lineALS := range lineALSList {
			if m := trySDCPair(b, box, lineIdx, isRow, intersectionCells, intersectionDigits, intersectionCands, boxALS, lineALS); m != nil {
				return m
			}
		}
	}

	return nil
}

// trySDCPair validates one (boxALS, lineALS) pair against the Sue de Coq
// requirements and returns the elimination move if the pair fits the pattern.
func trySDCPair(b BoardInterface, box, lineIdx int, isRow bool, intersectionCells, intersectionDigits []int, intersectionCands Candidates, boxALS, lineALS ALS) *core.Move {
	if digitsOverlap(boxALS.Digits, lineALS.Digits) {
		return nil
	}
	combinedALS := NewCandidates(boxALS.Digits).Union(NewCandidates(lineALS.Digits))
	if combinedALS != intersectionCands {
		return nil
	}
	boxRow, boxCol := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize
	eliminations := collectSDCEliminations(b, boxRow, boxCol, lineIdx, isRow, intersectionCells, boxALS, lineALS)
	if len(eliminations) == 0 {
		return nil
	}
	return buildSDCMove(box, lineIdx, isRow, intersectionCells, intersectionDigits, boxALS, lineALS, eliminations)
}

// buildSDCMove assembles the Sue de Coq elimination move.
func buildSDCMove(box, lineIdx int, isRow bool, intersectionCells, intersectionDigits []int, boxALS, lineALS ALS, eliminations []core.Candidate) *core.Move {
	targets, primary, secondary := sdcHighlights(intersectionCells, boxALS, lineALS)
	lineType := "row"
	if !isRow {
		lineType = "column"
	}
	return &core.Move{
		Action:       "eliminate",
		Digit:        0,
		Targets:      targets,
		Eliminations: eliminations,
		Explanation: fmt.Sprintf("Sue de Coq: intersection of box %d and %s %d with candidates {%s}; "+
			"box ALS {%s} covers {%s}, %s ALS {%s} covers {%s}",
			box+1, lineType, lineIdx+1,
			FormatDigits(intersectionDigits),
			FormatCells(boxALS.Cells), FormatDigits(boxALS.Digits),
			lineType, FormatCells(lineALS.Cells), FormatDigits(lineALS.Digits)),
		Highlights: core.Highlights{
			Primary:   primary,
			Secondary: secondary,
		},
	}
}

// sdcHighlights builds the (targets, primary, secondary) highlight lists for a
// Sue de Coq move: primary is the intersection cells, secondary is the two ALS.
func sdcHighlights(intersectionCells []int, boxALS, lineALS ALS) (targets, primary, secondary []core.CellRef) {
	appendRefs := func(cells []int) {
		for _, idx := range cells {
			ref := core.CellRef{Row: idx / constants.GridSize, Col: idx % constants.GridSize}
			targets = append(targets, ref)
		}
	}
	appendRefs(intersectionCells)
	primary = append(primary, targets...)
	for _, idx := range boxALS.Cells {
		ref := core.CellRef{Row: idx / constants.GridSize, Col: idx % constants.GridSize}
		targets = append(targets, ref)
		secondary = append(secondary, ref)
	}
	for _, idx := range lineALS.Cells {
		ref := core.CellRef{Row: idx / constants.GridSize, Col: idx % constants.GridSize}
		targets = append(targets, ref)
		secondary = append(secondary, ref)
	}
	return targets, primary, secondary
}

// collectSDCEliminations walks the box and the line for a Sue de Coq pattern and
// returns the eliminations implied by the two ALS sets.
func collectSDCEliminations(b BoardInterface, boxRow, boxCol, lineIdx int, isRow bool, intersectionCells []int, boxALS, lineALS ALS) []core.Candidate {
	var eliminations []core.Candidate
	eliminations = append(eliminations, sdcBoxEliminations(b, boxRow, boxCol, intersectionCells, boxALS)...)
	eliminations = append(eliminations, sdcLineEliminations(b, boxRow, boxCol, lineIdx, isRow, lineALS)...)
	return eliminations
}

// sdcBoxEliminations walks the 3x3 box and collects boxALS-digit candidates from
// cells that are not in the intersection and not in boxALS.
func sdcBoxEliminations(b BoardInterface, boxRow, boxCol int, intersectionCells []int, boxALS ALS) []core.Candidate {
	var eliminations []core.Candidate
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			idx := r*constants.GridSize + c
			if b.GetCell(idx) != 0 {
				continue
			}
			if cellIndexInList(idx, intersectionCells) || cellIndexInList(idx, boxALS.Cells) {
				continue
			}
			for _, d := range boxALS.Digits {
				if b.GetCandidatesAt(idx).Has(d) {
					eliminations = append(eliminations, core.Candidate{Row: r, Col: c, Digit: d})
				}
			}
		}
	}
	return eliminations
}

// sdcLineEliminations walks the line outside the box and collects lineALS-digit
// candidates from cells that are not in lineALS.
func sdcLineEliminations(b BoardInterface, boxRow, boxCol, lineIdx int, isRow bool, lineALS ALS) []core.Candidate {
	boxStart, boxEnd := boxCol, boxCol+constants.BoxSize
	if !isRow {
		boxStart, boxEnd = boxRow, boxRow+constants.BoxSize
	}
	var eliminations []core.Candidate
	for k := 0; k < constants.GridSize; k++ {
		if k >= boxStart && k < boxEnd {
			continue
		}
		var idx, row, col int
		if isRow {
			idx, row, col = lineIdx*constants.GridSize+k, lineIdx, k
		} else {
			idx, row, col = k*constants.GridSize+lineIdx, k, lineIdx
		}
		if b.GetCell(idx) != 0 || cellIndexInList(idx, lineALS.Cells) {
			continue
		}
		for _, d := range lineALS.Digits {
			if b.GetCandidatesAt(idx).Has(d) {
				eliminations = append(eliminations, core.Candidate{Row: row, Col: col, Digit: d})
			}
		}
	}
	return eliminations
}

// cellIndexInList reports whether idx appears in list.
func cellIndexInList(idx int, list []int) bool {
	for _, x := range list {
		if x == idx {
			return true
		}
	}
	return false
}

// sdcIntersectionCells returns the empty cells (with candidates) at the box/line
// intersection.
func sdcIntersectionCells(b BoardInterface, boxRow, boxCol, lineIdx int, isRow bool) []int {
	var cells []int
	if isRow {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			idx := lineIdx*constants.GridSize + c
			if b.GetCell(idx) == 0 && b.GetCandidatesAt(idx).Count() > 0 {
				cells = append(cells, idx)
			}
		}
	} else {
		for r := boxRow; r < boxRow+constants.BoxSize; r++ {
			idx := r*constants.GridSize + lineIdx
			if b.GetCell(idx) == 0 && b.GetCandidatesAt(idx).Count() > 0 {
				cells = append(cells, idx)
			}
		}
	}
	return cells
}

// sdcBoxRemainder returns the empty candidate-bearing cells in the box that are
// not in the intersection.
func sdcBoxRemainder(b BoardInterface, boxRow, boxCol int, intersectionCells []int) []int {
	var cells []int
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			idx := r*constants.GridSize + c
			if b.GetCell(idx) != 0 || b.GetCandidatesAt(idx).Count() == 0 {
				continue
			}
			if !cellIndexInList(idx, intersectionCells) {
				cells = append(cells, idx)
			}
		}
	}
	return cells
}

// sdcLineRemainder returns the empty candidate-bearing cells in the line that
// are outside the box.
func sdcLineRemainder(b BoardInterface, boxRow, boxCol, lineIdx int, isRow bool) []int {
	boxStart, boxEnd := boxCol, boxCol+constants.BoxSize
	if !isRow {
		boxStart, boxEnd = boxRow, boxRow+constants.BoxSize
	}
	var cells []int
	for k := 0; k < constants.GridSize; k++ {
		if k >= boxStart && k < boxEnd {
			continue
		}
		var idx int
		if isRow {
			idx = lineIdx*constants.GridSize + k
		} else {
			idx = k*constants.GridSize + lineIdx
		}
		if b.GetCell(idx) == 0 && b.GetCandidatesAt(idx).Count() > 0 {
			cells = append(cells, idx)
		}
	}
	return cells
}

// findALSInCells finds Almost Locked Sets within the given cells
// that share at least one digit with the intersection digits.
// The ALS may contain extra digits - we filter by overlap, not exact match.
func findALSInCells(b BoardInterface, cells []int, intersectionDigits []int) []ALS {
	var result []ALS
	intersectionSet := NewCandidates(intersectionDigits)

	// Try ALS of size 1 (bivalue cell - 1 cell with 2 candidates)
	for _, cell := range cells {
		result = append(result, alsFromCells(b, []int{cell}, intersectionSet)...)
	}

	// Try ALS of size 2 (2 cells with 3 candidates total)
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			result = append(result, alsFromCells(b, []int{cells[i], cells[j]}, intersectionSet)...)
		}
	}

	// Try ALS of size 3 (3 cells with 4 candidates total) - less common but possible
	// i<=len is harmless; the inner j/k loops never dereference cells[i] at i==len
	// mutator-disable-next-line expression/comparison
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			for k := j + 1; k < len(cells); k++ {
				result = append(result, alsFromCells(b, []int{cells[i], cells[j], cells[k]}, intersectionSet)...)
			}
		}
	}

	return result
}

// alsFromCells returns the ALS formed by cells if it satisfies the Almost Locked
// Set property (N cells holding exactly N+1 candidates) and shares at least one
// digit with intersectionSet. Returns nil otherwise.
func alsFromCells(b BoardInterface, cells []int, intersectionSet Candidates) []ALS {
	combined := Candidates(0)
	for _, c := range cells {
		combined = combined.Union(b.GetCandidatesAt(c))
	}
	if combined.Count() != len(cells)+1 {
		return nil
	}
	if combined.Intersect(intersectionSet) == 0 {
		return nil
	}
	overlapDigits := combined.Intersect(intersectionSet).ToSlice()
	byDigit := make(map[int][]int)
	for _, d := range combined.ToSlice() {
		for _, c := range cells {
			if b.GetCandidatesAt(c).Has(d) {
				byDigit[d] = append(byDigit[d], c)
			}
		}
	}
	return []ALS{{
		Cells:   cells,
		Digits:  overlapDigits,
		ByDigit: byDigit,
	}}
}

// digitsOverlap returns true if the two digit slices share any common digit
func digitsOverlap(a, b []int) bool {
	return NewCandidates(a).Intersect(NewCandidates(b)) != 0
}
