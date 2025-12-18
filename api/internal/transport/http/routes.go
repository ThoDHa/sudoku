package http

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"sync"
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
		api.GET("/practice/:technique", practiceHandler)
		api.POST("/session/start", sessionStartHandler)
		api.POST("/solve/next", solveNextHandler)
		api.POST("/solve/all", solveAllHandler)
		api.POST("/solve/full", solveFullHandler)
		api.POST("/validate", validateBoardHandler)
		api.POST("/custom/validate", customValidateHandler)
	}
}

// validatePuzzleString checks if a puzzle string is valid
// Returns nil if valid, error with details if invalid
func validatePuzzleString(puzzle string) error {
	if len(puzzle) != 81 {
		return fmt.Errorf("puzzle must be exactly 81 characters, got %d", len(puzzle))
	}
	
	clueCount := 0
	for i, c := range puzzle {
		if c < '0' || c > '9' {
			return fmt.Errorf("invalid character '%c' at position %d", c, i)
		}
		if c != '0' {
			clueCount++
		}
	}
	
	if clueCount < 17 {
		return fmt.Errorf("puzzle must have at least 17 clues for a unique solution, got %d", clueCount)
	}
	
	return nil
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

// Cache for technique -> puzzle mappings to avoid re-analyzing
// This is populated on-demand as puzzles are analyzed
var practiceCache = struct {
	sync.RWMutex
	// technique slug -> list of (puzzle index, difficulty) pairs
	puzzles map[string][]practicePuzzle
}{
	puzzles: make(map[string][]practicePuzzle),
}

type practicePuzzle struct {
	index      int
	difficulty string
}

// practiceHandler finds a puzzle that requires a specific technique
func practiceHandler(c *gin.Context) {
	technique := c.Param("technique")
	
	if technique == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "technique required"})
		return
	}
	
	loader := puzzles.Global()
	if loader == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "puzzles not loaded"})
		return
	}
	
	// Map technique to appropriate difficulty levels to search
	// Simple techniques are in all puzzles, medium in medium+, etc.
	techniqueToDifficulties := map[string][]string{
		// Simple techniques - found in all difficulties, but easier puzzles have more obvious examples
		"naked-single":       {"easy", "medium"},
		"hidden-single":      {"easy", "medium"},
		"pointing-pair":      {"easy", "medium", "hard"},
		"box-line-reduction": {"easy", "medium", "hard"},
		"naked-pair":         {"easy", "medium", "hard"},
		"hidden-pair":        {"easy", "medium", "hard"},
		
		// Medium techniques
		"naked-triple":     {"medium", "hard", "extreme"},
		"hidden-triple":    {"medium", "hard", "extreme"},
		"naked-quad":       {"hard", "extreme"},
		"hidden-quad":      {"hard", "extreme"},
		"x-wing":           {"medium", "hard", "extreme"},
		"xy-wing":          {"medium", "hard", "extreme"},
		"simple-coloring":  {"medium", "hard", "extreme"},
		
		// Hard techniques
		"swordfish":         {"hard", "extreme", "impossible"},
		"skyscraper":        {"hard", "extreme", "impossible"},
		"finned-x-wing":     {"hard", "extreme", "impossible"},
		"finned-swordfish":  {"hard", "extreme", "impossible"},
		"unique-rectangle":  {"hard", "extreme", "impossible"},
		"bug":               {"hard", "extreme", "impossible"},
		"jellyfish":         {"extreme", "impossible"},
		"x-chain":           {"hard", "extreme", "impossible"},
		"xy-chain":          {"hard", "extreme", "impossible"},
		"w-wing":            {"hard", "extreme", "impossible"},
		"empty-rectangle":   {"hard", "extreme", "impossible"},
		"xyz-wing":          {"hard", "extreme", "impossible"},
		"wxyz-wing":         {"hard", "extreme", "impossible"},
		"als-xz":            {"hard", "extreme", "impossible"},
		"remote-pairs":      {"hard", "extreme", "impossible"},
		
		// Extreme techniques
		"sue-de-coq":         {"impossible"},
		"medusa-3d":          {"impossible"},
		"grouped-x-cycles":   {"impossible"},
		"aic":                {"impossible"},
		"als-xy-wing":        {"impossible"},
		"als-xy-chain":       {"impossible"},
		"forcing-chain":      {"impossible"},
		"digit-forcing-chain": {"impossible"},
		"death-blossom":      {"impossible"},
	}
	
	difficulties, known := techniqueToDifficulties[technique]
	if !known {
		// Unknown technique - try medium/hard/extreme
		difficulties = []string{"medium", "hard", "extreme", "impossible"}
	}
	
	// Check cache first (thread-safe read)
	practiceCache.RLock()
	cached := practiceCache.puzzles[technique]
	practiceCache.RUnlock()
	
	if len(cached) > 0 {
		// Pick a random one from cache using current time
		idx := int(time.Now().UnixNano()) % len(cached)
		p := cached[idx]
		
		givens, _, err := loader.GetPuzzle(p.index, p.difficulty)
		if err == nil {
			seed := fmt.Sprintf("practice-%s-%d", technique, p.index)
			c.JSON(http.StatusOK, gin.H{
				"seed":         seed,
				"difficulty":   p.difficulty,
				"givens":       givens,
				"technique":    technique,
				"puzzle_index": p.index,
				"cached":       true,
			})
			return
		}
	}
	
	// Not in cache - search for a puzzle
	// We'll sample puzzles to find one that uses the technique
	solver := human.NewSolver()
	puzzleCount := loader.Count()
	
	// Sample up to 50 puzzles to find one with this technique
	maxSamples := 50
	startIdx := int(time.Now().UnixNano()) % puzzleCount
	
	for i := 0; i < maxSamples; i++ {
		idx := (startIdx + i) % puzzleCount
		
		// Try each difficulty level for this technique
		for _, diff := range difficulties {
			givens, _, err := loader.GetPuzzle(idx, diff)
			if err != nil {
				continue
			}
			
			// Analyze the puzzle
			_, techniqueCounts, status := solver.AnalyzePuzzleDifficulty(givens)
			if status != "completed" {
				continue
			}
			
			// Check if this technique is used
			if count, ok := techniqueCounts[technique]; ok && count > 0 {
				// Found one! Cache it (thread-safe write) and return
				practiceCache.Lock()
				practiceCache.puzzles[technique] = append(practiceCache.puzzles[technique], practicePuzzle{
					index:      idx,
					difficulty: diff,
				})
				practiceCache.Unlock()
				
				seed := fmt.Sprintf("practice-%s-%d", technique, idx)
				c.JSON(http.StatusOK, gin.H{
					"seed":         seed,
					"difficulty":   diff,
					"givens":       givens,
					"technique":    technique,
					"puzzle_index": idx,
					"cached":       false,
				})
				return
			}
		}
	}
	
	// Didn't find a puzzle with this technique
	c.JSON(http.StatusNotFound, gin.H{
		"error":     "no puzzle found",
		"technique": technique,
		"message":   "Could not find a puzzle requiring this technique. Try a different technique or check back later.",
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
		log.Printf("ERROR [sessionStart]: failed to create token: %v", err)
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
	Givens     []int   `json:"givens"`     // Original puzzle givens (to identify user-entered cells)
}

func solveNextHandler(c *gin.Context) {
	var req SolveNextRequest
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
	solver := human.NewSolver()
	move := solver.FindNextMove(board)

	if move == nil {
		c.JSON(http.StatusOK, gin.H{"move": nil})
		return
	}

	// Handle contradiction - try to find and fix user error (like solveAllHandler)
	if move.Action == "contradiction" {
		// Find the contradiction cell (first target in the move)
		if len(move.Targets) > 0 {
			contradictionCell := move.Targets[0].Row*9 + move.Targets[0].Col

			// Analyze which user-entered cell is causing this
			badCell, badDigit := findBlockingUserCell(board, contradictionCell, req.Board, givens)

			if badCell >= 0 {
				badRow, badCol := badCell/9, badCell%9

				// Create a new board without the bad cell
				fixedBoard := make([]int, len(req.Board))
				copy(fixedBoard, req.Board)
				fixedBoard[badCell] = 0
				
				// Preserve user's candidates but clear the fixed cell's candidates
				// Always allocate 81 slots even if req.Candidates is shorter/empty
				fixedCandidates := make([][]int, constants.TotalCells)
				for i := 0; i < constants.TotalCells; i++ {
					if i == badCell {
						fixedCandidates[i] = nil // Clear candidates for the fixed cell
					} else if i < len(req.Candidates) && req.Candidates[i] != nil {
						fixedCandidates[i] = make([]int, len(req.Candidates[i]))
						copy(fixedCandidates[i], req.Candidates[i])
					}
				}

				// Reset the board to the fixed state, preserving user's candidates
				newBoard := human.NewBoardWithCandidates(fixedBoard, fixedCandidates)

				c.JSON(http.StatusOK, gin.H{
					"board":      newBoard.GetCells(),
					"candidates": newBoard.GetCandidates(),
					"move": map[string]interface{}{
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
				return
			}
		}

		// Direct analysis failed - try candidate refill diagnostic
		badCell, badDigit, zeroCandCell := findErrorByCandidateRefill(req.Board, givens)

		if badCell >= 0 {
			badRow, badCol := badCell/9, badCell%9
			zeroCandRow, zeroCandCol := zeroCandCell/9, zeroCandCell%9

			// Create a new board without the bad cell
			fixedBoard := make([]int, len(req.Board))
			copy(fixedBoard, req.Board)
			fixedBoard[badCell] = 0
			
			// Preserve user's candidates but clear the fixed cell's candidates
			// Always allocate 81 slots even if req.Candidates is shorter/empty
			fixedCandidates := make([][]int, constants.TotalCells)
			for i := 0; i < constants.TotalCells; i++ {
				if i == badCell {
					fixedCandidates[i] = nil // Clear candidates for the fixed cell
				} else if i < len(req.Candidates) && req.Candidates[i] != nil {
					fixedCandidates[i] = make([]int, len(req.Candidates[i]))
					copy(fixedCandidates[i], req.Candidates[i])
				}
			}

			// Reset the board to the fixed state, preserving user's candidates
			newBoard := human.NewBoardWithCandidates(fixedBoard, fixedCandidates)

			c.JSON(http.StatusOK, gin.H{
				"board":      newBoard.GetCells(),
				"candidates": newBoard.GetCandidates(),
				"move": map[string]interface{}{
					"technique":   "fix-error",
					"action":      "fix-error",
					"digit":       badDigit,
					"explanation": fmt.Sprintf("Found it! R%dC%d has no valid candidates. The %d at R%dC%d was causing the problem.", zeroCandRow+1, zeroCandCol+1, badDigit, badRow+1, badCol+1),
					"targets":     []map[string]int{{"row": badRow, "col": badCol}},
					"highlights": map[string]interface{}{
						"primary":   []map[string]int{{"row": badRow, "col": badCol}},
						"secondary": []map[string]int{{"row": zeroCandRow, "col": zeroCandCol}},
					},
				},
			})
			return
		}

		// Both methods failed - return unpinpointable error
		userEntryCount := countUserEntries(req.Board, givens)

		c.JSON(http.StatusOK, gin.H{
			"board":      board.GetCells(),
			"candidates": board.GetCandidates(),
			"move": map[string]interface{}{
				"technique":      "unpinpointable-error",
				"action":         "unpinpointable-error",
				"explanation":    fmt.Sprintf("Hmm, I couldn't pinpoint the error. One of your %d entries might need checking.", userEntryCount),
				"userEntryCount": userEntryCount,
			},
		})
		return
	}

	// Apply the move for normal cases
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

// findErrorByCandidateRefill clears all candidates, refills them, and looks for cells with zero candidates.
// This is the "human-like" approach: when stuck, clear your pencil marks and start fresh.
// If a cell has zero candidates, trace back to find which user-entered cell is blocking it.
// Returns the cell index and digit, or -1 if no error found this way.
func findErrorByCandidateRefill(originalUserBoard []int, givens []int) (int, int, int) {
	// Create a fresh board and fill all candidates
	freshBoard := human.NewBoardWithCandidates(originalUserBoard, nil)
	
	// Find any cell with zero candidates
	for idx := 0; idx < constants.TotalCells; idx++ {
		if originalUserBoard[idx] != 0 {
			continue // Skip filled cells
		}
		
		candidates := freshBoard.Candidates[idx]
		if len(candidates) == 0 {
			// Found a cell with no candidates - this points to an error
			// Find which user-entered cell is blocking all candidates
			row, col := idx/9, idx%9
			boxRow, boxCol := (row/3)*3, (col/3)*3
			
			// For each digit 1-9, find what's blocking it
			type blocker struct {
				cellIdx int
				digit   int
			}
			var userBlockers []blocker
			
			for digit := 1; digit <= 9; digit++ {
				// Check row
				for c := 0; c < 9; c++ {
					cellIdx := row*9 + c
					if originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0 {
						userBlockers = append(userBlockers, blocker{cellIdx, digit})
					}
				}
				// Check column
				for r := 0; r < 9; r++ {
					cellIdx := r*9 + col
					if originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0 {
						userBlockers = append(userBlockers, blocker{cellIdx, digit})
					}
				}
				// Check box
				for r := boxRow; r < boxRow+3; r++ {
					for c := boxCol; c < boxCol+3; c++ {
						cellIdx := r*9 + c
						if originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0 {
							userBlockers = append(userBlockers, blocker{cellIdx, digit})
						}
					}
				}
			}
			
			if len(userBlockers) > 0 {
				// Return the first blocker found (any of them could be wrong)
				// Also return the zero-candidate cell index for the message
				return userBlockers[0].cellIdx, userBlockers[0].digit, idx
			}
		}
	}
	
	return -1, 0, -1
}

// countUserEntries counts how many cells have user entries (not givens)
func countUserEntries(board []int, givens []int) int {
	count := 0
	for i := 0; i < constants.TotalCells; i++ {
		if board[i] != 0 && givens[i] == 0 {
			count++
		}
	}
	return count
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
	
	// Keep a copy of the original user candidates to preserve them when fixing errors
	// Always allocate 81 slots even if req.Candidates is shorter/empty
	originalUserCandidates := make([][]int, constants.TotalCells)
	for i := 0; i < len(req.Candidates) && i < constants.TotalCells; i++ {
		if req.Candidates[i] != nil {
			originalUserCandidates[i] = make([]int, len(req.Candidates[i]))
			copy(originalUserCandidates[i], req.Candidates[i])
		}
	}

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
			// No more moves found (stalled)
			// If we've already fixed some errors, there might be more issues
			// Offer the user a choice
			userEntryCount := countUserEntries(originalUserBoard, givens)
			if userEntryCount > 0 {
				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: map[string]interface{}{
						"technique":      "stalled",
						"action":         "stalled",
						"explanation":    "I'm stuck. There might be another error in your entries.",
						"userEntryCount": userEntryCount,
					},
				})
			}
			break
		}

		// If we hit a contradiction, try to find and fix the user error
		if move.Action == "contradiction" {
			if fixCount >= maxFixes {
				// Too many fixes needed - give up and offer user a choice
				userEntryCount := countUserEntries(originalUserBoard, givens)
				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: map[string]interface{}{
						"technique":      "error",
						"action":         "error",
						"explanation":    "Too many incorrect entries to fix automatically.",
						"userEntryCount": userEntryCount,
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
					
					// Reset the board to the original user state (minus the fixed cell)
					// This removes any solver-placed cells that may have been wrong due to the user error
					// Use nil for candidates so the solver will rebuild them from scratch
					board = human.NewBoardWithCandidates(originalUserBoard, nil)
					// Initialize candidates properly based on the corrected board
					board.InitCandidates()

					// Record the fix move
					moves = append(moves, MoveResult{
						Board:      board.GetCells(),
						Candidates: board.GetCandidates(),
						Move: map[string]interface{}{
							"technique":   "fix-error",
							"action":      "fix-error",
							"digit":       badDigit,
					"explanation": fmt.Sprintf("Removing incorrect %d from R%dC%d.", badDigit, badRow+1, badCol+1),
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

			// Direct analysis failed - try candidate refill diagnostic
			// This is the "human-like" approach: clear notes, refill, look for zero-candidate cells
			moves = append(moves, MoveResult{
				Board:      board.GetCells(),
				Candidates: board.GetCandidates(),
				Move: map[string]interface{}{
					"technique":   "diagnostic",
					"action":      "diagnostic",
					"explanation": "Taking another look at the candidates...",
				},
			})

			badCell, badDigit, zeroCandCell := findErrorByCandidateRefill(originalUserBoard, givens)
			
			if badCell >= 0 {
				badRow, badCol := badCell/9, badCell%9
				zeroCandRow, zeroCandCol := zeroCandCell/9, zeroCandCell%9
				fixCount++

				// Update originalUserBoard to remove the bad cell (for future reference)
				originalUserBoard[badCell] = 0
				
				// Instead of resetting the entire board, just clear the bad cell
				// and let the solver continue from the current state
				board.ClearCell(badCell)

				// Record the fix move with friendly message
				moves = append(moves, MoveResult{
					Board:      board.GetCells(),
					Candidates: board.GetCandidates(),
					Move: map[string]interface{}{
						"technique":   "fix-error",
						"action":      "fix-error",
						"digit":       badDigit,
					"explanation": fmt.Sprintf("Removing incorrect %d from R%dC%d.", badDigit, badRow+1, badCol+1),
						"targets":     []map[string]int{{"row": badRow, "col": badCol}},
						"highlights": map[string]interface{}{
							"primary":   []map[string]int{{"row": badRow, "col": badCol}},
							"secondary": []map[string]int{{"row": zeroCandRow, "col": zeroCandCol}},
						},
					},
				})
				continue
			}

			// Both methods failed - return unpinpointable error
			// Count user entries so frontend can display helpful message
			userEntryCount := countUserEntries(originalUserBoard, givens)
			
			moves = append(moves, MoveResult{
				Board:      board.GetCells(),
				Candidates: board.GetCandidates(),
				Move: map[string]interface{}{
					"technique":       "unpinpointable-error",
					"action":          "unpinpointable-error",
					"explanation":     fmt.Sprintf("Hmm, I couldn't pinpoint the error. One of your %d entries might need checking.", userEntryCount),
					"userEntryCount":  userEntryCount,
				},
			})
			break // Stop auto-solving - let user decide what to do
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
