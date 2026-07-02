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

	"sudoku-api/internal/core"
	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/config"
	"sudoku-api/pkg/constants"

	"github.com/gin-gonic/gin"
)

var cfg *config.Config

func RegisterRoutes(r *gin.Engine, c *config.Config) {
	cfg = c

	r.GET(constants.RouteHealth, healthHandler)

	api := r.Group(constants.RouteAPI)
	{
		api.GET(constants.RouteVersion, versionHandler)
		api.GET(constants.RouteDaily, dailyHandler)
		api.GET(constants.RoutePuzzleID, puzzleHandler)
		api.GET(constants.RouteAnalyze, puzzleAnalyzeHandler)
		api.GET(constants.RoutePractice, practiceHandler)
		api.POST(constants.RouteSessionStart, sessionStartHandler)
		api.POST(constants.RouteSolveNext, solveNextHandler)
		api.POST(constants.RouteSolveAll, solveAllHandler)
		api.POST(constants.RouteSolveFull, solveFullHandler)
		api.POST(constants.RouteValidate, validateBoardHandler)
		api.POST(constants.RouteCustomValidate, customValidateHandler)
	}
}

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"version": constants.APIVersion,
	})
}

func versionHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"api_version":    constants.APIVersion,
		"solver_version": constants.SolverVersion,
	})
}

// TodayUTC returns today's UTC date string
//
// Returns: Current date in UTC formatted as YYYY-MM-DD
func TodayUTC() string {
	return time.Now().UTC().Format(constants.DateFormat)
}

// validateDifficulty reports whether d is one of the supported difficulties.
func validateDifficulty(d core.Difficulty) bool {
	switch d {
	case core.DifficultyEasy, core.DifficultyMedium, core.DifficultyHard,
		core.DifficultyExtreme, core.DifficultyImpossible:
		return true
	}
	return false
}

// writeInvalidDifficulty writes the standard 400 response for an unsupported
// difficulty. Kept centralized so every handler reports the same message.
func writeInvalidDifficulty(c *gin.Context, got core.Difficulty) {
	c.JSON(http.StatusBadRequest, gin.H{
		"error": fmt.Sprintf(
			"invalid difficulty '%s'. Must be one of: %s, %s, %s, %s, %s",
			got, core.DifficultyEasy, core.DifficultyMedium, core.DifficultyHard,
			core.DifficultyExtreme, core.DifficultyImpossible,
		),
	})
}

// requireBoardLength writes a 400 and returns false when board is not the
// expected Sudoku cell count. Returns true when the caller may proceed.
func requireBoardLength(c *gin.Context, board []int) bool {
	if len(board) != constants.TotalCells {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("board must have %d cells", constants.TotalCells),
		})
		return false
	}
	return true
}

// requireBoardValues writes a 400 and returns false when any cell of board holds
// a value outside the legal Sudoku digit range 0-9 (0 denotes an empty cell).
// The HTTP boundary is the public attack surface, so malformed digits are
// rejected explicitly rather than flowing into the solvers. Returns true when
// the caller may proceed.
func requireBoardValues(c *gin.Context, board []int) bool {
	for _, v := range board {
		if v < 0 || v > 9 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("board cell value %d is out of range; each cell must be 0-9", v),
			})
			return false
		}
	}
	return true
}

// buildFixedCandidates clones the user's candidate grid for a fix response,
// clearing the candidates of the cell being removed (badCell). It always
// returns a full TotalCells-length grid so downstream code can index safely
// even when reqCandidates is shorter or empty.
func buildFixedCandidates(reqCandidates [][]int, badCell int) [][]int {
	fixed := make([][]int, constants.TotalCells)
	for i := 0; i < constants.TotalCells; i++ {
		if i == badCell {
			fixed[i] = nil // Clear candidates for the fixed cell
		} else if i < len(reqCandidates) && reqCandidates[i] != nil {
			fixed[i] = make([]int, len(reqCandidates[i]))
			copy(fixed[i], reqCandidates[i])
		}
	}
	return fixed
}

// buildConflictFix resolves a single direct conflict (duplicate digit in a row,
// column, or box) by selecting which cell to clear, then produces the corrected
// board state and the fix-conflict move description. The cell holding a given is
// always kept; when both cells are givens the conflict cannot be auto-fixed and
// ok is false so the caller skips it. fixedBoard/fixedCandidates are returned
// alongside the move so callers that continue solving (solveAll) can seed the
// autosolve loop from the same corrected state the move reports.
func buildConflictFix(board []int, candidates [][]int, givens []int, conflict dp.Conflict) (move map[string]interface{}, fixedBoard []int, fixedCandidates [][]int, ok bool) {
	cell1IsGiven := givens[conflict.Cell1] != 0
	cell2IsGiven := givens[conflict.Cell2] != 0

	var badCell, otherCell int
	switch {
	case cell1IsGiven && cell2IsGiven:
		return nil, nil, nil, false
	case cell1IsGiven:
		badCell = conflict.Cell2
		otherCell = conflict.Cell1
	case cell2IsGiven:
		badCell = conflict.Cell1
		otherCell = conflict.Cell2
	default:
		badCell = conflict.Cell2
		otherCell = conflict.Cell1
	}

	badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
	otherRow, otherCol := otherCell/constants.GridSize, otherCell%constants.GridSize
	badDigit := board[badCell]

	fixedBoard = make([]int, len(board))
	copy(fixedBoard, board)
	fixedBoard[badCell] = 0

	fixedCandidates = buildFixedCandidates(candidates, badCell)

	var explanation string
	switch conflict.Type {
	case "row":
		explanation = fmt.Sprintf("Conflict! R%dC%d and R%dC%d both have %d in the same row. Removing the %d from R%dC%d.",
			badRow+1, badCol+1, otherRow+1, otherCol+1, badDigit, badDigit, badRow+1, badCol+1)
	case "column":
		explanation = fmt.Sprintf("Conflict! R%dC%d and R%dC%d both have %d in the same column. Removing the %d from R%dC%d.",
			badRow+1, badCol+1, otherRow+1, otherCol+1, badDigit, badDigit, badRow+1, badCol+1)
	case "box":
		explanation = fmt.Sprintf("Conflict! R%dC%d and R%dC%d both have %d in the same box. Removing the %d from R%dC%d.",
			badRow+1, badCol+1, otherRow+1, otherCol+1, badDigit, badDigit, badRow+1, badCol+1)
	}

	move = map[string]interface{}{
		"technique":   "fix-conflict",
		"action":      "fix-conflict",
		"digit":       badDigit,
		"explanation": explanation,
		"targets":     []map[string]int{{"row": badRow, "col": badCol}},
		"highlights": map[string]interface{}{
			"primary":   []map[string]int{{"row": badRow, "col": badCol}},
			"secondary": []map[string]int{{"row": otherRow, "col": otherCol}},
		},
	}
	return move, fixedBoard, fixedCandidates, true
}

// resolveGivens returns the puzzle's original givens, preferring the value
// supplied in the request and falling back to the loader or on-demand
// generation from the session seed when it is not the right length.
func resolveGivens(session *SessionToken, reqGivens []int) []int {
	givens := reqGivens
	if len(givens) == constants.TotalCells {
		return givens
	}

	loader := puzzles.Global()
	if loader != nil {
		givens, _, _, _ = loader.GetPuzzleBySeed(session.Seed, session.Difficulty)
	}
	if len(givens) == constants.TotalCells {
		return givens
	}

	seedHash := hashSeed(session.Seed)
	fullGrid := dp.GenerateFullGrid(seedHash)
	allPuzzles := dp.CarveGivensWithSubset(fullGrid, seedHash)
	return allPuzzles[session.Difficulty]
}

func dailyHandler(c *gin.Context) {
	dateUTC := TodayUTC()

	// Deterministic seed from date
	seed := constants.DailyPuzzlePrefix + dateUTC

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
	if !validateDifficulty(difficulty) {
		writeInvalidDifficulty(c, difficulty)
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
	puzzleID := seed + constants.PuzzleIDDl + string(difficulty)

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
	if !validateDifficulty(difficulty) {
		writeInvalidDifficulty(c, difficulty)
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

// techniqueToDifficulties maps a practice technique slug to the puzzle
// difficulties worth searching. It is constant lookup data, kept at package
// scope so it is allocated once rather than rebuilt on every practice request.
var techniqueToDifficulties = map[string][]string{
	// Simple techniques: found in all difficulties, but easier puzzles have more obvious examples
	"naked-single":       {"easy", "medium"},
	"hidden-single":      {"easy", "medium"},
	"pointing-pair":      {"easy", "medium", "hard"},
	"box-line-reduction": {"easy", "medium", "hard"},
	"naked-pair":         {"easy", "medium", "hard"},
	"hidden-pair":        {"easy", "medium", "hard"},

	// Medium techniques
	"naked-triple":    {"easy", "medium", "hard", "extreme", "impossible"},
	"hidden-triple":   {"easy", "medium", "hard", "extreme", "impossible"},
	"naked-quad":      {"hard", "extreme"},
	"hidden-quad":     {"hard", "extreme"},
	"x-wing":          {"medium", "hard", "extreme"},
	"xy-wing":         {"medium", "hard", "extreme"},
	"simple-coloring": {"medium", "hard", "extreme"},

	// Hard techniques
	"swordfish":        {"medium", "hard", "extreme", "impossible"},
	"skyscraper":       {"hard", "extreme", "impossible"},
	"finned-x-wing":    {"impossible"},
	"finned-swordfish": {"impossible"},
	"unique-rectangle": {"medium", "hard", "extreme", "impossible"},
	"bug":              {"medium", "hard", "extreme", "impossible"},
	"jellyfish":        {"extreme", "impossible"},
	"x-chain":          {"hard", "extreme", "impossible"},
	"xy-chain":         {"hard", "extreme", "impossible"},
	"w-wing":           {"hard", "extreme", "impossible"},
	"empty-rectangle":  {"hard", "extreme", "impossible"},
	"xyz-wing":         {"medium", "hard", "extreme", "impossible"},
	"wxyz-wing":        {"hard", "extreme", "impossible"},
	"als-xz":           {"impossible"},

	// Extreme techniques
	"sue-de-coq":          {"impossible"},
	"medusa-3d":           {"hard", "extreme", "impossible"},
	"grouped-x-cycles":    {"impossible"},
	"aic":                 {"impossible"},
	"als-xy-wing":         {"impossible"},
	"als-xy-chain":        {"impossible"},
	"forcing-chain":       {"impossible"},
	"digit-forcing-chain": {"impossible"},
	"death-blossom":       {"impossible"},
}

// practiceHandler finds a puzzle requiring a specific technique for practice purposes
//
// This endpoint searches the pre-generated puzzle database to find a puzzle that uses
// the requested technique. Results are cached to speed up subsequent requests for the
// same technique.
//
// Strategy:
// 1. Check if technique has cached puzzles (random selection from cache)
// 2. If not cached, sample up to 50 puzzles across difficulty levels
// 3. Analyze each sampled puzzle to find one using the requested technique
// 4. Cache found puzzles for faster future lookups
//
// Technique-to-difficulty mapping ensures appropriate puzzles:
// - Simple techniques: Easy/Medium puzzles
// - Medium techniques: Medium+ puzzles
// - Hard techniques: Hard/Extreme/Impossible puzzles
//
// Parameters:
//
//	technique: Slug name of Sudoku technique (e.g., "x-wing", "xy-wing", "swordfish")
//
// Response:
//
//	seed: Puzzle seed for generating the puzzle
//	difficulty: Difficulty level of found puzzle
//	givens: 81-element puzzle clues array
//	technique: Confirmed technique used in puzzle
//	puzzle_index: Index in puzzle database
//	cached: Boolean indicating if result came from cache
//
// serveCachedPractice writes the response for a cache hit on technique,
// picking a random puzzle from cached. Returns true when a response was
// written; false when there is no cache entry or the cached puzzle could not
// be loaded (caller falls through to the search path).
func serveCachedPractice(c *gin.Context, technique string, cached []practicePuzzle, loader *puzzles.Loader) bool {
	if len(cached) == 0 {
		return false
	}
	idx := int(time.Now().UnixNano()) % len(cached)
	p := cached[idx]

	givens, _, err := loader.GetPuzzle(p.index, p.difficulty)
	if err != nil {
		return false
	}

	seed := fmt.Sprintf(constants.PracticePuzzleIDFmt, technique, p.index)
	c.JSON(http.StatusOK, gin.H{
		"seed":         seed,
		"difficulty":   p.difficulty,
		"givens":       givens,
		"technique":    technique,
		"puzzle_index": p.index,
		"cached":       true,
	})
	return true
}

// findPracticePuzzle scans up to maxSamples puzzle indices across difficulties,
// returning the first puzzle whose analysis uses technique. The scan starts at
// a time-seeded offset so repeated requests surface different candidates. An
// empty result (ok=false) means no match was found.
func findPracticePuzzle(loader *puzzles.Loader, solver *human.Solver, technique string, difficulties []string, puzzleCount, maxSamples int) (givens []int, idx int, difficulty string, ok bool) {
	if puzzleCount == 0 {
		return nil, 0, "", false
	}
	startIdx := int(time.Now().UnixNano()) % puzzleCount
	for i := 0; i < maxSamples; i++ {
		idx := (startIdx + i) % puzzleCount
		for _, diff := range difficulties {
			g, _, err := loader.GetPuzzle(idx, diff)
			if err != nil {
				continue
			}
			_, techniqueCounts, status := solver.AnalyzePuzzleDifficulty(g)
			if status != "completed" {
				continue
			}
			if count, has := techniqueCounts[technique]; has && count > 0 {
				return g, idx, diff, true
			}
		}
	}
	return nil, 0, "", false
}

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

	difficulties, known := techniqueToDifficulties[technique]
	if !known {
		// Unknown technique - try medium/hard/extreme
		difficulties = []string{"medium", "hard", "extreme", "impossible"}
	}

	// Check cache first (thread-safe read)
	practiceCache.RLock()
	cached := practiceCache.puzzles[technique]
	practiceCache.RUnlock()

	if serveCachedPractice(c, technique, cached, loader) {
		return
	}

	// Not in cache - search for a puzzle that uses the requested technique.
	solver := human.NewSolver()
	givens, idx, diff, ok := findPracticePuzzle(loader, solver, technique, difficulties, loader.Count(), 50)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{
			"error":     "no puzzle found",
			"technique": technique,
			"message":   "Could not find a puzzle requiring this technique. Try a different technique or check back later.",
		})
		return
	}

	// Cache the hit (thread-safe write) and respond.
	practiceCache.Lock()
	practiceCache.puzzles[technique] = append(practiceCache.puzzles[technique], practicePuzzle{
		index:      idx,
		difficulty: diff,
	})
	practiceCache.Unlock()

	seed := fmt.Sprintf(constants.PracticePuzzleIDFmt, technique, idx)
	c.JSON(http.StatusOK, gin.H{
		"seed":         seed,
		"difficulty":   diff,
		"givens":       givens,
		"technique":    technique,
		"puzzle_index": idx,
		"cached":       false,
	})
}

// hashSeed generates a deterministic hash from a seed string for puzzle generation
//
// Parameters:
//
//	seed: string to hash (can be puzzle ID, date, or any unique identifier)
//
// Returns: 64-bit integer hash value (overflow is expected behavior for seeding)
func hashSeed(seed string) int64 {
	h := fnv.New64a()
	h.Write([]byte(seed))
	return int64(h.Sum64()) //nolint:gosec // hash value overflow is expected behavior
}

// hashSolution generates a unique SHA-256 hash of a completed puzzle board
//
// Parameters:
//
//	board: 81-element array representing the complete solved puzzle
//
// Returns: Hexadecimal SHA-256 hash (64 characters)
func hashSolution(board []int) string {
	h := sha256.New()
	for _, v := range board {
		h.Write([]byte{byte(v)}) //nolint:gosec // G115: v is a Sudoku digit (0-9); always fits in a byte
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
	if !validateDifficulty(difficulty) {
		writeInvalidDifficulty(c, difficulty)
		return
	}

	// Generate deterministic puzzle ID
	puzzleID := req.Seed + constants.PuzzleIDDl + req.Difficulty

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

// respondSolveNextFix writes the fix-error response for solveNext after a bad
// user cell has been identified. The board sent back is rebuilt from reqBoard
// with the bad cell cleared and the user's candidate grid preserved (minus the
// bad cell). explanation and the secondary highlight come from the caller since
// the two detection paths phrase them differently.
func respondSolveNextFix(c *gin.Context, reqBoard []int, reqCandidates [][]int, badCell, badDigit int, explanation string, secondaryRow, secondaryCol int) {
	badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize

	fixedBoard := make([]int, len(reqBoard))
	copy(fixedBoard, reqBoard)
	fixedBoard[badCell] = 0

	fixedCandidates := buildFixedCandidates(reqCandidates, badCell)
	newBoard := human.NewBoardWithCandidates(fixedBoard, fixedCandidates)

	c.JSON(http.StatusOK, gin.H{
		"board":      newBoard.GetCells(),
		"candidates": newBoard.GetCandidates(),
		"move": map[string]interface{}{
			"technique":   "fix-error",
			"action":      "fix-error",
			"digit":       badDigit,
			"explanation": explanation,
			"targets":     []map[string]int{{"row": badRow, "col": badCol}},
			"highlights": map[string]interface{}{
				"primary":   []map[string]int{{"row": badRow, "col": badCol}},
				"secondary": []map[string]int{{"row": secondaryRow, "col": secondaryCol}},
			},
		},
	})
}

// handleSolveNextContradiction diagnoses a contradiction reported by the solver
// during a single-step solve. On any path that ends the request (a fix was
// applied, or the error could not be pinpointed) it writes the JSON response
// and returns true. It returns false only when move is not a contradiction, so
// the caller knows to fall through to normal move application.
func handleSolveNextContradiction(c *gin.Context, board *human.Board, move *core.Move, reqBoard []int, reqCandidates [][]int, givens []int) bool {
	if move.Action != "contradiction" {
		return false
	}

	if len(move.Targets) > 0 {
		contradictionCell := move.Targets[0].Row*constants.GridSize + move.Targets[0].Col
		badCell, badDigit := findBlockingUserCell(board, contradictionCell, reqBoard, givens)
		if badCell >= 0 {
			badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
			respondSolveNextFix(c, reqBoard, reqCandidates, badCell, badDigit,
				fmt.Sprintf("Contradiction detected! R%dC%d had no valid candidates. Removing incorrect %d from R%dC%d.",
					move.Targets[0].Row+1, move.Targets[0].Col+1, badDigit, badRow+1, badCol+1),
				move.Targets[0].Row, move.Targets[0].Col)
			return true
		}
	}

	badCell, badDigit, zeroCandCell := findErrorByCandidateRefill(reqBoard, givens)
	if badCell >= 0 {
		zeroCandRow, zeroCandCol := zeroCandCell/constants.GridSize, zeroCandCell%constants.GridSize
		badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
		respondSolveNextFix(c, reqBoard, reqCandidates, badCell, badDigit,
			fmt.Sprintf("Found it! R%dC%d has no valid candidates. The %d at R%dC%d was causing the problem.",
				zeroCandRow+1, zeroCandCol+1, badDigit, badRow+1, badCol+1),
			zeroCandRow, zeroCandCol)
		return true
	}

	userEntryCount := countUserEntries(reqBoard, givens)
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
	return true
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

	if !requireBoardLength(c, req.Board) {
		return
	}
	if !requireBoardValues(c, req.Board) {
		return
	}

	givens := resolveGivens(session, req.Givens)

	// STEP 1: Check for direct conflicts FIRST (before running solver).
	// These are immediate rule violations: same digit twice in a row/column/box.
	conflicts := dp.FindConflicts(req.Board)
	if len(conflicts) > 0 {
		for _, conflict := range conflicts {
			move, fixedBoard, fixedCandidates, ok := buildConflictFix(req.Board, req.Candidates, givens, conflict)
			if !ok {
				continue
			}
			newBoard := human.NewBoardWithCandidates(fixedBoard, fixedCandidates)
			c.JSON(http.StatusOK, gin.H{
				"board":      newBoard.GetCells(),
				"candidates": newBoard.GetCandidates(),
				"move":       move,
			})
			return
		}
	}

	// STEP 2: No direct conflicts - proceed with normal solver.
	board := human.NewBoardWithCandidates(req.Board, req.Candidates)
	solver := human.NewSolver()
	move := solver.FindNextMove(board)

	if move == nil {
		c.JSON(http.StatusOK, gin.H{"move": nil})
		return
	}

	// STEP 3: Handle contradiction - try to find and fix user error, or report
	// the unpinpointable state. Returns true when the request was completed.
	if handleSolveNextContradiction(c, board, move, req.Board, req.Candidates, givens) {
		return
	}

	// Normal move: apply and respond.
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

// peerCellIndices returns the cell indices of the row, column, and 3x3 box
// peers of the cell at (row, col). Row peers come first (left to right), then
// column peers (top to bottom), then box peers in row-major order. The
// error-detection helpers below scan peers in this exact order, so reordering
// the returned slices would change which cell is reported as the blocker.
func peerCellIndices(row, col int) (rowCells, colCells, boxCells []int) {
	rowCells = make([]int, constants.GridSize)
	colCells = make([]int, constants.GridSize)
	for i := 0; i < constants.GridSize; i++ {
		rowCells[i] = row*constants.GridSize + i
		colCells[i] = i*constants.GridSize + col
	}
	boxRow := (row / constants.BoxSize) * constants.BoxSize
	boxCol := (col / constants.BoxSize) * constants.BoxSize
	boxCells = make([]int, 0, constants.GridSize)
	for r := boxRow; r < boxRow+constants.BoxSize; r++ {
		for c := boxCol; c < boxCol+constants.BoxSize; c++ {
			boxCells = append(boxCells, r*constants.GridSize+c)
		}
	}
	return rowCells, colCells, boxCells
}

// firstUserBlocker scans cells in order for the first one holding digit. It
// returns that cell's index and true when the cell is a user entry (present in
// originalUserBoard) and not a given. It returns false on the first non-user
// match or when no cell holds digit, mirroring the per-region break semantics
// of the original inline scan: once a digit is found in a region, no other
// cell in that region is considered even if it is not a user entry.
func firstUserBlocker(cells []int, board *human.Board, digit int, originalUserBoard, givens []int) (int, bool) {
	for _, idx := range cells {
		if board.Cells[idx] != digit {
			continue
		}
		if originalUserBoard[idx] != 0 && givens[idx] == 0 {
			return idx, true
		}
		return -1, false
	}
	return -1, false
}

// findBlockingUserCell analyzes a contradiction and identifies which
// user-entered cell is causing it.
//
// For each digit 1-9 it asks what is blocking it from contradictionCell, in
// turn scanning the cell's row, column, and box. Only user-entered cells (not
// givens, not solver placements) are considered. The user cell blocking the
// most candidates is reported as most likely wrong.
//
// Returns: Cell index and blocking digit, or (-1, 0) if no user error found.
func findBlockingUserCell(board *human.Board, contradictionCell int, originalUserBoard []int, givens []int) (int, int) {
	row, col := contradictionCell/constants.GridSize, contradictionCell%constants.GridSize
	rowCells, colCells, boxCells := peerCellIndices(row, col)

	type blockingCell struct {
		idx   int
		digit int
	}
	var userBlockers []blockingCell

	for digit := 1; digit <= constants.GridSize; digit++ {
		for _, region := range [][]int{rowCells, colCells, boxCells} {
			if idx, ok := firstUserBlocker(region, board, digit, originalUserBoard, givens); ok {
				userBlockers = append(userBlockers, blockingCell{idx, digit})
			}
		}
	}

	if len(userBlockers) == 0 {
		return -1, 0
	}

	// Count how many times each user cell appears as a blocker; the cell
	// blocking the most candidates is most likely wrong.
	cellCount := make(map[int]int)
	cellDigit := make(map[int]int)
	for _, b := range userBlockers {
		cellCount[b.idx]++
		cellDigit[b.idx] = b.digit
	}

	maxCount := 0
	maxCell := -1
	for idx := 0; idx < constants.TotalCells; idx++ {
		if cellCount[idx] > maxCount {
			maxCount = cellCount[idx]
			maxCell = idx
		}
	}

	if maxCell >= 0 {
		return maxCell, cellDigit[maxCell]
	}
	return -1, 0
}

// findErrorByCandidateRefill uses the "clear and recalculate" strategy to find
// user errors: rebuild candidates from the current board, then for any cell
// that ends up with zero candidates, scan its peers for a user-entered cell
// blocking some digit. The first such blocker is returned.
//
// Returns: (badCell, badDigit, zeroCandidateCell) or (-1, 0, -1) if no error found.
func findErrorByCandidateRefill(originalUserBoard []int, givens []int) (int, int, int) {
	freshBoard := human.NewBoard(originalUserBoard)

	for idx := 0; idx < constants.TotalCells; idx++ {
		if originalUserBoard[idx] != 0 {
			continue
		}
		if !freshBoard.Candidates[idx].IsEmpty() {
			continue
		}

		// Cell has no candidates: scan its peers for the first user-entered
		// cell blocking some digit. Scan order is row, column, box (left to
		// right, top to bottom) with digit as the outer loop, so the first
		// match is deterministic.
		row, col := idx/constants.GridSize, idx%constants.GridSize
		rowCells, colCells, boxCells := peerCellIndices(row, col)
		for digit := 1; digit <= constants.GridSize; digit++ {
			for _, region := range [][]int{rowCells, colCells, boxCells} {
				for _, cellIdx := range region {
					if originalUserBoard[cellIdx] == digit && givens[cellIdx] == 0 {
						return cellIdx, digit, idx
					}
				}
			}
		}
	}

	return -1, 0, -1
}

// countUserEntries counts how many cells contain user-entered digits (excluding original givens)
//
// Parameters:
//
//	board: Current board state (81 cells)
//	givens: Original puzzle clues (distinguishes user entries from given digits)
//
// Returns: Number of non-zero cells that are not original givens
func countUserEntries(board []int, givens []int) int {
	count := 0
	for i := 0; i < constants.TotalCells; i++ {
		if board[i] != 0 && givens[i] == 0 {
			count++
		}
	}
	return count
}

// moveResult is a single move snapshot returned in a solveAll response. It is
// the JSON shape the frontend consumes per step.
type moveResult struct {
	Board      []int       `json:"board"`
	Candidates [][]int     `json:"candidates"`
	Move       interface{} `json:"move"`
}

func appendStalledMove(moves []moveResult, board *human.Board, originalUserBoard, givens []int) []moveResult {
	userEntryCount := countUserEntries(originalUserBoard, givens)
	if userEntryCount == 0 {
		return moves
	}
	return append(moves, moveResult{
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

func appendErrorLimitMove(moves []moveResult, board *human.Board, originalUserBoard, givens []int) []moveResult {
	userEntryCount := countUserEntries(originalUserBoard, givens)
	return append(moves, moveResult{
		Board:      board.GetCells(),
		Candidates: board.GetCandidates(),
		Move: map[string]interface{}{
			"technique":      "error",
			"action":         "error",
			"explanation":    "Too many incorrect entries to fix automatically.",
			"userEntryCount": userEntryCount,
		},
	})
}

func appendDiagnosticMove(moves []moveResult, board *human.Board) []moveResult {
	return append(moves, moveResult{
		Board:      board.GetCells(),
		Candidates: board.GetCandidates(),
		Move: map[string]interface{}{
			"technique":   "diagnostic",
			"action":      "diagnostic",
			"explanation": "Taking another look at the candidates...",
		},
	})
}

func appendUnpinpointableMove(moves []moveResult, board *human.Board, originalUserBoard, givens []int) []moveResult {
	userEntryCount := countUserEntries(originalUserBoard, givens)
	return append(moves, moveResult{
		Board:      board.GetCells(),
		Candidates: board.GetCandidates(),
		Move: map[string]interface{}{
			"technique":      "unpinpointable-error",
			"action":         "unpinpointable-error",
			"explanation":    fmt.Sprintf("Hmm, I couldn't pinpoint the error. One of your %d entries might need checking.", userEntryCount),
			"userEntryCount": userEntryCount,
		},
	})
}

// appendFixErrorMove records a "fix-error" move after a bad user cell has been
// cleared from the board. secondaryRow/secondaryCol is the contradiction target
// or zero-candidate cell highlighted alongside the fix.
func appendFixErrorMove(moves []moveResult, board *human.Board, badCell, badDigit, secondaryRow, secondaryCol int) []moveResult {
	badRow, badCol := badCell/constants.GridSize, badCell%constants.GridSize
	return append(moves, moveResult{
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
				"secondary": []map[string]int{{"row": secondaryRow, "col": secondaryCol}},
			},
		},
	})
}

// handleAutosolveContradiction attempts to diagnose and repair a contradiction
// reached during the autosolve loop. It returns the updated moves slice,
// board, and fix count, plus a done flag: true when the caller must stop the
// loop (error budget exhausted, or the error could not be pinpointed), false
// when a fix was applied and the loop should continue.
func handleAutosolveContradiction(moves []moveResult, board *human.Board, move *core.Move, originalUserBoard, givens []int, fixCount, maxFixes int) ([]moveResult, *human.Board, int, bool) {
	if fixCount >= maxFixes {
		moves = appendErrorLimitMove(moves, board, originalUserBoard, givens)
		return moves, board, fixCount, true
	}

	if len(move.Targets) > 0 {
		contradictionCell := move.Targets[0].Row*constants.GridSize + move.Targets[0].Col
		badCell, badDigit := findBlockingUserCell(board, contradictionCell, originalUserBoard, givens)
		if badCell >= 0 {
			fixCount++
			originalUserBoard[badCell] = 0
			// Reset the board to the corrected user state so any solver-placed
			// cells that depended on the bad entry are dropped. Nil candidates
			// forces a from-scratch rebuild.
			board = human.NewBoardWithCandidates(originalUserBoard, nil)
			board.InitCandidates()
			moves = appendFixErrorMove(moves, board, badCell, badDigit, move.Targets[0].Row, move.Targets[0].Col)
			return moves, board, fixCount, false
		}
	}

	// Direct analysis failed; try the candidate-refill diagnostic. This clears
	// notes, refills candidates, and looks for a zero-candidate cell.
	moves = appendDiagnosticMove(moves, board)
	badCell, badDigit, zeroCandCell := findErrorByCandidateRefill(originalUserBoard, givens)
	if badCell >= 0 {
		fixCount++
		originalUserBoard[badCell] = 0
		// Clear only the bad cell and let the solver continue from current state.
		board.ClearCell(badCell)
		zeroRow, zeroCol := zeroCandCell/constants.GridSize, zeroCandCell%constants.GridSize
		moves = appendFixErrorMove(moves, board, badCell, badDigit, zeroRow, zeroCol)
		return moves, board, fixCount, false
	}

	moves = appendUnpinpointableMove(moves, board, originalUserBoard, givens)
	return moves, board, fixCount, true
}

// runAutosolveLoop drives the human solver for up to maxMoves steps, applying
// normal moves and routing contradictions through handleAutosolveContradiction.
// It returns the accumulated move snapshots and the final board. fixCount is
// the number of user-error fixes already applied before the loop starts (1 when
// continuing from an already-applied conflict fix, 0 otherwise).
func runAutosolveLoop(solver *human.Solver, board *human.Board, originalUserBoard, givens []int, moves []moveResult, fixCount int) ([]moveResult, *human.Board) {
	const maxMoves = 2000
	const maxFixes = 5
	for i := 0; i < maxMoves; i++ {
		if board.IsSolved() {
			break
		}
		move := solver.FindNextMove(board)
		if move == nil {
			moves = appendStalledMove(moves, board, originalUserBoard, givens)
			break
		}
		if move.Action != "contradiction" {
			solver.ApplyMove(board, move)
			moves = append(moves, moveResult{
				Board: board.GetCells(), Candidates: board.GetCandidates(), Move: move,
			})
			continue
		}
		var done bool
		moves, board, fixCount, done = handleAutosolveContradiction(
			moves, board, move, originalUserBoard, givens, fixCount, maxFixes)
		if done {
			break
		}
	}
	return moves, board
}

// serveSolveAllFromConflictFix tries each direct conflict on req.Board for a
// user-fixable one. On the first fixable conflict it records the fix as the
// opening move, then continues the autosolve loop from the corrected board and
// writes the solveAll response. Returns true when a response was written;
// false when no conflict was fixable (caller falls through to the no-conflict
// solve path).
func serveSolveAllFromConflictFix(c *gin.Context, req SolveAllRequest, givens []int, conflicts []dp.Conflict) bool {
	for _, conflict := range conflicts {
		move, fixedBoard, fixedCandidates, ok := buildConflictFix(req.Board, req.Candidates, givens, conflict)
		if !ok {
			continue
		}

		newBoard := human.NewBoardWithCandidates(fixedBoard, fixedCandidates)
		moves := []moveResult{{
			Board:      newBoard.GetCells(),
			Candidates: newBoard.GetCandidates(),
			Move:       move,
		}}

		originalUserBoard := make([]int, len(req.Board))
		copy(originalUserBoard, fixedBoard)

		board := human.NewBoardWithCandidates(originalUserBoard, nil)
		board.InitCandidates()
		solver := human.NewSolver()

		// fixCount starts at 1: the conflict fix above already corrected one cell.
		moves, board = runAutosolveLoop(solver, board, originalUserBoard, givens, moves, 1)

		c.JSON(http.StatusOK, gin.H{
			"moves":      moves,
			"solved":     board.IsSolved(),
			"finalBoard": board.GetCells(),
		})
		return true
	}
	return false
}

// solveAllHandler automatically solves a puzzle with error detection and
// correction. It runs the human solver in a loop until the puzzle is solved,
// the solver stalls, a contradiction is detected and fixed, or the per-run fix
// budget is exhausted. When the input board contains direct conflicts, the
// first user-fixable conflict is corrected and solving continues from the
// corrected board.
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

	if !requireBoardLength(c, req.Board) {
		return
	}
	if !requireBoardValues(c, req.Board) {
		return
	}

	givens := resolveGivens(session, req.Givens)

	// STEP 1: direct conflicts get fixed first, then solving continues from
	// the corrected board. Falls through when no conflict is user-fixable.
	conflicts := dp.FindConflicts(req.Board)
	if len(conflicts) > 0 && serveSolveAllFromConflictFix(c, req, givens, conflicts) {
		return
	}

	// STEP 2: no direct conflicts - run the autosolve loop on the request board.
	var board *human.Board
	if len(req.Candidates) == 0 {
		board = human.NewBoard(req.Board)
	} else {
		board = human.NewBoardWithCandidates(req.Board, req.Candidates)
	}

	originalUserBoard := make([]int, len(req.Board))
	copy(originalUserBoard, req.Board)

	solver := human.NewSolver()
	moves, board := runAutosolveLoop(solver, board, originalUserBoard, givens, nil, 0)

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

	if !requireBoardLength(c, req.Board) {
		return
	}
	if !requireBoardValues(c, req.Board) {
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

	if !requireBoardLength(c, req.Board) {
		return
	}
	if !requireBoardValues(c, req.Board) {
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
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("givens must have %d cells", constants.TotalCells)})
		return
	}
	if !requireBoardValues(c, req.Givens) {
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
