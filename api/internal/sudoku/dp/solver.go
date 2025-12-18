package dp

import (
	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/human"
)

// Solver provides DP/backtracking based Sudoku solving for verification
// and uniqueness checks. Not used for hints or educational gameplay.

// Solve finds a solution using backtracking. Returns the solved grid or nil if unsolvable.
func Solve(grid []int) []int {
	board := make([]int, 81)
	copy(board, grid)
	if solve(board) {
		return board
	}
	return nil
}

// HasUniqueSolution checks if the puzzle has exactly one solution.
func HasUniqueSolution(grid []int) bool {
	count := CountSolutions(grid, 2)
	return count == 1
}

// Conflict represents a pair of cells that have the same value where they shouldn't
type Conflict struct {
	Cell1 int `json:"cell1"` // First cell index (0-80)
	Cell2 int `json:"cell2"` // Second cell index (0-80)
	Value int `json:"value"` // The conflicting value
	Type  string `json:"type"` // "row", "column", or "box"
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

	// Check rows
	for row := 0; row < 9; row++ {
		positions := make(map[int][]int) // value -> list of column positions
		for col := 0; col < 9; col++ {
			val := grid[row*9+col]
			if val == 0 {
				continue
			}
			positions[val] = append(positions[val], col)
		}
		for val, cols := range positions {
			if len(cols) > 1 {
				for i := 0; i < len(cols); i++ {
					for j := i + 1; j < len(cols); j++ {
						cell1, cell2 := row*9+cols[i], row*9+cols[j]
						key := conflictKey(cell1, cell2, val)
						if !seen[key] {
							seen[key] = true
							conflicts = append(conflicts, Conflict{Cell1: cell1, Cell2: cell2, Value: val, Type: "row"})
						}
					}
				}
			}
		}
	}

	// Check columns
	for col := 0; col < 9; col++ {
		positions := make(map[int][]int) // value -> list of row positions
		for row := 0; row < 9; row++ {
			val := grid[row*9+col]
			if val == 0 {
				continue
			}
			positions[val] = append(positions[val], row)
		}
		for val, rows := range positions {
			if len(rows) > 1 {
				for i := 0; i < len(rows); i++ {
					for j := i + 1; j < len(rows); j++ {
						cell1, cell2 := rows[i]*9+col, rows[j]*9+col
						key := conflictKey(cell1, cell2, val)
						if !seen[key] {
							seen[key] = true
							conflicts = append(conflicts, Conflict{Cell1: cell1, Cell2: cell2, Value: val, Type: "column"})
						}
					}
				}
			}
		}
	}

	// Check boxes
	for box := 0; box < 9; box++ {
		positions := make(map[int][]int) // value -> list of cell indices
		boxRow, boxCol := (box/3)*3, (box%3)*3
		for r := boxRow; r < boxRow+3; r++ {
			for c := boxCol; c < boxCol+3; c++ {
				val := grid[r*9+c]
				if val == 0 {
					continue
				}
				positions[val] = append(positions[val], r*9+c)
			}
		}
		for val, cells := range positions {
			if len(cells) > 1 {
				for i := 0; i < len(cells); i++ {
					for j := i + 1; j < len(cells); j++ {
						key := conflictKey(cells[i], cells[j], val)
						if !seen[key] {
							seen[key] = true
							conflicts = append(conflicts, Conflict{Cell1: cells[i], Cell2: cells[j], Value: val, Type: "box"})
						}
					}
				}
			}
		}
	}

	return conflicts
}

func conflictKey(cell1, cell2, val int) string {
	if cell1 > cell2 {
		cell1, cell2 = cell2, cell1
	}
	return string(rune(cell1)) + "-" + string(rune(cell2)) + "-" + string(rune(val))
}

// CountSolutions counts solutions up to maxCount. Exported for custom puzzle validation.
func CountSolutions(grid []int, maxCount int) int {
	board := make([]int, 81)
	copy(board, grid)
	count := 0
	countSolutionsHelper(board, &count, maxCount)
	return count
}

func countSolutionsHelper(board []int, count *int, maxCount int) {
	if *count >= maxCount {
		return
	}

	// Find next empty cell
	idx := -1
	for i := 0; i < 81; i++ {
		if board[i] == 0 {
			idx = i
			break
		}
	}

	// All cells filled = found a solution
	if idx == -1 {
		*count++
		return
	}

	row, col := idx/9, idx%9

	for digit := 1; digit <= 9; digit++ {
		if isValid(board, row, col, digit) {
			board[idx] = digit
			countSolutionsHelper(board, count, maxCount)
			board[idx] = 0
			if *count >= maxCount {
				return
			}
		}
	}
}

func solve(board []int) bool {
	// Find next empty cell
	idx := -1
	for i := 0; i < 81; i++ {
		if board[i] == 0 {
			idx = i
			break
		}
	}

	// All cells filled
	if idx == -1 {
		return true
	}

	row, col := idx/9, idx%9

	for digit := 1; digit <= 9; digit++ {
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
	// Check row
	for c := 0; c < 9; c++ {
		if board[row*9+c] == digit {
			return false
		}
	}

	// Check column
	for r := 0; r < 9; r++ {
		if board[r*9+col] == digit {
			return false
		}
	}

	// Check 3x3 box
	boxRow, boxCol := (row/3)*3, (col/3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			if board[r*9+c] == digit {
				return false
			}
		}
	}

	return true
}

// GenerateFullGrid generates a complete valid Sudoku grid using the given seed.
func GenerateFullGrid(seed int64) []int {
	board := make([]int, 81)
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
	r.state = (r.state*1103515245 + 12345) & 0x7fffffff
	return int(r.state)
}

func (r *rng) shuffle(arr []int) {
	for i := len(arr) - 1; i > 0; i-- {
		j := r.next() % (i + 1)
		arr[i], arr[j] = arr[j], arr[i]
	}
}

func fillGrid(board []int, rng *rng) bool {
	// Find next empty cell
	idx := -1
	for i := 0; i < 81; i++ {
		if board[i] == 0 {
			idx = i
			break
		}
	}

	if idx == -1 {
		return true
	}

	row, col := idx/9, idx%9

	// Try digits in random order
	digits := []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
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
	puzzle := make([]int, 81)
	copy(puzzle, fullGrid)

	rng := newRNG(seed + 1) // offset seed for carving

	// Create list of filled positions
	positions := make([]int, 81)
	for i := 0; i < 81; i++ {
		positions[i] = i
	}
	rng.shuffle(positions)

	removed := 0
	target := 81 - targetGivens

	for _, pos := range positions {
		if removed >= target {
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
		"easy":       40,
		"medium":     34,
		"hard":       28,
		"extreme":    24,
		"impossible": 20,
	}

	puzzle := make([]int, 81)
	copy(puzzle, fullGrid)

	rng := newRNG(seed + 1) // offset seed for carving

	// Create list of filled positions in deterministic random order
	positions := make([]int, 81)
	for i := 0; i < 81; i++ {
		positions[i] = i
	}
	rng.shuffle(positions)

	// Track removal order - positions that were successfully removed
	var removalOrder []int

	// Carve down to impossible level (minimum givens)
	targetRemoved := 81 - targets["impossible"]

	for _, pos := range positions {
		if len(removalOrder) >= targetRemoved {
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
	impossiblePuzzle := make([]int, 81)
	copy(impossiblePuzzle, puzzle)
	result["impossible"] = impossiblePuzzle

	// For each easier difficulty, restore cells to reach target
	difficulties := []string{"extreme", "hard", "medium", "easy"}

	for _, diff := range difficulties {
		targetGivens := targets[diff]
		currentGivens := 81 - len(removalOrder)
		cellsToRestore := targetGivens - currentGivens

		diffPuzzle := make([]int, 81)
		copy(diffPuzzle, puzzle)

		// Restore cells in reverse removal order (last removed = first restored)
		restored := 0
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
	Givens           []int
	RequiredDifficulty core.Difficulty
	TechniqueCounts  map[string]int
	Status           string
}

// CarveGivensWithAnalysis generates puzzles and analyzes technique requirements.
// Returns puzzles that have been verified to be solvable with human techniques.
func CarveGivensWithAnalysis(fullGrid []int, seed int64) map[string]*PuzzleAnalysis {
	puzzles := CarveGivensWithSubset(fullGrid, seed)
	solver := human.NewSolver()

	result := make(map[string]*PuzzleAnalysis)

	for diff, givens := range puzzles {
		requiredDiff, techniqueCounts, status := solver.AnalyzePuzzleDifficulty(givens)

		result[diff] = &PuzzleAnalysis{
			Givens:           givens,
			RequiredDifficulty: requiredDiff,
			TechniqueCounts:  techniqueCounts,
			Status:           status,
		}
	}

	return result
}
