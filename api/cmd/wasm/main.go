//go:build js && wasm

package main

import (
	"syscall/js"

	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

// Global solver instance (reused across calls)
var solver *human.Solver

func init() {
	solver = human.NewSolver()
}

// ==================== JS Input Converters ====================

// jsArrayToIntSlice converts a JavaScript array to a Go []int
func jsArrayToIntSlice(arr js.Value) []int {
	length := arr.Length()
	result := make([]int, length)
	for i := 0; i < length; i++ {
		result[i] = arr.Index(i).Int()
	}
	return result
}

// jsArrayTo2DIntSlice converts a JavaScript 2D array to [][]int
func jsArrayTo2DIntSlice(arr js.Value) [][]int {
	if arr.IsNull() || arr.IsUndefined() {
		return nil
	}
	length := arr.Length()
	result := make([][]int, length)
	for i := 0; i < length; i++ {
		inner := arr.Index(i)
		if !inner.IsNull() && !inner.IsUndefined() {
			innerLen := inner.Length()
			result[i] = make([]int, innerLen)
			for j := 0; j < innerLen; j++ {
				result[i][j] = inner.Index(j).Int()
			}
		}
	}
	return result
}

// ==================== JS Output Converters (TinyGo Compatible) ====================

// Tier 1: Primitive converters

// intSliceToJSArray converts a Go []int to a JavaScript array
func intSliceToJSArray(slice []int) js.Value {
	arr := js.Global().Get("Array").New(len(slice))
	for i, v := range slice {
		arr.SetIndex(i, v)
	}
	return arr
}

// int2DSliceToJSArray converts a Go [][]int to a JavaScript 2D array
func int2DSliceToJSArray(slice [][]int) js.Value {
	arr := js.Global().Get("Array").New(len(slice))
	for i, inner := range slice {
		if inner == nil {
			arr.SetIndex(i, js.Global().Get("Array").New(0))
		} else {
			arr.SetIndex(i, intSliceToJSArray(inner))
		}
	}
	return arr
}

// errorToJS creates a JS object with an error field
func errorToJS(msg string) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("error", msg)
	return obj
}

// stringIntMapToJS converts map[string]int to JS object
func stringIntMapToJS(m map[string]int) js.Value {
	obj := js.Global().Get("Object").New()
	for k, v := range m {
		obj.Set(k, v)
	}
	return obj
}

// stringIntSliceMapToJS converts map[string][]int to JS object
func stringIntSliceMapToJS(m map[string][]int) js.Value {
	obj := js.Global().Get("Object").New()
	for k, v := range m {
		obj.Set(k, intSliceToJSArray(v))
	}
	return obj
}

// Tier 2: Struct converters

// cellRefToJS converts core.CellRef to JS object
func cellRefToJS(c core.CellRef) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("row", c.Row)
	obj.Set("col", c.Col)
	return obj
}

// cellRefSliceToJS converts []core.CellRef to JS array
func cellRefSliceToJS(cells []core.CellRef) js.Value {
	arr := js.Global().Get("Array").New(len(cells))
	for i, c := range cells {
		arr.SetIndex(i, cellRefToJS(c))
	}
	return arr
}

// candidateToJS converts core.Candidate to JS object
func candidateToJS(c core.Candidate) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("row", c.Row)
	obj.Set("col", c.Col)
	obj.Set("digit", c.Digit)
	return obj
}

// candidateSliceToJS converts []core.Candidate to JS array
func candidateSliceToJS(candidates []core.Candidate) js.Value {
	arr := js.Global().Get("Array").New(len(candidates))
	for i, c := range candidates {
		arr.SetIndex(i, candidateToJS(c))
	}
	return arr
}

// techniqueRefToJS converts core.TechniqueRef to JS object
func techniqueRefToJS(t core.TechniqueRef) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("title", t.Title)
	obj.Set("slug", t.Slug)
	obj.Set("url", t.URL)
	return obj
}

// highlightsToJS converts core.Highlights to JS object
func highlightsToJS(h core.Highlights) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("primary", cellRefSliceToJS(h.Primary))
	if len(h.Secondary) > 0 {
		obj.Set("secondary", cellRefSliceToJS(h.Secondary))
	}
	return obj
}

// conflictToJS converts dp.Conflict to JS object
func conflictToJS(c dp.Conflict) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("cell1", c.Cell1)
	obj.Set("cell2", c.Cell2)
	obj.Set("value", c.Value)
	obj.Set("type", c.Type)
	return obj
}

// conflictSliceToJS converts []dp.Conflict to JS array
func conflictSliceToJS(conflicts []dp.Conflict) js.Value {
	arr := js.Global().Get("Array").New(len(conflicts))
	for i, c := range conflicts {
		arr.SetIndex(i, conflictToJS(c))
	}
	return arr
}

// Tier 3: Complex struct converters

// moveToJS converts core.Move to JS object
func moveToJS(m *core.Move) js.Value {
	if m == nil {
		return js.Null()
	}
	obj := js.Global().Get("Object").New()
	obj.Set("step_index", m.StepIndex)
	obj.Set("technique", m.Technique)
	obj.Set("action", m.Action)
	obj.Set("digit", m.Digit)
	obj.Set("targets", cellRefSliceToJS(m.Targets))
	if len(m.Eliminations) > 0 {
		obj.Set("eliminations", candidateSliceToJS(m.Eliminations))
	}
	obj.Set("explanation", m.Explanation)
	obj.Set("refs", techniqueRefToJS(m.Refs))
	obj.Set("highlights", highlightsToJS(m.Highlights))
	return obj
}

// moveValueToJS converts core.Move (value type) to JS object
func moveValueToJS(m core.Move) js.Value {
	return moveToJS(&m)
}

// moveSliceToJS converts []core.Move to JS array
func moveSliceToJS(moves []core.Move) js.Value {
	arr := js.Global().Get("Array").New(len(moves))
	for i := range moves {
		arr.SetIndex(i, moveToJS(&moves[i]))
	}
	return arr
}

// inlineMoveToJS creates a move-like JS object from inline map data
// Used for error moves and fix-error moves that don't use core.Move struct
func inlineMoveToJS(technique, action string, digit int, explanation string, targets []map[string]int, highlights map[string]interface{}) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("technique", technique)
	obj.Set("action", action)
	if digit > 0 {
		obj.Set("digit", digit)
	}
	obj.Set("explanation", explanation)

	if targets != nil {
		targetsArr := js.Global().Get("Array").New(len(targets))
		for i, t := range targets {
			tObj := js.Global().Get("Object").New()
			tObj.Set("row", t["row"])
			tObj.Set("col", t["col"])
			targetsArr.SetIndex(i, tObj)
		}
		obj.Set("targets", targetsArr)
	}

	if highlights != nil {
		hObj := js.Global().Get("Object").New()
		if primary, ok := highlights["primary"].([]map[string]int); ok {
			pArr := js.Global().Get("Array").New(len(primary))
			for i, p := range primary {
				pObj := js.Global().Get("Object").New()
				pObj.Set("row", p["row"])
				pObj.Set("col", p["col"])
				pArr.SetIndex(i, pObj)
			}
			hObj.Set("primary", pArr)
		}
		if secondary, ok := highlights["secondary"].([]map[string]int); ok {
			sArr := js.Global().Get("Array").New(len(secondary))
			for i, s := range secondary {
				sObj := js.Global().Get("Object").New()
				sObj.Set("row", s["row"])
				sObj.Set("col", s["col"])
				sArr.SetIndex(i, sObj)
			}
			hObj.Set("secondary", sArr)
		}
		obj.Set("highlights", hObj)
	}

	return obj
}

// inlineMoveWithCountToJS creates a move-like JS object with userEntryCount field
func inlineMoveWithCountToJS(technique, action string, digit int, explanation string, targets []map[string]int, highlights map[string]interface{}, userEntryCount int) js.Value {
	obj := inlineMoveToJS(technique, action, digit, explanation, targets, highlights)
	if userEntryCount > 0 {
		obj.Set("userEntryCount", userEntryCount)
	}
	return obj
}

// Tier 4: Result object converters

// moveResultToJS converts MoveResult to JS object
func moveResultToJS(mr MoveResult) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("board", intSliceToJSArray(mr.Board))
	obj.Set("candidates", int2DSliceToJSArray(mr.Candidates))
	obj.Set("move", mr.Move)
	return obj
}

// moveResultSliceToJS converts []MoveResult to JS array
func moveResultSliceToJS(results []MoveResult) js.Value {
	arr := js.Global().Get("Array").New(len(results))
	for i, r := range results {
		arr.SetIndex(i, moveResultToJS(r))
	}
	return arr
}

// errorMoveToJS creates an error move JS object
func errorMoveToJS(explanation string) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("technique", "error")
	obj.Set("action", "error")
	obj.Set("explanation", explanation)
	return obj
}

// errorMoveWithCountToJS creates an error move JS object with userEntryCount
func errorMoveWithCountToJS(explanation string, userEntryCount int) js.Value {
	obj := errorMoveToJS(explanation)
	obj.Set("userEntryCount", userEntryCount)
	return obj
}

// unpinpointableErrorMoveToJS creates an unpinpointable-error move JS object
func unpinpointableErrorMoveToJS(explanation string) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("technique", "unpinpointable-error")
	obj.Set("action", "unpinpointable-error")
	obj.Set("explanation", explanation)
	return obj
}

// stalledMoveToJS creates a stalled move JS object (solver stuck, no progress possible)
func stalledMoveToJS(explanation string) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("technique", "stalled")
	obj.Set("action", "stalled")
	obj.Set("explanation", explanation)
	return obj
}

// fixCandidateMoveToJS creates a fix-candidate move JS object (restoring an incorrectly removed candidate)
func fixCandidateMoveToJS(digit int, explanation string, targetRow, targetCol int) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("technique", "fix-candidate")
	obj.Set("action", "fix-candidate")
	obj.Set("digit", digit)
	obj.Set("explanation", explanation)

	// targets
	targetsArr := js.Global().Get("Array").New(1)
	tObj := js.Global().Get("Object").New()
	tObj.Set("row", targetRow)
	tObj.Set("col", targetCol)
	targetsArr.SetIndex(0, tObj)
	obj.Set("targets", targetsArr)

	// highlights - just the target cell
	hObj := js.Global().Get("Object").New()
	pArr := js.Global().Get("Array").New(1)
	pObj := js.Global().Get("Object").New()
	pObj.Set("row", targetRow)
	pObj.Set("col", targetCol)
	pArr.SetIndex(0, pObj)
	hObj.Set("primary", pArr)
	obj.Set("highlights", hObj)

	return obj
}

// fixErrorMoveToJS creates a fix-error move JS object
func fixErrorMoveToJS(digit int, explanation string, targetRow, targetCol int, primaryCells [][]int, secondaryCells [][]int) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("technique", "fix-error")
	obj.Set("action", "fix-error")
	obj.Set("digit", digit)
	obj.Set("explanation", explanation)

	// targets
	targetsArr := js.Global().Get("Array").New(1)
	tObj := js.Global().Get("Object").New()
	tObj.Set("row", targetRow)
	tObj.Set("col", targetCol)
	targetsArr.SetIndex(0, tObj)
	obj.Set("targets", targetsArr)

	// highlights
	hObj := js.Global().Get("Object").New()
	if len(primaryCells) > 0 {
		pArr := js.Global().Get("Array").New(len(primaryCells))
		for i, cell := range primaryCells {
			pObj := js.Global().Get("Object").New()
			pObj.Set("row", cell[0])
			pObj.Set("col", cell[1])
			pArr.SetIndex(i, pObj)
		}
		hObj.Set("primary", pArr)
	}
	if len(secondaryCells) > 0 {
		sArr := js.Global().Get("Array").New(len(secondaryCells))
		for i, cell := range secondaryCells {
			sObj := js.Global().Get("Object").New()
			sObj.Set("row", cell[0])
			sObj.Set("col", cell[1])
			sArr.SetIndex(i, sObj)
		}
		hObj.Set("secondary", sArr)
	}
	obj.Set("highlights", hObj)

	return obj
}

// fixErrorMoveWithCountToJS creates a fix-error move JS object with userEntryCount
func fixErrorMoveWithCountToJS(digit int, explanation string, targetRow, targetCol int, primaryCells [][]int, secondaryCells [][]int, userEntryCount int) js.Value {
	obj := fixErrorMoveToJS(digit, explanation, targetRow, targetCol, primaryCells, secondaryCells)
	obj.Set("userEntryCount", userEntryCount)
	return obj
}

// ==================== Shared Types ====================

// MoveResult represents a single move result with board state
type MoveResult struct {
	Board      []int
	Candidates [][]int
	Move       js.Value // JS object representing the move
}

// solveResult is the internal result from solveAllInternal
type solveResult struct {
	moves           []MoveResult
	solved          bool
	finalBoard      []int
	finalCandidates [][]int
}

// ==================== Human Solver Functions ====================

// createBoard creates a new board from givens
// Input: givens (number[%d])
// Output: { cells: number[%d], candidates: number[%d][] }
func createBoard(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return errorToJS("givens required")
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != constants.TotalCells {
		return errorToJS("givens must have %d elements", constants.TotalCells")
	}

	board := human.NewBoard(givens)
	obj := js.Global().Get("Object").New()
	obj.Set("cells", intSliceToJSArray(board.GetCells()))
	obj.Set("candidates", int2DSliceToJSArray(board.GetCandidates()))
	return obj
}

// createBoardWithCandidates creates a board with pre-set candidates
// Input: cells (number[%d]), candidates (number[%d][])
// Output: { cells: number[%d], candidates: number[%d][] }
func createBoardWithCandidates(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return errorToJS("cells and candidates required")
	}

	cells := jsArrayToIntSlice(args[0])
	if len(cells) != constants.TotalCells {
		return errorToJS("cells must have %d elements", constants.TotalCells")
	}

	candidates := jsArrayTo2DIntSlice(args[1])
	// Note: candidates parameter accepted for API consistency but not used in solution comparison
	_ = candidates // Suppress unused variable warning
	givens := jsArrayToIntSlice(args[2])
	if len(givens) != constants.TotalCells {
		return errorToJS("givens must have %d elements", constants.TotalCells")
	}

	// Call the internal solver with maxMoves=1
	result := solveAllInternal(cells, candidates, givens, 1)

	// Return first move only (or nil if no moves)
	var move js.Value
	var boardCells []int
	var boardCandidates [][]int

	if len(result.moves) > 0 {
		move = result.moves[0].Move
		boardCells = result.moves[0].Board
		boardCandidates = result.moves[0].Candidates
	} else {
		move = js.Null()
		boardCells = result.finalBoard
		boardCandidates = result.finalCandidates
	}

	boardObj := js.Global().Get("Object").New()
	boardObj.Set("cells", intSliceToJSArray(boardCells))
	boardObj.Set("candidates", int2DSliceToJSArray(boardCandidates))

	obj := js.Global().Get("Object").New()
	obj.Set("move", move)
	obj.Set("board", boardObj)
	obj.Set("solved", result.solved)
	return obj
}

// solveWithSteps solves the puzzle returning all steps
// Input: givens (number[%d]), maxSteps (number)
// Output: { moves: Move[], status: string, finalBoard: number[%d] }
func solveWithSteps(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return errorToJS("givens required")
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != constants.TotalCells {
		return errorToJS("givens must have %d elements", constants.TotalCells")
	}

	maxSteps := 2000
	if len(args) >= 2 {
		maxSteps = args[1].Int()
	}

	board := human.NewBoard(givens)
	moves, status := solver.SolveWithSteps(board, maxSteps)

	obj := js.Global().Get("Object").New()
	obj.Set("moves", moveSliceToJS(moves))
	obj.Set("status", status)
	obj.Set("finalBoard", intSliceToJSArray(board.GetCells()))
	obj.Set("solved", board.IsSolved())
	return obj
}

// analyzePuzzle analyzes a puzzle and returns difficulty and technique counts
// Input: givens (number[%d])
// Output: { difficulty: string, techniques: { [name]: count }, status: string }
func analyzePuzzle(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return errorToJS("givens required")
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != constants.TotalCells {
		return errorToJS("givens must have %d elements", constants.TotalCells")
	}

	difficulty, techniques, status := solver.AnalyzePuzzleDifficulty(givens)

	obj := js.Global().Get("Object").New()
	obj.Set("difficulty", difficulty)
	obj.Set("techniques", stringIntMapToJS(techniques))
	obj.Set("status", status)
	return obj
}

// ==================== DP Solver Functions ====================

// solve finds a solution using fast backtracking
// Input: grid (number[%d])
// Output: number[%d] | null
func solve(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.Null()
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != constants.TotalCells {
		return js.Null()
	}

	solution := dp.Solve(grid)
	if solution == nil {
		return js.Null()
	}

	return intSliceToJSArray(solution)
}

// hasUniqueSolution checks if puzzle has exactly one solution
// Input: grid (number[%d])
// Output: boolean
func hasUniqueSolution(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf(false)
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != constants.TotalCells {
		return js.ValueOf(false)
	}

	return js.ValueOf(dp.HasUniqueSolution(grid))
}

// isValid checks if the grid has no conflicts
// Input: grid (number[%d])
// Output: boolean
func isValid(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf(false)
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != constants.TotalCells {
		return js.ValueOf(false)
	}

	return js.ValueOf(dp.IsValid(grid))
}

// findConflicts returns all conflicting cell pairs
// Input: grid (number[%d])
// Output: Conflict[]
func findConflicts(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.Global().Get("Array").New(0)
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != constants.TotalCells {
		return js.Global().Get("Array").New(0)
	}

	conflicts := dp.FindConflicts(grid)
	return conflictSliceToJS(conflicts)
}

// generateFullGrid generates a complete valid sudoku grid
// Input: seed (number)
// Output: number[%d]
func generateFullGrid(this js.Value, args []js.Value) interface{} {
	seed := int64(0)
	if len(args) >= 1 {
		seed = int64(args[0].Float()) // Use Float for larger numbers
	}

	grid := dp.GenerateFullGrid(seed)
	return intSliceToJSArray(grid)
}

// carveGivens creates a puzzle from a full grid
// Input: fullGrid (number[%d]), targetGivens (number), seed (number)
// Output: number[%d]
func carveGivens(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return js.Null()
	}

	fullGrid := jsArrayToIntSlice(args[0])
	if len(fullGrid) != constants.TotalCells {
		return js.Null()
	}

	targetGivens := args[1].Int()
	seed := int64(args[2].Float())

	puzzle := dp.CarveGivens(fullGrid, targetGivens, seed)
	return intSliceToJSArray(puzzle)
}

// carveGivensWithSubset generates puzzles for all difficulty levels
// Input: fullGrid (number[%d]), seed (number)
// Output: { easy: number[%d], medium: number[%d], hard: number[%d], extreme: number[%d], impossible: number[%d] }
func carveGivensWithSubset(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return js.Null()
	}

	fullGrid := jsArrayToIntSlice(args[0])
	if len(fullGrid) != constants.TotalCells {
		return js.Null()
	}

	seed := int64(args[1].Float())

	puzzles := dp.CarveGivensWithSubset(fullGrid, seed)

	// Build JS object explicitly
	obj := js.Global().Get("Object").New()
	for diff, givens := range puzzles {
		obj.Set(diff, intSliceToJSArray(givens))
	}
	return obj
}

// ==================== Combined Solve Functions ====================

// solveAll solves from current state, returning all moves (like /api/solve/all)
// Input: cells (number[%d]), candidates (number[%d][]), givens (number[%d])
// Output: { moves: MoveResult[], solved: boolean, finalBoard: number[%d] }
func solveAll(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return errorToJS("cells, candidates, and givens required")
	}

	cells := jsArrayToIntSlice(args[0])
	if len(cells) != constants.TotalCells {
		return errorToJS("cells must have %d elements", constants.TotalCells")
	}

	candidates := jsArrayTo2DIntSlice(args[1])
	givens := jsArrayToIntSlice(args[2])
	if len(givens) != constants.TotalCells {
		return errorToJS("givens must have %d elements", constants.TotalCells")
	}

	// Call internal implementation with default maxMoves
	result := solveAllInternal(cells, candidates, givens, 2000)

	// Build result object explicitly
	obj := js.Global().Get("Object").New()
	obj.Set("moves", moveResultSliceToJS(result.moves))
	obj.Set("solved", result.solved)
	obj.Set("finalBoard", intSliceToJSArray(result.finalBoard))
	obj.Set("finalCandidates", int2DSliceToJSArray(result.finalCandidates))
	return obj
}

// solveAllInternal is the internal implementation of solveAll
// It accepts a maxMoves parameter to limit the number of moves returned
// When maxMoves=1, this enables efficient single-move hints
func solveAllInternal(cells []int, candidates [][]int, givens []int, maxMovesLimit int) solveResult {
	board := human.NewBoardWithCandidates(cells, candidates)

	// Keep original user board for error detection
	originalUserBoard := make([]int, constants.TotalCells)
	copy(originalUserBoard, cells)

	var moves []MoveResult
	maxMoves := maxMovesLimit
	maxFixes := 5
	fixCount := 0

	for i := 0; i < maxMoves; i++ {
		// Check if board appears complete
		if board.IsSolved() {
			// Before declaring victory, verify the board is actually valid
			currentCells := board.GetCells()
			conflicts := dp.FindConflicts(currentCells)

			if len(conflicts) > 0 {
				// Board is filled but has conflicts - this is an error state
				if fixCount >= maxFixes {
					moves = append(moves, MoveResult{
						Board:      currentCells,
						Candidates: board.GetCandidates(),
						Move:       errorMoveToJS("Too many incorrect entries to fix automatically."),
					})
					break
				}

				// Find the first conflict and report it
				conflict := conflicts[0]
				cell1Row, cell1Col := conflict.Cell1/constants.GridSize, conflict.Cell1%constants.GridSize
				cell2Row, cell2Col := conflict.Cell2/constants.GridSize, conflict.Cell2%constants.GridSize

				// Find which cell is a user entry (not a given)
				badCell := -1
				badDigit := conflict.Value
				if givens[conflict.Cell1] == 0 {
					badCell = conflict.Cell1
				} else if givens[conflict.Cell2] == 0 {
					badCell = conflict.Cell2
				}

				if badCell >= 0 {
					badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
					fixCount++
					originalUserBoard[badCell] = 0

					// Reset board without the bad cell
					board = human.NewBoardWithCandidates(originalUserBoard, nil)
					board.InitCandidates()

					moves = append(moves, MoveResult{
						Board:      board.GetCells(),
						Candidates: board.GetCandidates(),
						Move: fixErrorMoveToJS(
							badDigit,
							formatExplanation("R%dC%d and R%dC%d both have %d in the same %s. Removing %d from R%dC%d.", cell1Row+1, cell1Col+1, cell2Row+1, cell2Col+1, badDigit, conflict.Type, badDigit, badRow+1, badCol+1),
							badRow, badCol,
							[][]int{{cell1Row, cell1Col}, {cell2Row, cell2Col}},
							nil,
						),
					})
					continue // Continue solving after fixing
				} else {
					// Both cells are givens - puzzle itself is invalid
					moves = append(moves, MoveResult{
						Board:      currentCells,
						Candidates: board.GetCandidates(),
						Move:       errorMoveToJS("The puzzle has conflicting givens and cannot be solved."),
					})
					break
				}
			}

			// No conflicts on a filled board = correctly solved!
			// A valid Sudoku has exactly one solution. If all cells are filled
			// and there are no conflicts (no duplicate digits in any row/col/box),
			// then by definition this IS the unique correct solution.
			break
		}

		move := solver.FindNextMove(board)
		if move == nil {
			// Solver stalled: no technique works and no contradiction detected yet.
			// This often means user has incorrect entries that prevent progress.
			// Try to find the error using our detection methods.

			if fixCount >= maxFixes {
				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move:       stalledMoveToJS("Solver is stuck. Too many incorrect entries to fix automatically."),
				})
				break
			}

			// Method 1: Check for cells with zero candidates (indicates error)
			badCell, badDigit, zeroCandCell := findErrorByCandidateRefill(originalUserBoard, givens)
			if badCell >= 0 {
				badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
				zeroCandRow, zeroCandCol := zeroCandCell/constants.GridSize, zeroCandCell%constants.GridSize
				fixCount++
				originalUserBoard[badCell] = 0

				board = human.NewBoardWithCandidates(originalUserBoard, nil)
				board.InitCandidates()

				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: fixErrorMoveToJS(
						badDigit,
						formatExplanation("Solver stuck! R%dC%d has no valid candidates. The %d at R%dC%d was causing the problem.", zeroCandRow+1, zeroCandCol+1, badDigit, badRow+1, badCol+1),
						badRow, badCol,
						[][]int{{badRow, badCol}},
						[][]int{{zeroCandRow, zeroCandCol}},
					),
				})
				continue
			}

			// Method 2: Trial removal, try removing each user digit to see if solver can progress
			badCell, badDigit = findErrorByTrialRemoval(originalUserBoard, givens, solver)
			if badCell >= 0 {
				badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
				fixCount++
				originalUserBoard[badCell] = 0

				board = human.NewBoardWithCandidates(originalUserBoard, nil)
				board.InitCandidates()

				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: fixErrorMoveToJS(
						badDigit,
						formatExplanation("Solver stuck! Removing %d from R%dC%d allows progress.", badDigit, badRow+1, badCol+1),
						badRow, badCol,
						[][]int{{badRow, badCol}},
						nil,
					),
				})
				continue
			}

			// Method 3: Check if user removed valid candidates that are blocking progress
			if candidates != nil {
				missingCell, missingDigit, found := findMissingCandidates(originalUserBoard, candidates, solver)
				if found {
					row, col := missingCell/constants.GridSize, missingCell%constants.GridSize
					// Don't increment fixCount - we're restoring a candidate, not removing a digit
					// Update the candidates array to include the missing candidate
					if missingCell < len(candidates) {
						candidates[missingCell] = append(candidates[missingCell], missingDigit)
					}

					board = human.NewBoardWithCandidates(originalUserBoard, candidates)

					moves = append(moves, MoveResult{
						Board:      board.GetCells(),
						Candidates: board.GetCandidates(),
						Move: fixCandidateMoveToJS(
							missingDigit,
							formatExplanation("Solver stuck! The candidate %d was incorrectly removed from R%dC%d. Restoring it.", missingDigit, row+1, col+1),
							row, col,
						),
					})
					continue
				}
			}

			// All methods failed - give up
			moves = append(moves, MoveResult{
				Board:      board.GetCells(),
				Candidates: board.GetCandidates(),
				Move:       stalledMoveToJS("Solver is stuck and couldn't identify the problem. Check your entries."),
			})
			break
		}

		// Handle contradiction (simplified version - just report it)
		if move.Action == "contradiction" {
			if fixCount >= maxFixes {
				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move:       errorMoveToJS("Too many incorrect entries to fix automatically."),
				})
				break
			}

			// Try to find the blocking user cell
			if len(move.Targets) > 0 {
				contradictionCell := move.Targets[0].Row*constants.GridSize + move.Targets[0].Col
				badCell, badDigit := findBlockingUserCell(board, contradictionCell, originalUserBoard, givens)

				if badCell >= 0 {
					badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
					fixCount++
					originalUserBoard[badCell] = 0

					// Reset board without the bad cell
					board = human.NewBoardWithCandidates(originalUserBoard, nil)
					board.InitCandidates()

					moves = append(moves, MoveResult{
						Board:      board.GetCells(),
						Candidates: board.GetCandidates(),
						Move: fixErrorMoveToJS(
							badDigit,
							formatExplanation("Removing incorrect %d from R%dC%d.", badDigit, badRow+1, badCol+1),
							badRow, badCol,
							[][]int{{badRow, badCol}},
							[][]int{{move.Targets[0].Row, move.Targets[0].Col}},
						),
					})
					continue
				}
			}

			// Couldn't find the error with primary method - try fallback
			badCell, badDigit, zeroCandCell := findErrorByCandidateRefill(originalUserBoard, givens)
			if badCell >= 0 {
				badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
				zeroCandRow, zeroCandCol := zeroCandCell/constants.GridSize, zeroCandCell%constants.GridSize
				fixCount++
				originalUserBoard[badCell] = 0

				// Reset board without the bad cell
				board = human.NewBoardWithCandidates(originalUserBoard, nil)
				board.InitCandidates()

				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: fixErrorMoveToJS(
						badDigit,
						formatExplanation("Found it! R%dC%d has no valid candidates. The %d at R%dC%d was causing the problem.", zeroCandRow+1, zeroCandCol+1, badDigit, badRow+1, badCol+1),
						badRow, badCol,
						[][]int{{badRow, badCol}},
						[][]int{{zeroCandRow, zeroCandCol}},
					),
				})
				continue
			}

			// Method 3: Trial removal - try removing each user digit to see if solver can progress
			badCell, badDigit = findErrorByTrialRemoval(originalUserBoard, givens, solver)
			if badCell >= 0 {
				badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
				fixCount++
				originalUserBoard[badCell] = 0

				board = human.NewBoardWithCandidates(originalUserBoard, nil)
				board.InitCandidates()

				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: fixErrorMoveToJS(
						badDigit,
						formatExplanation("Contradiction detected! Removing %d from R%dC%d allows progress.", badDigit, badRow+1, badCol+1),
						badRow, badCol,
						[][]int{{badRow, badCol}},
						nil,
					),
				})
				continue
			}

			// All methods failed - couldn't find the error
			moves = append(moves, MoveResult{
				Board:      board.GetCells(),
				Candidates: board.GetCandidates(),
				Move:       unpinpointableErrorMoveToJS("Could not pinpoint the error. Check your entries."),
			})
			break
		}

		// Apply normal move
		solver.ApplyMove(board, move)
		moves = append(moves, MoveResult{
			Board:      board.GetCells(),
			Candidates: board.GetCandidates(),
			Move:       moveToJS(move),
		})
	}

	// Final validation: if board appears solved but might have errors
	finalCells := board.GetCells()
	allFilled := true
	for _, cell := range finalCells {
		if cell == 0 {
			allFilled = false
			break
		}
	}

	// If all cells are filled, verify it's actually correct
	if allFilled && len(moves) == 0 {
		// No moves were generated - this means user filled everything but it might be wrong
		// First check for obvious conflicts
		conflicts := dp.FindConflicts(finalCells)
		if len(conflicts) > 0 {
			conflict := conflicts[0]
			cell1Row, cell1Col := conflict.Cell1/constants.GridSize, conflict.Cell1%constants.GridSize
			cell2Row, cell2Col := conflict.Cell2/constants.GridSize, conflict.Cell2%constants.GridSize

			// Find which cell is a user entry
			badRow, badCol := cell1Row, cell1Col
			if givens[conflict.Cell1] != 0 {
				badRow, badCol = cell2Row, cell2Col
			}

			moves = append(moves, MoveResult{
				Board:      finalCells,
				Candidates: board.GetCandidates(),
				Move: fixErrorMoveToJS(
					conflict.Value,
					formatExplanation("R%dC%d and R%dC%d both have %d in the same %s.", cell1Row+1, cell1Col+1, cell2Row+1, cell2Col+1, conflict.Value, conflict.Type),
					badRow, badCol,
					[][]int{{cell1Row, cell1Col}, {cell2Row, cell2Col}},
					nil,
				),
			})
		} else {
			// No conflicts on a filled board = correctly solved!
			// A valid Sudoku has exactly one solution. If all cells are filled
			// and there are no conflicts, this IS the unique correct solution.
			// No need to compare against dp.Solve() - pure logic is sufficient.
		}
	}

	return solveResult{
		moves:           moves,
		solved:          board.IsSolved() && dp.IsValid(finalCells),
		finalBoard:      finalCells,
		finalCandidates: board.GetCandidates(),
	}
}

// findBlockingUserCell finds which user-entered cell is blocking candidates
func findBlockingUserCell(board *human.Board, contradictionCell int, originalUserBoard []int, givens []int) (int, int) {
	row, col := contradictionCell/constants.GridSize, contradictionCell%constants.GridSize
	boxRow, boxCol := (row/3)*3, (col/3)*3

	type blockingCell struct {
		idx   int
		digit int
	}
	var userBlockers []blockingCell

	for digit := 1; digit <= 9; digit++ {
		// Check row
		for c := 0; c < 9; c++ {
			idx := row*constants.GridSize + c
			if board.Cells[idx] == digit && originalUserBoard[idx] != 0 && givens[idx] == 0 {
				userBlockers = append(userBlockers, blockingCell{idx, digit})
				break
			}
		}

		// Check column
		for r := 0; r < 9; r++ {
			idx := r*constants.GridSize + col
			if board.Cells[idx] == digit && originalUserBoard[idx] != 0 && givens[idx] == 0 {
				userBlockers = append(userBlockers, blockingCell{idx, digit})
				break
			}
		}

		// Check box
		for r := boxRow; r < boxRow+3; r++ {
			for c := boxCol; c < boxCol+3; c++ {
				idx := r*constants.GridSize + c
				if board.Cells[idx] == digit && originalUserBoard[idx] != 0 && givens[idx] == 0 {
					userBlockers = append(userBlockers, blockingCell{idx, digit})
					break
				}
			}
		}
	}

	if len(userBlockers) == 0 {
		return -1, 0
	}

	// Find cell blocking the most candidates
	cellCount := make(map[int]int)
	cellDigit := make(map[int]int)
	for _, b := range userBlockers {
		cellCount[b.idx]++
		cellDigit[b.idx] = b.digit
	}

	maxCount := 0
	maxCell := -1
	for idx, count := range cellCount {
		if count > maxCount {
			maxCount = count
			maxCell = idx
		}
	}

	if maxCell >= 0 {
		return maxCell, cellDigit[maxCell]
	}
	return -1, 0
}

// findErrorByCandidateRefill clears all candidates, refills them, and looks for cells with zero candidates.
// This is the "human-like" approach: when stuck, clear your pencil marks and start fresh.
// If a cell has zero candidates, trace back to find which user-entered cell is blocking it.
// Returns the cell index, digit, and the zero-candidate cell index, or -1 if no error found.
func findErrorByCandidateRefill(originalUserBoard []int, givens []int) (int, int, int) {
	// Create a fresh board with candidates properly initialized
	freshBoard := human.NewBoard(originalUserBoard)

	// Find any cell with zero candidates
	for idx := 0; idx < constants.TotalCells; idx++ {
		if originalUserBoard[idx] != 0 {
			continue // Skip filled cells
		}

		candidates := freshBoard.Candidates[idx]
		if candidates.IsEmpty() {
			// Found a cell with no candidates - this points to an error
			row, col := idx/constants.GridSize, idx%constants.GridSize
			boxRow, boxCol := (row/3)*3, (col/3)*3

			type blocker struct {
				cellIdx int
				digit   int
			}
			var userBlockers []blocker

			for digit := 1; digit <= 9; digit++ {
				// Check row
				for c := 0; c < 9; c++ {
					cellIdx := row*constants.GridSize + c
					if originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0 {
						userBlockers = append(userBlockers, blocker{cellIdx, digit})
					}
				}
				// Check column
				for r := 0; r < 9; r++ {
					cellIdx := r*constants.GridSize + col
					if originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0 {
						userBlockers = append(userBlockers, blocker{cellIdx, digit})
					}
				}
				// Check box
				for r := boxRow; r < boxRow+3; r++ {
					for c := boxCol; c < boxCol+3; c++ {
						cellIdx := r*constants.GridSize + c
						if originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0 {
							userBlockers = append(userBlockers, blocker{cellIdx, digit})
						}
					}
				}
			}

			if len(userBlockers) > 0 {
				return userBlockers[0].cellIdx, userBlockers[0].digit, idx
			}
		}
	}

	return -1, 0, -1
}

// findErrorByTrialRemoval tries removing each user-entered digit to see if the solver can progress.
// This is a brute-force approach when other methods fail: temporarily remove each user digit,
// reinitialize the board, and check if the solver can now find a move.
// Returns the cell index and digit of the first entry whose removal allows progress, or -1 if none found.
func findErrorByTrialRemoval(originalUserBoard []int, givens []int, solver *human.Solver) (int, int) {
	// Collect all user-entered cells (non-zero, non-given)
	var userCells []int
	for idx := 0; idx < constants.TotalCells; idx++ {
		if originalUserBoard[idx] != 0 && givens[idx] == 0 {
			userCells = append(userCells, idx)
		}
	}

	// Try removing each user entry and see if solver can progress
	for _, cellIdx := range userCells {
		digit := originalUserBoard[cellIdx]

		// Create a test board without this cell's value
		testBoard := make([]int, constants.TotalCells)
		copy(testBoard, originalUserBoard)
		testBoard[cellIdx] = 0

		// Initialize a fresh board with candidates
		board := human.NewBoard(testBoard)

		// Check if solver can now find a move
		move := solver.FindNextMove(board)
		if move != nil && move.Action != "contradiction" {
			// Removing this cell allowed progress!
			return cellIdx, digit
		}
	}

	return -1, 0
}

// findMissingCandidates checks if the user has incorrectly removed candidates that are logically valid.
// When solver stalls, it might be because the correct digit was eliminated from a cell.
// This function compares user candidates against what SHOULD be valid based on Sudoku rules.
// Returns: cell index, the missing digit that should be restored, and whether any were found.
func findMissingCandidates(cells []int, userCandidates [][]int, solver *human.Solver) (int, int, bool) {
	// Create a fresh board to get "correct" candidates based on current filled cells
	freshBoard := human.NewBoard(cells)

	// Compare each cell's candidates
	for idx := 0; idx < constants.TotalCells; idx++ {
		if cells[idx] != 0 {
			continue // Skip filled cells
		}

		// Get the logically correct candidates for this cell
		correctCandidates := freshBoard.Candidates[idx]

		// Get user's candidates for this cell (if provided)
		userCands := make(map[int]bool)
		if idx < len(userCandidates) {
			for _, d := range userCandidates[idx] {
				userCands[d] = true
			}
		}

		// Find candidates that are logically valid but user removed
		for digit := 1; digit <= 9; digit++ {
			if correctCandidates.Has(digit) && !userCands[digit] {
				// User removed a valid candidate! This might be blocking progress.
				// Test if restoring this candidate allows the solver to progress
				testBoard := human.NewBoardWithCandidates(cells, userCandidates)
				testBoard.Candidates[idx] = testBoard.Candidates[idx].Set(digit)

				move := solver.FindNextMove(testBoard)
				if move != nil && move.Action != "contradiction" {
					// Restoring this candidate allowed progress!
					return idx, digit, true
				}
			}
		}
	}

	return -1, 0, false
}

// formatExplanation is a simple sprintf helper
func formatExplanation(format string, args ...interface{}) string {
	// Simple implementation for common case
	result := format
	for _, arg := range args {
		switch v := arg.(type) {
		case int:
			// Replace first %d
			for i := 0; i < len(result)-1; i++ {
				if result[i] == '%' && result[i+1] == 'd' {
					result = result[:i] + intToString(v) + result[i+2:]
					break
				}
			}
		case string:
			// Replace first %s
			for i := 0; i < len(result)-1; i++ {
				if result[i] == '%' && result[i+1] == 's' {
					result = result[:i] + v + result[i+2:]
					break
				}
			}
		}
	}
	return result
}

func intToString(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		return "-" + intToString(-n)
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}

// ==================== Validation Functions ====================

// validationResultToJS creates a validation result JS object
func validationResultToJS(valid bool, reason string) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("valid", valid)
	if reason != "" {
		obj.Set("reason", reason)
	}
	return obj
}

// validationResultWithUniqueToJS creates a validation result with unique field
func validationResultWithUniqueToJS(valid bool, unique bool, reason string) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("valid", valid)
	obj.Set("unique", unique)
	if reason != "" {
		obj.Set("reason", reason)
	}
	return obj
}

// validationResultWithSolutionToJS creates a validation result with solution
func validationResultWithSolutionToJS(valid bool, unique bool, solution []int) js.Value {
	obj := js.Global().Get("Object").New()
	obj.Set("valid", valid)
	obj.Set("unique", unique)
	obj.Set("solution", intSliceToJSArray(solution))
	return obj
}

// validateCustomPuzzle validates a custom puzzle
// Input: givens (number[%d])
// Output: { valid: boolean, unique?: boolean, reason?: string, puzzleId?: string }
func validateCustomPuzzle(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return validationResultToJS(false, "givens required")
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != constants.TotalCells {
		return validationResultToJS(false, "givens must have %d elements", constants.TotalCells")
	}

	// Count givens
	givenCount := 0
	for _, v := range givens {
		if v != 0 {
			givenCount++
		}
	}

	if givenCount < 17 {
		return validationResultToJS(false, "need at least 17 givens")
	}

	// Check for conflicts
	if !dp.IsValid(givens) {
		return validationResultToJS(false, "puzzle contains conflicts")
	}

	// Check solvability
	solutions := dp.CountSolutions(givens, 2)

	if solutions == 0 {
		return validationResultToJS(false, "puzzle has no solution")
	}

	if solutions > 1 {
		return validationResultWithUniqueToJS(true, false, "puzzle has multiple solutions")
	}

	// Solve to get the solution
	solution := dp.Solve(givens)

	return validationResultWithSolutionToJS(true, true, solution)
}

// validateBoard validates current board state during gameplay by comparing against solution
// Input: board (number[%d]), solution (number[%d])
// Output: { valid: boolean, reason?: string, message?: string, incorrectCells?: number[] }
func validateBoard(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return validationResultToJS(false, "board and solution required")
	}

	board := jsArrayToIntSlice(args[0])
	solution := jsArrayToIntSlice(args[1])

	if len(board) != constants.TotalCells {
		return validationResultToJS(false, "board must have %d elements", constants.TotalCells")
	}

	if len(solution) != constants.TotalCells {
		return validationResultToJS(false, "solution must have %d elements", constants.TotalCells")
	}

	// Find incorrect cells (where user entry doesn't match solution)
	incorrectCells := []int{}
	for i := 0; i < constants.TotalCells; i++ {
		if board[i] != 0 && board[i] != solution[i] {
			incorrectCells = append(incorrectCells, i)
		}
	}

	if len(incorrectCells) > 0 {
		// Build message without fmt.Sprintf (reflection)
		msg := "Found " + intToString(len(incorrectCells)) + " incorrect cell"
		if len(incorrectCells) > 1 {
			msg += "s"
		}
		obj := js.Global().Get("Object").New()
		obj.Set("valid", false)
		obj.Set("reason", "incorrect_entries")
		obj.Set("message", msg)
		obj.Set("incorrectCells", intSliceToJSArray(incorrectCells))
		return obj
	}

	obj := js.Global().Get("Object").New()
	obj.Set("valid", true)
	obj.Set("message", "All entries are correct so far!")
	return obj
}

// ==================== Utility Functions ====================

// getPuzzleForSeed generates or retrieves a puzzle for a given seed
// Input: seed (string), difficulty (string)
// Output: { givens: number[%d], solution: number[%d], puzzleId: string, seed: string, difficulty: string }
func getPuzzleForSeed(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return errorToJS("seed and difficulty required")
	}

	seed := args[0].String()
	difficulty := args[1].String()

	// Validate difficulty
	validDifficulties := map[string]bool{
		"easy": true, "medium": true, "hard": true, "extreme": true, "impossible": true,
	}
	if !validDifficulties[difficulty] {
		return errorToJS("invalid difficulty")
	}

	// Generate deterministic seed hash
	seedHash := hashSeed(seed)
	fullGrid := dp.GenerateFullGrid(seedHash)
	allPuzzles := dp.CarveGivensWithSubset(fullGrid, seedHash)
	givens := allPuzzles[difficulty]

	puzzleID := seed + "-" + difficulty

	obj := js.Global().Get("Object").New()
	obj.Set("givens", intSliceToJSArray(givens))
	obj.Set("solution", intSliceToJSArray(fullGrid))
	obj.Set("puzzleId", puzzleID)
	obj.Set("seed", seed)
	obj.Set("difficulty", difficulty)
	return obj
}

// hashSeed converts a string seed to int64
func hashSeed(seed string) int64 {
	// FNV-1a hash
	var hash uint64 = 14695981039346656037
	for i := 0; i < len(seed); i++ {
		hash ^= uint64(seed[i])
		hash *= 1099511628211
	}
	return int64(hash & 0x7fffffffffffffff)
}

// ==================== Move Types (for TypeScript reference) ====================

// Move structure matches core.Move
type Move = core.Move

// ==================== Version Function ====================

// getVersion returns the solver version
// Output: string
func getVersion(this js.Value, args []js.Value) interface{} {
	return js.ValueOf(constants.SolverVersion)
}

// findNextMove finds the next solving step with full error detection
// Input: cells (number[%d]), candidates (number[%d][]), givens (number[%d])
// Output: { move: Move | null, board: { cells, candidates }, solved: boolean }
// This is equivalent to solveAll with maxMoves=1, returning the first move only
func findNextMove(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return errorToJS("cells, candidates, and givens required")
	}

	cells := jsArrayToIntSlice(args[0])
	if len(cells) != constants.TotalCells {
		return errorToJS("cells must have %d elements", constants.TotalCells")
	}

	candidates := jsArrayTo2DIntSlice(args[1])
	givens := jsArrayToIntSlice(args[2])
	if len(givens) != constants.TotalCells {
		return errorToJS("givens must have %d elements", constants.TotalCells")
	}

	// Call internal implementation with maxMoves=1 for single move
	result := solveAllInternal(cells, candidates, givens, 1)

	// Extract first move if available
	var move interface{}
	var newBoard []int
	var newCandidates [][]int

	if len(result.moves) > 0 {
		firstMove := result.moves[0]
		move = firstMove.Move
		newBoard = firstMove.Board
		newCandidates = firstMove.Candidates
	} else {
		move = nil
		newBoard = cells
		newCandidates = candidates
	}

	// Build result object
	obj := js.Global().Get("Object").New()
	obj.Set("move", move)

	boardObj := js.Global().Get("Object").New()
	boardObj.Set("cells", intSliceToJSArray(newBoard))
	boardObj.Set("candidates", int2DSliceToJSArray(newCandidates))
	obj.Set("board", boardObj)
	obj.Set("solved", result.solved)

	return obj
}

// checkAndFixWithSolution compares the current board against the known solution,
// removes any incorrect user entries, then continues solving using techniques.
// Input: cells (current board), candidates, givens, solution (correct answer)
// Output: { moves: MoveResult[], solved: boolean, finalBoard: number[%d] }
func checkAndFixWithSolution(this js.Value, args []js.Value) interface{} {
	if len(args) < 4 {
		return errorToJS("cells, candidates, givens, and solution required")
	}

	cells := jsArrayToIntSlice(args[0])
	if len(cells) != constants.TotalCells {
		return errorToJS("cells must have %d elements", constants.TotalCells")
	}

	candidates := jsArrayTo2DIntSlice(args[1])
	_ = candidates // Accept for API consistency but not needed for solution comparison
	givens := jsArrayToIntSlice(args[2])
	if len(givens) != constants.TotalCells {
		return errorToJS("givens must have %d elements", constants.TotalCells")
	}

	solution := jsArrayToIntSlice(args[3])
	if len(solution) != constants.TotalCells {
		return errorToJS("solution must have %d elements", constants.TotalCells")
	}

	// Create a copy of the current board to modify
	correctedBoard := make([]int, constants.TotalCells)
	copy(correctedBoard, cells)

	// Track what we fix for reporting
	var fixedCells []MoveResult
	fixCount := 0
	maxFixes := 10 // Allow more fixes than normal solving since we're comparing to solution

	// Compare current board against solution and remove mismatches
	for i := 0; i < constants.TotalCells; i++ {
		// Skip empty cells and givens
		if correctedBoard[i] == 0 || givens[i] != 0 {
			continue
		}

		// If user entry doesn't match solution, remove it
		if correctedBoard[i] != solution[i] {
			badDigit := correctedBoard[i]
			correctedBoard[i] = 0
			fixCount++

			row, col := i/constants.GridSize, i%constants.GridSize
			fixedCells = append(fixedCells, MoveResult{
				Board:      append([]int(nil), correctedBoard...), // Copy current state
				Candidates: nil,                                   // Will be recalculated
				Move: fixErrorMoveToJS(
					badDigit,
					formatExplanation("Removed incorrect %d from R%dC%d (should be %d)", badDigit, row+1, col+1, solution[i]),
					row, col,
					[][]int{{row, col}},
					nil,
				),
			})

			if fixCount >= maxFixes {
				break // Don't fix too many at once
			}
		}
	}

	// If we made fixes, recalculate candidates for the corrected board
	if len(fixedCells) > 0 {
		board := human.NewBoard(correctedBoard)
		for i := range fixedCells {
			fixedCells[i].Candidates = board.GetCandidates()
		}
	}

	// Now continue solving from the corrected state using normal techniques
	result := solveAllInternal(correctedBoard, nil, givens, 2000)

	// Prepend the fix moves to the solution moves
	allMoves := append(fixedCells, result.moves...)

	// Build result object
	obj := js.Global().Get("Object").New()
	obj.Set("moves", moveResultSliceToJS(allMoves))
	obj.Set("solved", result.solved)
	obj.Set("finalBoard", intSliceToJSArray(result.finalBoard))
	obj.Set("finalCandidates", int2DSliceToJSArray(result.finalCandidates))
	return obj
}

func main() {
	// Create the SudokuWasm global object with all exported functions
	exports := map[string]interface{}{
		// Human solver
		"createBoard":               js.FuncOf(createBoard),
		"createBoardWithCandidates": js.FuncOf(createBoardWithCandidates),
		"findNextMove":              js.FuncOf(findNextMove),
		"solveWithSteps":            js.FuncOf(solveWithSteps),
		"analyzePuzzle":             js.FuncOf(analyzePuzzle),
		"solveAll":                  js.FuncOf(solveAll),
		"checkAndFixWithSolution":   js.FuncOf(checkAndFixWithSolution),

		// DP solver
		"solve":                 js.FuncOf(solve),
		"hasUniqueSolution":     js.FuncOf(hasUniqueSolution),
		"isValid":               js.FuncOf(isValid),
		"findConflicts":         js.FuncOf(findConflicts),
		"generateFullGrid":      js.FuncOf(generateFullGrid),
		"carveGivens":           js.FuncOf(carveGivens),
		"carveGivensWithSubset": js.FuncOf(carveGivensWithSubset),

		// Validation
		"validateCustomPuzzle": js.FuncOf(validateCustomPuzzle),
		"validateBoard":        js.FuncOf(validateBoard),

		// Utility
		"getPuzzleForSeed": js.FuncOf(getPuzzleForSeed),
		"getVersion":       js.FuncOf(getVersion),
	}

	js.Global().Set("SudokuWasm", js.ValueOf(exports))

	// Signal that WASM is ready
	js.Global().Call("dispatchEvent", js.Global().Get("CustomEvent").New("wasmReady"))

	// Keep the Go runtime alive
	select {}
}
