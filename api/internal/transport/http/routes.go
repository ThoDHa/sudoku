package http

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash/fnv"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"sudoku-api/internal/core"
	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/config"
	"sudoku-api/pkg/constants"
)

var cfg *config.Config

func RegisterRoutes(r *gin.Engine, c *config.Config) {
	cfg = c

	r.GET("/health", healthHandler)

	api := r.Group("/api")
	{
		api.GET("/daily", dailyHandler)
		api.GET("/puzzle/:seed", puzzleHandler)
		api.GET("/puzzle/:seed/analyze", puzzleAnalyzeHandler)
		api.POST("/session/start", sessionStartHandler)
		api.POST("/solve/next", solveNextHandler)
		api.POST("/solve/all", solveAllHandler)
		api.POST("/solve/full", solveFullHandler)
		api.POST("/validate", validateBoardHandler)
		api.POST("/custom/validate", customValidateHandler)
	}
}

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"version": constants.APIVersion,
	})
}

// TodayUTC returns today's UTC date string
func TodayUTC() string {
	return time.Now().UTC().Format(constants.DateFormat)
}

func dailyHandler(c *gin.Context) {
	dateUTC := TodayUTC()

	// Deterministic seed from date
	seed := "D" + dateUTC

	// Get puzzle index for today if puzzles are loaded
	var puzzleIndex int
	loader := puzzles.Global()
	if loader != nil {
		_, _, puzzleIndex, _ = loader.GetDailyPuzzle(time.Now(), "medium")
	}

	c.JSON(http.StatusOK, gin.H{
		"date_utc":     dateUTC,
		"seed":         seed,
		"puzzle_index": puzzleIndex,
	})
}

func puzzleHandler(c *gin.Context) {
	seed := c.Param("seed")
	difficulty := core.Difficulty(c.Query("d"))

	if difficulty == "" {
		difficulty = core.DifficultyMedium
	}

	// Validate difficulty
	if difficulty != core.DifficultyEasy &&
		difficulty != core.DifficultyMedium &&
		difficulty != core.DifficultyHard &&
		difficulty != core.DifficultyExtreme &&
		difficulty != core.DifficultyImpossible {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_difficulty"})
		return
	}

	var givens []int
	var puzzleIndex int

	// Try pre-generated puzzles first
	loader := puzzles.Global()
	if loader != nil {
		var err error
		givens, _, puzzleIndex, err = loader.GetPuzzleBySeed(seed, string(difficulty))
		if err != nil {
			// Fall through to generation
			loader = nil
		}
	}

	// Fallback: generate puzzle on-demand
	if loader == nil {
		seedHash := hashSeed(seed)
		fullGrid := dp.GenerateFullGrid(seedHash)
		allPuzzles := dp.CarveGivensWithSubset(fullGrid, seedHash)
		givens = allPuzzles[string(difficulty)]
		puzzleIndex = -1 // Indicates generated, not pre-loaded
	}

	// Generate a deterministic puzzle ID from seed + difficulty
	puzzleID := seed + "-" + string(difficulty)

	c.JSON(http.StatusOK, gin.H{
		"puzzle_id":    puzzleID,
		"seed":         seed,
		"difficulty":   difficulty,
		"givens":       givens,
		"puzzle_index": puzzleIndex,
	})
}

// puzzleAnalyzeHandler analyzes a puzzle and returns technique requirements
func puzzleAnalyzeHandler(c *gin.Context) {
	seed := c.Param("seed")
	difficulty := core.Difficulty(c.Query("d"))

	if difficulty == "" {
		difficulty = core.DifficultyMedium
	}

	// Validate difficulty
	if difficulty != core.DifficultyEasy &&
		difficulty != core.DifficultyMedium &&
		difficulty != core.DifficultyHard &&
		difficulty != core.DifficultyExtreme &&
		difficulty != core.DifficultyImpossible {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_difficulty"})
		return
	}

	var givens []int

	// Try pre-generated puzzles first
	loader := puzzles.Global()
	if loader != nil {
		var err error
		givens, _, _, err = loader.GetPuzzleBySeed(seed, string(difficulty))
		if err != nil {
			loader = nil
		}
	}

	// Fallback: generate puzzle on-demand
	if loader == nil {
		seedHash := hashSeed(seed)
		fullGrid := dp.GenerateFullGrid(seedHash)
		allPuzzles := dp.CarveGivensWithSubset(fullGrid, seedHash)
		givens = allPuzzles[string(difficulty)]
	}

	// Analyze with human solver
	solver := human.NewSolver()
	requiredDiff, techniqueCounts, status := solver.AnalyzePuzzleDifficulty(givens)

	givensCount := 0
	for _, v := range givens {
		if v != 0 {
			givensCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"seed":                seed,
		"difficulty":          difficulty,
		"givens_count":        givensCount,
		"required_difficulty": requiredDiff,
		"status":              status,
		"techniques":          techniqueCounts,
	})
}

func hashSeed(seed string) int64 {
	h := fnv.New64a()
	h.Write([]byte(seed))
	return int64(h.Sum64())
}

func hashSolution(board []int) string {
	h := sha256.New()
	for _, v := range board {
		h.Write([]byte{byte(v)})
	}
	return hex.EncodeToString(h.Sum(nil))
}

type SessionStartRequest struct {
	Seed       string `json:"seed" binding:"required"`
	Difficulty string `json:"difficulty" binding:"required"`
	DeviceID   string `json:"device_id" binding:"required"`
}

func sessionStartHandler(c *gin.Context) {
	var req SessionStartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate difficulty
	difficulty := core.Difficulty(req.Difficulty)
	if difficulty != core.DifficultyEasy &&
		difficulty != core.DifficultyMedium &&
		difficulty != core.DifficultyHard &&
		difficulty != core.DifficultyExtreme &&
		difficulty != core.DifficultyImpossible {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_difficulty"})
		return
	}

	// Generate deterministic puzzle ID
	puzzleID := req.Seed + "-" + req.Difficulty

	// Create session token
	now := time.Now()
	session := SessionToken{
		DeviceID:   req.DeviceID,
		PuzzleID:   puzzleID,
		Seed:       req.Seed,
		Difficulty: req.Difficulty,
		StartedAt:  now,
		ExpiresAt:  now.Add(constants.SessionTokenExpiry),
	}

	token, err := createToken(cfg.JWTSecret, session)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"puzzle_id":  puzzleID,
		"started_at": now.Format(time.RFC3339),
	})
}

type SolveNextRequest struct {
	Token      string  `json:"token" binding:"required"`
	Board      []int   `json:"board" binding:"required"`
	Candidates [][]int `json:"candidates"` // Optional: preserve eliminations
}

func solveNextHandler(c *gin.Context) {
	var req SolveNextRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := verifyToken(cfg.JWTSecret, req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token: " + err.Error()})
		return
	}

	if len(req.Board) != constants.TotalCells {
		c.JSON(http.StatusBadRequest, gin.H{"error": "board must have 81 cells"})
		return
	}

	// Use provided candidates (may be empty/incomplete - solver will fill one at a time)
	board := human.NewBoardWithCandidates(req.Board, req.Candidates)
	solver := human.NewSolver()
	move := solver.FindNextMove(board)

	if move == nil {
		c.JSON(http.StatusOK, gin.H{"move": nil})
		return
	}

	// Apply the move
	solver.ApplyMove(board, move)

	c.JSON(http.StatusOK, gin.H{
		"board":      board.GetCells(),
		"candidates": board.GetCandidates(),
		"move":       move,
	})
}

type SolveAllRequest struct {
	Token      string  `json:"token" binding:"required"`
	Board      []int   `json:"board" binding:"required"`
	Candidates [][]int `json:"candidates"`
	Givens     []int   `json:"givens"` // Original puzzle givens (to identify user-entered cells)
}

// findBlockingUserCell analyzes a contradiction and finds which user-entered cell is causing it.
// originalUserBoard is the board state when solve was called (to distinguish user entries from solver placements)
// givens is the original puzzle (to distinguish user entries from given clues)
// Returns the cell index and the blocking digit, or -1 if no user error found.
func findBlockingUserCell(board *human.Board, contradictionCell int, originalUserBoard []int, givens []int) (int, int) {
	row, col := contradictionCell/9, contradictionCell%9
	boxRow, boxCol := (row/3)*3, (col/3)*3

	// For each digit 1-9, find what's blocking it from this cell
	// Only consider cells that were user-entered BEFORE solve was called (not solver placements)
	type blockingCell struct {
		idx   int
		digit int
	}
	var userBlockers []blockingCell

	for digit := 1; digit <= 9; digit++ {
		// Check row for this digit
		for c := 0; c < 9; c++ {
			idx := row*9 + c
			if board.Cells[idx] == digit {
				// This cell blocks 'digit' from contradiction cell
				// Only consider if: was in original user board AND not a given
				if originalUserBoard[idx] != 0 && givens[idx] == 0 {
					userBlockers = append(userBlockers, blockingCell{idx, digit})
				}
				break
			}
		}

		// Check column for this digit
		for r := 0; r < 9; r++ {
			idx := r*9 + col
			if board.Cells[idx] == digit {
				if originalUserBoard[idx] != 0 && givens[idx] == 0 {
					userBlockers = append(userBlockers, blockingCell{idx, digit})
				}
				break
			}
		}

		// Check box for this digit
		for r := boxRow; r < boxRow+3; r++ {
			for c := boxCol; c < boxCol+3; c++ {
				idx := r*9 + c
				if board.Cells[idx] == digit {
					if originalUserBoard[idx] != 0 && givens[idx] == 0 {
						userBlockers = append(userBlockers, blockingCell{idx, digit})
					}
					break
				}
			}
		}
	}

	if len(userBlockers) == 0 {
		return -1, 0
	}

	// Count how many times each user cell appears as a blocker
	// The cell blocking the most candidates is most likely wrong
	cellCount := make(map[int]int)
	cellDigit := make(map[int]int)
	for _, b := range userBlockers {
		cellCount[b.idx]++
		cellDigit[b.idx] = b.digit
	}

	// Find cell with highest count
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

func solveAllHandler(c *gin.Context) {
	var req SolveAllRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	session, err := verifyToken(cfg.JWTSecret, req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token: " + err.Error()})
		return
	}

	if len(req.Board) != constants.TotalCells {
		c.JSON(http.StatusBadRequest, gin.H{"error": "board must have 81 cells"})
		return
	}

	// Get original givens - either from request or regenerate from session
	givens := req.Givens
	if len(givens) != constants.TotalCells {
		// Regenerate givens from session info
		loader := puzzles.Global()
		if loader != nil {
			givens, _, _, _ = loader.GetPuzzleBySeed(session.Seed, session.Difficulty)
		}
		if len(givens) != constants.TotalCells {
			// Fallback: generate on-demand
			seedHash := hashSeed(session.Seed)
			fullGrid := dp.GenerateFullGrid(seedHash)
			allPuzzles := dp.CarveGivensWithSubset(fullGrid, seedHash)
			givens = allPuzzles[session.Difficulty]
		}
	}

	// Use provided candidates (may be empty/incomplete - solver will fill one at a time)
	board := human.NewBoardWithCandidates(req.Board, req.Candidates)
	
	// Keep a copy of the original user board to distinguish user entries from solver placements
	originalUserBoard := make([]int, len(req.Board))
	copy(originalUserBoard, req.Board)

	solver := human.NewSolver()

	// Collect all moves
	type MoveResult struct {
		Board      []int       `json:"board"`
		Candidates [][]int     `json:"candidates"`
		Move       interface{} `json:"move"`
	}

	var moves []MoveResult
	maxMoves := 2000
	maxFixes := 5 // Limit how many user errors we'll fix

	fixCount := 0

	for i := 0; i < maxMoves; i++ {
		// Check if solved
		if board.IsSolved() {
			break
		}

		move := solver.FindNextMove(board)
		if move == nil {
			break // No more moves found (stalled)
		}

		// If we hit a contradiction, try to find and fix the user error
		if move.Action == "contradiction" {
			if fixCount >= maxFixes {
				// Too many fixes needed - give up
				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: map[string]interface{}{
						"technique":   "error",
						"action":      "error",
						"explanation": "Too many incorrect entries to fix automatically",
					},
				})
				break
			}

			// Find the contradiction cell (first target in the move)
			if len(move.Targets) > 0 {
				contradictionCell := move.Targets[0].Row*9 + move.Targets[0].Col

				// Analyze which user-entered cell is causing this
				badCell, badDigit := findBlockingUserCell(board, contradictionCell, originalUserBoard, givens)

				if badCell >= 0 {
					badRow, badCol := badCell/9, badCell%9
					fixCount++

					// Update originalUserBoard to remove the bad cell
					originalUserBoard[badCell] = 0
					
					// IMPORTANT: Reset the board to the original user state (minus the fixed cell)
					// This removes any solver-placed cells that may have been wrong due to the user error
					board = human.NewBoardWithCandidates(originalUserBoard, nil)

					// Record the fix move
					moves = append(moves, MoveResult{
						Board:      board.GetCells(),
						Candidates: board.GetCandidates(),
						Move: map[string]interface{}{
							"technique":   "fix-error",
							"action":      "fix-error",
							"digit":       badDigit,
							"explanation": fmt.Sprintf("Contradiction detected! R%dC%d had no valid candidates. Removing incorrect %d from R%dC%d.", move.Targets[0].Row+1, move.Targets[0].Col+1, badDigit, badRow+1, badCol+1),
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

			// Couldn't identify the error - just record the contradiction
			moves = append(moves, MoveResult{
				Board:      board.GetCells(),
				Candidates: board.GetCandidates(),
				Move:       move,
			})
			continue
		}

		// Apply the move
		solver.ApplyMove(board, move)

		// Record the result
		moves = append(moves, MoveResult{
			Board:      board.GetCells(),
			Candidates: board.GetCandidates(),
			Move:       move,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"moves":      moves,
		"solved":     board.IsSolved(),
		"finalBoard": board.GetCells(),
	})
}

type SolveFullRequest struct {
	Token string `json:"token" binding:"required"`
	Board []int  `json:"board" binding:"required"`
}

func solveFullHandler(c *gin.Context) {
	var req SolveFullRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := verifyToken(cfg.JWTSecret, req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token: " + err.Error()})
		return
	}

	if len(req.Board) != constants.TotalCells {
		c.JSON(http.StatusBadRequest, gin.H{"error": "board must have 81 cells"})
		return
	}

	mode := c.Query("mode")
	if mode == "" {
		mode = "human"
	}

	if mode == "fast" {
		// Use DP solver
		solution := dp.Solve(req.Board)
		if solution == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "no solution found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"final_board": solution})
		return
	}

	// Human mode
	board := human.NewBoard(req.Board)
	solver := human.NewSolver()
	moves, reason := solver.SolveWithSteps(board, constants.MaxSolverSteps)

	c.JSON(http.StatusOK, gin.H{
		"moves":          moves,
		"final_board":    board.GetCells(),
		"stopped_reason": reason,
	})
}

// ValidateBoardRequest validates current board state during gameplay
type ValidateBoardRequest struct {
	Token string `json:"token" binding:"required"`
	Board []int  `json:"board" binding:"required"`
}

func validateBoardHandler(c *gin.Context) {
	var req ValidateBoardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := verifyToken(cfg.JWTSecret, req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token: " + err.Error()})
		return
	}

	if len(req.Board) != constants.TotalCells {
		c.JSON(http.StatusBadRequest, gin.H{"error": "board must have 81 cells"})
		return
	}

	// Check for conflicts (duplicates in rows/cols/boxes)
	conflicts := dp.FindConflicts(req.Board)
	if len(conflicts) > 0 {
		// Find all unique cells involved in conflicts
		conflictCells := make(map[int]bool)
		for _, conflict := range conflicts {
			conflictCells[conflict.Cell1] = true
			conflictCells[conflict.Cell2] = true
		}
		cellList := make([]int, 0, len(conflictCells))
		for cell := range conflictCells {
			cellList = append(cellList, cell)
		}
		
		c.JSON(http.StatusOK, gin.H{
			"valid":         false,
			"reason":        "conflicts",
			"message":       "There are conflicting numbers in the puzzle",
			"conflicts":     conflicts,
			"conflictCells": cellList,
		})
		return
	}

	// Check if puzzle is solvable from current state
	solutions := dp.CountSolutions(req.Board, 1)
	if solutions == 0 {
		c.JSON(http.StatusOK, gin.H{
			"valid":   false,
			"reason":  "unsolvable",
			"message": "The puzzle cannot be solved from this state - a digit you entered is incorrect",
		})
		return
	}

	// Board is valid and solvable
	c.JSON(http.StatusOK, gin.H{
		"valid":   true,
		"message": "All entries are correct so far!",
	})
}

type CustomValidateRequest struct {
	Givens   []int  `json:"givens" binding:"required"`
	DeviceID string `json:"device_id" binding:"required"`
}

func customValidateHandler(c *gin.Context) {
	var req CustomValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Givens) != constants.TotalCells {
		c.JSON(http.StatusBadRequest, gin.H{"error": "givens must have 81 cells"})
		return
	}

	// Check given count
	givenCount := 0
	for _, v := range req.Givens {
		if v != 0 {
			givenCount++
		}
	}

	if givenCount < constants.MinGivens {
		c.JSON(http.StatusOK, gin.H{
			"valid":  false,
			"reason": "need at least 17 givens",
		})
		return
	}

	// Validate: check for conflicts
	if !dp.IsValid(req.Givens) {
		c.JSON(http.StatusOK, gin.H{
			"valid":  false,
			"reason": "puzzle contains conflicts",
		})
		return
	}

	// Check solvability and uniqueness using DP
	solutions := dp.CountSolutions(req.Givens, constants.SolutionCountLimit)

	if solutions == 0 {
		c.JSON(http.StatusOK, gin.H{
			"valid":  false,
			"reason": "puzzle has no solution",
		})
		return
	}

	if solutions > 1 {
		c.JSON(http.StatusOK, gin.H{
			"valid":  true,
			"unique": false,
			"reason": "puzzle has multiple solutions",
		})
		return
	}

	// Generate a unique ID for this custom puzzle
	puzzleHash := hashSolution(req.Givens)
	puzzleID := "custom-" + puzzleHash[:16]

	c.JSON(http.StatusOK, gin.H{
		"valid":     true,
		"unique":    true,
		"puzzle_id": puzzleID,
	})
}
