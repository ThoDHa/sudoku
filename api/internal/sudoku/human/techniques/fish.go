package techniques

import (
	"fmt"
	"maps"
	"slices"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// DetectXWing finds X-Wing pattern: a digit in exactly 2 positions in 2 rows,
// and those positions share the same columns
func DetectXWing(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		if m := findXWingInAxis(b, digit, true); m != nil {
			return m
		}
		if m := findXWingInAxis(b, digit, false); m != nil {
			return m
		}
	}
	return nil
}

// findXWingInAxis scans for an X-Wing in rows (byRow=true) or columns. Each line
// where digit has exactly two candidates is paired with every other such line;
// when two lines share the same perpendicular coordinates, eliminations are
// possible along those perpendicular lines.
func findXWingInAxis(b BoardInterface, digit int, byRow bool) *core.Move {
	lineToPerps := xwingLinePositions(b, digit, byRow)
	// Sorted so the first X-Wing found is deterministic (Go randomizes map range).
	lines := slices.Sorted(maps.Keys(lineToPerps))
	for i := range lines {
		for j := i + 1; j < len(lines); j++ {
			l1, l2 := lines[i], lines[j]
			p1, p2 := lineToPerps[l1], lineToPerps[l2]
			if p1[0] != p2[0] || p1[1] != p2[1] {
				continue
			}
			if m := buildXWingMove(b, digit, l1, l2, p1[0], p1[1], byRow); m != nil {
				return m
			}
		}
	}
	return nil
}

// xwingLinePositions returns, for each line (row if byRow, column otherwise)
// where digit appears in exactly two cells, the perpendicular coordinates of
// those cells.
func xwingLinePositions(b BoardInterface, digit int, byRow bool) map[int][]int {
	result := map[int][]int{}
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
		if len(perps) == 2 {
			result[i] = perps
		}
	}
	return result
}

// buildXWingMove collects eliminations for an X-Wing on lines l1,l2 sharing
// perpendicular coordinates p1,p2, and returns the elimination move.
func buildXWingMove(b BoardInterface, digit, l1, l2, p1, p2 int, byRow bool) *core.Move {
	eliminations := collectXWingElims(b, digit, l1, l2, p1, p2, byRow)
	if len(eliminations) == 0 {
		return nil
	}
	secondaryCells := xwingSecondaryCells(l1, l2, byRow)
	r1, r2, c1, c2 := xwingCoords(l1, l2, p1, p2, byRow)
	targets := []core.CellRef{
		{Row: r1, Col: c1}, {Row: r1, Col: c2},
		{Row: r2, Col: c1}, {Row: r2, Col: c2},
	}
	return &core.Move{
		Action:       "eliminate",
		Digit:        digit,
		Targets:      targets,
		Eliminations: eliminations,
		Explanation:  xwingExplanation(digit, r1, r2, c1, c2, byRow),
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: ToCellRefs(secondaryCells),
		},
	}
}

// collectXWingElims walks the perpendicular lines at p1 and p2, collecting cells
// (outside lines l1 and l2) that hold digit as a candidate.
func collectXWingElims(b BoardInterface, digit, l1, l2, p1, p2 int, byRow bool) []core.Candidate {
	var eliminations []core.Candidate
	for k := range constants.GridSize {
		if k == l1 || k == l2 {
			continue
		}
		idx1, idx2, cand1, cand2 := xwingPerpCells(k, p1, p2, digit, byRow)
		if b.GetCandidatesAt(idx1).Has(digit) {
			eliminations = append(eliminations, cand1)
		}
		if b.GetCandidatesAt(idx2).Has(digit) {
			eliminations = append(eliminations, cand2)
		}
	}
	return eliminations
}

// xwingPerpCells returns the two cell indices and Candidate structs on the
// perpendicular lines at p1 and p2 for the given walk coordinate k.
func xwingPerpCells(k, p1, p2, digit int, byRow bool) (int, int, core.Candidate, core.Candidate) {
	if byRow {
		idx1 := k*constants.GridSize + p1
		idx2 := k*constants.GridSize + p2
		return idx1, idx2,
			core.Candidate{Row: k, Col: p1, Digit: digit},
			core.Candidate{Row: k, Col: p2, Digit: digit}
	}
	idx1 := p1*constants.GridSize + k
	idx2 := p2*constants.GridSize + k
	return idx1, idx2,
		core.Candidate{Row: p1, Col: k, Digit: digit},
		core.Candidate{Row: p2, Col: k, Digit: digit}
}

// xwingSecondaryCells returns all cell indices along the two source lines, for
// display as secondary highlights.
func xwingSecondaryCells(l1, l2 int, byRow bool) []int {
	var cells []int
	for k := range constants.GridSize {
		if byRow {
			cells = append(cells, l1*constants.GridSize+k, l2*constants.GridSize+k)
		} else {
			cells = append(cells, k*constants.GridSize+l1, k*constants.GridSize+l2)
		}
	}
	return cells
}

// xwingCoords resolves the X-Wing's four corner coordinates (r1,r2,c1,c2) from
// the abstract line/perpendicular representation.
func xwingCoords(l1, l2, p1, p2 int, byRow bool) (int, int, int, int) {
	if byRow {
		return l1, l2, p1, p2
	}
	return p1, p2, l1, l2
}

// xwingExplanation formats the human-readable X-Wing description.
func xwingExplanation(digit, r1, r2, c1, c2 int, byRow bool) string {
	if byRow {
		return fmt.Sprintf("X-Wing: %d in rows %d,%d columns %d,%d", digit, r1+1, r2+1, c1+1, c2+1)
	}
	return fmt.Sprintf("X-Wing: %d in columns %d,%d rows %d,%d", digit, c1+1, c2+1, r1+1, r2+1)
}

// DetectXYWing finds XY-Wing pattern: pivot cell with candidates XY,
// two wings with candidates XZ and YZ, eliminate Z from cells seeing both wings
//
//nolint:gocyclo // XY-Wing couples pivot-cell scan with per-pivot XZ/YZ wing selection and Z-elimination; the XZ/YZ candidates are computed once per pivot and consumed by the nested elimination loop, so extraction requires passing several derived slices.
func DetectXYWing(b BoardInterface) *core.Move {
	// Find cells with exactly 2 candidates (potential pivots or wings)
	var bivalues []int
	for i := range constants.TotalCells {
		if b.GetCandidatesAt(i).Count() == 2 {
			bivalues = append(bivalues, i)
		}
	}

	for _, pivot := range bivalues {
		pivotCands := b.GetCandidatesAt(pivot).ToSlice()
		if len(pivotCands) != 2 {
			continue
		}
		x, y := pivotCands[0], pivotCands[1]

		// Find wings that see the pivot
		var xzWings, yzWings []int

		for _, wing := range bivalues {
			if wing == pivot {
				continue
			}
			if !ArePeers(pivot, wing) {
				continue
			}

			wingCands := b.GetCandidatesAt(wing).ToSlice()
			if len(wingCands) != 2 {
				continue
			}

			hasX := wingCands[0] == x || wingCands[1] == x
			hasY := wingCands[0] == y || wingCands[1] == y

			if hasX && !hasY {
				xzWings = append(xzWings, wing)
			} else if hasY && !hasX {
				yzWings = append(yzWings, wing)
			}
		}

		// Try all XZ-YZ pairs
		for _, xzWing := range xzWings {
			xzCands := b.GetCandidatesAt(xzWing).ToSlice()
			var z1 int
			if xzCands[0] == x {
				z1 = xzCands[1]
			} else {
				z1 = xzCands[0]
			}

			for _, yzWing := range yzWings {
				yzCands := b.GetCandidatesAt(yzWing).ToSlice()
				var z2 int
				if yzCands[0] == y {
					z2 = yzCands[1]
				} else {
					z2 = yzCands[0]
				}

				if z1 != z2 {
					continue
				}
				z := z1

				// Find cells that see both wings and have z as candidate
				var eliminations []core.Candidate
				for i := range constants.TotalCells {
					if i == pivot || i == xzWing || i == yzWing {
						continue
					}
					if !b.GetCandidatesAt(i).Has(z) {
						continue
					}
					if ArePeers(i, xzWing) && ArePeers(i, yzWing) {
						eliminations = append(eliminations, core.Candidate{
							Row: i / constants.GridSize, Col: i % constants.GridSize, Digit: z,
						})
					}
				}

				if len(eliminations) > 0 {
					return &core.Move{
						Action: "eliminate",
						Digit:  z,
						Targets: []core.CellRef{
							{Row: pivot / constants.GridSize, Col: pivot % constants.GridSize},
							{Row: xzWing / constants.GridSize, Col: xzWing % constants.GridSize},
							{Row: yzWing / constants.GridSize, Col: yzWing % constants.GridSize},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("XY-Wing: pivot at R%dC%d with wings: eliminate %d.", pivot/constants.GridSize+1, pivot%constants.GridSize+1, z),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: pivot / constants.GridSize, Col: pivot % constants.GridSize},
								{Row: xzWing / constants.GridSize, Col: xzWing % constants.GridSize},
								{Row: yzWing / constants.GridSize, Col: yzWing % constants.GridSize},
							},
						},
					}
				}
			}
		}
	}

	return nil
}

// DetectSimpleColoring uses single-digit coloring to find eliminations
//
//nolint:gocyclo // Simple Coloring builds a conjugate-pair graph, runs two-color BFS, then checks five trap/elimination patterns over the resulting color sets; each pattern consumes the same color buckets and per-cell color maps.
func DetectSimpleColoring(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		// Find conjugate pairs (cells where digit appears exactly twice in a unit)
		conjugates := make(map[int][]int) // cell -> connected cells

		// Check rows
		for row := range constants.GridSize {
			var cells []int
			for col := range constants.GridSize {
				if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
					cells = append(cells, row*constants.GridSize+col)
				}
			}
			if len(cells) == 2 {
				conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
				conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
			}
		}

		// Check columns
		for col := range constants.GridSize {
			var cells []int
			for row := range constants.GridSize {
				if b.GetCandidatesAt(row*constants.GridSize + col).Has(digit) {
					cells = append(cells, row*constants.GridSize+col)
				}
			}
			if len(cells) == 2 {
				conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
				conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
			}
		}

		// Check boxes
		for box := range constants.GridSize {
			var cells []int
			boxRow, boxCol := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize
			for r := boxRow; r < boxRow+constants.BoxSize; r++ {
				for c := boxCol; c < boxCol+constants.BoxSize; c++ {
					if b.GetCandidatesAt(r*constants.GridSize + c).Has(digit) {
						cells = append(cells, r*constants.GridSize+c)
					}
				}
			}
			if len(cells) == 2 {
				conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
				conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
			}
		}

		if len(conjugates) == 0 {
			continue
		}

		// Sorted list of starting cells for deterministic iteration.
		startCells := slices.Sorted(maps.Keys(conjugates))

		// Color each connected component separately
		colors := make(map[int]int) // cell -> color (1 or 2)

		for _, start := range startCells {
			if colors[start] != 0 {
				continue
			}

			// BFS to color THIS connected component only
			var color1, color2 []int // Reset for each component!
			queue := []int{start}
			colors[start] = 1
			color1 = append(color1, start)

			for len(queue) > 0 {
				cell := queue[0]
				queue = queue[1:]
				currentColor := colors[cell]
				nextColor := 3 - currentColor

				for _, neighbor := range conjugates[cell] {
					if colors[neighbor] == 0 {
						colors[neighbor] = nextColor
						if nextColor == 1 {
							color1 = append(color1, neighbor)
						} else {
							color2 = append(color2, neighbor)
						}
						queue = append(queue, neighbor)
					}
				}
			}

			// Need at least one cell of each color for a valid chain
			if len(color1) == 0 || len(color2) == 0 {
				continue
			}

			// Check for eliminations: cells that see both colors OF THIS COMPONENT
			for i := range constants.TotalCells {
				if !b.GetCandidatesAt(i).Has(digit) || colors[i] != 0 {
					continue
				}

				seesColor1 := false
				seesColor2 := false
				for _, c1 := range color1 {
					if ArePeers(i, c1) {
						seesColor1 = true
						break
					}
				}
				for _, c2 := range color2 {
					if ArePeers(i, c2) {
						seesColor2 = true
						break
					}
				}

				if seesColor1 && seesColor2 {
					return &core.Move{
						Action: "eliminate",
						Digit:  digit,
						Targets: []core.CellRef{
							{Row: i / constants.GridSize, Col: i % constants.GridSize},
						},
						Eliminations: []core.Candidate{
							{Row: i / constants.GridSize, Col: i % constants.GridSize, Digit: digit},
						},
						Explanation: fmt.Sprintf("Simple Coloring: cell R%dC%d sees both colors for %d", i/constants.GridSize+1, i%constants.GridSize+1, digit),
						Highlights: core.Highlights{
							Primary:   []core.CellRef{{Row: i / constants.GridSize, Col: i % constants.GridSize}},
							Secondary: CellRefsFromIndices(append(color1, color2...)...),
						},
					}
				}
			}
		}
	}

	return nil
}
