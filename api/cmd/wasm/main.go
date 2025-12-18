//go:build js && wasm

package main

import (
	"encoding/json"
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

// intSliceToJSArray converts a Go []int to a JavaScript array
func intSliceToJSArray(slice []int) js.Value {
	arr := js.Global().Get("Array").New(len(slice))
	for i, v := range slice {
		arr.SetIndex(i, v)
	}
	return arr
}

// toJSValue converts a Go value to a JavaScript value via JSON
func toJSValue(v interface{}) js.Value {
	jsonBytes, err := json.Marshal(v)
	if err != nil {
		return js.ValueOf(nil)
	}
	return js.Global().Get("JSON").Call("parse", string(jsonBytes))
}

// ==================== Human Solver Functions ====================

// createBoard creates a new board from givens
// Input: givens (number[81])
// Output: { cells: number[81], candidates: number[81][] }
func createBoard(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return toJSValue(map[string]interface{}{"error": "givens required"})
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != 81 {
		return toJSValue(map[string]interface{}{"error": "givens must have 81 elements"})
	}

	board := human.NewBoard(givens)
	return toJSValue(map[string]interface{}{
		"cells":      board.GetCells(),
		"candidates": board.GetCandidates(),
	})
}

// createBoardWithCandidates creates a board with pre-set candidates
// Input: cells (number[81]), candidates (number[81][])
// Output: { cells: number[81], candidates: number[81][] }
func createBoardWithCandidates(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return toJSValue(map[string]interface{}{"error": "cells and candidates required"})
	}

	cells := jsArrayToIntSlice(args[0])
	if len(cells) != 81 {
		return toJSValue(map[string]interface{}{"error": "cells must have 81 elements"})
	}

	candidates := jsArrayTo2DIntSlice(args[1])
	board := human.NewBoardWithCandidates(cells, candidates)
	return toJSValue(map[string]interface{}{
		"cells":      board.GetCells(),
		"candidates": board.GetCandidates(),
	})
}

// findNextMove finds the next solving step
// Input: cells (number[81]), candidates (number[81][])
// Output: { move: Move | null, board: { cells, candidates } }
func findNextMove(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return toJSValue(map[string]interface{}{"error": "cells and candidates required"})
	}

	cells := jsArrayToIntSlice(args[0])
	if len(cells) != 81 {
		return toJSValue(map[string]interface{}{"error": "cells must have 81 elements"})
	}

	candidates := jsArrayTo2DIntSlice(args[1])
	board := human.NewBoardWithCandidates(cells, candidates)

	move := solver.FindNextMove(board)
	if move == nil {
		return toJSValue(map[string]interface{}{
			"move": nil,
			"board": map[string]interface{}{
				"cells":      board.GetCells(),
				"candidates": board.GetCandidates(),
			},
		})
	}

	// Apply the move to get the updated board state
	solver.ApplyMove(board, move)

	return toJSValue(map[string]interface{}{
		"move": move,
		"board": map[string]interface{}{
			"cells":      board.GetCells(),
			"candidates": board.GetCandidates(),
		},
	})
}

// solveWithSteps solves the puzzle returning all steps
// Input: givens (number[81]), maxSteps (number)
// Output: { moves: Move[], status: string, finalBoard: number[81] }
func solveWithSteps(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return toJSValue(map[string]interface{}{"error": "givens required"})
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != 81 {
		return toJSValue(map[string]interface{}{"error": "givens must have 81 elements"})
	}

	maxSteps := 2000
	if len(args) >= 2 {
		maxSteps = args[1].Int()
	}

	board := human.NewBoard(givens)
	moves, status := solver.SolveWithSteps(board, maxSteps)

	return toJSValue(map[string]interface{}{
		"moves":      moves,
		"status":     status,
		"finalBoard": board.GetCells(),
		"solved":     board.IsSolved(),
	})
}

// analyzePuzzle analyzes a puzzle and returns difficulty and technique counts
// Input: givens (number[81])
// Output: { difficulty: string, techniques: { [name]: count }, status: string }
func analyzePuzzle(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return toJSValue(map[string]interface{}{"error": "givens required"})
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != 81 {
		return toJSValue(map[string]interface{}{"error": "givens must have 81 elements"})
	}

	difficulty, techniques, status := solver.AnalyzePuzzleDifficulty(givens)

	return toJSValue(map[string]interface{}{
		"difficulty": difficulty,
		"techniques": techniques,
		"status":     status,
	})
}

// ==================== DP Solver Functions ====================

// solve finds a solution using fast backtracking
// Input: grid (number[81])
// Output: number[81] | null
func solve(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.Null()
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != 81 {
		return js.Null()
	}

	solution := dp.Solve(grid)
	if solution == nil {
		return js.Null()
	}

	return intSliceToJSArray(solution)
}

// hasUniqueSolution checks if puzzle has exactly one solution
// Input: grid (number[81])
// Output: boolean
func hasUniqueSolution(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf(false)
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != 81 {
		return js.ValueOf(false)
	}

	return js.ValueOf(dp.HasUniqueSolution(grid))
}

// isValid checks if the grid has no conflicts
// Input: grid (number[81])
// Output: boolean
func isValid(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf(false)
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != 81 {
		return js.ValueOf(false)
	}

	return js.ValueOf(dp.IsValid(grid))
}

// findConflicts returns all conflicting cell pairs
// Input: grid (number[81])
// Output: Conflict[]
func findConflicts(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return toJSValue([]interface{}{})
	}

	grid := jsArrayToIntSlice(args[0])
	if len(grid) != 81 {
		return toJSValue([]interface{}{})
	}

	conflicts := dp.FindConflicts(grid)
	return toJSValue(conflicts)
}

// generateFullGrid generates a complete valid sudoku grid
// Input: seed (number)
// Output: number[81]
func generateFullGrid(this js.Value, args []js.Value) interface{} {
	seed := int64(0)
	if len(args) >= 1 {
		seed = int64(args[0].Float()) // Use Float for larger numbers
	}

	grid := dp.GenerateFullGrid(seed)
	return intSliceToJSArray(grid)
}

// carveGivens creates a puzzle from a full grid
// Input: fullGrid (number[81]), targetGivens (number), seed (number)
// Output: number[81]
func carveGivens(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return js.Null()
	}

	fullGrid := jsArrayToIntSlice(args[0])
	if len(fullGrid) != 81 {
		return js.Null()
	}

	targetGivens := args[1].Int()
	seed := int64(args[2].Float())

	puzzle := dp.CarveGivens(fullGrid, targetGivens, seed)
	return intSliceToJSArray(puzzle)
}

// carveGivensWithSubset generates puzzles for all difficulty levels
// Input: fullGrid (number[81]), seed (number)
// Output: { easy: number[81], medium: number[81], hard: number[81], extreme: number[81], impossible: number[81] }
func carveGivensWithSubset(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return js.Null()
	}

	fullGrid := jsArrayToIntSlice(args[0])
	if len(fullGrid) != 81 {
		return js.Null()
	}

	seed := int64(args[1].Float())

	puzzles := dp.CarveGivensWithSubset(fullGrid, seed)

	result := make(map[string][]int)
	for diff, givens := range puzzles {
		result[diff] = givens
	}

	return toJSValue(result)
}

// ==================== Combined Solve Functions ====================

// solveAll solves from current state, returning all moves (like /api/solve/all)
// Input: cells (number[81]), candidates (number[81][]), givens (number[81])
// Output: { moves: MoveResult[], solved: boolean, finalBoard: number[81] }
func solveAll(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return toJSValue(map[string]interface{}{"error": "cells, candidates, and givens required"})
	}

	cells := jsArrayToIntSlice(args[0])
	if len(cells) != 81 {
		return toJSValue(map[string]interface{}{"error": "cells must have 81 elements"})
	}

	candidates := jsArrayTo2DIntSlice(args[1])
	givens := jsArrayToIntSlice(args[2])
	if len(givens) != 81 {
		return toJSValue(map[string]interface{}{"error": "givens must have 81 elements"})
	}

	board := human.NewBoardWithCandidates(cells, candidates)

	// Keep original user board for error detection
	originalUserBoard := make([]int, 81)
	copy(originalUserBoard, cells)

	type MoveResult struct {
		Board      []int       `json:"board"`
		Candidates [][]int     `json:"candidates"`
		Move       interface{} `json:"move"`
	}

	var moves []MoveResult
	maxMoves := 2000
	maxFixes := 5
	fixCount := 0

	for i := 0; i < maxMoves; i++ {
		if board.IsSolved() {
			break
		}

		move := solver.FindNextMove(board)
		if move == nil {
			break
		}

		// Handle contradiction (simplified version - just report it)
		if move.Action == "contradiction" {
			if fixCount >= maxFixes {
				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: map[string]interface{}{
						"technique":   "error",
						"action":      "error",
						"explanation": "Too many incorrect entries to fix automatically.",
					},
				})
				break
			}

			// Try to find the blocking user cell
			if len(move.Targets) > 0 {
				contradictionCell := move.Targets[0].Row*9 + move.Targets[0].Col
				badCell, badDigit := findBlockingUserCell(board, contradictionCell, originalUserBoard, givens)

				if badCell >= 0 {
					badRow, badCol := badCell/9, badCell%9
					fixCount++
					originalUserBoard[badCell] = 0

					// Reset board without the bad cell
					board = human.NewBoardWithCandidates(originalUserBoard, nil)
					board.InitCandidates()

					moves = append(moves, MoveResult{
						Board:      board.GetCells(),
						Candidates: board.GetCandidates(),
						Move: map[string]interface{}{
							"technique":   "fix-error",
							"action":      "fix-error",
							"digit":       badDigit,
							"explanation": formatExplanation("Removing incorrect %d from R%dC%d.", badDigit, badRow+1, badCol+1),
							"targets":     []map[string]int{{"row": badRow, "col": badCol}},
							"highlights": map[string]interface{}{
								"primary":   []map[string]int{{"row": badRow, "col": badCol}},
								"secondary": []map[string]int{{"row": move.Targets[0].Row, "col": move.Targets[0].Col}},
							},
						},
					})
					continue
				}
			}

			// Couldn't find the error
			moves = append(moves, MoveResult{
				Board:      board.GetCells(),
				Candidates: board.GetCandidates(),
				Move: map[string]interface{}{
					"technique":   "unpinpointable-error",
					"action":      "unpinpointable-error",
					"explanation": "Could not pinpoint the error. Check your entries.",
				},
			})
			break
		}

		// Apply normal move
		solver.ApplyMove(board, move)
		moves = append(moves, MoveResult{
			Board:      board.GetCells(),
			Candidates: board.GetCandidates(),
			Move:       move,
		})
	}

	return toJSValue(map[string]interface{}{
		"moves":      moves,
		"solved":     board.IsSolved(),
		"finalBoard": board.GetCells(),
	})
}

// findBlockingUserCell finds which user-entered cell is blocking candidates
func findBlockingUserCell(board *human.Board, contradictionCell int, originalUserBoard []int, givens []int) (int, int) {
	row, col := contradictionCell/9, contradictionCell%9
	boxRow, boxCol := (row/3)*3, (col/3)*3

	type blockingCell struct {
		idx   int
		digit int
	}
	var userBlockers []blockingCell

	for digit := 1; digit <= 9; digit++ {
		// Check row
		for c := 0; c < 9; c++ {
			idx := row*9 + c
			if board.Cells[idx] == digit && originalUserBoard[idx] != 0 && givens[idx] == 0 {
				userBlockers = append(userBlockers, blockingCell{idx, digit})
				break
			}
		}

		// Check column
		for r := 0; r < 9; r++ {
			idx := r*9 + col
			if board.Cells[idx] == digit && originalUserBoard[idx] != 0 && givens[idx] == 0 {
				userBlockers = append(userBlockers, blockingCell{idx, digit})
				break
			}
		}

		// Check box
		for r := boxRow; r < boxRow+3; r++ {
			for c := boxCol; c < boxCol+3; c++ {
				idx := r*9 + c
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

// validateCustomPuzzle validates a custom puzzle
// Input: givens (number[81])
// Output: { valid: boolean, unique?: boolean, reason?: string, puzzleId?: string }
func validateCustomPuzzle(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return toJSValue(map[string]interface{}{
			"valid":  false,
			"reason": "givens required",
		})
	}

	givens := jsArrayToIntSlice(args[0])
	if len(givens) != 81 {
		return toJSValue(map[string]interface{}{
			"valid":  false,
			"reason": "givens must have 81 elements",
		})
	}

	// Count givens
	givenCount := 0
	for _, v := range givens {
		if v != 0 {
			givenCount++
		}
	}

	if givenCount < 17 {
		return toJSValue(map[string]interface{}{
			"valid":  false,
			"reason": "need at least 17 givens",
		})
	}

	// Check for conflicts
	if !dp.IsValid(givens) {
		return toJSValue(map[string]interface{}{
			"valid":  false,
			"reason": "puzzle contains conflicts",
		})
	}

	// Check solvability
	solutions := dp.CountSolutions(givens, 2)

	if solutions == 0 {
		return toJSValue(map[string]interface{}{
			"valid":  false,
			"reason": "puzzle has no solution",
		})
	}

	if solutions > 1 {
		return toJSValue(map[string]interface{}{
			"valid":  true,
			"unique": false,
			"reason": "puzzle has multiple solutions",
		})
	}

	return toJSValue(map[string]interface{}{
		"valid":  true,
		"unique": true,
	})
}

// validateBoard validates current board state during gameplay
// Input: board (number[81])
// Output: { valid: boolean, reason?: string, conflicts?: Conflict[], solvable?: boolean }
func validateBoard(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return toJSValue(map[string]interface{}{
			"valid":  false,
			"reason": "board required",
		})
	}

	board := jsArrayToIntSlice(args[0])
	if len(board) != 81 {
		return toJSValue(map[string]interface{}{
			"valid":  false,
			"reason": "board must have 81 elements",
		})
	}

	// Check for conflicts
	conflicts := dp.FindConflicts(board)
	if len(conflicts) > 0 {
		conflictCells := make(map[int]bool)
		for _, c := range conflicts {
			conflictCells[c.Cell1] = true
			conflictCells[c.Cell2] = true
		}
		cellList := make([]int, 0, len(conflictCells))
		for cell := range conflictCells {
			cellList = append(cellList, cell)
		}

		return toJSValue(map[string]interface{}{
			"valid":         false,
			"reason":        "conflicts",
			"message":       "There are conflicting numbers in the puzzle",
			"conflicts":     conflicts,
			"conflictCells": cellList,
		})
	}

	// Check if solvable
	solutions := dp.CountSolutions(board, 1)
	if solutions == 0 {
		return toJSValue(map[string]interface{}{
			"valid":   false,
			"reason":  "unsolvable",
			"message": "The puzzle cannot be solved from this state",
		})
	}

	return toJSValue(map[string]interface{}{
		"valid":   true,
		"message": "All entries are correct so far!",
	})
}

// ==================== Utility Functions ====================

// getPuzzleForSeed generates or retrieves a puzzle for a given seed
// Input: seed (string), difficulty (string)
// Output: { givens: number[81], puzzleId: string }
func getPuzzleForSeed(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return toJSValue(map[string]interface{}{"error": "seed and difficulty required"})
	}

	seed := args[0].String()
	difficulty := args[1].String()

	// Validate difficulty
	validDifficulties := map[string]bool{
		"easy": true, "medium": true, "hard": true, "extreme": true, "impossible": true,
	}
	if !validDifficulties[difficulty] {
		return toJSValue(map[string]interface{}{"error": "invalid difficulty"})
	}

	// Generate deterministic seed hash
	seedHash := hashSeed(seed)
	fullGrid := dp.GenerateFullGrid(seedHash)
	allPuzzles := dp.CarveGivensWithSubset(fullGrid, seedHash)
	givens := allPuzzles[difficulty]

	puzzleID := seed + "-" + difficulty

	return toJSValue(map[string]interface{}{
		"givens":    givens,
		"puzzleId":  puzzleID,
		"seed":      seed,
		"difficulty": difficulty,
	})
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

func main() {
	// Create the SudokuWasm global object with all exported functions
	exports := map[string]interface{}{
		// Human solver
		"createBoard":             js.FuncOf(createBoard),
		"createBoardWithCandidates": js.FuncOf(createBoardWithCandidates),
		"findNextMove":            js.FuncOf(findNextMove),
		"solveWithSteps":          js.FuncOf(solveWithSteps),
		"analyzePuzzle":           js.FuncOf(analyzePuzzle),
		"solveAll":                js.FuncOf(solveAll),

		// DP solver
		"solve":                js.FuncOf(solve),
		"hasUniqueSolution":    js.FuncOf(hasUniqueSolution),
		"isValid":              js.FuncOf(isValid),
		"findConflicts":        js.FuncOf(findConflicts),
		"generateFullGrid":     js.FuncOf(generateFullGrid),
		"carveGivens":          js.FuncOf(carveGivens),
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
