package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectGroupedXCycles finds Grouped X-Cycles eliminations or assignments.
//
// X-Cycles are chains of strong and weak links for a single digit that form a loop.
// - Strong link: exactly 2 candidates in a unit (if one is false, other must be true)
// - Weak link: candidates see each other (if one is true, other must be false)
//
// Types of X-Cycles:
//   - Nice Loop (continuous): alternates strong-weak-strong-weak..., even length
//     -> Cells seeing both ends of any weak link can eliminate the digit
//   - Type 1 (discontinuous): two strong links meet at a node
//     -> That node must be ON (the digit goes there)
//   - Type 2 (discontinuous): two weak links meet at a node
//     -> That node must be OFF (eliminate the digit)
func detectGroupedXCycles(b *Board) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		if move := findGroupedXCycleForDigit(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func findGroupedXCycleForDigit(b *Board, digit int) *core.Move {
	// Build list of cells with this candidate
	var cells []int
	for idx := 0; idx < 81; idx++ {
		if b.Candidates[idx].Has(digit) {
			cells = append(cells, idx)
		}
	}

	if len(cells) < 4 {
		return nil
	}

	// Build strong link pairs - cells that are the only two with digit in their unit
	strongLinks := buildStrongLinksXC(b, digit, cells)

	// Try to find cycles using DFS with alternating links
	return findXCyclesDFS(b, digit, cells, strongLinks)
}

// strongLink represents a bidirectional strong link between two cells
type strongLink struct {
	cell1, cell2 int
	unit         string // "row", "col", or "box"
}

func buildStrongLinksXC(b *Board, digit int, cells []int) []strongLink {
	var links []strongLink

	// Check rows
	for row := 0; row < 9; row++ {
		var rowCells []int
		for _, idx := range cells {
			if idx/9 == row {
				rowCells = append(rowCells, idx)
			}
		}
		if len(rowCells) == 2 {
			links = append(links, strongLink{rowCells[0], rowCells[1], "row"})
		}
	}

	// Check columns
	for col := 0; col < 9; col++ {
		var colCells []int
		for _, idx := range cells {
			if idx%9 == col {
				colCells = append(colCells, idx)
			}
		}
		if len(colCells) == 2 {
			links = append(links, strongLink{colCells[0], colCells[1], "col"})
		}
	}

	// Check boxes
	for box := 0; box < 9; box++ {
		boxRowStart := (box / 3) * 3
		boxColStart := (box % 3) * 3
		var boxCells []int
		for _, idx := range cells {
			r, c := idx/9, idx%9
			if r >= boxRowStart && r < boxRowStart+3 && c >= boxColStart && c < boxColStart+3 {
				boxCells = append(boxCells, idx)
			}
		}
		if len(boxCells) == 2 {
			links = append(links, strongLink{boxCells[0], boxCells[1], "box"})
		}
	}

	return links
}

// hasStrongLink checks if there's a strong link between two cells
func hasStrongLink(strongLinks []strongLink, cell1, cell2 int) bool {
	for _, link := range strongLinks {
		if (link.cell1 == cell1 && link.cell2 == cell2) ||
			(link.cell1 == cell2 && link.cell2 == cell1) {
			return true
		}
	}
	return false
}

// hasWeakLink checks if there's a weak link (cells see each other)
func hasWeakLink(cell1, cell2 int) bool {
	return cell1 != cell2 && ArePeers(cell1, cell2)
}

// findXCyclesDFS searches for X-Cycles using DFS
func findXCyclesDFS(b *Board, digit int, cells []int, strongLinks []strongLink) *core.Move {
	// Try starting from each cell
	for _, startCell := range cells {
		// Try both: starting with strong link out, or weak link out
		for _, startWithStrong := range []bool{true, false} {
			if move := searchCycle(b, digit, cells, strongLinks, startCell, startWithStrong); move != nil {
				return move
			}
		}
	}
	return nil
}

func searchCycle(b *Board, digit int, cells []int, strongLinks []strongLink, startCell int, startWithStrong bool) *core.Move {
	// DFS with proper alternation tracking
	// path[i] connected to path[i+1] via linkStrong[i]
	type dfsState struct {
		cell       int
		path       []int
		linkStrong []bool // linkStrong[i] = type of link from path[i] to path[i+1]
	}

	stack := []dfsState{{
		cell:       startCell,
		path:       []int{startCell},
		linkStrong: []bool{},
	}}

	for len(stack) > 0 {
		state := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		// Limit path length
		if len(state.path) > 10 {
			continue
		}

		currentCell := state.cell
		pathLen := len(state.path)

		// Determine what kind of link we need next
		// We want to alternate: strong, weak, strong, weak, ...
		// First link type is determined by startWithStrong
		var needStrong bool
		if pathLen == 1 {
			needStrong = startWithStrong
		} else {
			// Alternate from previous
			needStrong = !state.linkStrong[len(state.linkStrong)-1]
		}

		// Check for cycle back to start (need at least 4 nodes for a valid cycle)
		if pathLen >= 4 {
			if needStrong && hasStrongLink(strongLinks, currentCell, startCell) {
				// Cycle closes with strong link
				fullPath := state.path
				fullLinks := append(state.linkStrong, true) // closing link is strong

				if move := analyzeCycleFixed(b, digit, fullPath, fullLinks); move != nil {
					return move
				}
			}
			if !needStrong && hasWeakLink(currentCell, startCell) {
				// Cycle closes with weak link
				fullPath := state.path
				fullLinks := append(state.linkStrong, false) // closing link is weak

				if move := analyzeCycleFixed(b, digit, fullPath, fullLinks); move != nil {
					return move
				}
			}
		}

		// Explore neighbors with the required link type
		for _, nextCell := range cells {
			// Don't revisit cells in path (except for closing cycle, handled above)
			inPath := false
			for _, p := range state.path {
				if p == nextCell {
					inPath = true
					break
				}
			}
			if inPath {
				continue
			}

			// Check if we have the required link type
			hasLink := false
			if needStrong {
				hasLink = hasStrongLink(strongLinks, currentCell, nextCell)
			} else {
				hasLink = hasWeakLink(currentCell, nextCell)
			}

			if !hasLink {
				continue
			}

			newPath := make([]int, len(state.path)+1)
			copy(newPath, state.path)
			newPath[len(state.path)] = nextCell

			newLinks := make([]bool, len(state.linkStrong)+1)
			copy(newLinks, state.linkStrong)
			newLinks[len(state.linkStrong)] = needStrong

			stack = append(stack, dfsState{
				cell:       nextCell,
				path:       newPath,
				linkStrong: newLinks,
			})
		}
	}

	return nil
}

// analyzeCycleFixed checks for discontinuities in the cycle
// linkStrong[i] = type of link from path[i] to path[(i+1) % len(path)]
func analyzeCycleFixed(b *Board, digit int, path []int, linkStrong []bool) *core.Move {
	n := len(path)
	if n < 4 || len(linkStrong) != n {
		return nil
	}

	// Check each node for discontinuity
	// At node i:
	//   - Link coming IN is linkStrong[(i-1+n)%n] (from path[i-1] to path[i])
	//   - Link going OUT is linkStrong[i] (from path[i] to path[i+1])
	for i := 0; i < n; i++ {
		linkIn := linkStrong[(i-1+n)%n]
		linkOut := linkStrong[i]

		cell := path[i]

		// Type 1: Two strong links meet -> cell must be ON
		if linkIn && linkOut {
			return &core.Move{
				Action:  "assign",
				Digit:   digit,
				Targets: []core.CellRef{{Row: cell / 9, Col: cell % 9}},
				Explanation: fmt.Sprintf("X-Cycle Type 1: two strong links meet at R%dC%d, so it must be %d",
					cell/9+1, cell%9+1, digit),
				Highlights: core.Highlights{
					Primary: pathToCellRefsSimple(path),
				},
			}
		}

		// Type 2: Two weak links meet -> cell must be OFF
		if !linkIn && !linkOut {
			if b.Candidates[cell].Has(digit) {
				return &core.Move{
					Action: "eliminate",
					Digit:  digit,
					Eliminations: []core.Candidate{
						{Row: cell / 9, Col: cell % 9, Digit: digit},
					},
					Explanation: fmt.Sprintf("X-Cycle Type 2: two weak links meet at R%dC%d, eliminating %d",
						cell/9+1, cell%9+1, digit),
					Highlights: core.Highlights{
						Primary:   pathToCellRefsSimple(path),
						Secondary: []core.CellRef{{Row: cell / 9, Col: cell % 9}},
					},
				}
			}
		}
	}

	// No discontinuity found - this is a nice loop (continuous, alternating)
	// For nice loops, we can eliminate from cells that see both ends of any weak link
	return findNiceLoopEliminationsFixed(b, digit, path, linkStrong)
}

func findNiceLoopEliminationsFixed(b *Board, digit int, path []int, linkStrong []bool) *core.Move {
	n := len(path)

	var eliminations []core.Candidate

	// Find weak links and look for eliminations
	for i := 0; i < n; i++ {
		if !linkStrong[i] { // This is a weak link
			cell1 := path[i]
			cell2 := path[(i+1)%n]

			// Cells that see BOTH ends of this weak link can eliminate the digit
			for idx := 0; idx < 81; idx++ {
				if !b.Candidates[idx].Has(digit) {
					continue
				}

				// Skip cells in the cycle
				inPath := false
				for _, p := range path {
					if p == idx {
						inPath = true
						break
					}
				}
				if inPath {
					continue
				}

				if ArePeers(idx, cell1) && ArePeers(idx, cell2) {
					eliminations = append(eliminations, core.Candidate{
						Row: idx / 9, Col: idx % 9, Digit: digit,
					})
				}
			}
		}
	}

	if len(eliminations) > 0 {
		// Deduplicate
		eliminations = DedupeEliminations(eliminations)

		return &core.Move{
			Action:       "eliminate",
			Digit:        digit,
			Eliminations: eliminations,
			Explanation: fmt.Sprintf("X-Cycle Nice Loop: eliminate %d from cells seeing both ends of weak links",
				digit),
			Highlights: core.Highlights{
				Primary: pathToCellRefsSimple(path),
			},
		}
	}

	return nil
}

func pathToCellRefsSimple(path []int) []core.CellRef {
	refs := make([]core.CellRef, len(path))
	for i, cell := range path {
		refs[i] = core.CellRef{Row: cell / 9, Col: cell % 9}
	}
	return refs
}
