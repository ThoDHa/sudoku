package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Finned X-Wing Detection
// ============================================================================
//
// A Finned X-Wing is like a regular X-Wing but with one extra candidate (the "fin")
// in one of the rows/columns. The fin restricts where eliminations can occur:
// only cells that see both the X-Wing corner AND the fin can be eliminated.

// DetectFinnedXWing finds Finned X-Wing patterns
func DetectFinnedXWing(b BoardInterface) *core.Move {
	// Lowering the first digit only adds a pass for a digit no cell can hold:
	// Candidates.Has rejects anything below 1.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		// Check row-based finned X-wing
		if move := detectFinnedXWingInRows(b, digit); move != nil {
			return move
		}
		// Check column-based finned X-wing
		if move := detectFinnedXWingInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectFinnedXWingInRows(b BoardInterface, digit int) *core.Move {
	return detectFinnedXWingInAxis(b, digit, true)
}

func detectFinnedXWingInCols(b BoardInterface, digit int) *core.Move {
	return detectFinnedXWingInAxis(b, digit, false)
}

// detectFinnedXWingInAxis scans for a finned X-Wing in rows (byRow=true) or
// columns. It looks for a base line holding exactly two perpendicular positions
// and a finned line whose positions cover those two plus one "fin" position in
// the same box as one of them, then eliminates along that perpendicular column
// within the fin's box.
func detectFinnedXWingInAxis(b BoardInterface, digit int, byRow bool) *core.Move {
	lines := xwingFinnedLines(b, digit, byRow)
	for i := range lines {
		for j := range lines {
			// A line paired with itself has the same position count on both
			// sides, so it fails the two-and-three check below either way.
			// mutator-disable-next-line branch/if
			if i == j {
				continue
			}
			base, fin := lines[i], lines[j]
			if len(base.perps) != 2 || len(fin.perps) != 3 {
				continue
			}
			if m := tryFinnedXWing(b, digit, base, fin, byRow); m != nil {
				return m
			}
		}
	}
	return nil
}

// xwingFinnedLines returns lines (rows if byRow, cols otherwise) where digit
// appears in 2 or 3 perpendicular positions.
func xwingFinnedLines(b BoardInterface, digit int, byRow bool) []finnedLineInfo {
	var lines []finnedLineInfo
	for i := range constants.GridSize {
		var perps []int
		for j := range constants.GridSize {
			var idx int
			if byRow {
				idx = i*constants.GridSize + j
			} else {
				idx = j*constants.GridSize + i
			}
			if b.GetCandidatesAt(idx).Has(digit) {
				perps = append(perps, j)
			}
		}
		if len(perps) >= 2 && len(perps) <= 3 {
			lines = append(lines, finnedLineInfo{i, perps})
		}
	}
	return lines
}

// tryFinnedXWing validates one (base, fin) line pair as a finned X-Wing and
// returns the elimination move if the fin's perpendicular coord shares a box
// with one of the base's coords and eliminations follow.
func tryFinnedXWing(b BoardInterface, digit int, base, fin finnedLineInfo, byRow bool) *core.Move {
	finPerp, ok := findFinnedXWingFinPerp(base.perps, fin.perps)
	if !ok {
		return nil
	}
	targetPerp := xwingFinnedTargetPerp(base.perps, finPerp)
	if targetPerp == -1 {
		return nil
	}
	eliminations := collectFinnedXWingElims(b, digit, base.line, fin.line, targetPerp, fin.line/constants.BoxSize, byRow)
	if len(eliminations) == 0 {
		return nil
	}
	return buildFinnedXWingMove(digit, base, fin, finPerp, targetPerp, eliminations, byRow)
}

// findFinnedXWingFinPerp returns the perpendicular coord of the fin: the one
// position of the fin line that is not among the base's two. It refuses when the
// fin line has no such position or more than one.
//
// It does not check that the fin line covers both base positions. A two-position
// fin line sharing one position with the base passes here, and the caller's
// count check is what keeps that pattern out.
func findFinnedXWingFinPerp(basePerps, finPerps []int) (int, bool) {
	baseSet := map[int]bool{basePerps[0]: true, basePerps[1]: true}
	var fin int
	found := false
	for _, p := range finPerps {
		if baseSet[p] {
			continue
		}
		if found {
			return 0, false
		}
		fin = p
		found = true
	}
	if !found {
		return 0, false
	}
	return fin, true
}

// xwingFinnedTargetPerp returns the base perpendicular coord whose box axis
// matches the fin's box axis, or -1 if neither does.
func xwingFinnedTargetPerp(basePerps []int, finPerp int) int {
	finBoxAxis := finPerp / constants.BoxSize
	for _, p := range basePerps {
		if p/constants.BoxSize == finBoxAxis {
			return p
		}
	}
	return -1
}

// collectFinnedXWingElims walks the parallel-box range containing finLine at the
// target perpendicular coord, collecting cells outside the base and fin lines.
func collectFinnedXWingElims(b BoardInterface, digit, baseLine, finLine, targetPerp, finParallelBox int, byRow bool) []core.Candidate {
	var eliminations []core.Candidate
	parallelStart := finParallelBox * constants.BoxSize
	for k := parallelStart; k < parallelStart+constants.BoxSize; k++ {
		if k == baseLine || k == finLine {
			continue
		}
		var idx int
		var cand core.Candidate
		if byRow {
			idx = k*constants.GridSize + targetPerp
			cand = core.Candidate{Row: k, Col: targetPerp, Digit: digit}
		} else {
			idx = targetPerp*constants.GridSize + k
			cand = core.Candidate{Row: targetPerp, Col: k, Digit: digit}
		}
		if b.GetCandidatesAt(idx).Has(digit) {
			eliminations = append(eliminations, cand)
		}
	}
	return eliminations
}

// buildFinnedXWingMove assembles the elimination move for a finned X-Wing.
func buildFinnedXWingMove(digit int, base, fin finnedLineInfo, finPerp, targetPerp int, eliminations []core.Candidate, byRow bool) *core.Move {
	var r1, r2, c1, c2, finRowIdx, finColIdx int
	if byRow {
		r1, r2 = base.line, fin.line
		c1, c2 = base.perps[0], base.perps[1]
		finRowIdx, finColIdx = fin.line, finPerp
	} else {
		r1, r2 = base.perps[0], base.perps[1]
		c1, c2 = base.line, fin.line
		finRowIdx, finColIdx = finPerp, fin.line
	}
	targets := []core.CellRef{
		{Row: r1, Col: c1}, {Row: r1, Col: c2},
		{Row: r2, Col: c1}, {Row: r2, Col: c2},
		{Row: finRowIdx, Col: finColIdx},
	}
	primary := []core.CellRef{
		{Row: r1, Col: c1}, {Row: r1, Col: c2},
		{Row: r2, Col: c1}, {Row: r2, Col: c2},
	}
	explanation := fmt.Sprintf("Finned X-Wing: %d in rows %d,%d with fin at R%dC%d",
		digit, base.line+1, fin.line+1, finRowIdx+1, finColIdx+1)
	if !byRow {
		explanation = fmt.Sprintf("Finned X-Wing: %d in columns %d,%d with fin at R%dC%d",
			digit, base.line+1, fin.line+1, finRowIdx+1, finColIdx+1)
	}
	return &core.Move{
		Action:       "eliminate",
		Digit:        digit,
		Targets:      targets,
		Eliminations: eliminations,
		Explanation:  explanation,
		Highlights: core.Highlights{
			Primary:   primary,
			Secondary: []core.CellRef{{Row: finRowIdx, Col: finColIdx}},
		},
	}
}
