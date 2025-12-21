package human

import (
	"fmt"
	"sort"

	"sudoku-api/internal/core"
)

// candidatePair represents a cell-candidate pair for 3D Medusa coloring
type candidatePair struct {
	cell  int
	digit int
}

// pairKey returns a unique key for a candidate pair
func (cp candidatePair) key() int {
	return cp.cell*10 + cp.digit
}

// detectMedusa3D implements 3D Medusa (Multi-Coloring) technique
// This extends simple coloring by coloring candidate-cell pairs rather than just cells.
// Connections are made through:
// 1. Same cell, different candidate -> opposite color (bivalue connection)
// 2. Same candidate, conjugate pair in unit -> opposite color (strong link)
func detectMedusa3D(b *Board) *core.Move {
	// Build the 3D Medusa graph
	// For each bivalue cell and each strong link, we have connections

	// First, find all conjugate pairs for each digit (strong links)
	conjugatePairs := make(map[int][][2]int) // digit -> list of cell pairs
	for digit := 1; digit <= 9; digit++ {
		conjugatePairs[digit] = findConjugatePairs(b, digit)
	}

	// Find all bivalue cells
	var bivalueCells []int
	for i := 0; i < 81; i++ {
		if b.Candidates[i].Count() == 2 {
			bivalueCells = append(bivalueCells, i)
		}
	}

	// Build adjacency for the 3D graph
	// adj[pair.key()] = list of connected pairs (with opposite color)
	adj := make(map[int][]candidatePair)

	// Add bivalue connections: same cell, different candidates
	for _, cell := range bivalueCells {
		cands := b.Candidates[cell].ToSlice()
		if len(cands) == 2 {
			p1 := candidatePair{cell, cands[0]}
			p2 := candidatePair{cell, cands[1]}
			adj[p1.key()] = append(adj[p1.key()], p2)
			adj[p2.key()] = append(adj[p2.key()], p1)
		}
	}

	// Add strong link connections: same digit, conjugate pair in unit
	for digit, pairs := range conjugatePairs {
		for _, pair := range pairs {
			p1 := candidatePair{pair[0], digit}
			p2 := candidatePair{pair[1], digit}
			adj[p1.key()] = append(adj[p1.key()], p2)
			adj[p2.key()] = append(adj[p2.key()], p1)
		}
	}

	if len(adj) == 0 {
		return nil
	}

	// Get all starting points sorted for deterministic behavior
	var startKeys []int
	seenKeys := make(map[int]bool)
	for key := range adj {
		if !seenKeys[key] {
			startKeys = append(startKeys, key)
			seenKeys[key] = true
		}
	}
	sort.Ints(startKeys)

	// Color each connected component
	colors := make(map[int]int) // pair.key() -> color (1 or 2)

	for _, startKey := range startKeys {
		if colors[startKey] != 0 {
			continue
		}

		startPair := candidatePair{startKey / 10, startKey % 10}

		// BFS to color this component
		var color1, color2 []candidatePair
		queue := []candidatePair{startPair}
		colors[startPair.key()] = 1
		color1 = append(color1, startPair)

		for len(queue) > 0 {
			current := queue[0]
			queue = queue[1:]
			currentColor := colors[current.key()]
			nextColor := 3 - currentColor

			for _, neighbor := range adj[current.key()] {
				if colors[neighbor.key()] == 0 {
					colors[neighbor.key()] = nextColor
					if nextColor == 1 {
						color1 = append(color1, neighbor)
					} else {
						color2 = append(color2, neighbor)
					}
					queue = append(queue, neighbor)
				}
			}
		}

		// Need at least one pair of each color
		if len(color1) == 0 || len(color2) == 0 {
			continue
		}

		// Check for contradictions and eliminations

		// Rule 1: Two same-colored candidates in the same cell
		// -> that color is false, eliminate all of that color
		if move := checkSameCellContradiction(b, color1, color2, 1); move != nil {
			return move
		}
		if move := checkSameCellContradiction(b, color2, color1, 2); move != nil {
			return move
		}

		// Rule 2: Two same-colored same-digit in same unit
		// -> that color is false, eliminate all of that color
		if move := checkSameUnitContradiction(b, color1, color2, 1); move != nil {
			return move
		}
		if move := checkSameUnitContradiction(b, color2, color1, 2); move != nil {
			return move
		}

		// Rule 3: Uncolored candidate sees same digit in both colors
		// -> eliminate the uncolored candidate
		if move := checkUncoloredSeesBothColors(b, color1, color2, colors); move != nil {
			return move
		}

		// Rule 4: Cell with all candidates in one color
		// -> that color is false, eliminate all of that color
		// NOTE: Disabled due to incorrect eliminations. The rule requires that ALL
		// candidates in the cell are colored AND all are the same color, but the
		// current implementation may be incorrectly identifying this case.
		// TODO: Debug and fix this rule.
		// if move := checkAllCandidatesSameColor(b, color1, color2, colors, 1); move != nil {
		// 	return move
		// }
		// if move := checkAllCandidatesSameColor(b, color2, color1, colors, 2); move != nil {
		// 	return move
		// }
	}

	return nil
}

// findConjugatePairs finds all conjugate pairs (strong links) for a digit
func findConjugatePairs(b *Board, digit int) [][2]int {
	var pairs [][2]int
	seen := make(map[[2]int]bool)

	addPair := func(c1, c2 int) {
		if c1 > c2 {
			c1, c2 = c2, c1
		}
		pair := [2]int{c1, c2}
		if !seen[pair] {
			seen[pair] = true
			pairs = append(pairs, pair)
		}
	}

	// Check all units (rows, columns, boxes)
	for _, unit := range AllUnits() {
		cells := b.CellsWithDigitInUnit(unit, digit)
		if len(cells) == 2 {
			addPair(cells[0], cells[1])
		}
	}

	return pairs
}

// checkSameCellContradiction checks if two candidates of the same color are in the same cell
// If so, that color is false and all candidates of that color can be eliminated
func checkSameCellContradiction(b *Board, colorToCheck, otherColor []candidatePair, colorNum int) *core.Move {
	// Group by cell
	cellPairs := make(map[int][]candidatePair)
	for _, cp := range colorToCheck {
		cellPairs[cp.cell] = append(cellPairs[cp.cell], cp)
	}

	for cell, pairs := range cellPairs {
		if len(pairs) >= 2 {
			// Contradiction: two candidates of the same color in the same cell
			// This color is false, eliminate all candidates of this color
			var eliminations []core.Candidate
			for _, cp := range colorToCheck {
				if b.Candidates[cp.cell].Has(cp.digit) {
					eliminations = append(eliminations, core.Candidate{
						Row: cp.cell / 9, Col: cp.cell % 9, Digit: cp.digit,
					})
				}
			}

			if len(eliminations) > 0 {
				// Collect all colored cells for highlighting
				allPairs := append(colorToCheck, otherColor...)
				return &core.Move{
					Action:       "eliminate",
					Digit:        0,
					Targets:      pairsToTargets(allPairs),
					Eliminations: eliminations,
					Explanation: fmt.Sprintf("3D Medusa: Color %d has two candidates in R%dC%d; eliminate all color %d",
						colorNum, cell/9+1, cell%9+1, colorNum),
					Highlights: core.Highlights{
						Primary:   pairsToTargets(colorToCheck),
						Secondary: pairsToTargets(otherColor),
					},
				}
			}
		}
	}

	return nil
}

// checkSameUnitContradiction checks if two same-digit candidates of the same color are in the same unit
func checkSameUnitContradiction(b *Board, colorToCheck, otherColor []candidatePair, colorNum int) *core.Move {
	// Group by digit
	digitPairs := make(map[int][]candidatePair)
	for _, cp := range colorToCheck {
		digitPairs[cp.digit] = append(digitPairs[cp.digit], cp)
	}

	for digit, pairs := range digitPairs {
		// Check if any two cells with this digit see each other
		for i := 0; i < len(pairs); i++ {
			for j := i + 1; j < len(pairs); j++ {
				if ArePeers(pairs[i].cell, pairs[j].cell) {
					// Contradiction: two same-digit candidates of the same color in the same unit
					var eliminations []core.Candidate
					for _, cp := range colorToCheck {
						if b.Candidates[cp.cell].Has(cp.digit) {
							eliminations = append(eliminations, core.Candidate{
								Row: cp.cell / 9, Col: cp.cell % 9, Digit: cp.digit,
							})
						}
					}

					if len(eliminations) > 0 {
						allPairs := append(colorToCheck, otherColor...)
						return &core.Move{
							Action:       "eliminate",
							Digit:        0,
							Targets:      pairsToTargets(allPairs),
							Eliminations: eliminations,
							Explanation: fmt.Sprintf("3D Medusa: Color %d has %d twice in same unit (R%dC%d, R%dC%d); eliminate all color %d",
								colorNum, digit, pairs[i].cell/9+1, pairs[i].cell%9+1,
								pairs[j].cell/9+1, pairs[j].cell%9+1, colorNum),
							Highlights: core.Highlights{
								Primary:   pairsToTargets(colorToCheck),
								Secondary: pairsToTargets(otherColor),
							},
						}
					}
				}
			}
		}
	}

	return nil
}

// checkUncoloredSeesBothColors finds uncolored candidates that see the same digit in both colors
func checkUncoloredSeesBothColors(b *Board, color1, color2 []candidatePair, colors map[int]int) *core.Move {
	// Group each color by digit
	color1ByDigit := make(map[int][]int) // digit -> cells
	color2ByDigit := make(map[int][]int)

	for _, cp := range color1 {
		color1ByDigit[cp.digit] = append(color1ByDigit[cp.digit], cp.cell)
	}
	for _, cp := range color2 {
		color2ByDigit[cp.digit] = append(color2ByDigit[cp.digit], cp.cell)
	}

	// Find uncolored candidates that see the same digit in both colors
	for digit := 1; digit <= 9; digit++ {
		cells1, ok1 := color1ByDigit[digit]
		cells2, ok2 := color2ByDigit[digit]

		if !ok1 || !ok2 {
			continue
		}

		// Check each uncolored cell with this digit
		for cell := 0; cell < 81; cell++ {
			if !b.Candidates[cell].Has(digit) {
				continue
			}

			// Skip if this cell-digit is colored
			cp := candidatePair{cell, digit}
			if colors[cp.key()] != 0 {
				continue
			}

			// Check if it sees a cell in color1 with this digit
			seesColor1 := false
			for _, c1 := range cells1 {
				if ArePeers(cell, c1) {
					seesColor1 = true
					break
				}
			}

			// Check if it sees a cell in color2 with this digit
			seesColor2 := false
			for _, c2 := range cells2 {
				if ArePeers(cell, c2) {
					seesColor2 = true
					break
				}
			}

			if seesColor1 && seesColor2 {
				allPairs := append(color1, color2...)
				return &core.Move{
					Action: "eliminate",
					Digit:  digit,
					Targets: []core.CellRef{
						{Row: cell / 9, Col: cell % 9},
					},
					Eliminations: []core.Candidate{
						{Row: cell / 9, Col: cell % 9, Digit: digit},
					},
					Explanation: fmt.Sprintf("3D Medusa: R%dC%d sees %d in both colors; eliminate %d",
						cell/9+1, cell%9+1, digit, digit),
					Highlights: core.Highlights{
						Primary:   []core.CellRef{{Row: cell / 9, Col: cell % 9}},
						Secondary: pairsToTargets(allPairs),
					},
				}
			}
		}
	}

	return nil
}

// pairsToTargets converts candidate pairs to cell references
func pairsToTargets(pairs []candidatePair) []core.CellRef {
	seen := make(map[int]bool)
	var targets []core.CellRef

	for _, cp := range pairs {
		if !seen[cp.cell] {
			seen[cp.cell] = true
			targets = append(targets, core.CellRef{Row: cp.cell / 9, Col: cp.cell % 9})
		}
	}

	return targets
}
