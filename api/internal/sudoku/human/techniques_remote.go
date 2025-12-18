package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectRemotePairs finds Remote Pairs pattern: a chain of cells where:
// - All cells have the same two candidates {A, B}
// - Each cell in the chain sees the next cell
// - Cells at even positions are one "color", odd positions are another
// - Any cell that sees two cells of different colors can have both A and B eliminated
func detectRemotePairs(b *Board) *core.Move {
	// Find all bivalue cells
	type bivalueCell struct {
		idx    int
		digits [2]int
	}

	var bivalue []bivalueCell
	for i := 0; i < 81; i++ {
		if len(b.Candidates[i]) == 2 {
			cands := getCandidateSlice(b.Candidates[i])
			bivalue = append(bivalue, bivalueCell{i, [2]int{cands[0], cands[1]}})
		}
	}

	if len(bivalue) < 4 {
		return nil
	}

	// Group bivalue cells by their digit pair
	pairGroups := make(map[[2]int][]int)
	for _, bv := range bivalue {
		pairGroups[bv.digits] = append(pairGroups[bv.digits], bv.idx)
	}

	// For each group of cells with the same digit pair, try to find remote pairs
	for digits, cells := range pairGroups {
		if len(cells) < 4 {
			continue
		}

		// Build adjacency graph: two cells are connected if they see each other
		adj := make(map[int][]int)
		for i := 0; i < len(cells); i++ {
			for j := i + 1; j < len(cells); j++ {
				if sees(cells[i], cells[j]) {
					adj[cells[i]] = append(adj[cells[i]], cells[j])
					adj[cells[j]] = append(adj[cells[j]], cells[i])
				}
			}
		}

		// Try to find chains starting from each cell
		for _, startCell := range cells {
			if move := findRemotePairChain(b, startCell, adj, digits); move != nil {
				return move
			}
		}
	}

	return nil
}

// findRemotePairChain uses BFS to find remote pair chains and eliminations
func findRemotePairChain(b *Board, start int, adj map[int][]int, digits [2]int) *core.Move {
	// BFS to explore chains and track colors
	type chainNode struct {
		cell  int
		path  []int
		color int // 0 = even position, 1 = odd position
	}

	// Track visited cells to avoid cycles
	visited := make(map[int]bool)
	queue := []chainNode{{start, []int{start}, 0}}

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		if visited[node.cell] {
			continue
		}
		visited[node.cell] = true

		// For chains of length >= 4, check for eliminations
		// We need to find cells that see both an even-colored and odd-colored cell
		if len(node.path) >= 4 {
			if move := checkRemotePairEliminations(b, node.path, digits); move != nil {
				return move
			}
		}

		// Extend the chain
		for _, next := range adj[node.cell] {
			if !visited[next] {
				newPath := make([]int, len(node.path)+1)
				copy(newPath, node.path)
				newPath[len(node.path)] = next
				queue = append(queue, chainNode{next, newPath, 1 - node.color})
			}
		}
	}

	return nil
}

// checkRemotePairEliminations checks if any cell can see two cells of different colors
// in the chain and can have the pair digits eliminated
func checkRemotePairEliminations(b *Board, chain []int, digits [2]int) *core.Move {
	d1, d2 := digits[0], digits[1]

	// Assign colors to chain cells based on position
	evenCells := make(map[int]bool) // cells at even positions (0, 2, 4, ...)
	oddCells := make(map[int]bool)  // cells at odd positions (1, 3, 5, ...)
	chainSet := make(map[int]bool)

	for i, cell := range chain {
		chainSet[cell] = true
		if i%2 == 0 {
			evenCells[cell] = true
		} else {
			oddCells[cell] = true
		}
	}

	// Look for elimination targets: cells not in the chain that see both
	// an even-colored cell and an odd-colored cell
	var eliminations []core.Candidate

	for idx := 0; idx < 81; idx++ {
		// Skip cells in the chain
		if chainSet[idx] {
			continue
		}

		// Cell must have at least one of the pair digits as candidates
		hasD1 := b.Candidates[idx][d1]
		hasD2 := b.Candidates[idx][d2]
		if !hasD1 && !hasD2 {
			continue
		}

		// Check if this cell sees at least one even-colored cell and one odd-colored cell
		seesEven := false
		seesOdd := false

		for evenCell := range evenCells {
			if sees(idx, evenCell) {
				seesEven = true
				break
			}
		}

		for oddCell := range oddCells {
			if sees(idx, oddCell) {
				seesOdd = true
				break
			}
		}

		// If the cell sees both colors, both pair digits can be eliminated
		if seesEven && seesOdd {
			if hasD1 {
				eliminations = append(eliminations, core.Candidate{
					Row: idx / 9, Col: idx % 9, Digit: d1,
				})
			}
			if hasD2 {
				eliminations = append(eliminations, core.Candidate{
					Row: idx / 9, Col: idx % 9, Digit: d2,
				})
			}
		}
	}

	if len(eliminations) > 0 {
		// Build targets (the chain cells)
		var targets []core.CellRef
		for _, cell := range chain {
			targets = append(targets, core.CellRef{Row: cell / 9, Col: cell % 9})
		}

		// Build highlights: primary = chain cells, secondary = cells being eliminated
		var secondary []core.CellRef
		elimCells := make(map[int]bool)
		for _, elim := range eliminations {
			idx := elim.Row*9 + elim.Col
			if !elimCells[idx] {
				elimCells[idx] = true
				secondary = append(secondary, core.CellRef{Row: elim.Row, Col: elim.Col})
			}
		}

		return &core.Move{
			Action:       "eliminate",
			Digit:        0, // Multiple digits may be eliminated
			Targets:      targets,
			Eliminations: eliminations,
			Explanation:  fmt.Sprintf("Remote Pairs: chain of {%d,%d} cells; eliminate from cells seeing both colors", d1, d2),
			Highlights: core.Highlights{
				Primary:   targets,
				Secondary: secondary,
			},
		}
	}

	return nil
}
