package techniques

import (
	"fmt"
	"maps"
	"slices"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// chainsScanDigits yields each digit a detector in this file scans, in
// ascending order. The three detectors below all walk the same range, and the
// start value and bound are the kind of thing that drifts independently when
// repeated, so the range is defined once here.
func chainsScanDigits(yield func(int) bool) {
	for digit := 1; digit <= constants.GridSize; digit++ {
		if !yield(digit) {
			return
		}
	}
}

// DetectJellyfish finds Jellyfish pattern: 4 rows where a digit appears in 2-4 positions,
// and those positions share exactly 4 columns (or vice versa).
func DetectJellyfish(b BoardInterface) *core.Move {
	for digit := range chainsScanDigits {
		if move := detectJellyfishInDirection(b, digit, UnitRow); move != nil {
			return move
		}
		if move := detectJellyfishInDirection(b, digit, UnitCol); move != nil {
			return move
		}
	}
	return nil
}

// detectJellyfishInDirection finds Jellyfish in the specified direction (rows or columns)
//
//nolint:gocyclo // Jellyfish detection enumerates all 4-combinations of source lines per digit per direction, with the per-combination validation (column-count, elimination-collection, target building) sharing the line-size map and perp sets across phases.
func detectJellyfishInDirection(b BoardInterface, digit int, dir UnitType) *core.Move {
	// Build map of primary unit -> secondary positions where digit appears
	unitPositions := make(map[int][]int)
	for primary := range constants.GridSize {
		var secondaries []int
		for secondary := range constants.GridSize {
			idx := cellIndexForDirection(dir, primary, secondary)
			if b.GetCandidatesAt(idx).Has(digit) {
				secondaries = append(secondaries, secondary)
			}
		}
		if len(secondaries) >= 2 {
			unitPositions[primary] = secondaries
		}
	}

	// Sorted for deterministic iteration order (Go randomizes map range).
	units := slices.Sorted(maps.Keys(unitPositions))

	// Try all combinations of 4 units
	for i := range units {
		// An index one past the end is never dereferenced: units[j] is only read
		// inside the innermost loop, which cannot run once j reaches len(units).
		// mutator-disable-next-line expression/comparison
		for j := i + 1; j < len(units); j++ {
			// Same as the bound above: units[k] is read only inside the innermost
			// loop, which cannot run once k reaches len(units).
			// mutator-disable-next-line expression/comparison
			for k := j + 1; k < len(units); k++ {
				for l := k + 1; l < len(units); l++ {
					u1, u2, u3, u4 := units[i], units[j], units[k], units[l]

					// Collect all secondary positions from these 4 units
					secondarySet := make(map[int]bool)
					for _, s := range unitPositions[u1] {
						secondarySet[s] = true
					}
					for _, s := range unitPositions[u2] {
						secondarySet[s] = true
					}
					for _, s := range unitPositions[u3] {
						secondarySet[s] = true
					}
					for _, s := range unitPositions[u4] {
						secondarySet[s] = true
					}

					if len(secondarySet) != 4 {
						continue
					}

					// Sorted so the returned Eliminations array order is deterministic.
					secondaries := slices.Sorted(maps.Keys(secondarySet))

					// Find eliminations in secondary lines outside the 4 primary units
					var eliminations []core.Candidate
					for _, sec := range secondaries {
						for pri := range constants.GridSize {
							if pri == u1 || pri == u2 || pri == u3 || pri == u4 {
								continue
							}
							idx := cellIndexForDirection(dir, pri, sec)
							if b.GetCandidatesAt(idx).Has(digit) {
								row, col := cellCoordsForDirection(dir, pri, sec)
								eliminations = append(eliminations, core.Candidate{
									Row: row, Col: col, Digit: digit,
								})
							}
						}
					}

					if len(eliminations) > 0 {
						var targets []core.CellRef
						for _, pri := range []int{u1, u2, u3, u4} {
							for _, sec := range unitPositions[pri] {
								row, col := cellCoordsForDirection(dir, pri, sec)
								targets = append(targets, core.CellRef{Row: row, Col: col})
							}
						}

						return &core.Move{
							Action:       "eliminate",
							Digit:        digit,
							Targets:      targets,
							Eliminations: eliminations,
							Explanation:  fmt.Sprintf("Jellyfish: %d in %s %d,%d,%d,%d", digit, directionNamePlural(dir), u1+1, u2+1, u3+1, u4+1),
							Highlights: core.Highlights{
								Primary: targets,
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// cellIndexForDirection returns the cell index given primary and secondary coordinates
// For UnitRow: primary=row, secondary=col -> row*GridSize+col
// For UnitCol: primary=col, secondary=row -> row*GridSize+col (note: secondary is row)
func cellIndexForDirection(dir UnitType, primary, secondary int) int {
	if dir == UnitRow {
		return primary*constants.GridSize + secondary
	}
	return secondary*constants.GridSize + primary
}

// cellCoordsForDirection returns (row, col) given primary and secondary coordinates
func cellCoordsForDirection(dir UnitType, primary, secondary int) (int, int) {
	if dir == UnitRow {
		return primary, secondary
	}
	return secondary, primary
}

// directionNamePlural returns "rows" or "columns" for explanation strings
func directionNamePlural(dir UnitType) string {
	if dir == UnitRow {
		return "rows"
	}
	return "columns"
}

// DetectXChain finds X-Chain pattern: a chain of conjugate pairs for a single digit
func DetectXChain(b BoardInterface) *core.Move {
	for digit := range chainsScanDigits {
		// Build conjugate pair graph
		conjugates := buildConjugateGraph(b, digit)

		// Find chains of length 4+ (even length required for elimination).
		// Sorted so the first chain found and returned is deterministic.
		for _, start := range slices.Sorted(maps.Keys(conjugates)) {
			if move := findXChainFrom(b, digit, start, conjugates); move != nil {
				return move
			}
		}
	}
	return nil
}

//nolint:gocyclo // Conjugate graph construction walks three unit kinds and threads the per-cell pair-count state through the edge-emission check; the three unit iterations all consume the same digit-positions accumulator.
func buildConjugateGraph(b BoardInterface, digit int) map[int][]int {
	conjugates := make(map[int][]int)

	// Check rows and columns using UnitType abstraction
	for _, dir := range []UnitType{UnitRow, UnitCol} {
		for primary := range constants.GridSize {
			var cells []int
			for secondary := range constants.GridSize {
				idx := cellIndexForDirection(dir, primary, secondary)
				if b.GetCandidatesAt(idx).Has(digit) {
					cells = append(cells, idx)
				}
			}
			if len(cells) == 2 {
				conjugates[cells[0]] = append(conjugates[cells[0]], cells[1])
				conjugates[cells[1]] = append(conjugates[cells[1]], cells[0])
			}
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

	return conjugates
}

func findXChainFrom(b BoardInterface, digit int, start int, conjugates map[int][]int) *core.Move {
	// BFS to find chains
	type chainNode struct {
		cell int
		path []int
	}

	visited := make(map[int]bool)
	queue := []chainNode{{start, []int{start}}}

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		if visited[node.cell] {
			continue
		}
		visited[node.cell] = true

		// Look for eliminations: cells that see both ends of an even-length chain
		// The parity check admits only even lengths, so lowering this floor to 3
		// leaves the admitted set unchanged: 3 is odd.
		// mutator-disable-next-line numbers/decrementer
		if len(node.path) >= 4 && len(node.path)%2 == 0 {
			if move := findChainEndpointElimination(b, digit, node.path, "X-Chain: sees both ends of chain: eliminate %d from R%dC%d."); move != nil {
				return move
			}
		}

		// Continue building chain
		for _, next := range conjugates[node.cell] {
			if !visited[next] {
				newPath := make([]int, len(node.path)+1)
				copy(newPath, node.path)
				newPath[len(node.path)] = next
				queue = append(queue, chainNode{next, newPath})
			}
		}
	}

	return nil
}

// findChainEndpointElimination scans for a cell (outside path) that holds digit
// as a candidate and sees both ends of path. If found, it returns an eliminate
// move whose explanation is produced by formatting explanationFmt with the
// digit, row+1, and col+1 of the eliminated cell.
func findChainEndpointElimination(b BoardInterface, digit int, path []int, explanationFmt string) *core.Move {
	if len(path) < 2 {
		return nil
	}
	chainStart := path[0]
	chainEnd := path[len(path)-1]
	pathSet := map[int]bool{}
	for _, c := range path {
		pathSet[c] = true
	}
	targets := pathCellRefs(path)
	for i := range constants.TotalCells {
		if !b.GetCandidatesAt(i).Has(digit) {
			continue
		}
		if pathSet[i] {
			continue
		}
		if !ArePeers(i, chainStart) || !ArePeers(i, chainEnd) {
			continue
		}
		row, col := i/constants.GridSize, i%constants.GridSize
		return &core.Move{
			Action:  "eliminate",
			Digit:   digit,
			Targets: targets,
			Eliminations: []core.Candidate{
				{Row: row, Col: col, Digit: digit},
			},
			Explanation: fmt.Sprintf(explanationFmt, digit, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   targets,
				Secondary: []core.CellRef{{Row: row, Col: col}},
			},
		}
	}
	return nil
}

// pathCellRefs converts a chain path (cell indices) to CellRefs for highlighting.
func pathCellRefs(path []int) []core.CellRef {
	refs := make([]core.CellRef, len(path))
	for i, c := range path {
		refs[i] = core.CellRef{Row: c / constants.GridSize, Col: c % constants.GridSize}
	}
	return refs
}

// DetectXYChain finds XY-Chain pattern: a chain of bivalue cells
//
//nolint:gocyclo // XY-Chain driver threads bivalue-cell adjacency, BFS queue state, and chain-extension validation through one BFS body; the extension step needs the per-cell adjacency and the visited set built in the outer scan.
func DetectXYChain(b BoardInterface) *core.Move {
	// Find all bivalue cells
	var bivalue []int
	for i := range constants.TotalCells {
		if b.GetCandidatesAt(i).Count() == 2 {
			bivalue = append(bivalue, i)
		}
	}

	// Build adjacency: two bivalue cells are connected if they share a unit and a candidate
	adj := make(map[int][]struct {
		cell       int
		sharedCand int
	})

	for _, c1 := range bivalue {
		for _, c2 := range bivalue {
			// ArePeers is false for a cell against itself, so the equal case is
			// rejected by the peer test whether or not this comparison admits it.
			// mutator-disable-next-line expression/comparison
			if c1 >= c2 || !ArePeers(c1, c2) {
				continue
			}
			// Find shared candidate
			for _, d := range b.GetCandidatesAt(c1).ToSlice() {
				if b.GetCandidatesAt(c2).Has(d) {
					adj[c1] = append(adj[c1], struct {
						cell       int
						sharedCand int
					}{c2, d})
					adj[c2] = append(adj[c2], struct {
						cell       int
						sharedCand int
					}{c1, d})
					break
				}
			}
		}
	}

	// DFS to find chains
	for _, start := range bivalue {
		if move := findXYChainFrom(b, start, adj); move != nil {
			return move
		}
	}

	return nil
}

//nolint:gocyclo // XY-Chain BFS threads chain state (visited set, path, current/end candidates) through queue pops, neighbor extension, and end-condition elimination checks; the per-iteration state mutations and the elimination logic share the running path/candidate view.
func findXYChainFrom(b BoardInterface, start int, adj map[int][]struct {
	cell       int
	sharedCand int
}) *core.Move {
	cands := b.GetCandidatesAt(start).ToSlice()
	if len(cands) != 2 {
		return nil
	}

	// Try chains starting with each candidate
	for _, startCand := range cands {
		type node struct {
			cell    int
			path    []int
			endCand int // the "dangling" candidate at the end
		}

		visited := make(map[int]bool)
		// Start with the other candidate as the "dangling" one
		otherCand := cands[0]
		if startCand == cands[0] {
			otherCand = cands[1]
		}

		queue := []node{{start, []int{start}, otherCand}}

		for len(queue) > 0 {
			n := queue[0]
			queue = queue[1:]

			if visited[n.cell] {
				continue
			}
			visited[n.cell] = true

			// Check for eliminations: if start's startCand == end's endCand,
			// cells seeing both can eliminate that digit
			if len(n.path) >= 3 && startCand == n.endCand {
				if move := findChainEndpointElimination(b, startCand, n.path, "XY-Chain: eliminate %d from R%dC%d."); move != nil {
					return move
				}
			}

			// Extend chain
			for _, neighbor := range adj[n.cell] {
				// Dropping this guard only re-queues nodes that are already visited, and
				// the visited check at pop discards them, so nothing observable changes.
				// The comment sits above the if rather than above the continue because
				// the branch/if mutant is attached to the if statement's own node.
				// mutator-disable-next-line branch/if
				if visited[neighbor.cell] {
					continue
				}
				// The shared candidate must be the current endCand
				if neighbor.sharedCand != n.endCand {
					continue
				}

				// New end candidate is the other candidate of the neighbor cell
				neighborCands := b.GetCandidatesAt(neighbor.cell).ToSlice()
				if len(neighborCands) != 2 {
					continue
				}
				newEndCand := neighborCands[0]
				if neighborCands[0] == neighbor.sharedCand {
					newEndCand = neighborCands[1]
				}

				newPath := make([]int, len(n.path)+1)
				copy(newPath, n.path)
				newPath[len(n.path)] = neighbor.cell
				queue = append(queue, node{neighbor.cell, newPath, newEndCand})
			}
		}
	}

	return nil
}

// DetectWWing finds W-Wing pattern: two bivalue cells with same candidates,
// connected by a strong link on one of the candidates
//
//nolint:gocyclo // W-Wing searches bivalue-cell pairs across three peer relationships (same row, same col, same box) for the strong-link bridge that justifies elimination; the three relationship branches share the bivalue-cell scan and the bridge-search state.
func DetectWWing(b BoardInterface) *core.Move {
	// Find all bivalue cells
	var bivalue []struct {
		idx    int
		digits [2]int
	}

	for i := range constants.TotalCells {
		if b.GetCandidatesAt(i).Count() == 2 {
			cands := b.GetCandidatesAt(i).ToSlice()
			bivalue = append(bivalue, struct {
				idx    int
				digits [2]int
			}{i, [2]int{cands[0], cands[1]}})
		}
	}

	// Look for pairs with same candidates
	for i := range bivalue {
		for j := i + 1; j < len(bivalue); j++ {
			bv1, bv2 := bivalue[i], bivalue[j]
			if bv1.digits != bv2.digits {
				continue
			}
			if ArePeers(bv1.idx, bv2.idx) {
				continue // They shouldn't see each other directly
			}

			d1, d2 := bv1.digits[0], bv1.digits[1]

			// Check if there's a strong link on d1 or d2 connecting them
			for _, linkDigit := range []int{d1, d2} {
				elimDigit := d1
				if linkDigit == d1 {
					elimDigit = d2
				}

				// Check rows and columns for strong links using UnitType abstraction
				for _, dir := range []UnitType{UnitRow, UnitCol} {
					for primary := range constants.GridSize {
						var cells []int
						for secondary := range constants.GridSize {
							idx := cellIndexForDirection(dir, primary, secondary)
							if b.GetCandidatesAt(idx).Has(linkDigit) {
								cells = append(cells, idx)
							}
						}
						if len(cells) != 2 {
							continue
						}

						// Check if one cell sees bv1 and the other sees bv2
						// link2's initial value is never read: link1 alone gates the branch
						// below, and both are assigned together before either is used.
						// mutator-disable-next-line numbers/decrementer, numbers/incrementer
						link1, link2 := -1, -1
						if ArePeers(cells[0], bv1.idx) && ArePeers(cells[1], bv2.idx) {
							link1, link2 = cells[0], cells[1]
						} else if ArePeers(cells[1], bv1.idx) && ArePeers(cells[0], bv2.idx) {
							link1, link2 = cells[1], cells[0]
						}

						if link1 != -1 {
							// W-Wing found! Eliminate elimDigit from cells seeing both bv1 and bv2
							var eliminations []core.Candidate
							for idx := range constants.TotalCells {
								if !b.GetCandidatesAt(idx).Has(elimDigit) {
									continue
								}
								if idx == link1 || idx == link2 {
									continue
								}
								if ArePeers(idx, bv1.idx) && ArePeers(idx, bv2.idx) {
									eliminations = append(eliminations, core.Candidate{
										Row: idx / constants.GridSize, Col: idx % constants.GridSize, Digit: elimDigit,
									})
								}
							}

							if len(eliminations) > 0 {
								return &core.Move{
									Action: "eliminate",
									Digit:  elimDigit,
									Targets: []core.CellRef{
										{Row: bv1.idx / constants.GridSize, Col: bv1.idx % constants.GridSize},
										{Row: bv2.idx / constants.GridSize, Col: bv2.idx % constants.GridSize},
										{Row: link1 / constants.GridSize, Col: link1 % constants.GridSize},
										{Row: link2 / constants.GridSize, Col: link2 % constants.GridSize},
									},
									Eliminations: eliminations,
									Explanation:  fmt.Sprintf("W-Wing: {%d,%d} cells connected by strong link on %d", d1, d2, linkDigit),
									Highlights: core.Highlights{
										Primary: []core.CellRef{
											{Row: bv1.idx / constants.GridSize, Col: bv1.idx % constants.GridSize},
											{Row: bv2.idx / constants.GridSize, Col: bv2.idx % constants.GridSize},
										},
										Secondary: []core.CellRef{
											{Row: link1 / constants.GridSize, Col: link1 % constants.GridSize},
											{Row: link2 / constants.GridSize, Col: link2 % constants.GridSize},
										},
									},
								}
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// DetectEmptyRectangle finds Empty Rectangle pattern
// An empty rectangle is a box where all candidates for a digit are in an L-shape
// (all in one row + one column within the box). Combined with a strong link (conjugate pair)
// in a line outside the box, this can eliminate candidates.
//
//nolint:gocyclo // Empty Rectangle detection spans a 5-level nested search (digit × box × ER row/col × perpendicular cells × conjugate-pair strategies). The two strategies share box/row/col state computed at outer levels; splitting them apart would duplicate that derivation or require a wide intermediate-state struct.
func DetectEmptyRectangle(b BoardInterface) *core.Move {
	for digit := range chainsScanDigits {
		for box := range constants.GridSize {
			boxRowStart, boxColStart := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize

			// Find positions of digit in this box
			var positions []int
			for r := boxRowStart; r < boxRowStart+constants.BoxSize; r++ {
				for c := boxColStart; c < boxColStart+constants.BoxSize; c++ {
					if b.GetCandidatesAt(r*constants.GridSize + c).Has(digit) {
						positions = append(positions, r*constants.GridSize+c)
					}
				}
			}

			if len(positions) > 4 {
				continue
			}

			// Check if positions form an ER (all in one row OR one column within box,
			// or in an L-shape where there's a "pivot" row and column)
			// For ER, we need positions that can be covered by one row + one column
			// Try each combination of pivot row and column within the box
			// A pivot row one past the box matches no in-box position, so the row-arm
			// check below rejects that extra iteration.
			// mutator-disable-next-line expression/comparison
			for erRow := boxRowStart; erRow < boxRowStart+constants.BoxSize; erRow++ {
				// A pivot column one past the box matches no in-box position, so the
				// column-arm check below rejects that extra iteration.
				// mutator-disable-next-line expression/comparison
				for erCol := boxColStart; erCol < boxColStart+constants.BoxSize; erCol++ {
					// Check if all positions are in erRow or erCol
					validER := true
					for _, pos := range positions {
						r, c := pos/constants.GridSize, pos%constants.GridSize
						if r != erRow && c != erCol {
							validER = false
							// Early exit only: validER is already false, so continuing the
							// scan instead of leaving it reaches the same state.
							// mutator-disable-next-line loop/break
							break
						}
					}
					if !validER {
						continue
					}

					// We need at least one position in erRow (not at erCol) and one in erCol (not at erRow)
					// to form a proper L-shape
					hasRowArm := false
					hasColArm := false
					for _, pos := range positions {
						r, c := pos/constants.GridSize, pos%constants.GridSize
						// validER guarantees each position is on the pivot row or the pivot
						// column, so c != erCol already implies r == erRow here.
						// mutator-disable-next-line expression/remove
						if r == erRow && c != erCol {
							hasRowArm = true
						}
						// Mirror of the row arm: r != erRow already implies c == erCol under
						// the same validER guarantee.
						// mutator-disable-next-line expression/remove
						if c == erCol && r != erRow {
							hasColArm = true
						}
					}
					if !hasRowArm || !hasColArm {
						// Within one pivot row, two pivot columns can satisfy validER only
						// when no position lies off that row, and then no column arm exists
						// for either. So no later column in this row can succeed, and
						// leaving the scan here reaches the same result as skipping on.
						// mutator-disable-next-line loop/break
						continue // Need both arms for a proper ER
					}

					// We have an empty rectangle with pivot at erRow, erCol
					// Now look for a conjugate pair (strong link) outside the box

					// Strategy 1: Find a conjugate pair in a COLUMN outside the box
					// where one end is in erRow, and eliminate from the other end's row
					// intersecting with erCol
					for linkCol := range constants.GridSize {
						if linkCol >= boxColStart && linkCol < boxColStart+constants.BoxSize {
							continue
						}
						colPositions := digitPositionsInLine(b, digit, linkCol, false)
						linkRow, ok := findConjugateLink(colPositions, erRow)
						if !ok {
							continue
						}
						if linkRow >= boxRowStart && linkRow < boxRowStart+constants.BoxSize {
							continue
						}
						if m := buildERMove(b, digit, box, positions, linkRow, erCol, linkCol, false); m != nil {
							return m
						}
					}

					// Strategy 2: Find a conjugate pair in a ROW outside the box
					// where one end is in erCol, and eliminate from the other end's column
					// intersecting with erRow
					for linkRow := range constants.GridSize {
						if linkRow >= boxRowStart && linkRow < boxRowStart+constants.BoxSize {
							continue
						}
						rowPositions := digitPositionsInLine(b, digit, linkRow, true)
						linkCol, ok := findConjugateLink(rowPositions, erCol)
						if !ok {
							continue
						}
						if linkCol >= boxColStart && linkCol < boxColStart+constants.BoxSize {
							continue
						}
						if m := buildERMove(b, digit, box, positions, erRow, linkCol, linkRow, true); m != nil {
							return m
						}
					}
				}
			}
		}
	}

	return nil
}

// digitPositionsInLine returns the perpendicular coordinates (row indices for a
// column, column indices for a row) where digit appears as a candidate in the
// line at index lineIdx.
func digitPositionsInLine(b BoardInterface, digit, lineIdx int, byRow bool) []int {
	var positions []int
	for k := range constants.GridSize {
		var idx int
		if byRow {
			idx = lineIdx*constants.GridSize + k
		} else {
			idx = k*constants.GridSize + lineIdx
		}
		if b.GetCandidatesAt(idx).Has(digit) {
			positions = append(positions, k)
		}
	}
	return positions
}

// findConjugateLink returns the "other" element of a length-2 positions slice
// when one element equals anchor. ok is false if positions is not a conjugate
// pair or does not contain anchor.
func findConjugateLink(positions []int, anchor int) (int, bool) {
	if len(positions) != 2 {
		return 0, false
	}
	if positions[0] == anchor {
		return positions[1], true
	}
	if positions[1] == anchor {
		return positions[0], true
	}
	return 0, false
}

// buildERMove returns the Empty Rectangle elimination move for a target cell at
// (targetRow, targetCol) if that cell holds digit as a candidate. linkLineIdx is
// the row or column holding the conjugate pair; byRow indicates which (true for
// row, false for column), and selects the explanation format.
func buildERMove(b BoardInterface, digit, box int, erPositions []int, targetRow, targetCol, linkLineIdx int, byRow bool) *core.Move {
	targetIdx := targetRow*constants.GridSize + targetCol
	if !b.GetCandidatesAt(targetIdx).Has(digit) {
		return nil
	}
	targets := make([]core.CellRef, len(erPositions))
	for i, p := range erPositions {
		targets[i] = core.CellRef{Row: p / constants.GridSize, Col: p % constants.GridSize}
	}
	var explanation string
	if byRow {
		explanation = fmt.Sprintf("Empty Rectangle: %d in box %d with conjugate pair in R%d: eliminate from R%dC%d.",
			digit, box+1, linkLineIdx+1, targetRow+1, targetCol+1)
	} else {
		explanation = fmt.Sprintf("Empty Rectangle: %d in box %d with conjugate pair in C%d: eliminate from R%dC%d.",
			digit, box+1, linkLineIdx+1, targetRow+1, targetCol+1)
	}
	return &core.Move{
		Action:  "eliminate",
		Digit:   digit,
		Targets: targets,
		Eliminations: []core.Candidate{
			{Row: targetRow, Col: targetCol, Digit: digit},
		},
		Explanation: explanation,
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: []core.CellRef{{Row: targetRow, Col: targetCol}},
		},
	}
}
