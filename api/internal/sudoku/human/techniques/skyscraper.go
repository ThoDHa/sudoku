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
	// Lowering the first digit only adds a pass for a digit no cell can hold:
	// Candidates.Has rejects anything below 1.
	// mutator-disable-next-line numbers/decrementer
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
	for outer := range constants.GridSize {
		var cells []int
		for inner := range constants.GridSize {
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
	for i := range links {
		// Starting at i pairs a link with itself, which makes both tops the same
		// cell and so the same line, which the tops guard rejects.
		// mutator-disable-next-line numbers/decrementer
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
//
//nolint:gocyclo // evaluates four base-pairing permutations with sequential geometry guards sharing the same digit/cell state
func buildSkyscraperMove(b BoardInterface, digit int, a, c [2]int, baseUnit string) *core.Move {
	// At most one pairing can ever get past the tops guard below, which is what
	// makes the three later continues equivalent to leaving the loop. A pairing
	// needs its two base ends on one line, and the two links' free coordinates
	// are each a set of two: if the sets overlap in one value exactly one
	// pairing qualifies, and if they are equal the two that qualify both leave
	// the tops on one line and are rejected there.
	for endA := range 2 {
		for endC := range 2 {
			base1, top1 := a[endA], a[1-endA]
			base2, top2 := c[endC], c[1-endC]

			sharedIdx, ok := sharedRowOrCol(base1, base2)
			if !ok {
				continue
			}
			// Tops sharing a row or column collapse to an X-Wing, not a skyscraper.
			if RowOf(top1) == RowOf(top2) || ColOf(top1) == ColOf(top2) {
				// mutator-disable-next-line loop/break
				continue
			}
			// The unshared ends must be in different boxes for a proper skyscraper.
			if BoxOf(top1) == BoxOf(top2) {
				// mutator-disable-next-line loop/break
				continue
			}

			var eliminations []core.Candidate
			for idx := range constants.TotalCells {
				// A top is not its own peer, so ArePeers below already excludes
				// both of them and no separate identity check is needed.
				if !b.GetCandidatesAt(idx).Has(digit) {
					continue
				}
				if ArePeers(idx, top1) && ArePeers(idx, top2) {
					eliminations = append(eliminations, core.Candidate{
						Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: digit,
					})
				}
			}
			if len(eliminations) == 0 {
				// mutator-disable-next-line loop/break
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
