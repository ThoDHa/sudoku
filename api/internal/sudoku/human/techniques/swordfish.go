package techniques

import (
	"fmt"
	"maps"
	"slices"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Swordfish Detection
// ============================================================================
//
// Swordfish is a fish pattern that uses 3 rows and 3 columns.
// If a digit appears 2-3 times in each of 3 rows, and those positions
// align to exactly 3 columns, the digit can be eliminated from other
// cells in those columns (and vice versa for column-based Swordfish).

// DetectSwordfish finds Swordfish patterns
func DetectSwordfish(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		if move := detectSwordfishInRows(b, digit); move != nil {
			return move
		}
		if move := detectSwordfishInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

func detectSwordfishInRows(b BoardInterface, digit int) *core.Move {
	return detectSwordfishInAxis(b, digit, true)
}

func detectSwordfishInCols(b BoardInterface, digit int) *core.Move {
	return detectSwordfishInAxis(b, digit, false)
}

// detectSwordfishInAxis scans for a Swordfish in rows (byRow=true) or columns.
// A Swordfish uses three lines whose digit candidates project onto exactly three
// perpendicular coordinates, allowing eliminations on those perpendicular lines
// outside the three source lines.
func detectSwordfishInAxis(b BoardInterface, digit int, byRow bool) *core.Move {
	lineToPerps := swordfishLinePositions(b, digit, byRow)
	// Sorted so the first Swordfish found is deterministic (Go randomizes map range).
	lines := slices.Sorted(maps.Keys(lineToPerps))
	if len(lines) < 3 {
		return nil
	}
	for i := range lines {
		for j := i + 1; j < len(lines); j++ {
			for k := j + 1; k < len(lines); k++ {
				l1, l2, l3 := lines[i], lines[j], lines[k]
				perpSet := unionInts(lineToPerps[l1], lineToPerps[l2], lineToPerps[l3])
				if len(perpSet) != 3 {
					continue
				}
				if m := buildSwordfishMove(b, digit, l1, l2, l3, lineToPerps, perpSet, byRow); m != nil {
					return m
				}
			}
		}
	}
	return nil
}

// swordfishLinePositions returns, for each line where digit has 2-3 candidate
// positions, the perpendicular coordinates of those positions.
func swordfishLinePositions(b BoardInterface, digit int, byRow bool) map[int][]int {
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
		if len(perps) >= 2 && len(perps) <= 3 {
			result[i] = perps
		}
	}
	return result
}

// unionInts returns the set of unique ints across the input slices.
func unionInts(slices ...[]int) map[int]bool {
	s := map[int]bool{}
	for _, sl := range slices {
		for _, x := range sl {
			s[x] = true
		}
	}
	return s
}

// buildSwordfishMove constructs the Swordfish elimination move for three source
// lines whose perpendicular projections cover exactly perpSet.
func buildSwordfishMove(b BoardInterface, digit, l1, l2, l3 int, lineToPerps map[int][]int, perpSet map[int]bool, byRow bool) *core.Move {
	lines := []int{l1, l2, l3}
	// Sorted so the explanation text and elimination order are deterministic.
	perps := slices.Sorted(maps.Keys(perpSet))
	eliminations := collectSwordfishElims(b, digit, lines, perps, byRow)
	if len(eliminations) == 0 {
		return nil
	}
	targets := swordfishTargets(lines, lineToPerps, byRow)
	return &core.Move{
		Action:       "eliminate",
		Digit:        digit,
		Targets:      targets,
		Eliminations: eliminations,
		Explanation:  swordfishExplanation(digit, lines, perps, byRow),
		Highlights:   core.Highlights{Primary: targets},
	}
}

// collectSwordfishElims walks each perpendicular coordinate and collects cells
// outside the three source lines that hold digit as a candidate.
func collectSwordfishElims(b BoardInterface, digit int, lines, perps []int, byRow bool) []core.Candidate {
	inLines := map[int]bool{}
	for _, l := range lines {
		inLines[l] = true
	}
	var eliminations []core.Candidate
	for _, perp := range perps {
		for k := range constants.GridSize {
			if inLines[k] {
				continue
			}
			var idx int
			var cand core.Candidate
			if byRow {
				idx = k*constants.GridSize + perp
				cand = core.Candidate{Row: k, Col: perp, Digit: digit}
			} else {
				idx = perp*constants.GridSize + k
				cand = core.Candidate{Row: perp, Col: k, Digit: digit}
			}
			if b.GetCandidatesAt(idx).Has(digit) {
				eliminations = append(eliminations, cand)
			}
		}
	}
	return eliminations
}

// swordfishTargets builds the primary highlight targets from each source line's
// candidate positions. For byRow, line=row and perp=col; for byCol, line=col
// and perp=row, so the CellRef fields swap accordingly.
func swordfishTargets(lines []int, lineToPerps map[int][]int, byRow bool) []core.CellRef {
	var targets []core.CellRef
	for _, line := range lines {
		for _, perp := range lineToPerps[line] {
			if byRow {
				targets = append(targets, core.CellRef{Row: line, Col: perp})
			} else {
				targets = append(targets, core.CellRef{Row: perp, Col: line})
			}
		}
	}
	return targets
}

// swordfishExplanation formats the Swordfish description.
func swordfishExplanation(digit int, lines, perps []int, byRow bool) string {
	if byRow {
		return fmt.Sprintf("Swordfish: %d in rows %d,%d,%d columns %d,%d,%d",
			digit, lines[0]+1, lines[1]+1, lines[2]+1,
			perps[0]+1, perps[1]+1, perps[2]+1)
	}
	return fmt.Sprintf("Swordfish: %d in columns %d,%d,%d rows %d,%d,%d",
		digit, perps[0]+1, perps[1]+1, perps[2]+1,
		lines[0]+1, lines[1]+1, lines[2]+1)
}

// ============================================================================
// Finned Swordfish Detection
// ============================================================================
//
// Similar to regular Swordfish but with "fin" cells:
// - 3 rows where a digit appears in 2-4 positions
// - Positions align to exactly 3 columns (or vice versa)
// - One row has extra positions (the "fin") not in the main columns
// - Eliminate the digit from cells that are in one of the 3 columns AND see the fin cell

func DetectFinnedSwordfish(b BoardInterface) *core.Move {
	for digit := 1; digit <= constants.GridSize; digit++ {
		if move := detectFinnedSwordfishInRows(b, digit); move != nil {
			return move
		}
		if move := detectFinnedSwordfishInCols(b, digit); move != nil {
			return move
		}
	}
	return nil
}

// finnedLineInfo describes one source line of a potential finned swordfish.
// line is the row index (byRow=true) or column index (otherwise); perps holds
// the perpendicular coordinates (cols for rows, rows for cols) where digit
// appears.
type finnedLineInfo struct {
	line  int
	perps []int
}

func detectFinnedSwordfishInRows(b BoardInterface, digit int) *core.Move {
	return detectFinnedSwordfishInAxis(b, digit, true)
}

func detectFinnedSwordfishInCols(b BoardInterface, digit int) *core.Move {
	return detectFinnedSwordfishInAxis(b, digit, false)
}

// detectFinnedSwordfishInAxis scans for a finned swordfish in rows (byRow=true)
// or columns. For each combination of three candidate lines it tries each line
// as the finned one and delegates the configuration check.
func detectFinnedSwordfishInAxis(b BoardInterface, digit int, byRow bool) *core.Move {
	lines := collectFinnedLines(b, digit, byRow)
	if len(lines) < 3 {
		return nil
	}
	for i := range lines {
		for j := i + 1; j < len(lines); j++ {
			for k := j + 1; k < len(lines); k++ {
				l1, l2, l3 := lines[i], lines[j], lines[k]
				configs := [][]finnedLineInfo{
					{l1, l2, l3},
					{l2, l1, l3},
					{l3, l1, l2},
				}
				for _, cfg := range configs {
					if m := tryFinnedSwordfishConfig(b, digit, cfg[0], cfg[1], cfg[2], byRow); m != nil {
						return m
					}
				}
			}
		}
	}
	return nil
}

// collectFinnedLines returns lines where digit has between 2 and 4 candidate
// positions, in source-line order.
func collectFinnedLines(b BoardInterface, digit int, byRow bool) []finnedLineInfo {
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
		if len(perps) >= 2 && len(perps) <= 4 {
			lines = append(lines, finnedLineInfo{i, perps})
		}
	}
	return lines
}

// tryFinnedSwordfishConfig validates one (finned, base1, base2) configuration
// and returns the elimination move if the configuration is a legal finned
// swordfish with eliminations.
func tryFinnedSwordfishConfig(b BoardInterface, digit int, finned, base1, base2 finnedLineInfo, byRow bool) *core.Move {
	if len(base1.perps) > 3 || len(base2.perps) > 3 {
		return nil
	}
	basePerpSet := unionInts(base1.perps, base2.perps)
	if len(basePerpSet) != 3 {
		return nil
	}
	mainPerps, finPerps := splitMainAndFins(finned.perps, basePerpSet)
	if len(mainPerps) < 2 || len(finPerps) == 0 {
		return nil
	}
	if !finsInSameBoxAxis(finPerps) {
		return nil
	}
	targetPerps := perpsSharingBoxWithFins(mainPerps, finPerps)
	if len(targetPerps) == 0 {
		return nil
	}
	return buildFinnedSwordfishMove(b, digit, finned, base1, base2, mainPerps, finPerps, targetPerps, byRow)
}

// splitMainAndFins partitions perps into those in baseSet (main) and those not (fins).
func splitMainAndFins(perps []int, baseSet map[int]bool) (main, fins []int) {
	for _, p := range perps {
		if baseSet[p] {
			main = append(main, p)
		} else {
			fins = append(fins, p)
		}
	}
	return main, fins
}

// finsInSameBoxAxis reports whether all fin perpendicular coordinates fall in
// the same box along the perpendicular axis.
func finsInSameBoxAxis(finPerps []int) bool {
	if len(finPerps) <= 1 {
		return true
	}
	boxAxis := finPerps[0] / constants.BoxSize
	for _, fp := range finPerps[1:] {
		if fp/constants.BoxSize != boxAxis {
			return false
		}
	}
	return true
}

// perpsSharingBoxWithFins returns the main perps that share the fins' box axis.
func perpsSharingBoxWithFins(mainPerps, finPerps []int) []int {
	finBoxAxis := finPerps[0] / constants.BoxSize
	var shared []int
	for _, mp := range mainPerps {
		if mp/constants.BoxSize == finBoxAxis {
			shared = append(shared, mp)
		}
	}
	return shared
}

// buildFinnedSwordfishMove collects eliminations and assembles the move.
func buildFinnedSwordfishMove(
	b BoardInterface, digit int,
	finned, base1, base2 finnedLineInfo,
	mainPerps, finPerps, targetPerps []int,
	byRow bool,
) *core.Move {
	eliminations := collectFinnedSwordfishElims(b, digit, finned, base1, base2, targetPerps, finPerps, byRow)
	if len(eliminations) == 0 {
		return nil
	}
	targets := finnedSwordfishTargets(base1, base2, finned, mainPerps, byRow)
	finCells := lineCells(finned.line, finPerps, byRow)
	lineIndices := []int{base1.line, base2.line, finned.line}
	return &core.Move{
		Action:       "eliminate",
		Digit:        digit,
		Targets:      targets,
		Eliminations: eliminations,
		Explanation:  finnedSwordfishExplanation(digit, lineIndices, finned.line, finPerps[0], byRow),
		Highlights: core.Highlights{
			Primary:   targets,
			Secondary: finCells,
		},
	}
}

// collectFinnedSwordfishElims walks the perpendicular target coords within the
// fin's parallel box, collecting cells (outside the three source lines) that
// hold digit as a candidate and see every fin cell.
func collectFinnedSwordfishElims(
	b BoardInterface, digit int,
	finned, base1, base2 finnedLineInfo,
	targetPerps, finPerps []int,
	byRow bool,
) []core.Candidate {
	swordfishLines := map[int]bool{
		finned.line: true,
		base1.line:  true,
		base2.line:  true,
	}
	parallelStart := (finned.line / constants.BoxSize) * constants.BoxSize
	var eliminations []core.Candidate
	for _, tp := range targetPerps {
		for k := parallelStart; k < parallelStart+constants.BoxSize; k++ {
			if swordfishLines[k] {
				continue
			}
			idx, cand := finnedElimCell(k, tp, digit, byRow)
			if !b.GetCandidatesAt(idx).Has(digit) {
				continue
			}
			if !seesAllFins(finned.line, finPerps, idx, byRow) {
				continue
			}
			eliminations = append(eliminations, cand)
		}
	}
	return eliminations
}

// finnedElimCell returns the cell index and Candidate struct for a walk coordinate
// k along the source-line axis at perpendicular coordinate tp.
func finnedElimCell(k, tp, digit int, byRow bool) (int, core.Candidate) {
	if byRow {
		return k*constants.GridSize + tp, core.Candidate{Row: k, Col: tp, Digit: digit}
	}
	return tp*constants.GridSize + k, core.Candidate{Row: tp, Col: k, Digit: digit}
}

// seesAllFins reports whether idx is a peer of every fin cell.
func seesAllFins(finnedLine int, finPerps []int, idx int, byRow bool) bool {
	for _, fp := range finPerps {
		var finIdx int
		if byRow {
			finIdx = finnedLine*constants.GridSize + fp
		} else {
			finIdx = fp*constants.GridSize + finnedLine
		}
		if !ArePeers(idx, finIdx) {
			return false
		}
	}
	return true
}

// finnedSwordfishTargets builds the primary highlight targets from each base
// line's candidate positions plus the finned line's main positions.
func finnedSwordfishTargets(base1, base2, finned finnedLineInfo, mainPerps []int, byRow bool) []core.CellRef {
	var targets []core.CellRef
	targets = append(targets, lineCells(base1.line, base1.perps, byRow)...)
	targets = append(targets, lineCells(base2.line, base2.perps, byRow)...)
	targets = append(targets, lineCells(finned.line, mainPerps, byRow)...)
	return targets
}

// lineCells returns the CellRefs for the given line at each perpendicular coord.
func lineCells(line int, perps []int, byRow bool) []core.CellRef {
	var cells []core.CellRef
	for _, p := range perps {
		if byRow {
			cells = append(cells, core.CellRef{Row: line, Col: p})
		} else {
			cells = append(cells, core.CellRef{Row: p, Col: line})
		}
	}
	return cells
}

// finnedSwordfishExplanation formats the human-readable description.
func finnedSwordfishExplanation(digit int, lineIndices []int, finnedLine, firstFinPerp int, byRow bool) string {
	if byRow {
		return fmt.Sprintf("Finned Swordfish: %d in rows %d,%d,%d with fin at R%dC%d",
			digit, lineIndices[0]+1, lineIndices[1]+1, lineIndices[2]+1,
			finnedLine+1, firstFinPerp+1)
	}
	return fmt.Sprintf("Finned Swordfish: %d in columns %d,%d,%d with fin at R%dC%d",
		digit, lineIndices[0]+1, lineIndices[1]+1, lineIndices[2]+1,
		firstFinPerp+1, finnedLine+1)
}
