package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Skyscraper Detection
// ============================================================================
//
// A Skyscraper is a pattern involving two rows (or columns) where a digit
// appears exactly twice in each. One end of each pair shares a column (or row),
// forming the "base" of the skyscraper. The other ends (the "tops") are in
// different boxes. Any cell that sees both tops can have the digit eliminated.

// DetectSkyscraper finds Skyscraper pattern: two conjugate pairs sharing one end.
func DetectSkyscraper(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		rowLinks := collectSkyscraperLinks(b, digit, true)
		colLinks := collectSkyscraperLinks(b, digit, false)

		if mv := findSkyscraperInLinks(b, digit, rowLinks, "column"); mv != nil {
			return mv
		}
		if mv := findSkyscraperInLinks(b, digit, colLinks, "row"); mv != nil {
			return mv
		}
	}

	return nil
}

// collectSkyscraperLinks returns, for digit, the pair of cell indices holding it
// in each row (byRow) or column (!byRow) that contains exactly two candidates
// for the digit.
func collectSkyscraperLinks(b BoardInterface, digit int, byRow bool) [][2]int {
	var links [][2]int
	for outer := 0; outer < constants.GridSize; outer++ {
		var cells []int
		for inner := 0; inner < constants.GridSize; inner++ {
			var idx int
			if byRow {
				idx = outer*constants.GridSize + inner
			} else {
				idx = inner*constants.GridSize + outer
			}
			if b.GetCandidatesAt(idx).Has(digit) {
				cells = append(cells, idx)
			}
		}
		if len(cells) == 2 {
			links = append(links, [2]int{cells[0], cells[1]})
		}
	}
	return links
}

// findSkyscraperInLinks returns the first skyscraper move formed by a pair of
// same-orientation links. baseUnit is "column" for row links (base cells share
// a column) and "row" for column links, used in the explanation.
func findSkyscraperInLinks(b BoardInterface, digit int, links [][2]int, baseUnit string) *core.Move {
	for i := 0; i < len(links); i++ {
		for j := i + 1; j < len(links); j++ {
			if mv := buildSkyscraperMove(b, digit, links[i], links[j], baseUnit); mv != nil {
				return mv
			}
		}
	}
	return nil
}

// buildSkyscraperMove evaluates one pair of same-orientation strong links for a
// skyscraper. It tries each way of matching one end of each link as the shared
// base; the remaining ends are the tops. It returns the eliminate move when the
// tops sit in different rows, columns, and boxes and at least one cell sees both.
func buildSkyscraperMove(b BoardInterface, digit int, a, c [2]int, baseUnit string) *core.Move {
	for _, p := range [4][2]int{{0, 0}, {0, 1}, {1, 0}, {1, 1}} {
		base1, top1 := a[p[0]], a[1-p[0]]
		base2, top2 := c[p[1]], c[1-p[1]]

		sharedIdx, ok := sharedRowOrCol(base1, base2)
		if !ok {
			continue
		}
		// Tops sharing a row or column collapse to an X-Wing, not a skyscraper.
		if RowOf(top1) == RowOf(top2) || ColOf(top1) == ColOf(top2) {
			continue
		}
		// The unshared ends must be in different boxes for a proper skyscraper.
		if BoxOf(top1) == BoxOf(top2) {
			continue
		}

		var eliminations []core.Candidate
		for idx := 0; idx < constants.TotalCells; idx++ {
			if !b.GetCandidatesAt(idx).Has(digit) || idx == top1 || idx == top2 {
				continue
			}
			if ArePeers(idx, top1) && ArePeers(idx, top2) {
				eliminations = append(eliminations, core.Candidate{
					Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: digit,
				})
			}
		}
		if len(eliminations) == 0 {
			continue
		}

		pattern := []core.CellRef{
			{Row: RowOf(a[0]), Col: ColOf(a[0])},
			{Row: RowOf(a[1]), Col: ColOf(a[1])},
			{Row: RowOf(c[0]), Col: ColOf(c[0])},
			{Row: RowOf(c[1]), Col: ColOf(c[1])},
		}
		return &core.Move{
			Action:       "eliminate",
			Digit:        digit,
			Targets:      pattern,
			Eliminations: eliminations,
			Explanation:  fmt.Sprintf("Skyscraper: %d with base in %s %d", digit, baseUnit, sharedIdx+1),
			Highlights:   core.Highlights{Primary: pattern},
		}
	}
	return nil
}

func sharedRowOrCol(idxA, idxB int) (int, bool) {
	if RowOf(idxA) == RowOf(idxB) {
		return RowOf(idxA), true
	}
	if ColOf(idxA) == ColOf(idxB) {
		return ColOf(idxA), true
	}
	return -1, false
}
