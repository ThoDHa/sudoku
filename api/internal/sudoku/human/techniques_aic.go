package human

import (
	"fmt"
	"sudoku-api/internal/core"
)

// candidateNode represents a candidate-cell pair in the AIC
type candidateNode struct {
	cell  int
	digit int
}

// chainLink represents a link in the chain with polarity
type chainLink struct {
	node   candidateNode
	strong bool // true if this node was reached via a strong link
}

// detectAIC finds Alternating Inference Chains and returns eliminations or assignments
func detectAIC(b *Board) *core.Move {
	// Build strong and weak link maps for efficient lookup
	strongLinks := buildStrongLinks(b)
	weakLinks := buildWeakLinks(b)

	// Try starting from each candidate in each cell
	for cell := 0; cell < 81; cell++ {
		if b.Cells[cell] != 0 {
			continue
		}
		for _, digit := range b.Candidates[cell].ToSlice() {
			startNode := candidateNode{cell: cell, digit: digit}

			// BFS to find chains - start with strong link (node is ON if true)
			move := bfsAIC(b, startNode, true, strongLinks, weakLinks)
			if move != nil {
				return move
			}
		}
	}

	return nil
}

// buildStrongLinks builds a map of all strong links from each candidate node
func buildStrongLinks(b *Board) map[candidateNode][]candidateNode {
	links := make(map[candidateNode][]candidateNode)

	// Strong links from conjugate pairs (only 2 places for digit in a unit)
	for digit := 1; digit <= 9; digit++ {
		// Check rows
		for row := 0; row < 9; row++ {
			cells := []int{}
			for col := 0; col < 9; col++ {
				idx := row*9 + col
				if b.Cells[idx] == 0 && b.Candidates[idx].Has(digit) {
					cells = append(cells, idx)
				}
			}
			if len(cells) == 2 {
				n1 := candidateNode{cell: cells[0], digit: digit}
				n2 := candidateNode{cell: cells[1], digit: digit}
				links[n1] = append(links[n1], n2)
				links[n2] = append(links[n2], n1)
			}
		}

		// Check columns
		for col := 0; col < 9; col++ {
			cells := []int{}
			for row := 0; row < 9; row++ {
				idx := row*9 + col
				if b.Cells[idx] == 0 && b.Candidates[idx].Has(digit) {
					cells = append(cells, idx)
				}
			}
			if len(cells) == 2 {
				n1 := candidateNode{cell: cells[0], digit: digit}
				n2 := candidateNode{cell: cells[1], digit: digit}
				links[n1] = append(links[n1], n2)
				links[n2] = append(links[n2], n1)
			}
		}

		// Check boxes
		for box := 0; box < 9; box++ {
			cells := []int{}
			startRow := (box / 3) * 3
			startCol := (box % 3) * 3
			for r := 0; r < 3; r++ {
				for c := 0; c < 3; c++ {
					idx := (startRow+r)*9 + (startCol + c)
					if b.Cells[idx] == 0 && b.Candidates[idx].Has(digit) {
						cells = append(cells, idx)
					}
				}
			}
			if len(cells) == 2 {
				n1 := candidateNode{cell: cells[0], digit: digit}
				n2 := candidateNode{cell: cells[1], digit: digit}
				// Avoid duplicates if already added from row/col
				if !containsNode(links[n1], n2) {
					links[n1] = append(links[n1], n2)
					links[n2] = append(links[n2], n1)
				}
			}
		}
	}

	// Strong links from bivalue cells (cells with exactly 2 candidates)
	for cell := 0; cell < 81; cell++ {
		if b.Cells[cell] != 0 {
			continue
		}
		cands := b.Candidates[cell].ToSlice()
		if len(cands) == 2 {
			n1 := candidateNode{cell: cell, digit: cands[0]}
			n2 := candidateNode{cell: cell, digit: cands[1]}
			links[n1] = append(links[n1], n2)
			links[n2] = append(links[n2], n1)
		}
	}

	return links
}

// buildWeakLinks builds a map of all weak links from each candidate node
func buildWeakLinks(b *Board) map[candidateNode][]candidateNode {
	links := make(map[candidateNode][]candidateNode)

	// Weak links: same digit in cells that see each other
	for digit := 1; digit <= 9; digit++ {
		cells := []int{}
		for cell := 0; cell < 81; cell++ {
			if b.Cells[cell] == 0 && b.Candidates[cell].Has(digit) {
				cells = append(cells, cell)
			}
		}
		for i := 0; i < len(cells); i++ {
			for j := i + 1; j < len(cells); j++ {
				if sees(cells[i], cells[j]) {
					n1 := candidateNode{cell: cells[i], digit: digit}
					n2 := candidateNode{cell: cells[j], digit: digit}
					links[n1] = append(links[n1], n2)
					links[n2] = append(links[n2], n1)
				}
			}
		}
	}

	// Weak links: different digits in the same cell
	for cell := 0; cell < 81; cell++ {
		if b.Cells[cell] != 0 {
			continue
		}
		cands := b.Candidates[cell].ToSlice()
		for i := 0; i < len(cands); i++ {
			for j := i + 1; j < len(cands); j++ {
				n1 := candidateNode{cell: cell, digit: cands[i]}
				n2 := candidateNode{cell: cell, digit: cands[j]}
				links[n1] = append(links[n1], n2)
				links[n2] = append(links[n2], n1)
			}
		}
	}

	return links
}

// containsNode checks if a node slice contains a specific node
func containsNode(nodes []candidateNode, target candidateNode) bool {
	for _, n := range nodes {
		if n.cell == target.cell && n.digit == target.digit {
			return true
		}
	}
	return false
}

// bfsAIC performs BFS to find valid AIC chains
func bfsAIC(b *Board, start candidateNode, startPolarity bool, strongLinks, weakLinks map[candidateNode][]candidateNode) *core.Move {
	type queueItem struct {
		chain    []chainLink
		polarity bool // current polarity: true=ON, false=OFF
	}

	// Start chain with the initial node (polarity true means "assume ON")
	initialChain := []chainLink{{node: start, strong: startPolarity}}
	queue := []queueItem{{chain: initialChain, polarity: startPolarity}}

	maxChainLength := 10

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if len(current.chain) > maxChainLength {
			continue
		}

		lastLink := current.chain[len(current.chain)-1]

		// Determine which links to follow based on alternation
		// After a strong link (polarity ON), we follow weak links
		// After a weak link (polarity OFF), we follow strong links
		var nextLinks []candidateNode
		var nextStrong bool

		if current.polarity {
			// Current node is ON, follow weak links (next will be OFF)
			nextLinks = weakLinks[lastLink.node]
			nextStrong = false
		} else {
			// Current node is OFF, follow strong links (next will be ON)
			nextLinks = strongLinks[lastLink.node]
			nextStrong = true
		}

		for _, nextNode := range nextLinks {
			// Check if we've visited this node in this chain
			visited := false
			for _, link := range current.chain {
				if link.node.cell == nextNode.cell && link.node.digit == nextNode.digit {
					visited = true
					break
				}
			}
			if visited {
				continue
			}

			newChain := make([]chainLink, len(current.chain)+1)
			copy(newChain, current.chain)
			newChain[len(current.chain)] = chainLink{node: nextNode, strong: nextStrong}
			nextPolarity := !current.polarity

			// Check for valid chain conclusions (need at least 3 nodes)
			if len(newChain) >= 3 {
				move := checkChainConclusion(b, newChain, start, startPolarity, nextNode, nextPolarity)
				if move != nil {
					return move
				}
			}

			queue = append(queue, queueItem{chain: newChain, polarity: nextPolarity})
		}
	}

	return nil
}

// checkChainConclusion checks if a chain leads to valid eliminations or assignments
func checkChainConclusion(b *Board, chain []chainLink, start candidateNode, startPolarity bool, end candidateNode, endPolarity bool) *core.Move {
	// Type 1: Discontinuous Nice Loop - endpoints are the same with same polarity
	// If both ends are ON (or both OFF) for the same candidate, we have a contradiction
	if start.cell == end.cell && start.digit == end.digit {
		// Chain forms a loop back to start
		// If start is ON and end is ON: candidate must be true
		// If start is OFF and end is OFF: candidate must be false
		if startPolarity && endPolarity {
			// Both ON means this candidate is definitely true - assign it
			return &core.Move{
				Technique:   "aic",
				Action:      "assign",
				Digit:       start.digit,
				Targets:     []core.CellRef{{Row: start.cell / 9, Col: start.cell % 9}},
				Explanation: fmt.Sprintf("AIC: Chain proves r%dc%d must be %d", start.cell/9+1, start.cell%9+1, start.digit),
				Highlights:  buildAICHighlights(chain),
			}
		}
	}

	// Type 2: Endpoints have same digit, both ON, but are DIFFERENT cells that SEE each other
	// Chain proves: Start=ON => End=ON
	// But if they see each other, they can't both be ON (weak link)
	// This is a CONTRADICTION - therefore Start must be OFF!
	// We eliminate the digit from Start.
	if start.digit == end.digit && start.cell != end.cell && startPolarity && endPolarity {
		if sees(start.cell, end.cell) {
			// Contradiction: Start=ON leads to End=ON, but they see each other
			// So Start CANNOT be ON - eliminate it
			return &core.Move{
				Technique:    "aic",
				Action:       "eliminate",
				Digit:        start.digit,
				Targets:      getChainCellRefs(chain),
				Eliminations: []core.Candidate{{Row: start.cell / 9, Col: start.cell % 9, Digit: start.digit}},
				Explanation: fmt.Sprintf("AIC: Chain proves r%dc%d=%d leads to r%dc%d=%d, but they see each other - contradiction",
					start.cell/9+1, start.cell%9+1, start.digit, end.cell/9+1, end.cell%9+1, end.digit),
				Highlights: buildAICHighlights(chain),
			}
		}

		// If they DON'T see each other, we can't make eliminations without
		// verifying the chain works bidirectionally (which requires the chain
		// structure to have weak links at both ends - more complex to verify).
		// For now, skip this case.
	}

	return nil
}

// getChainCellRefs extracts cell references from a chain
func getChainCellRefs(chain []chainLink) []core.CellRef {
	refs := make([]core.CellRef, len(chain))
	for i, link := range chain {
		refs[i] = core.CellRef{Row: link.node.cell / 9, Col: link.node.cell % 9}
	}
	return refs
}

// buildAICHighlights creates highlight information for the chain
func buildAICHighlights(chain []chainLink) core.Highlights {
	highlights := core.Highlights{
		Primary:   []core.CellRef{},
		Secondary: []core.CellRef{},
	}

	for _, link := range chain {
		cellRef := core.CellRef{Row: link.node.cell / 9, Col: link.node.cell % 9}
		highlights.Primary = append(highlights.Primary, cellRef)
	}

	return highlights
}
