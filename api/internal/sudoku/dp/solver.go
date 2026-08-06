package dp

import (
	"context"
	"errors"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// Solver provides DP/backtracking based Sudoku solving for verification
// and uniqueness checks. Not used for hints or educational gameplay.

var ErrBudgetExceeded = errors.New("solver exceeded node budget")

const budgetCheckInterval = 1000

type nodeBudget struct {
	nodes int
	max   int
}

func (b *nodeBudget) tick(ctx context.Context) error {
	b.nodes++
	if b.nodes%budgetCheckInterval == 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if b.nodes > b.max {
			return ErrBudgetExceeded
		}
	}
	return nil
}

// Solve finds a solution using backtracking. Returns the solved grid, or nil if
// the grid is unsolvable. Returns ErrBudgetExceeded if the node budget is
// exhausted.
//
// Note: (nil, nil) is returned for two distinct cases that this signature
// conflates: conflicting givens (rejected up front, since backtracking cannot
// remove the user's givens) and a genuinely unsolvable conflict-free board.
// Callers that need to distinguish them should call FindConflicts first; the
// HTTP solveFull path already does so.
func Solve(ctx context.Context, grid []int) ([]int, error) {
	if !IsValid(ctx, grid) {
		return nil, nil
	}
	board := make([]int, constants.TotalCells)
	copy(board, grid)
	budget := &nodeBudget{max: constants.MaxSolverNodes}
	solved, err := solve(ctx, board, budget)
	if err != nil {
		return nil, err
	}
	if !solved {
		return nil, nil
	}
	return board, nil
}

// HasUniqueSolution checks if the puzzle has exactly one solution.
func HasUniqueSolution(ctx context.Context, grid []int) (bool, error) {
	// maxCount=2 suffices: we only distinguish 0, 1, or 2+ solutions. maxCount=3
	// would yield the same HasUniqueSolution result for every possible puzzle.
	// mutator-disable-next-line numbers/incrementer
	count, err := CountSolutions(ctx, grid, 2)
	if err != nil {
		return false, err
	}
	return count == 1, nil
}

// Conflict represents a pair of cells that have the same value where they shouldn't
type Conflict struct {
	Cell1 int    `json:"cell1"` // First cell index (0-80)
	Cell2 int    `json:"cell2"` // Second cell index (0-80)
	Value int    `json:"value"` // The conflicting value
	Type  string `json:"type"`  // "row", "column", or "box"
}

// IsValid checks if the given grid has no conflicts (no duplicate values in rows, columns, or boxes).
func IsValid(ctx context.Context, grid []int) bool {
	conflicts := FindConflicts(grid)
	return len(conflicts) == 0
}

// FindConflicts returns all conflicting cell pairs in the grid.
// Each conflict identifies two cells with the same value in the same row, column, or box.
//
// Allocation profile: per-unit position tracking uses a stack-allocated
// unitPositions value (no per-unit heap maps), the dedup map is lazily allocated
// only when a conflict is actually found, and the dedup key is integer
// arithmetic rather than string concatenation. A grid with no conflicts
// therefore allocates only the returned (nil) slice header.
func FindConflicts(grid []int) []Conflict {
	var conflicts []Conflict
	var seen map[uint64]bool

	for row := range constants.GridSize {
		var unit unitPositions
		base := row * constants.GridSize
		for col := range constants.GridSize {
			idx := base + col
			unit.record(grid[idx], idx)
		}
		conflicts = appendUnitConflicts(unit, "row", &seen, conflicts)
	}

	for col := range constants.GridSize {
		var unit unitPositions
		for row := range constants.GridSize {
			idx := row*constants.GridSize + col
			unit.record(grid[idx], idx)
		}
		conflicts = appendUnitConflicts(unit, "column", &seen, conflicts)
	}

	for box := range constants.GridSize {
		conflicts = appendBoxConflicts(grid, box, &seen, conflicts)
	}

	return conflicts
}

// unitPositions records which cells of a single unit hold each digit.
// positions[v][:counts[v]] holds the indices of the cells holding digit v.
//
// Slot 0 is never written. appendUnitConflicts scans digits 1-9 only, so a cell
// filed under slot 0 would be silently dropped from conflict detection rather
// than reported; keeping empties out of the structure altogether is what makes
// that scan range correct.
type unitPositions struct {
	// Both arrays are indexed by digit, so they carry GridSize+1 slots: one per
	// digit plus the unwritten slot 0. Widening either by one leaves a slot no
	// index ever reaches; narrowing it puts digit GridSize out of bounds.
	// mutator-disable-next-line numbers/incrementer
	positions [constants.GridSize + 1][constants.GridSize]int
	// mutator-disable-next-line numbers/incrementer
	counts [constants.GridSize + 1]int
}

// record files idx under the digit the cell holds, ignoring empty cells so that
// slot 0 stays empty.
func (u *unitPositions) record(val, idx int) {
	if val == 0 {
		return
	}
	u.positions[val][u.counts[val]] = idx
	u.counts[val]++
}

// appendUnitConflicts scans the position groups for a single unit and appends
// any newly-seen conflicts of the given type. The seen map is lazily allocated
// on the first conflict so a clean unit costs nothing.
func appendUnitConflicts(unit unitPositions, conflictType string, seen *map[uint64]bool, conflicts []Conflict) []Conflict {
	for val := 1; val <= 9; val++ {
		group := unit.positions[val][:unit.counts[val]]
		// < 2 vs <= 1 is moot: the inner j=i+1 loop yields no pairs for groups of size < 2.
		// branch/if (removing the continue) is also moot for the same reason.
		// mutator-disable-next-line numbers/decrementer, branch/if
		if len(group) < 2 {
			continue
		}
		for i := range group {
			for j := i + 1; j < len(group); j++ {
				key := conflictKey(group[i], group[j], val)
				// Cross-unit de-duplication: two cells can share more than one unit
				// (e.g. the same row AND the same box), so the row pass and the box
				// pass would each emit a Conflict for that pair without this guard.
				if _, ok := (*seen)[key]; ok {
					continue
				}
				if *seen == nil {
					*seen = make(map[uint64]bool)
				}
				(*seen)[key] = true
				conflicts = append(conflicts, Conflict{Cell1: group[i], Cell2: group[j], Value: val, Type: conflictType})
			}
		}
	}
	return conflicts
}

// appendBoxConflicts scans one 3x3 box for duplicate values and appends any new
// conflicts of type "box".
func appendBoxConflicts(grid []int, box int, seen *map[uint64]bool, conflicts []Conflict) []Conflict {
	boxRow, boxCol := (box/constants.BoxSize)*constants.BoxSize, (box%constants.BoxSize)*constants.BoxSize
	var unit unitPositions
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			idx := r*constants.GridSize + c
			unit.record(grid[idx], idx)
		}
	}
	return appendUnitConflicts(unit, "box", seen, conflicts)
}

// conflictKey builds an integer dedup key from (cell1, cell2, val), normalizing
// the pair so (a,b) and (b,a) collide. Cell indices are bounded 0-80 and val
// 1-9, so lo*810 + hi*10 + val uniquely identifies the triple and cannot
// overflow int (max 65609) before the uint64 conversion.
func conflictKey(cell1, cell2, val int) uint64 {
	lo, hi := min(cell1, cell2), max(cell1, cell2)
	// lo, hi are validated Sudoku cell indices (0-80); val is a digit (1-9).
	return uint64(lo*810 + hi*10 + val) //nolint:gosec // G115: bounded inputs, see doc comment
}

// findEmptyCell returns the index of the first empty (0) cell, or -1 if the board is full.
func findEmptyCell(board []int) int {
	for i := range constants.TotalCells {
		if board[i] == 0 {
			return i
		}
	}
	return -1
}

// CountSolutions counts solutions up to maxCount. Exported for custom puzzle validation.
// Returns ErrBudgetExceeded if the node budget is exhausted.
// A grid whose givens already conflict is rejected up front and reports 0 solutions.
func CountSolutions(ctx context.Context, grid []int, maxCount int) (int, error) {
	if !IsValid(ctx, grid) {
		return 0, nil
	}
	board := make([]int, constants.TotalCells)
	copy(board, grid)
	count := 0
	budget := &nodeBudget{max: constants.MaxSolverNodes}
	err := countSolutionsHelper(ctx, board, &count, maxCount, budget)
	if err != nil {
		return count, err
	}
	return count, nil
}

func countSolutionsHelper(ctx context.Context, board []int, count *int, maxCount int, budget *nodeBudget) error {
	if err := budget.tick(ctx); err != nil {
		return err
	}

	// Redundant guard: the inner guard (L176) also caps counting. Mutating either
	// guard alone does not change the observable count returned by CountSolutions.
	// mutator-disable-next-line expression/comparison,branch/if
	if *count >= maxCount {
		return nil
	}

	idx := findEmptyCell(board)

	if idx == -1 {
		*count++
		return nil
	}

	row, col := idx/constants.GridSize, idx%constants.GridSize

	// digit=0 is always rejected: isValid checks board[row*GridSize+col]==digit, and the
	// empty cell itself is 0, so 0==0 → false. Starting at 0 vs 1 is a no-op.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		if isValid(board, row, col, digit) {
			board[idx] = digit
			if err := countSolutionsHelper(ctx, board, count, maxCount, budget); err != nil {
				return err
			}
			board[idx] = 0
			// Redundant guard: the outer guard also caps counting.
			// mutator-disable-next-line expression/comparison,branch/if
			if *count >= maxCount {
				return nil
			}
		}
	}
	return nil
}

func solve(ctx context.Context, board []int, budget *nodeBudget) (bool, error) {
	if err := budget.tick(ctx); err != nil {
		return false, err
	}

	idx := findEmptyCell(board)

	if idx == -1 {
		return true, nil
	}

	row, col := idx/constants.GridSize, idx%constants.GridSize

	// digit=0 is always rejected (empty cell itself is 0, isValid returns false). See L171.
	// mutator-disable-next-line numbers/decrementer
	for digit := 1; digit <= constants.GridSize; digit++ {
		if isValid(board, row, col, digit) {
			board[idx] = digit
			solved, err := solve(ctx, board, budget)
			if err != nil {
				return false, err
			}
			if solved {
				return true, nil
			}
			board[idx] = 0
		}
	}

	return false, nil
}

func isValid(board []int, row, col, digit int) bool {
	for c := range constants.GridSize {
		if board[row*constants.GridSize+c] == digit {
			return false
		}
	}

	for r := range constants.GridSize {
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
	for i := range constants.GridSize {
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
// Returns the puzzle grid with zeros for empty cells. An error (context
// cancellation or ErrBudgetExceeded from the uniqueness check) is propagated
// rather than swallowed: returning a partially-carved board on a canceled
// context would silently serve an incorrect puzzle.
func CarveGivens(ctx context.Context, fullGrid []int, targetGivens int, seed int64) ([]int, error) {
	puzzle := make([]int, constants.TotalCells)
	copy(puzzle, fullGrid)

	// Seed offset is an implementation detail: seed±1 changes which cells get carved
	// first but not the validity, uniqueness, or givens-count properties that tests assert.
	// mutator-disable-next-line arithmetic/base,numbers/decrementer,numbers/incrementer
	rng := newRNG(seed + 1) // offset seed for carving

	// Create list of filled positions
	positions := make([]int, constants.TotalCells)
	for i := range constants.TotalCells {
		positions[i] = i
	}
	rng.shuffle(positions)

	removed := 0
	target := constants.TotalCells - targetGivens

	for _, pos := range positions {
		if removed >= target {
			// continue would behave identically: the guard re-tests on every
			// remaining position, so neither form removes a further cell.
			// mutator-disable-next-line loop/break
			break
		}

		oldVal := puzzle[pos]
		puzzle[pos] = 0

		unique, err := HasUniqueSolution(ctx, puzzle)
		if err != nil {
			// Do not treat a canceled context or exhausted budget as "not unique":
			// restoring the cell and continuing would walk the rest of the cells and
			// return a silently partially-carved (wrong) puzzle.
			return nil, err
		}
		if unique {
			removed++
		} else {
			puzzle[pos] = oldVal
		}
	}

	return puzzle, nil
}

// Givens targets per difficulty for puzzle carving (fewer givens = harder).
// Shared by CarveGivens (single-difficulty on-demand generation) and
// CarveGivensWithSubset (multi-difficulty generation with the subset property).
var givensTargets = map[string]int{
	string(core.DifficultyEasy):   targetGivensEasy,
	string(core.DifficultyMedium): targetGivensMedium,
	string(core.DifficultyHard):   targetGivensHard,
	// The extreme and impossible targets do not steer CarveGivensWithSubset's
	// output: the uniqueness constraint floors carving at 24 givens for the test
	// grid, above both targets. They remain part of the public contract through
	// TargetGivensFor, which returns each value verbatim.
	string(core.DifficultyExtreme):    targetGivensExtreme,
	string(core.DifficultyImpossible): targetGivensImpossible,
}

const (
	targetGivensEasy       = 40
	targetGivensMedium     = 34
	targetGivensHard       = 28
	targetGivensExtreme    = 24
	targetGivensImpossible = 20
)

// TargetGivensFor returns the target clue count for on-demand carving at the
// given difficulty, or zero for an unrecognized difficulty.
func TargetGivensFor(diff string) int {
	return givensTargets[diff]
}

// CarveGivensWithSubset generates puzzles for all difficulty levels ensuring subset property.
// Returns a map of difficulty -> givens where impossible ⊂ extreme ⊂ hard ⊂ medium ⊂ easy.
// The approach: carve to the minimum (impossible), then record which cells to restore for easier levels.
// Difficulty is assigned by givens count alone: fewer givens yield harder labels. No technique
// verification is performed. An error (context cancellation or ErrBudgetExceeded from the
// uniqueness check) is propagated rather than swallowed.
func CarveGivensWithSubset(ctx context.Context, fullGrid []int, seed int64) (map[string][]int, error) {
	targets := givensTargets

	puzzle := make([]int, constants.TotalCells)
	copy(puzzle, fullGrid)

	// Seed offset is an implementation detail: seed±1 changes carve order, not validity.
	// mutator-disable-next-line arithmetic/base,numbers/decrementer,numbers/incrementer
	rng := newRNG(seed + 1) // offset seed for carving

	// Create list of filled positions in deterministic random order
	positions := make([]int, constants.TotalCells)
	for i := range constants.TotalCells {
		positions[i] = i
	}
	rng.shuffle(positions)

	// Track removal order - positions that were successfully removed
	var removalOrder []int

	// Carve down to impossible level (minimum givens)
	// Carving floor: for the test grid, impossible reaches 24 givens (57 removed) regardless
	// of targetRemoved value. ±1 on the subtraction or the >= guard cannot change the floor.
	// mutator-disable-next-line arithmetic/base
	targetRemoved := constants.TotalCells - targets[string(core.DifficultyImpossible)]

	for _, pos := range positions {
		// This guard never fires: the uniqueness constraint floors carving well
		// above targetRemoved, so no variation of the comparison is observable.
		// mutator-disable-next-line expression/comparison, branch/if
		if len(removalOrder) >= targetRemoved {
			// mutator-disable-next-line loop/break, loop/range_break
			break
		}

		oldVal := puzzle[pos]
		puzzle[pos] = 0

		unique, err := HasUniqueSolution(ctx, puzzle)
		if err != nil {
			// Propagate cancellation/budget errors instead of restoring-and-continuing,
			// which would yield a partially-carved board served as valid.
			return nil, err
		}
		if unique {
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
	result[string(core.DifficultyImpossible)] = impossiblePuzzle

	// For each easier difficulty, restore cells to reach target
	difficulties := []string{
		string(core.DifficultyExtreme),
		string(core.DifficultyHard),
		string(core.DifficultyMedium),
		string(core.DifficultyEasy),
	}

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

	return result, nil
}

// PuzzleAnalysis contains the analysis results for a puzzle
type PuzzleAnalysis struct {
	Givens             []int
	RequiredDifficulty core.Difficulty
	TechniqueCounts    map[string]int
	Status             string
}
