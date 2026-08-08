package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// candidateNode represents a candidate-cell pair in the AIC
type candidateNode struct {
	cell  int
	digit int
}

// DetectAIC finds Alternating Inference Chains and returns eliminations or assignments
func DetectAIC(b BoardInterface) *core.Move {
	// Build strong and weak link maps for efficient lookup
	strongLinks := buildStrongLinks(b)
	weakLinks := buildWeakLinks(b)

	// Try starting from each candidate in each cell. Dropping this skip costs
	// iterations and changes no result: both weak-link builders ignore solved
	// cells, so a solved cell is neither key nor value in weakLinks, and a
	// search always leaves its start node along a weak link.
	for cell := range constants.TotalCells {
		// mutator-disable-next-line branch/if
		if b.GetCell(cell) != 0 {
			continue
		}
		for _, digit := range b.GetCandidatesAt(cell).ToSlice() {
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
func buildStrongLinks(b BoardInterface) map[candidateNode][]candidateNode {
	links := make(map[candidateNode][]candidateNode)

	// Strong links from conjugate pairs (only 2 places for digit in a unit).
	// Candidates.Has rejects any digit outside 1..GridSize, so an extra
	// iteration at 0 finds no cells in any unit and adds no link.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		for _, unit := range AllUnits() {
			cells := b.CellsWithDigitInUnit(unit, digit)
			if len(cells) == 2 {
				n1 := candidateNode{cell: cells[0], digit: digit}
				n2 := candidateNode{cell: cells[1], digit: digit}
				// Avoid duplicates if pair appears in multiple units
				if !containsNode(links[n1], n2) {
					links[n1] = append(links[n1], n2)
					links[n2] = append(links[n2], n1)
				}
			}
		}
	}

	// Strong links from bivalue cells (cells with exactly 2 candidates)
	for cell := range constants.TotalCells {
		if b.GetCell(cell) != 0 {
			continue
		}
		cands := b.GetCandidatesAt(cell).ToSlice()
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
//
//nolint:gocyclo // buildWeakLinks classifies every cell×digit pair into one of three link classes (in-cell, strong unit, weak unit) via tightly-coupled per-unit iteration; the three classifications share per-cell state and splitting them duplicates that loop.
func buildWeakLinks(b BoardInterface) map[candidateNode][]candidateNode {
	links := make(map[candidateNode][]candidateNode)

	// Weak links: same digit in cells that see each other. As in
	// buildStrongLinks, an extra iteration at 0 collects no cells at all.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		cells := []int{}
		for cell := range constants.TotalCells {
			if b.GetCell(cell) == 0 && b.GetCandidatesAt(cell).Has(digit) {
				cells = append(cells, cell)
			}
		}
		for i := range cells {
			// Starting j at i pairs a cell with itself, which ArePeers refuses
			// since a cell is not among its own peers, so no link follows.
			// mutator-disable-next-line numbers/decrementer
			for j := i + 1; j < len(cells); j++ {
				if ArePeers(cells[i], cells[j]) {
					n1 := candidateNode{cell: cells[i], digit: digit}
					n2 := candidateNode{cell: cells[j], digit: digit}
					links[n1] = append(links[n1], n2)
					links[n2] = append(links[n2], n1)
				}
			}
		}
	}

	// Weak links: different digits in the same cell
	for cell := range constants.TotalCells {
		if b.GetCell(cell) != 0 {
			continue
		}
		cands := b.GetCandidatesAt(cell).ToSlice()
		for i := range cands {
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
func bfsAIC(b BoardInterface, start candidateNode, startPolarity bool, strongLinks, weakLinks map[candidateNode][]candidateNode) *core.Move {
	type queueItem struct {
		chain    []candidateNode
		polarity bool // current polarity: true=ON, false=OFF
	}

	// Start chain with the initial node (polarity true means "assume ON")
	queue := []queueItem{{chain: []candidateNode{start}, polarity: startPolarity}}

	// Both readings in checkChainConclusion require the start and end
	// polarities to agree. The start is always ON and the polarity flips at
	// every step, so only an odd chain length can conclude. A conclusion is
	// checked on a chain one longer than the one being extended, which puts the
	// longest concluding chain at maxChainLength+1. Raising this bound by one
	// therefore only admits an even length, which concludes nothing.
	// mutator-disable-next-line numbers/incrementer
	maxChainLength := 10

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if len(current.chain) > maxChainLength {
			// Abandoning the whole search here reaches the same answer. The
			// queue is strictly level-ordered, since a chain is only ever
			// appended while extending one exactly a node shorter, so by the
			// time an over-long chain is dequeued every shorter chain has been
			// extended and every conclusion checked, and everything still
			// queued is over-long too.
			// mutator-disable-next-line loop/break
			continue
		}

		lastNode := current.chain[len(current.chain)-1]

		// Determine which links to follow based on alternation
		// After a strong link (polarity ON), we follow weak links
		// After a weak link (polarity OFF), we follow strong links
		var nextLinks []candidateNode

		if current.polarity {
			// Current node is ON, follow weak links (next will be OFF)
			nextLinks = weakLinks[lastNode]
		} else {
			// Current node is OFF, follow strong links (next will be ON)
			nextLinks = strongLinks[lastNode]
		}

		for _, nextNode := range nextLinks {
			// Revisiting a node would close the chain onto itself rather than
			// extend it, so the branch is abandoned.
			if containsNode(current.chain, nextNode) {
				continue
			}

			newChain := make([]candidateNode, len(current.chain)+1)
			copy(newChain, current.chain)
			newChain[len(current.chain)] = nextNode
			nextPolarity := !current.polarity

			// Check for valid chain conclusions (need at least 3 nodes).
			// Lowering the bound changes nothing: a two-node chain ends OFF
			// while the start is ON, and both readings need them to agree.
			// mutator-disable-next-line numbers/decrementer
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
func checkChainConclusion(b BoardInterface, chain []candidateNode, start candidateNode, startPolarity bool, end candidateNode, endPolarity bool) *core.Move {
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
				Targets:     []core.CellRef{{Row: start.cell / constants.GridSize, Col: start.cell % constants.GridSize}},
				Explanation: fmt.Sprintf("AIC: Chain proves r%dc%d must be %d", start.cell/constants.GridSize+1, start.cell%constants.GridSize+1, start.digit),
				Highlights:  buildAICHighlights(chain),
			}
		}
	}

	// Type 2: Endpoints have same digit, both ON, but are DIFFERENT cells that SEE each other
	// Chain proves: Start=ON => End=ON
	// But if they see each other, they can't both be ON (weak link)
	// This is a CONTRADICTION - therefore Start must be OFF!
	// We eliminate the digit from Start.
	// The endpoints being different cells is not checked here. Type 1 above
	// returns for every chain whose endpoints are the same cell and digit with
	// both polarities ON, which is exactly what would reach this line, and
	// ArePeers refuses a cell as its own peer in any case.
	if start.digit == end.digit && startPolarity && endPolarity {
		if ArePeers(start.cell, end.cell) {
			// Contradiction: Start=ON leads to End=ON, but they see each other
			// So Start CANNOT be ON - eliminate it
			return &core.Move{
				Technique:    "aic",
				Action:       "eliminate",
				Digit:        start.digit,
				Targets:      getChainCellRefs(chain),
				Eliminations: []core.Candidate{{Row: start.cell / constants.GridSize, Col: start.cell % constants.GridSize, Digit: start.digit}},
				Explanation: fmt.Sprintf("AIC: Chain proves r%dc%d=%d leads to r%dc%d=%d, but they see each other - contradiction",
					start.cell/constants.GridSize+1, start.cell%constants.GridSize+1, start.digit, end.cell/constants.GridSize+1, end.cell%constants.GridSize+1, end.digit),
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
func getChainCellRefs(chain []candidateNode) []core.CellRef {
	refs := make([]core.CellRef, len(chain))
	for i, n := range chain {
		refs[i] = core.CellRef{Row: n.cell / constants.GridSize, Col: n.cell % constants.GridSize}
	}
	return refs
}

// buildAICHighlights creates highlight information for the chain
func buildAICHighlights(chain []candidateNode) core.Highlights {
	highlights := core.Highlights{
		Primary:   []core.CellRef{},
		Secondary: []core.CellRef{},
	}

	for _, n := range chain {
		cellRef := core.CellRef{Row: n.cell / constants.GridSize, Col: n.cell % constants.GridSize}
		highlights.Primary = append(highlights.Primary, cellRef)
	}

	return highlights
}
