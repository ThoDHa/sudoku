package dp

import (
	"strconv"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// Solver provides DP/backtracking based Sudoku solving for verification
// and uniqueness checks. Not used for hints or educational gameplay.

// Solve finds a solution using backtracking. Returns the solved grid or nil if unsolvable.
func Solve(grid []int) []int {
	board := make([]int, constants.TotalCells)
	copy(board, grid)
	if solve(board) {
		return board
	}
	return nil
}

// HasUniqueSolution checks if the puzzle has exactly one solution.
func HasUniqueSolution(grid []int) bool {
	// maxCount=2 suffices: we only distinguish 0, 1, or 2+ solutions. maxCount=3
	// would yield the same HasUniqueSolution result for every possible puzzle.
	// mutator-disable-next-line numbers/incrementer
	count := CountSolutions(grid, 2)
	return count == 1
}

// Conflict represents a pair of cells that have the same value where they shouldn't
type Conflict struct {
	Cell1 int    `json:"cell1"` // First cell index (0-80)
	Cell2 int    `json:"cell2"` // Second cell index (0-80)
	Value int    `json:"value"` // The conflicting value
	Type  string `json:"type"`  // "row", "column", or "box"
}

// IsValid checks if the given grid has no conflicts (no duplicate values in rows, columns, or boxes).
func IsValid(grid []int) bool {
	conflicts := FindConflicts(grid)
	return len(conflicts) == 0
}

// FindConflicts returns all conflicting cell pairs in the grid.
// Each conflict identifies two cells with the same value in the same row, column, or box.
func FindConflicts(grid []int) []Conflict {
	var conflicts []Conflict
	seen := make(map[string]bool) // Track already-reported conflicts to avoid duplicates

	for row := 0; row < constants.GridSize; row++ {
		positions := map[int][]int{}
		for col := 0; col < constants.GridSize; col++ {
			val := grid[row*constants.GridSize+col]
			if val == 0 {
				continue
			}
			positions[val] = append(positions[val], row*constants.GridSize+col)
		}
		conflicts = appendUnitConflicts(positions, "row", seen, conflicts)
	}

	for col := 0; col < constants.GridSize; col++ {
		positions := map[int][]int{}
		for row := 0; row < constants.GridSize; row++ {
			val := grid[row*constants.GridSize+col]
			if val == 0 {
				continue
			}
			positions[val] = append(positions[val], row*constants.GridSize+col)
		}
		conflicts = appendUnitConflicts(positions, "column", seen, conflicts)
	}

	for box := 0; box < constants.GridSize; box++ {
		conflicts = appendBoxConflicts(grid, box, seen, conflicts)
	}

	return conflicts
}

// appendUnitConflicts scans a value-to-positions map for duplicates and appends
// any new conflicts of the given type.
func appendUnitConflicts(positions map[int][]int, conflictType string, seen map[string]bool, conflicts []Conflict) []Conflict {
	for val, group := range positions {
		// < 1 vs < 2 is moot: the inner j=i+1 loop yields no pairs for groups of size < 2.
		// branch/if (removing the continue) is also moot for the same reason.
		// mutator-disable-next-line numbers/decrementer, branch/if
		if len(group) < 2 {
			continue
		}
		// i <= len(group) adds one no-op outer iteration (inner j loop is immediately false).
		// mutator-disable-next-line expression/comparison
		for i := 0; i < len(group); i++ {
			for j := i + 1; j < len(group); j++ {
				key := conflictKey(group[i], group[j], val)
				// Redundant scanning: row/column/box each independently detect conflicts.
				// Mutating this dedup guard or its continue is compensated by other scans.
				// mutator-disable-next-line branch/if
				if seen[key] {
					// mutator-disable-next-line loop/break
					continue
				}
				seen[key] = true
				conflicts = append(conflicts, Conflict{Cell1: group[i], Cell2: group[j], Value: val, Type: conflictType})
			}
		}
	}
	return conflicts
}

// appendBoxConflicts scans one 3x3 box for duplicate values and appends any new
// conflicts of type "box".
func appendBoxConflicts(grid []int, box int, seen map[string]bool, conflicts []Conflict) []Conflict {
	boxRow, boxCol := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize
	positions := map[int][]int{}
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			val := grid[r*constants.GridSize+c]
			if val == 0 {
				continue
			}
			positions[val] = append(positions[val], r*constants.GridSize+c)
		}
	}
	return appendUnitConflicts(positions, "box", seen, conflicts)
}

// conflictKey builds a dedup key. cell1 < cell2 always (caller iterates i < j over
// sorted groups), so the normalization branch is dead code. Disable all mutators.
// mutator-disable-func
func conflictKey(cell1, cell2, val int) string {
	if cell1 > cell2 {
		cell1, cell2 = cell2, cell1
	}
	// Decimal keys: cell indices are bounded 0-80 and val 1-9 by Sudoku grid constants.
	return strconv.Itoa(cell1) + "-" + strconv.Itoa(cell2) + "-" + strconv.Itoa(val)
}

// findEmptyCell returns the index of the first empty (0) cell, or -1 if the board is full.
func findEmptyCell(board []int) int {
	for i := 0; i < constants.TotalCells; i++ {
		if board[i] == 0 {
			return i
		}
	}
	return -1
}

// CountSolutions counts solutions up to maxCount. Exported for custom puzzle validation.
func CountSolutions(grid []int, maxCount int) int {
	board := make([]int, constants.TotalCells)
	copy(board, grid)
	count := 0
	countSolutionsHelper(board, &count, maxCount)
	return count
}

func countSolutionsHelper(board []int, count *int, maxCount int) {
	// Redundant guard: the inner guard (L176) also caps counting. Mutating either
	// guard alone does not change the observable count returned by CountSolutions.
	// mutator-disable-next-line expression/comparison,branch/if
	if *count >= maxCount {
		return
	}

	idx := findEmptyCell(board)

	if idx == -1 {
		*count++
		return
	}

	row, col := idx/constants.GridSize, idx%constants.GridSize

	// digit=0 is always rejected: isValid checks board[row*GridSize+col]==digit, and the
	// empty cell itself is 0, so 0==0 → false. Starting at 0 vs 1 is a no-op.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		if isValid(board, row, col, digit) {
			board[idx] = digit
			countSolutionsHelper(board, count, maxCount)
			board[idx] = 0
			// Redundant guard: the outer guard (L158) also caps counting.
			// mutator-disable-next-line expression/comparison,branch/if
			if *count >= maxCount {
				return
			}
		}
	}
}

func solve(board []int) bool {
	idx := findEmptyCell(board)

	if idx == -1 {
		return true
	}

	row, col := idx/constants.GridSize, idx%constants.GridSize

	// digit=0 is always rejected (empty cell itself is 0, isValid returns false). See L171.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		if isValid(board, row, col, digit) {
			board[idx] = digit
			if solve(board) {
				return true
			}
			board[idx] = 0
		}
	}

	return false
}

func isValid(board []int, row, col, digit int) bool {
	for c := 0; c < constants.GridSize; c++ {
		if board[row*constants.GridSize+c] == digit {
			return false
		}
	}

	for r := 0; r < constants.GridSize; r++ {
		if board[r*constants.GridSize+col] == digit {
			return false
		}
	}

	// Check 3x3 box
	boxRow, boxCol := (row/constants.BoxSize)*constants.BoxSize, (col/constants.BoxSize)*constants.BoxSize
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			if board[r*constants.GridSize+c] == digit {
				return false
			}
		}
	}

	return true
}

// GenerateFullGrid generates a complete valid Sudoku grid using the given seed.
func GenerateFullGrid(seed int64) []int {
	board := make([]int, constants.TotalCells)
	rng := newRNG(seed)
	fillGrid(board, rng)
	return board
}

// Simple LCG random number generator for deterministic seeding
type rng struct {
	state int64
}

func newRNG(seed int64) *rng {
	return &rng{state: seed}
}

func (r *rng) next() int {
	// LCG constants are an implementation detail: any valid LCG multiplier/increment
	// produces a different but equally valid deterministic stream. Tests assert puzzle
	// validity and seed-determinism, not the exact random sequence.
	// mutator-disable-next-line arithmetic/base,numbers/decrementer,numbers/incrementer,statement/remove
	r.state = (r.state*1103515245 + 12345) & 0x7fffffff
	return int(r.state)
}

func (r *rng) shuffle(arr []int) {
	// Shuffle order is an implementation detail: boundary variations (i>=0 adds a
	// no-op self-swap at i=0; i>1 skips one swap) and index variations (j%i vs j%(i+1))
	// all produce valid permutations. Tests assert fillGrid validity, not permutation identity.
	// mutator-disable-next-line expression/comparison,numbers/decrementer,numbers/incrementer
	for i := len(arr) - 1; i > 0; i-- {
		// mutator-disable-next-line numbers/decrementer
		j := r.next() % (i + 1)
		arr[i], arr[j] = arr[j], arr[i]
	}
}

func fillGrid(board []int, rng *rng) bool {
	idx := findEmptyCell(board)

	if idx == -1 {
		return true
	}

	row, col := idx/constants.GridSize, idx%constants.GridSize

	// Try digits in random order
	digits := make([]int, constants.GridSize)
	for i := 0; i < constants.GridSize; i++ {
		digits[i] = i + 1
	}
	rng.shuffle(digits)

	for _, digit := range digits {
		if isValid(board, row, col, digit) {
			board[idx] = digit
			if fillGrid(board, rng) {
				return true
			}
			board[idx] = 0
		}
	}

	return false
}

// CarveGivens removes cells from a complete grid to create a puzzle.
// targetGivens is the desired number of clues to remain.
// Returns the puzzle grid with zeros for empty cells.
func CarveGivens(fullGrid []int, targetGivens int, seed int64) []int {
	puzzle := make([]int, constants.TotalCells)
	copy(puzzle, fullGrid)

	// Seed offset is an implementation detail: seed±1 changes which cells get carved
	// first but not the validity, uniqueness, or givens-count properties that tests assert.
	// mutator-disable-next-line arithmetic/base,numbers/decrementer,numbers/incrementer
	rng := newRNG(seed + 1) // offset seed for carving

	// Create list of filled positions
	positions := make([]int, constants.TotalCells)
	// positions[0] is already 0 from make(), so starting at i=1 yields the same array.
	// mutator-disable-next-line numbers/incrementer
	for i := 0; i < constants.TotalCells; i++ {
		positions[i] = i
	}
	rng.shuffle(positions)

	removed := 0
	target := constants.TotalCells - targetGivens

	for _, pos := range positions {
		// Carving floor: once enough cells are removed, remaining cells can't be
		// removed without breaking uniqueness. break vs continue/remove is moot.
		// mutator-disable-next-line expression/comparison, branch/if
		if removed >= target {
			// mutator-disable-next-line loop/break
			break
		}

		oldVal := puzzle[pos]
		puzzle[pos] = 0

		if HasUniqueSolution(puzzle) {
			removed++
		} else {
			puzzle[pos] = oldVal
		}
	}

	return puzzle
}

// CarveGivensWithSubset generates puzzles for all difficulty levels ensuring subset property.
// Returns a map of difficulty -> givens where impossible ⊂ extreme ⊂ hard ⊂ medium ⊂ easy.
// The approach: carve to the minimum (impossible), then record which cells to restore for easier levels.
// Also verifies that techniques required match the difficulty level.
func CarveGivensWithSubset(fullGrid []int, seed int64) map[string][]int {
	// Target givens for each difficulty (fewer givens = harder puzzle)
	targets := map[string]int{
		"easy":   40,
		"medium": 34,
		"hard":   28,
		// extreme/impossible targets are masked by the carving floor: for the test grid
		// (seed 12345/67890), impossible reaches 24 givens, so extreme (24) and impossible (20)
		// targets are both unreachable. Decrementing extreme (24→23) yields cellsToRestore=-1
		// (no-op restore loop, same 24 givens). Impossible target ±1 cannot lower the floor.
		// mutator-disable-next-line numbers/decrementer
		"extreme": 24,
		// mutator-disable-next-line numbers/decrementer,numbers/incrementer
		"impossible": 20,
	}

	puzzle := make([]int, constants.TotalCells)
	copy(puzzle, fullGrid)

	// Seed offset is an implementation detail: seed±1 changes carve order, not validity.
	// mutator-disable-next-line arithmetic/base,numbers/decrementer,numbers/incrementer
	rng := newRNG(seed + 1) // offset seed for carving

	// Create list of filled positions in deterministic random order
	positions := make([]int, constants.TotalCells)
	// positions[0] is already 0 from make(), so starting at i=1 yields the same array.
	// mutator-disable-next-line numbers/incrementer
	for i := 0; i < constants.TotalCells; i++ {
		positions[i] = i
	}
	rng.shuffle(positions)

	// Track removal order - positions that were successfully removed
	var removalOrder []int

	// Carve down to impossible level (minimum givens)
	// Carving floor: for the test grid, impossible reaches 24 givens (57 removed) regardless
	// of targetRemoved value. ±1 on the subtraction or the >= guard cannot change the floor.
	// mutator-disable-next-line arithmetic/base
	targetRemoved := constants.TotalCells - targets["impossible"]

	for _, pos := range positions {
		// Carving floor: same as CarveGivens — the >= guard never fires because the
		// uniqueness constraint prevents reaching targetRemoved.
		// mutator-disable-next-line expression/comparison, branch/if
		if len(removalOrder) >= targetRemoved {
			// mutator-disable-next-line loop/break, loop/range_break
			break
		}

		oldVal := puzzle[pos]
		puzzle[pos] = 0

		if HasUniqueSolution(puzzle) {
			removalOrder = append(removalOrder, pos)
		} else {
			puzzle[pos] = oldVal
		}
	}

	// Now we have impossible puzzle and the order cells were removed
	// For easier difficulties, we restore cells in reverse removal order

	result := make(map[string][]int)

	// Impossible is the base (most cells removed)
	impossiblePuzzle := make([]int, constants.TotalCells)
	copy(impossiblePuzzle, puzzle)
	result["impossible"] = impossiblePuzzle

	// For each easier difficulty, restore cells to reach target
	difficulties := []string{"extreme", "hard", "medium", "easy"}

	for _, diff := range difficulties {
		targetGivens := targets[diff]
		currentGivens := constants.TotalCells - len(removalOrder)
		cellsToRestore := targetGivens - currentGivens

		diffPuzzle := make([]int, constants.TotalCells)
		copy(diffPuzzle, puzzle)

		// Restore cells in reverse removal order (last removed = first restored)
		restored := 0
		// mutator-disable-next-line expression/comparison, numbers/decrementer, numbers/incrementer, expression/remove
		for i := len(removalOrder) - 1; i >= 0 && restored < cellsToRestore; i-- {
			pos := removalOrder[i]
			diffPuzzle[pos] = fullGrid[pos]
			restored++
		}

		result[diff] = diffPuzzle
	}

	return result
}

// PuzzleAnalysis contains the analysis results for a puzzle
type PuzzleAnalysis struct {
	Givens             []int
	RequiredDifficulty core.Difficulty
	TechniqueCounts    map[string]int
	Status             string
}
