package human

import (
	"fmt"
	"sort"

	"sudoku-api/internal/core"
)

// detectSueDeCoq finds Sue de Coq (Two-Sector Disjoint Subset) patterns.
//
// A Sue de Coq occurs at the intersection of a box and a line (row/column):
//   - The intersection has 2-3 cells with N candidates total
//   - Find an Almost Locked Set (ALS) in the REST of the box (not in the line)
//     that shares some candidates with the intersection
//   - Find an ALS in the REST of the line (not in the box) that shares other candidates
//   - If the two ALS together cover all N candidates with no overlap, eliminations can be made:
//   - Eliminate ALS-A candidates from rest of box
//   - Eliminate ALS-B candidates from rest of line
func detectSueDeCoq(b *Board) *core.Move {
	// Try each box
	for box := 0; box < 9; box++ {
		boxRow, boxCol := (box/3)*3, (box%3)*3

		// Try rows intersecting this box
		for r := boxRow; r < boxRow+3; r++ {
			if move := detectSueDeCoqIntersection(b, box, r, true); move != nil {
				return move
			}
		}

		// Try columns intersecting this box
		for c := boxCol; c < boxCol+3; c++ {
			if move := detectSueDeCoqIntersection(b, box, c, false); move != nil {
				return move
			}
		}
	}

	return nil
}

// detectSueDeCoqIntersection checks for Sue de Coq at a box/line intersection
// isRow indicates whether lineIdx is a row (true) or column (false)
func detectSueDeCoqIntersection(b *Board, box int, lineIdx int, isRow bool) *core.Move {
	boxRow, boxCol := (box/3)*3, (box%3)*3

	// Get intersection cells (cells that are in both box and line)
	var intersectionCells []int
	if isRow {
		for c := boxCol; c < boxCol+3; c++ {
			idx := lineIdx*9 + c
			if b.Cells[idx] == 0 && b.Candidates[idx].Count() > 0 {
				intersectionCells = append(intersectionCells, idx)
			}
		}
	} else {
		for r := boxRow; r < boxRow+3; r++ {
			idx := r*9 + lineIdx
			if b.Cells[idx] == 0 && b.Candidates[idx].Count() > 0 {
				intersectionCells = append(intersectionCells, idx)
			}
		}
	}

	// Need 2 or 3 intersection cells
	if len(intersectionCells) < 2 || len(intersectionCells) > 3 {
		return nil
	}

	// Get combined candidates of intersection cells
	intersectionCands := make(map[int]bool)
	for _, idx := range intersectionCells {
		for _, d := range b.Candidates[idx].ToSlice() {
			intersectionCands[d] = true
		}
	}
	intersectionDigits := getCandidateSlice(intersectionCands)

	// For a valid Sue de Coq with N intersection cells:
	// We need at least N+2 candidates (to cover with 2 ALS)
	// The simpler case: 2 cells with 4 candidates, each ALS covers 2
	if len(intersectionDigits) < len(intersectionCells)+2 {
		return nil
	}

	// Get box remainder cells (in box but not in intersection)
	var boxRemainderCells []int
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			idx := r*9 + c
			if b.Cells[idx] != 0 || b.Candidates[idx].Count() == 0 {
				continue
			}
			// Check if in intersection
			inIntersection := false
			for _, iCell := range intersectionCells {
				if idx == iCell {
					inIntersection = true
					break
				}
			}
			if !inIntersection {
				boxRemainderCells = append(boxRemainderCells, idx)
			}
		}
	}

	// Get line remainder cells (in line but not in intersection)
	var lineRemainderCells []int
	if isRow {
		for c := 0; c < 9; c++ {
			// Skip cells in the box
			if c >= boxCol && c < boxCol+3 {
				continue
			}
			idx := lineIdx*9 + c
			if b.Cells[idx] == 0 && b.Candidates[idx].Count() > 0 {
				lineRemainderCells = append(lineRemainderCells, idx)
			}
		}
	} else {
		for r := 0; r < 9; r++ {
			// Skip cells in the box
			if r >= boxRow && r < boxRow+3 {
				continue
			}
			idx := r*9 + lineIdx
			if b.Cells[idx] == 0 && b.Candidates[idx].Count() > 0 {
				lineRemainderCells = append(lineRemainderCells, idx)
			}
		}
	}

	// Find ALS candidates in box remainder that share candidates with intersection
	boxALSList := findALSInCells(b, boxRemainderCells, intersectionDigits)

	// Find ALS candidates in line remainder that share candidates with intersection
	lineALSList := findALSInCells(b, lineRemainderCells, intersectionDigits)

	// Try all combinations of box-ALS and line-ALS
	for _, boxALS := range boxALSList {
		for _, lineALS := range lineALSList {
			// The ALS candidates must not overlap
			if digitsOverlap(boxALS.Digits, lineALS.Digits) {
				continue
			}

			// Combined ALS candidates must cover all intersection candidates exactly
			combinedALS := make(map[int]bool)
			for _, d := range boxALS.Digits {
				combinedALS[d] = true
			}
			for _, d := range lineALS.Digits {
				combinedALS[d] = true
			}

			// Check if combined covers exactly the intersection candidates
			if len(combinedALS) != len(intersectionDigits) {
				continue
			}
			coversAll := true
			for _, d := range intersectionDigits {
				if !combinedALS[d] {
					coversAll = false
					break
				}
			}
			if !coversAll {
				continue
			}

			// Found a valid Sue de Coq pattern! Now find eliminations.
			var eliminations []core.Candidate

			// Eliminate boxALS digits from rest of box (excluding intersection and boxALS cells)
			for r := boxRow; r < boxRow+3; r++ {
				for c := boxCol; c < boxCol+3; c++ {
					idx := r*9 + c
					if b.Cells[idx] != 0 {
						continue
					}

					// Skip intersection cells
					inIntersection := false
					for _, iCell := range intersectionCells {
						if idx == iCell {
							inIntersection = true
							break
						}
					}
					if inIntersection {
						continue
					}

					// Skip boxALS cells
					inBoxALS := false
					for _, aCell := range boxALS.Cells {
						if idx == aCell {
							inBoxALS = true
							break
						}
					}
					if inBoxALS {
						continue
					}

					// Eliminate boxALS digits
					for _, d := range boxALS.Digits {
						if b.Candidates[idx].Has(d) {
							eliminations = append(eliminations, core.Candidate{
								Row: r, Col: c, Digit: d,
							})
						}
					}
				}
			}

			// Eliminate lineALS digits from rest of line (excluding intersection and lineALS cells)
			if isRow {
				for c := 0; c < 9; c++ {
					idx := lineIdx*9 + c

					// Skip cells in box
					if c >= boxCol && c < boxCol+3 {
						continue
					}

					if b.Cells[idx] != 0 {
						continue
					}

					// Skip lineALS cells
					inLineALS := false
					for _, aCell := range lineALS.Cells {
						if idx == aCell {
							inLineALS = true
							break
						}
					}
					if inLineALS {
						continue
					}

					// Eliminate lineALS digits
					for _, d := range lineALS.Digits {
						if b.Candidates[idx].Has(d) {
							eliminations = append(eliminations, core.Candidate{
								Row: lineIdx, Col: c, Digit: d,
							})
						}
					}
				}
			} else {
				for r := 0; r < 9; r++ {
					idx := r*9 + lineIdx

					// Skip cells in box
					if r >= boxRow && r < boxRow+3 {
						continue
					}

					if b.Cells[idx] != 0 {
						continue
					}

					// Skip lineALS cells
					inLineALS := false
					for _, aCell := range lineALS.Cells {
						if idx == aCell {
							inLineALS = true
							break
						}
					}
					if inLineALS {
						continue
					}

					// Eliminate lineALS digits
					for _, d := range lineALS.Digits {
						if b.Candidates[idx].Has(d) {
							eliminations = append(eliminations, core.Candidate{
								Row: r, Col: lineIdx, Digit: d,
							})
						}
					}
				}
			}

			if len(eliminations) > 0 {
				// Build targets: intersection cells + both ALS cells
				var targets []core.CellRef
				var primary []core.CellRef
				var secondary []core.CellRef

				for _, idx := range intersectionCells {
					ref := core.CellRef{Row: idx / 9, Col: idx % 9}
					targets = append(targets, ref)
					primary = append(primary, ref)
				}
				for _, idx := range boxALS.Cells {
					ref := core.CellRef{Row: idx / 9, Col: idx % 9}
					targets = append(targets, ref)
					secondary = append(secondary, ref)
				}
				for _, idx := range lineALS.Cells {
					ref := core.CellRef{Row: idx / 9, Col: idx % 9}
					targets = append(targets, ref)
					secondary = append(secondary, ref)
				}

				lineType := "row"
				lineNum := lineIdx + 1
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
						box+1, lineType, lineNum,
						formatDigits(intersectionDigits),
						FormatCells(boxALS.Cells), formatDigits(boxALS.Digits),
						lineType, FormatCells(lineALS.Cells), formatDigits(lineALS.Digits)),
					Highlights: core.Highlights{
						Primary:   primary,
						Secondary: secondary,
					},
				}
			}
		}
	}

	return nil
}

// findALSInCells finds Almost Locked Sets within the given cells
// that share at least one digit with the intersection digits.
// The ALS may contain extra digits - we filter by overlap, not exact match.
func findALSInCells(b *Board, cells []int, intersectionDigits []int) []ALS {
	var result []ALS

	intersectionSet := make(map[int]bool)
	for _, d := range intersectionDigits {
		intersectionSet[d] = true
	}

	// Helper to check if ALS shares at least one digit with intersection
	sharesDigitWithIntersection := func(digits []int) bool {
		for _, d := range digits {
			if intersectionSet[d] {
				return true
			}
		}
		return false
	}

	// Helper to get only intersection-overlapping digits from ALS
	getOverlappingDigits := func(digits []int) []int {
		var overlap []int
		for _, d := range digits {
			if intersectionSet[d] {
				overlap = append(overlap, d)
			}
		}
		return overlap
	}

	// Try ALS of size 1 (bivalue cell - 1 cell with 2 candidates)
	for _, cell := range cells {
		cands := b.Candidates[cell].ToSlice()

		// For ALS: N cells need N+1 candidates
		// 1 cell needs 2 candidates
		if len(cands) != 2 {
			continue
		}

		// Must share at least one digit with intersection
		if !sharesDigitWithIntersection(cands) {
			continue
		}

		// Store only the overlapping digits for matching purposes
		overlapDigits := getOverlappingDigits(cands)

		byDigit := make(map[int][]int)
		for _, d := range cands {
			byDigit[d] = []int{cell}
		}
		result = append(result, ALS{
			Cells:   []int{cell},
			Digits:  overlapDigits, // Only intersection-overlapping digits
			ByDigit: byDigit,
		})
	}

	// Try ALS of size 2 (2 cells with 3 candidates total)
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			combined := make(map[int]bool)
			for _, d := range b.Candidates[cells[i]].ToSlice() {
				combined[d] = true
			}
			for _, d := range b.Candidates[cells[j]].ToSlice() {
				combined[d] = true
			}

			// For ALS: 2 cells need 3 candidates
			if len(combined) != 3 {
				continue
			}

			digits := getCandidateSlice(combined)

			// Must share at least one digit with intersection
			if !sharesDigitWithIntersection(digits) {
				continue
			}

			overlapDigits := getOverlappingDigits(digits)

			byDigit := make(map[int][]int)
			for _, d := range digits {
				if b.Candidates[cells[i]].Has(d) {
					byDigit[d] = append(byDigit[d], cells[i])
				}
				if b.Candidates[cells[j]].Has(d) {
					byDigit[d] = append(byDigit[d], cells[j])
				}
			}
			result = append(result, ALS{
				Cells:   []int{cells[i], cells[j]},
				Digits:  overlapDigits, // Only intersection-overlapping digits
				ByDigit: byDigit,
			})
		}
	}

	// Try ALS of size 3 (3 cells with 4 candidates total) - less common but possible
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			for k := j + 1; k < len(cells); k++ {
				combined := make(map[int]bool)
				for _, d := range b.Candidates[cells[i]].ToSlice() {
					combined[d] = true
				}
				for _, d := range b.Candidates[cells[j]].ToSlice() {
					combined[d] = true
				}
				for _, d := range b.Candidates[cells[k]].ToSlice() {
					combined[d] = true
				}

				// For ALS: 3 cells need 4 candidates
				if len(combined) != 4 {
					continue
				}

				digits := getCandidateSlice(combined)

				// Must share at least one digit with intersection
				if !sharesDigitWithIntersection(digits) {
					continue
				}

				overlapDigits := getOverlappingDigits(digits)

				byDigit := make(map[int][]int)
				for _, d := range digits {
					if b.Candidates[cells[i]].Has(d) {
						byDigit[d] = append(byDigit[d], cells[i])
					}
					if b.Candidates[cells[j]].Has(d) {
						byDigit[d] = append(byDigit[d], cells[j])
					}
					if b.Candidates[cells[k]].Has(d) {
						byDigit[d] = append(byDigit[d], cells[k])
					}
				}
				result = append(result, ALS{
					Cells:   []int{cells[i], cells[j], cells[k]},
					Digits:  overlapDigits, // Only intersection-overlapping digits
					ByDigit: byDigit,
				})
			}
		}
	}

	return result
}

// digitsOverlap returns true if the two digit slices share any common digit
func digitsOverlap(a, b []int) bool {
	set := make(map[int]bool)
	for _, d := range a {
		set[d] = true
	}
	for _, d := range b {
		if set[d] {
			return true
		}
	}
	return false
}

// formatDigits formats a slice of digits for display
func formatDigits(digits []int) string {
	sorted := make([]int, len(digits))
	copy(sorted, digits)
	sort.Ints(sorted)

	result := ""
	for i, d := range sorted {
		if i > 0 {
			result += ","
		}
		result += fmt.Sprintf("%d", d)
	}
	return result
}
