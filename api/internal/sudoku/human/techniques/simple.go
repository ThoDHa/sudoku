package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// DetectNakedSingle finds a cell with only one candidate
func DetectNakedSingle(b BoardInterface) *core.Move {
	for i := range constants.TotalCells {
		if b.GetCell(i) == 0 && b.GetCandidatesAt(i).Count() == 1 {
			digit, _ := b.GetCandidatesAt(i).Only()
			row, col := i/constants.GridSize, i%constants.GridSize

			return &core.Move{
				Action:      constants.ActionAssign,
				Digit:       digit,
				Targets:     []core.CellRef{{Row: row, Col: col}},
				Explanation: fmt.Sprintf("Cell R%dC%d has only one candidate: %d", row+1, col+1, digit),
				Highlights: core.Highlights{
					Primary: []core.CellRef{{Row: row, Col: col}},
				},
			}
		}
	}
	return nil
}

// DetectHiddenSingle finds a digit that can only go in one cell within a unit
func DetectHiddenSingle(b BoardInterface) *core.Move {
	for i := range constants.GridSize {
		if m := findHiddenSingleInUnit(b, i, RowIndices[i], "row"); m != nil {
			return m
		}
	}
	for i := range constants.GridSize {
		if m := findHiddenSingleInUnit(b, i, ColIndices[i], "column"); m != nil {
			return m
		}
	}
	for i := range constants.GridSize {
		if m := findHiddenSingleInUnit(b, i, BoxIndices[i], "box"); m != nil {
			return m
		}
	}
	return nil
}

// findHiddenSingleInUnit scans a single unit (described by its cell indices and
// a human-readable label) for a digit that has exactly one candidate position.
// cells is the unit's cell-index list (RowIndices[i], ColIndices[i], BoxIndices[i]);
// desc is used in the explanation ("row", "column", "box").
func findHiddenSingleInUnit(b BoardInterface, unitIdx int, cells []int, desc string) *core.Move {
	// digit=0 is never a candidate: Candidates.Has rejects anything outside
	// 1..GridSize, so an extra iteration at 0 finds no position and no unit
	// already holding it.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		positions, placed := unitDigitPositions(b, cells, digit)
		if placed || len(positions) != 1 {
			continue
		}
		idx := positions[0]
		row, col := idx/constants.GridSize, idx%constants.GridSize
		cellCandidates := b.GetCandidatesAt(idx)
		if cellCandidates.Count() <= 1 {
			continue
		}
		return buildHiddenSingleMove(row, col, digit, unitIdx, desc, cells, cellCandidates)
	}
	return nil
}

// unitDigitPositions lists the cells of a unit that hold digit as a candidate.
// It reports placed=true, with no positions, as soon as a cell of the unit
// already holds the digit: the unit is settled for that digit at that point,
// whatever the remaining cells still carry as candidates.
func unitDigitPositions(b BoardInterface, cells []int, digit int) (positions []int, placed bool) {
	for _, idx := range cells {
		if b.GetCell(idx) == digit {
			return nil, true
		}
		if b.GetCandidatesAt(idx).Has(digit) {
			positions = append(positions, idx)
		}
	}
	return positions, false
}

// buildHiddenSingleMove constructs the assign move for a hidden single, including
// eliminations for every other candidate in the target cell.
func buildHiddenSingleMove(row, col, digit, unitIdx int, desc string, cells []int, cellCandidates Candidates) *core.Move {
	var eliminations []core.Candidate
	// d=0 is never a candidate: Candidates.Has rejects anything outside
	// 1..GridSize, so an extra iteration at 0 eliminates nothing.
	// mutator-disable-next-line numbers/decrementer
	for d := 1; d <= constants.GridSize; d++ {
		if d != digit && cellCandidates.Has(d) {
			eliminations = append(eliminations, core.Candidate{Row: row, Col: col, Digit: d})
		}
	}
	return &core.Move{
		Action:       "assign",
		Digit:        digit,
		Targets:      []core.CellRef{{Row: row, Col: col}},
		Eliminations: eliminations,
		Explanation:  fmt.Sprintf("In %s %d, %d can only go in R%dC%d", desc, unitIdx+1, digit, row+1, col+1),
		Highlights: core.Highlights{
			Primary:   []core.CellRef{{Row: row, Col: col}},
			Secondary: ToCellRefs(cells),
		},
	}
}

// DetectPointingPair finds candidates in a box that are confined to one row/column
func DetectPointingPair(b BoardInterface) *core.Move {
	for box := range constants.GridSize {
		boxRow, boxCol := (box/3)*3, (box%3)*3
		// digit=0 is never a candidate: Candidates.Has rejects anything outside
		// 1..GridSize, so an extra iteration at 0 collects no position at all.
		// mutator-disable-next-line numbers/decrementer
		for digit := 1; digit <= constants.GridSize; digit++ {
			positions := scanBoxCandidates(b, boxRow, boxCol, digit)
			if move := findPointingPairMove(b, box, digit, positions); move != nil {
				return move
			}
		}
	}
	return nil
}

// scanBoxCandidates collects all cells in a 3x3 box (anchored at boxRow, boxCol)
// that have digit as a candidate.
func scanBoxCandidates(b BoardInterface, boxRow, boxCol, digit int) []core.CellRef {
	var positions []core.CellRef
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			if b.GetCandidatesAt(r*constants.GridSize + c).Has(digit) {
				positions = append(positions, core.CellRef{Row: r, Col: c})
			}
		}
	}
	return positions
}

// findPointingPairMove checks whether a box's candidate positions for a digit all
// lie on a single row or single column of the box, and if so returns the
// elimination move for cells outside the box on that line.
func findPointingPairMove(b BoardInterface, box, digit int, positions []core.CellRef) *core.Move {
	if len(positions) < 2 || len(positions) > 3 {
		return nil
	}
	boxRow, boxCol := (box/3)*3, (box%3)*3
	if row, ok := sharedLine(positions, true); ok {
		if m := buildPointingLineMove(b, box, digit, positions, row, boxCol, true); m != nil {
			return m
		}
	}
	if col, ok := sharedLine(positions, false); ok {
		if m := buildPointingLineMove(b, box, digit, positions, col, boxRow, false); m != nil {
			return m
		}
	}
	return nil
}

// sharedLine reports whether every position shares the same row (byRow=true) or
// the same column (byRow=false), returning that line index.
func sharedLine(positions []core.CellRef, byRow bool) (int, bool) {
	var first int
	if byRow {
		first = positions[0].Row
	} else {
		first = positions[0].Col
	}
	// The scan starts at index 1 because index 0 is where first came from:
	// including it would compare that value against itself, which can never
	// disagree, so the lower bound is unobservable.
	// mutator-disable-next-line numbers/decrementer
	for _, p := range positions[1:] {
		var v int
		if byRow {
			v = p.Row
		} else {
			v = p.Col
		}
		if v != first {
			return 0, false
		}
	}
	return first, true
}

// buildPointingLineMove walks a row (byRow=true, lineIdx=row, boxLo=boxCol) or a
// column (byRow=false, lineIdx=col, boxLo=boxRow) outside the box and collects
// cells holding digit as a candidate, returning the elimination move.
func buildPointingLineMove(b BoardInterface, box, digit int, positions []core.CellRef, lineIdx, boxLo int, byRow bool) *core.Move {
	var eliminations []core.Candidate
	for i := range constants.GridSize {
		if i >= boxLo && i < boxLo+3 {
			continue
		}
		var idx int
		var cand core.Candidate
		if byRow {
			idx = lineIdx*constants.GridSize + i
			cand = core.Candidate{Row: lineIdx, Col: i, Digit: digit}
		} else {
			idx = i*constants.GridSize + lineIdx
			cand = core.Candidate{Row: i, Col: lineIdx, Digit: digit}
		}
		if b.GetCandidatesAt(idx).Has(digit) {
			eliminations = append(eliminations, cand)
		}
	}
	if len(eliminations) == 0 {
		return nil
	}
	desc := "row"
	secondary := ToCellRefs(RowIndices[lineIdx])
	if !byRow {
		desc = "column"
		secondary = ToCellRefs(ColIndices[lineIdx])
	}
	return &core.Move{
		Action:       "eliminate",
		Digit:        digit,
		Targets:      positions,
		Eliminations: eliminations,
		Explanation:  fmt.Sprintf("In box %d, %d is confined to %s %d: eliminate %d from rest of %s %d.", box+1, digit, desc, lineIdx+1, digit, desc, lineIdx+1),
		Highlights: core.Highlights{
			Primary:   positions,
			Secondary: secondary,
		},
	}
}

// DetectBoxLineReduction finds candidates in a row/column confined to one box
func DetectBoxLineReduction(b BoardInterface) *core.Move {
	for i := range constants.GridSize {
		if m := findBoxLineReductionInLine(b, i, true); m != nil {
			return m
		}
	}
	for i := range constants.GridSize {
		if m := findBoxLineReductionInLine(b, i, false); m != nil {
			return m
		}
	}
	return nil
}

// findBoxLineReductionInLine scans a single row (byRow=true) or column
// (byRow=false) for a digit whose candidates all lie in one box, and returns
// the elimination move for the rest of that box.
func findBoxLineReductionInLine(b BoardInterface, lineIdx int, byRow bool) *core.Move {
	// digit=0 is never a candidate: Candidates.Has rejects anything outside
	// 1..GridSize, so an extra iteration at 0 collects no position at all.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		positions := scanLineCandidates(b, lineIdx, byRow, digit)
		boxLo, ok := lineDigitBox(positions, byRow)
		if !ok {
			continue
		}
		if m := buildBoxLineElims(b, lineIdx, byRow, digit, positions, boxLo); m != nil {
			return m
		}
	}
	return nil
}

// lineDigitBox reports the box origin shared by a line's candidate positions
// for one digit. It admits two or three positions only: a single position is a
// hidden single rather than a reduction, and four or more cannot fit the three
// cells a box contributes to a line.
func lineDigitBox(positions []core.CellRef, byRow bool) (int, bool) {
	if len(positions) < 2 || len(positions) > 3 {
		return 0, false
	}
	return sharedBoxAlongLine(positions, byRow)
}

// scanLineCandidates collects cells holding digit along a row (byRow=true) or
// column (byRow=false).
func scanLineCandidates(b BoardInterface, lineIdx int, byRow bool, digit int) []core.CellRef {
	var positions []core.CellRef
	for i := range constants.GridSize {
		var idx int
		var ref core.CellRef
		if byRow {
			idx = lineIdx*constants.GridSize + i
			ref = core.CellRef{Row: lineIdx, Col: i}
		} else {
			idx = i*constants.GridSize + lineIdx
			ref = core.CellRef{Row: i, Col: lineIdx}
		}
		if b.GetCandidatesAt(idx).Has(digit) {
			positions = append(positions, ref)
		}
	}
	return positions
}

// sharedBoxAlongLine returns the box origin (already *3) shared by all positions
// along the perpendicular axis (box column when byRow, box row otherwise), or
// ok=false if they span multiple boxes.
func sharedBoxAlongLine(positions []core.CellRef, byRow bool) (int, bool) {
	var first int
	if byRow {
		first = (positions[0].Col / 3) * 3
	} else {
		first = (positions[0].Row / 3) * 3
	}
	// The scan starts at index 1 because index 0 is where first came from:
	// including it would compare that origin against itself, which can never
	// disagree, so the lower bound is unobservable.
	// mutator-disable-next-line numbers/decrementer
	for _, p := range positions[1:] {
		var v int
		if byRow {
			v = (p.Col / 3) * 3
		} else {
			v = (p.Row / 3) * 3
		}
		if v != first {
			return 0, false
		}
	}
	return first, true
}

// buildBoxLineElims walks the 3x3 box containing the source line and collects
// digit candidates outside that line, returning the elimination move. boxLo is
// the box column (byRow) or box row (otherwise) origin, already multiplied by 3.
func buildBoxLineElims(b BoardInterface, lineIdx int, byRow bool, digit int, positions []core.CellRef, boxLo int) *core.Move {
	var boxRow, boxCol int
	if byRow {
		boxRow = (lineIdx / 3) * 3
		boxCol = boxLo
	} else {
		boxRow = boxLo
		boxCol = (lineIdx / 3) * 3
	}
	eliminations := collectBoxExcludingLine(b, boxRow, boxCol, lineIdx, digit, byRow)
	if len(eliminations) == 0 {
		return nil
	}
	desc := "row"
	if !byRow {
		desc = "column"
	}
	boxIdx := (boxRow/3)*3 + boxCol/3
	return &core.Move{
		Action:       "eliminate",
		Digit:        digit,
		Targets:      positions,
		Eliminations: eliminations,
		Explanation:  fmt.Sprintf("In %s %d, %d is confined to one box: eliminate %d from rest of box.", desc, lineIdx+1, digit, digit),
		Highlights: core.Highlights{
			Primary:   positions,
			Secondary: ToCellRefs(BoxIndices[boxIdx]),
		},
	}
}

// collectBoxExcludingLine walks a 3x3 box at (boxRow, boxCol) and collects digit
// candidates in cells that are NOT on the source line.
func collectBoxExcludingLine(b BoardInterface, boxRow, boxCol, lineIdx, digit int, byRow bool) []core.Candidate {
	var elims []core.Candidate
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			if (byRow && r == lineIdx) || (!byRow && c == lineIdx) {
				continue
			}
			if b.GetCandidatesAt(r*constants.GridSize + c).Has(digit) {
				elims = append(elims, core.Candidate{Row: r, Col: c, Digit: digit})
			}
		}
	}
	return elims
}
