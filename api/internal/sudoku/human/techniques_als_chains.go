package human

import (
	"fmt"

	"sudoku-api/internal/core"
)

// detectALSXYWing finds ALS-XY-Wing pattern:
// - Three ALS (A, B, C) where:
//   - ALS A shares a restricted common (RC) digit X with ALS B
//   - ALS A shares a different RC digit Y with ALS C
//   - ALS B and C both contain digit Z (but don't share an RC on Z)
//   - Any cell seeing all Z candidates in both B and C can eliminate Z
//
// The logic: Since X is an RC between A and B, exactly one of them contains X.
// Similarly for Y between A and C. If A contains X, it doesn't contain Y (since
// A would be locked on its N digits). So either B has X locked out and contains Z,
// or C has Y locked out and contains Z. Either way, Z appears in B or C.
func detectALSXYWing(b *Board) *core.Move {
	allALS := findAllALS(b)

	// Try all combinations of 3 ALS for A, B, C
	n := len(allALS)
	for ai := 0; ai < n; ai++ {
		alsA := allALS[ai]

		for bi := 0; bi < n; bi++ {
			if bi == ai {
				continue
			}
			alsB := allALS[bi]

			// A and B must not share cells
			if alsShareCells(alsA, alsB) {
				continue
			}

			// Find restricted commons between A and B
			rcAB := findRestrictedCommons(alsA, alsB)
			if len(rcAB) == 0 {
				continue
			}

			for ci := 0; ci < n; ci++ {
				if ci == ai || ci == bi {
					continue
				}
				alsC := allALS[ci]

				// A and C must not share cells, B and C must not share cells
				if alsShareCells(alsA, alsC) || alsShareCells(alsB, alsC) {
					continue
				}

				// Find restricted commons between A and C
				rcAC := findRestrictedCommons(alsA, alsC)
				if len(rcAC) == 0 {
					continue
				}

				// Try each combination of RC digits X (A-B) and Y (A-C)
				for _, x := range rcAB {
					for _, y := range rcAC {
						if x == y {
							continue // X and Y must be different
						}

						// Find common digit Z in B and C (but Z should not be an RC between B and C)
						commonBC := findCommonDigits(alsB.Digits, alsC.Digits)
						for _, z := range commonBC {
							if z == x || z == y {
								continue
							}

							// Z must not be a restricted common between B and C
							// (if it were, the pattern would collapse)
							if isRestrictedCommon(alsB, alsC, z) {
								continue
							}

							// Find eliminations: cells seeing all Z in B and all Z in C
							zCellsB := alsB.ByDigit[z]
							zCellsC := alsC.ByDigit[z]

							if len(zCellsB) == 0 || len(zCellsC) == 0 {
								continue
							}

							eliminations := findZEliminations(b, z, zCellsB, zCellsC, alsA.Cells, alsB.Cells, alsC.Cells)

							if len(eliminations) > 0 {
								targets := buildTargets(alsA.Cells, alsB.Cells, alsC.Cells)
								return &core.Move{
									Action:       "eliminate",
									Digit:        z,
									Targets:      targets,
									Eliminations: eliminations,
									Explanation: fmt.Sprintf(
										"ALS-XY-Wing: A=%s, B=%s, C=%s; RC(A-B)=%d, RC(A-C)=%d; eliminate %d",
										formatCells(alsA.Cells), formatCells(alsB.Cells), formatCells(alsC.Cells),
										x, y, z),
									Highlights: core.Highlights{
										Primary: targets,
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

// detectALSXYChain finds ALS-XY-Chain pattern:
// - A chain of ALS connected by restricted commons
// - First and last ALS share a non-RC digit Z
// - Cells seeing all Z in first and last ALS can eliminate Z
//
// This extends ALS-XY-Wing to chains of arbitrary length.
func detectALSXYChain(b *Board) *core.Move {
	allALS := findAllALS(b)

	// Build adjacency: which ALS pairs have restricted commons
	n := len(allALS)
	adjRC := make(map[int]map[int][]int) // alsIdx -> alsIdx -> []RC digits

	for i := 0; i < n; i++ {
		adjRC[i] = make(map[int][]int)
		for j := 0; j < n; j++ {
			if i == j {
				continue
			}
			if alsShareCells(allALS[i], allALS[j]) {
				continue
			}
			rcs := findRestrictedCommons(allALS[i], allALS[j])
			if len(rcs) > 0 {
				adjRC[i][j] = rcs
			}
		}
	}

	// Try to find chains of length 3 to 6 (longer chains are rare)
	// Chain: ALS[0] --(RC1)--> ALS[1] --(RC2)--> ... --(RCn)--> ALS[n]
	// Each RC must be different from the previous to maintain the chain logic

	// Use DFS to find chains
	for startIdx := 0; startIdx < n; startIdx++ {
		// Try to find chains starting from startIdx
		if move := searchALSChain(b, allALS, adjRC, startIdx, 6); move != nil {
			return move
		}
	}

	return nil
}

// searchALSChain performs DFS to find valid ALS chains
func searchALSChain(b *Board, allALS []ALS, adjRC map[int]map[int][]int, startIdx int, maxLen int) *core.Move {
	type chainState struct {
		path    []int // ALS indices in the chain
		rcUsed  []int // RC digits used for each link
		visited map[int]bool
	}

	// Initialize with just the start ALS
	initial := chainState{
		path:    []int{startIdx},
		rcUsed:  []int{},
		visited: map[int]bool{startIdx: true},
	}

	stack := []chainState{initial}

	for len(stack) > 0 {
		curr := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		currALSIdx := curr.path[len(curr.path)-1]

		// Check if we have a valid chain (length >= 3)
		if len(curr.path) >= 3 {
			if move := checkChainElimination(b, allALS, curr.path, curr.rcUsed); move != nil {
				return move
			}
		}

		// Don't extend beyond max length
		if len(curr.path) >= maxLen {
			continue
		}

		// Extend the chain
		for nextIdx, rcs := range adjRC[currALSIdx] {
			if curr.visited[nextIdx] {
				continue
			}

			// The RC digit must be different from the last used RC (if any)
			for _, rc := range rcs {
				if len(curr.rcUsed) > 0 && curr.rcUsed[len(curr.rcUsed)-1] == rc {
					continue // Same RC as previous link - skip
				}

				// Also check that this RC is not the same as any other RC in the chain
				// to maintain proper alternation
				validRC := true
				for _, usedRC := range curr.rcUsed {
					if usedRC == rc {
						validRC = false
						break
					}
				}
				if !validRC {
					continue
				}

				// Create new state
				newPath := make([]int, len(curr.path)+1)
				copy(newPath, curr.path)
				newPath[len(curr.path)] = nextIdx

				newRCUsed := make([]int, len(curr.rcUsed)+1)
				copy(newRCUsed, curr.rcUsed)
				newRCUsed[len(curr.rcUsed)] = rc

				newVisited := make(map[int]bool)
				for k, v := range curr.visited {
					newVisited[k] = v
				}
				newVisited[nextIdx] = true

				stack = append(stack, chainState{
					path:    newPath,
					rcUsed:  newRCUsed,
					visited: newVisited,
				})
			}
		}
	}

	return nil
}

// checkChainElimination checks if a chain produces eliminations
func checkChainElimination(b *Board, allALS []ALS, path []int, rcUsed []int) *core.Move {
	firstALS := allALS[path[0]]
	lastALS := allALS[path[len(path)-1]]

	// Find common digits between first and last ALS
	commonDigits := findCommonDigits(firstALS.Digits, lastALS.Digits)

	// Collect all cells in the chain
	var allChainCells []int
	for _, alsIdx := range path {
		allChainCells = append(allChainCells, allALS[alsIdx].Cells...)
	}

	for _, z := range commonDigits {
		// Z must not be any of the RC digits used in the chain
		isRC := false
		for _, rc := range rcUsed {
			if rc == z {
				isRC = true
				break
			}
		}
		if isRC {
			continue
		}

		// Z must exist in both first and last ALS
		zCellsFirst := firstALS.ByDigit[z]
		zCellsLast := lastALS.ByDigit[z]

		if len(zCellsFirst) == 0 || len(zCellsLast) == 0 {
			continue
		}

		// Find cells that see all Z in first and last ALS
		eliminations := findZEliminations(b, z, zCellsFirst, zCellsLast, allChainCells)

		if len(eliminations) > 0 {
			targets := make([]core.CellRef, 0, len(allChainCells))
			for _, cell := range allChainCells {
				targets = append(targets, core.CellRef{Row: cell / 9, Col: cell % 9})
			}

			return &core.Move{
				Action:       "eliminate",
				Digit:        z,
				Targets:      targets,
				Eliminations: eliminations,
				Explanation: fmt.Sprintf(
					"ALS-XY-Chain: %d ALS linked by RCs %v; eliminate %d",
					len(path), rcUsed, z),
				Highlights: core.Highlights{
					Primary: targets,
				},
			}
		}
	}

	return nil
}

// findRestrictedCommons finds all digits that are restricted commons between two ALS
// A digit X is a restricted common if:
// - Both ALS contain X
// - All cells in A with X see all cells in B with X (or vice versa)
func findRestrictedCommons(a, b ALS) []int {
	var rcs []int

	commonDigits := findCommonDigits(a.Digits, b.Digits)
	for _, d := range commonDigits {
		if isRestrictedCommon(a, b, d) {
			rcs = append(rcs, d)
		}
	}

	return rcs
}

// isRestrictedCommon checks if digit d is a restricted common between two ALS
func isRestrictedCommon(a, b ALS, d int) bool {
	cellsA := a.ByDigit[d]
	cellsB := b.ByDigit[d]

	if len(cellsA) == 0 || len(cellsB) == 0 {
		return false
	}

	// All cells in A with d must see all cells in B with d
	return allSeeAll(cellsA, cellsB)
}

// findZEliminations finds cells that can eliminate digit z
// These cells must see all z-cells in the given groups and not be part of excluded cells
func findZEliminations(b *Board, z int, zCellsFirst, zCellsLast []int, excludedCellGroups ...[]int) []core.Candidate {
	// Build set of excluded cells
	excluded := make(map[int]bool)
	for _, group := range excludedCellGroups {
		for _, cell := range group {
			excluded[cell] = true
		}
	}

	var eliminations []core.Candidate
	for idx := 0; idx < 81; idx++ {
		if excluded[idx] {
			continue
		}
		if !b.Candidates[idx][z] {
			continue
		}

		// Must see all Z cells in first group
		seesAllFirst := true
		for _, zCell := range zCellsFirst {
			if !sees(idx, zCell) {
				seesAllFirst = false
				break
			}
		}
		if !seesAllFirst {
			continue
		}

		// Must see all Z cells in last group
		seesAllLast := true
		for _, zCell := range zCellsLast {
			if !sees(idx, zCell) {
				seesAllLast = false
				break
			}
		}
		if !seesAllLast {
			continue
		}

		eliminations = append(eliminations, core.Candidate{
			Row:   idx / 9,
			Col:   idx % 9,
			Digit: z,
		})
	}

	return eliminations
}

// buildTargets creates CellRef slice from multiple cell groups
func buildTargets(cellGroups ...[]int) []core.CellRef {
	var targets []core.CellRef
	for _, group := range cellGroups {
		for _, cell := range group {
			targets = append(targets, core.CellRef{Row: cell / 9, Col: cell % 9})
		}
	}
	return targets
}
