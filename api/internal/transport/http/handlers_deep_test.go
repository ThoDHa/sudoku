package http

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"

	"github.com/gin-gonic/gin"
)

func postSolveNext(t *testing.T, router *gin.Engine, body map[string]interface{}) (int, map[string]interface{}) {
	t.Helper()
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return w.Code, resp
}

// TestSolveNextReturnsNullMoveWhenBoardIsAlreadySolved covers the stall path:
// a complete, valid board has no conflict and no remaining move, so the
// handler must respond with move: nil.
func TestSolveNextReturnsNullMoveWhenBoardIsAlreadySolved(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solvedGrid := dp.GenerateFullGrid(12345)
	body := map[string]interface{}{
		"token":  token,
		"board":  solvedGrid,
		"givens": solvedGrid,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected status 200 for solved board, got %d. body: %s", code, resp)
	}
	if move, ok := resp["move"]; !ok || move != nil {
		t.Fatalf("expected move to be absent/null for a solved board, got: %v", resp["move"])
	}
}

// TestSolveNextPinpointsUserErrorOnContradiction covers the contradiction ->
// fix-error path. An empty cell whose row/column jointly contain all nine
// digits (a user-entered error with no direct duplicate conflict) makes the
// solver flag a contradiction; the handler must pinpoint the blocking user
// entry and return a fix-error move that clears it.
func TestSolveNextPinpointsUserErrorOnContradiction(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	// Fill row 0 (cells 1..8) with digits 1..8 and cell 9 (R2C1, same column
	// as cell 0) with digit 9. Cell 0 then sees all nine digits with no direct
	// duplicate conflict, so it becomes a zero-candidate contradiction.
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	// All filled cells are user entries (no givens), so findBlockingUserCell
	// can attribute the contradiction to a user-entered cell.
	givens := make([]int, 81)

	body := map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. body: %s", code, resp)
	}

	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a move in the contradiction response, got: %v", resp)
	}
	if technique, _ := move["technique"].(string); technique != "fix-error" {
		t.Errorf("expected technique 'fix-error', got %q", technique)
	}
	if action, _ := move["action"].(string); action != "fix-error" {
		t.Errorf("expected action 'fix-error', got %q", action)
	}
	explanation, _ := move["explanation"].(string)
	if !strings.Contains(explanation, "Contradiction") {
		t.Errorf("expected explanation to mention 'Contradiction', got: %s", explanation)
	}
	if !strings.Contains(explanation, "R1C1") {
		t.Errorf("expected explanation to mention R1C1 (contradiction at cell 0), got: %s", explanation)
	}

	if digit, _ := move["digit"].(float64); digit < 1 || digit > 9 {
		t.Errorf("expected digit 1-9 (the wrong entry's value), got %v", digit)
	}

	fixedBoard, _ := resp["board"].([]interface{})
	if filledFromIface(fixedBoard) >= filledFromInt(board) {
		t.Errorf("expected the fix-error move to clear a cell; input filled=%d, output filled=%d",
			filledFromInt(board), filledFromIface(fixedBoard))
	}

	clearedIdx := -1
	for i := 0; i < 81; i++ {
		if board[i] != 0 {
			if v, _ := fixedBoard[i].(float64); int(v) == 0 {
				clearedIdx = i
				break
			}
		}
	}
	if clearedIdx < 0 {
		t.Fatal("no cell was cleared in the fix-error response")
	}
	moveDigit, _ := move["digit"].(float64)
	if int(moveDigit) != board[clearedIdx] {
		t.Errorf("move digit %v doesn't match cleared cell %d value %d", moveDigit, clearedIdx, board[clearedIdx])
	}
	clearedRow := clearedIdx / 9
	clearedCol := clearedIdx % 9
	expectedRef := fmt.Sprintf("R%dC%d", clearedRow+1, clearedCol+1)
	if !strings.Contains(explanation, expectedRef) {
		t.Errorf("explanation should mention %s (cleared cell), got: %s", expectedRef, explanation)
	}
}

// TestSolveNextReportsUnpinpointableWhenErrorIsAllGivens covers the
// unpinpointable-error path: when the contradiction is caused entirely by
// given clues (no user-entered blocker), neither pinpointing strategy can
// attribute it to a user cell, so the handler must respond with an
// unpinpointable-error move.
func TestSolveNextReportsUnpinpointableWhenErrorIsAllGivens(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	// Mark every filled cell as a given: the contradiction cannot be
	// attributed to any user entry.
	givens := make([]int, 81)
	copy(givens, board)

	body := map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. body: %s", code, resp)
	}

	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a move in the response, got: %v", resp)
	}
	if technique, _ := move["technique"].(string); technique != "unpinpointable-error" {
		t.Errorf("expected technique 'unpinpointable-error', got %q", technique)
	}
}

func filledFromInt(board []int) int {
	count := 0
	for _, v := range board {
		if v != 0 {
			count++
		}
	}
	return count
}

func filledFromIface(board []interface{}) int {
	count := 0
	for _, v := range board {
		if n, ok := v.(float64); ok && n != 0 {
			count++
		}
	}
	return count
}

// --- Behavioral tests pinning exact conflict response content ---
// TestMutation_FixConflict_ExactRowConflictResponse pins the exact cell positions,
// digit, and explanation text for a direct row conflict. This kills mutants on
// badCell/GridSize computation, badRow+1 display formatting, cell-selection logic,
// and conflict-type branching.
func TestMutation_FixConflict_ExactRowConflictResponse(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(42)
	conflictDigit := solved[0]
	board, givens := boardWithUserErrors(solved, map[int]int{4: conflictDigit})

	body := map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}

	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected move in response: %v", resp)
	}

	if technique, _ := move["technique"].(string); technique != "fix-conflict" {
		t.Fatalf("expected fix-conflict, got %q", technique)
	}

	if digit, _ := move["digit"].(float64); int(digit) != conflictDigit {
		t.Errorf("expected digit %d, got %v", conflictDigit, digit)
	}

	targets, _ := move["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target := targets[0].(map[string]interface{})
	if row, _ := target["row"].(float64); int(row) != 0 {
		t.Errorf("expected target row 0 (badCell=4: 4/9=0), got %v", row)
	}
	if col, _ := target["col"].(float64); int(col) != 4 {
		t.Errorf("expected target col 4 (badCell=4: 4%%9=4), got %v", col)
	}

	highlights, _ := move["highlights"].(map[string]interface{})
	primary, _ := highlights["primary"].([]interface{})
	if len(primary) > 0 {
		p := primary[0].(map[string]interface{})
		if row, _ := p["row"].(float64); int(row) != 0 {
			t.Errorf("expected primary row 0, got %v", row)
		}
		if col, _ := p["col"].(float64); int(col) != 4 {
			t.Errorf("expected primary col 4, got %v", col)
		}
	}
	secondary, _ := highlights["secondary"].([]interface{})
	if len(secondary) > 0 {
		s := secondary[0].(map[string]interface{})
		if row, _ := s["row"].(float64); int(row) != 0 {
			t.Errorf("expected secondary row 0 (otherCell=0), got %v", row)
		}
		if col, _ := s["col"].(float64); int(col) != 0 {
			t.Errorf("expected secondary col 0 (otherCell=0: 0%%9=0), got %v", col)
		}
	}

	explanation, _ := move["explanation"].(string)
	expectedBad := "R1C5"
	expectedOther := "R1C1"
	if !strings.Contains(explanation, expectedBad) {
		t.Errorf("expected explanation to contain %s (badRow+1=1, badCol+1=5), got: %s", expectedBad, explanation)
	}
	if !strings.Contains(explanation, expectedOther) {
		t.Errorf("expected explanation to contain %s (otherRow+1=1, otherCol+1=1), got: %s", expectedOther, explanation)
	}
	if !strings.Contains(explanation, "same row") {
		t.Errorf("expected explanation to mention 'same row' for row conflict, got: %s", explanation)
	}
}

// TestMutation_FixConflict_ExactColumnConflictResponse pins a column conflict
// to kill mutants on column-scan cell-index computation and column-type branching.
// Uses a sparse board (not a solved grid) so the ONLY conflict is in the column,
// not the row (rows are scanned first and would mask the column conflict).
func TestMutation_FixConflict_ExactColumnConflictResponse(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	board[0] = 5  // row 0, col 0 — given
	board[27] = 5 // row 3, col 0 — user entry, same column, different row and box
	givens := make([]int, 81)
	givens[0] = 5

	body := map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}

	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected move: %v", resp)
	}

	if technique, _ := move["technique"].(string); technique != "fix-conflict" {
		t.Fatalf("expected fix-conflict, got %q", technique)
	}

	targets, _ := move["targets"].([]interface{})
	if len(targets) == 0 {
		t.Fatal("expected targets")
	}
	target := targets[0].(map[string]interface{})
	if row, _ := target["row"].(float64); int(row) != 3 {
		t.Errorf("expected target row 3 (badCell=27: 27/9=3), got %v", row)
	}
	if col, _ := target["col"].(float64); int(col) != 0 {
		t.Errorf("expected target col 0 (badCell=27: 27%%9=0), got %v", col)
	}

	explanation, _ := move["explanation"].(string)
	if !strings.Contains(explanation, "R4C1") {
		t.Errorf("expected R4C1 (badRow+1=4, badCol+1=1), got: %s", explanation)
	}
	if !strings.Contains(explanation, "same column") {
		t.Errorf("expected 'same column' in explanation, got: %s", explanation)
	}
}

// TestMutation_FixConflict_ExactBoxConflictResponse pins a box conflict
// to kill mutants on box-scan cell-index computation and box-type branching.
// Cells 0 (R0C0) and 20 (R2C2) share box 0 but differ in both row and column,
// so no row or column conflict masks the box conflict.
func TestMutation_FixConflict_ExactBoxConflictResponse(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	board[0] = 7  // row 0, col 0 — given
	board[20] = 7 // row 2, col 2 — user entry, same box, different row and col
	givens := make([]int, 81)
	givens[0] = 7

	body := map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}

	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected move: %v", resp)
	}

	if technique, _ := move["technique"].(string); technique != "fix-conflict" {
		t.Fatalf("expected fix-conflict, got %q", technique)
	}

	targets, _ := move["targets"].([]interface{})
	if len(targets) == 0 {
		t.Fatal("expected targets")
	}
	target := targets[0].(map[string]interface{})
	if row, _ := target["row"].(float64); int(row) != 2 {
		t.Errorf("expected target row 2 (badCell=20: 20/9=2), got %v", row)
	}
	if col, _ := target["col"].(float64); int(col) != 2 {
		t.Errorf("expected target col 2 (badCell=20: 20%%9=2), got %v", col)
	}

	explanation, _ := move["explanation"].(string)
	if !strings.Contains(explanation, "R3C3") {
		t.Errorf("expected R3C3 (badRow+1=3, badCol+1=3), got: %s", explanation)
	}
	if !strings.Contains(explanation, "same box") {
		t.Errorf("expected 'same box' in explanation, got: %s", explanation)
	}
}

// TestMutation_BoardValidation_RejectsOutOfRangeValues pins the exact HTTP
// status codes for invalid cell values to kill branch/if mutants on validation paths.
func TestMutation_BoardValidation_RejectsOutOfRangeValues(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	board[0] = 10
	givens := make([]int, 81)

	body := map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusBadRequest {
		t.Errorf("expected 400 for out-of-range value, got %d: %v", code, resp)
	}

	errMsg, _ := resp["error"].(string)
	if !strings.Contains(strings.ToLower(errMsg), "range") && !strings.Contains(strings.ToLower(errMsg), "valid") {
		t.Errorf("expected error about range/validation, got: %s", errMsg)
	}
}

// TestMutation_SolveAll_RespectsMaxFixesCap pins the exact maximum number of
// fix moves in solve/all, killing numbers/incrementer+decrementer on the cap.
func TestMutation_SolveAll_RespectsMaxFixesCap(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(99)
	board, givens := boardWithUserErrors(solved, map[int]int{
		1: solved[5],
		2: solved[6],
		3: solved[7],
	})

	body := map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	}

	code, resp := postSolveAll(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}

	techniques := solveAllTechniques(resp)
	fixCount := 0
	for _, tech := range techniques {
		if tech == "fix-conflict" || tech == "fix-error" {
			fixCount++
		}
	}
	if fixCount > maxMovesCap {
		t.Errorf("fix moves %d exceeded cap %d", fixCount, maxMovesCap)
	}
}

// TestMutation_PuzzleHandler_RejectsInvalidDifficulty pins the 400 status code
// for an unsupported difficulty, killing branch/if mutants that remove the return.
func TestMutation_PuzzleHandler_RejectsInvalidDifficulty(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/123?d=bogus", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid difficulty, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if _, ok := resp["error"]; !ok {
		t.Errorf("expected error field in response, got: %s", w.Body.String())
	}
}

// TestMutation_PuzzleHandler_AcceptsAllDifficulties pins that each valid
// difficulty produces a 200 with a givens_count field, killing branch/if
// mutants on the validation path.
func TestMutation_PuzzleHandler_AcceptsAllDifficulties(t *testing.T) {
	router := setupRouter()
	for _, d := range []string{"easy", "medium", "hard", "extreme", "impossible"} {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/puzzle/testseed?d="+d, nil)
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("difficulty %q: expected 200, got %d. body: %s", d, w.Code, w.Body.String())
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		givens, ok := resp["givens"].([]interface{})
		if !ok {
			t.Errorf("difficulty %q: missing givens array. body: %s", d, w.Body.String())
			continue
		}
		nonZero := 0
		for _, v := range givens {
			if n, ok := v.(float64); ok && n != 0 {
				nonZero++
			}
		}
		if nonZero == 0 || nonZero > 81 {
			t.Errorf("difficulty %q: givens count %d is invalid", d, nonZero)
		}
	}
}

// TestMutation_DailyHandler_ReturnsDeterministicFields pins the exact response
// structure for the daily endpoint, killing branch/if and statement/remove mutants
// on the daily handler path.
func TestMutation_DailyHandler_ReturnsDeterministicFields(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/daily", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	for _, field := range []string{"date_utc", "seed", "puzzle_index"} {
		if _, ok := resp[field]; !ok {
			t.Errorf("missing %q in daily response: %v", field, resp)
		}
	}
}

func TestMutation_ValidateBoard_DetectsConflicts(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	board[0] = 5
	board[3] = 5

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}

	code, resp := postJSON(t, router, "/api/validate", body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	if valid, _ := resp["valid"].(bool); valid {
		t.Error("expected valid=false for conflicting board")
	}
	if reason, _ := resp["reason"].(string); reason != "conflicts" {
		t.Errorf("expected reason 'conflicts', got %q", reason)
	}
	conflictCells, _ := resp["conflictCells"].([]interface{})
	cellSet := make(map[int]bool)
	for _, c := range conflictCells {
		if n, ok := c.(float64); ok {
			cellSet[int(n)] = true
		}
	}
	if !cellSet[0] || !cellSet[3] {
		t.Errorf("expected conflictCells to contain 0 and 3, got %v", cellSet)
	}
}

func TestMutation_ValidateBoard_AcceptsSolvedBoard(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(42)

	body := map[string]interface{}{
		"token": token,
		"board": solved,
	}

	code, resp := postJSON(t, router, "/api/validate", body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	if valid, _ := resp["valid"].(bool); !valid {
		t.Error("expected valid=true for solved board")
	}
}

func TestMutation_SolveNext_NormalMove_ExactResponse(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	givens := make([]int, 81)
	givens[1] = 1
	givens[2] = 2
	givens[3] = 3
	givens[4] = 4
	givens[9] = 6
	givens[10] = 9
	givens[18] = 7
	givens[27] = 8

	board := human.NewBoard(givens)
	if board.Candidates[0].Count() != 1 || !board.Candidates[0].Has(5) {
		t.Fatalf("setup: cell 0 should be naked single (5 only), got %v", board.Candidates[0].ToSlice())
	}
	candidates := board.GetCandidates()

	body := map[string]interface{}{
		"token":      token,
		"board":      givens,
		"givens":     givens,
		"candidates": candidates,
	}

	code, resp := postSolveNext(t, router, body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}

	move, ok := resp["move"].(map[string]interface{})
	if move == nil || !ok {
		t.Fatal("expected a move, got nil")
	}

	if technique, _ := move["technique"].(string); technique != "naked-single" {
		t.Fatalf("expected naked-single (cell 0 can only be 5), got %q", technique)
	}
	if digit, _ := move["digit"].(float64); int(digit) != 5 {
		t.Errorf("expected digit 5, got %v", digit)
	}
	targets, _ := move["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target := targets[0].(map[string]interface{})
	if row, _ := target["row"].(float64); int(row) != 0 {
		t.Errorf("expected target row 0, got %v", row)
	}
	if col, _ := target["col"].(float64); int(col) != 0 {
		t.Errorf("expected target col 0, got %v", col)
	}
	if action, _ := move["action"].(string); action != "assign" {
		t.Errorf("expected action 'assign', got %q", action)
	}
}

func TestMutation_SessionStart_ExactResponse(t *testing.T) {
	router := setupRouter()

	body := map[string]interface{}{
		"device_id":  "test-device",
		"seed":       "test-seed",
		"difficulty": "medium",
	}
	code, resp := postJSON(t, router, "/api/session/start", body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}

	token, ok := resp["token"].(string)
	if !ok || token == "" {
		t.Error("expected non-empty token")
	}

	puzzleID, ok := resp["puzzle_id"].(string)
	if !ok || puzzleID == "" {
		t.Error("expected non-empty puzzle_id")
	}
	if !strings.Contains(puzzleID, "test-seed") {
		t.Errorf("puzzle_id should contain the seed, got: %s", puzzleID)
	}
	if !strings.Contains(puzzleID, "medium") {
		t.Errorf("puzzle_id should contain the difficulty, got: %s", puzzleID)
	}

	startedAt, ok := resp["started_at"].(string)
	if !ok || startedAt == "" {
		t.Error("expected non-empty started_at timestamp")
	}
}

func TestMutation_SessionStart_RejectsInvalidDifficulty(t *testing.T) {
	router := setupRouter()

	body := map[string]interface{}{
		"device_id":  "test-device",
		"seed":       "test-seed",
		"difficulty": "bogus",
	}
	code, resp := postJSON(t, router, "/api/session/start", body)
	if code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid difficulty, got %d", code)
	}
	if _, ok := resp["error"]; !ok {
		t.Error("expected error field in response")
	}
}

func TestMutation_PuzzleAnalyze_ExactResponse(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/testseed/analyze?d=easy", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	for _, field := range []string{"seed", "difficulty", "givens_count", "required_difficulty", "status", "techniques"} {
		if _, ok := resp[field]; !ok {
			t.Errorf("missing %q in analyze response. body: %s", field, w.Body.String())
		}
	}

	status, _ := resp["status"].(string)
	if status != "completed" && status != "stalled" && status != "max-steps" {
		t.Errorf("expected valid status, got %q", status)
	}
}

func TestMutation_PuzzleAnalyze_RejectsInvalidDifficulty(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/testseed/analyze?d=bogus", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestMutation_SolveFull_FastMode_ExactSolution(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(42)
	partial := make([]int, 81)
	copy(partial, solved)
	partial[0] = 0
	partial[40] = 0

	body := map[string]interface{}{
		"token": token,
		"board": partial,
	}

	code, resp := postJSON(t, router, "/api/solve/full?mode=fast", body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}

	finalBoard, _ := resp["final_board"].([]interface{})
	if len(finalBoard) != 81 {
		t.Fatalf("expected 81 cells, got %d", len(finalBoard))
	}
	for i, v := range finalBoard {
		if n, _ := v.(float64); int(n) != solved[i] {
			t.Errorf("cell %d: expected %d, got %v", i, solved[i], v)
			break
		}
	}
}

func TestMutation_SolveFull_RejectsOutOfRangeValues(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	board[0] = 42

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}

	code, _ := postJSON(t, router, "/api/solve/full", body)
	if code != http.StatusBadRequest {
		t.Errorf("expected 400 for cell value 42, got %d", code)
	}
}

func TestMutation_CustomValidate_ValidUniquePuzzle(t *testing.T) {
	router := setupRouter()

	solved := dp.GenerateFullGrid(42)
	givens := make([]int, 81)
	copy(givens, solved)
	givens[0] = 0
	givens[40] = 0

	body := map[string]interface{}{
		"givens":    givens,
		"device_id": "test",
	}

	code, resp := postJSON(t, router, "/api/custom/validate", body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	if valid, _ := resp["valid"].(bool); !valid {
		t.Error("expected valid=true for unique solvable puzzle")
	}
	if unique, _ := resp["unique"].(bool); !unique {
		t.Error("expected unique=true for puzzle with single solution")
	}
	puzzleID, _ := resp["puzzle_id"].(string)
	if !strings.HasPrefix(puzzleID, "custom-") {
		t.Errorf("puzzle_id should start with 'custom-', got: %s", puzzleID)
	}
}

func TestMutation_CustomValidate_RejectsTooFewGivens(t *testing.T) {
	router := setupRouter()

	givens := make([]int, 81)
	givens[0] = 5

	body := map[string]interface{}{
		"givens":    givens,
		"device_id": "test",
	}

	code, resp := postJSON(t, router, "/api/custom/validate", body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if valid, _ := resp["valid"].(bool); valid {
		t.Error("expected valid=false for puzzle with too few givens")
	}
}

func TestMutation_CustomValidate_RejectsConflicts(t *testing.T) {
	router := setupRouter()

	solved := dp.GenerateFullGrid(42)
	givens := make([]int, 81)
	copy(givens, solved)
	givens[1] = solved[0]

	body := map[string]interface{}{
		"givens":    givens,
		"device_id": "test",
	}

	code, resp := postJSON(t, router, "/api/custom/validate", body)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if valid, _ := resp["valid"].(bool); valid {
		t.Error("expected valid=false for conflicting puzzle")
	}
	reason, _ := resp["reason"].(string)
	if !strings.Contains(reason, "conflict") {
		t.Errorf("reason should mention conflict, got: %s", reason)
	}
}

func TestMutation_HealthHandler_ExactStatusAndVersion(t *testing.T) {
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/health", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "ok" {
		t.Errorf("expected status 'ok', got %v", resp["status"])
	}
	if resp["version"] != constants.APIVersion {
		t.Errorf("expected version %q, got %v", constants.APIVersion, resp["version"])
	}
}

func TestMutation_VersionHandler_ExactVersions(t *testing.T) {
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/version", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["api_version"] != constants.APIVersion {
		t.Errorf("api_version: expected %q, got %v", constants.APIVersion, resp["api_version"])
	}
	if resp["solver_version"] != constants.SolverVersion {
		t.Errorf("solver_version: expected %q, got %v", constants.SolverVersion, resp["solver_version"])
	}
}

func TestMutation_DailyHandler_SeedIsPrefixPlusDate(t *testing.T) {
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/daily", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	dateUTC, _ := resp["date_utc"].(string)
	expectedSeed := constants.DailyPuzzlePrefix + dateUTC
	if resp["seed"] != expectedSeed {
		t.Errorf("seed: expected %q (DailyPuzzlePrefix+date), got %v", expectedSeed, resp["seed"])
	}
	idx, ok := resp["puzzle_index"].(float64)
	if !ok {
		t.Fatalf("puzzle_index missing or non-numeric: %v", resp["puzzle_index"])
	}
	count := puzzles.Global().Count()
	if int(idx) < 0 || int(idx) >= count {
		t.Errorf("puzzle_index %v out of valid range [0,%d)", idx, count)
	}
}

func TestMutation_PuzzleHandler_EchoesSeedDifficultyAndLoaderIndex(t *testing.T) {
	router := setupRouter()
	seed := "echo-test-seed"
	diff := "hard"
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/"+seed+"?d="+diff, nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. body: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["seed"] != seed {
		t.Errorf("seed: expected %q, got %v", seed, resp["seed"])
	}
	if resp["difficulty"] != diff {
		t.Errorf("difficulty: expected %q, got %v", diff, resp["difficulty"])
	}
	expectedID := seed + constants.PuzzleIDDl + diff
	if resp["puzzle_id"] != expectedID {
		t.Errorf("puzzle_id: expected %q, got %v", expectedID, resp["puzzle_id"])
	}
	loader := puzzles.Global()
	expGivens, _, expIdx, err := loader.GetPuzzleBySeed(seed, diff)
	if err != nil {
		t.Fatalf("loader error: %v", err)
	}
	if int(resp["puzzle_index"].(float64)) != expIdx {
		t.Errorf("puzzle_index: expected %d, got %v", expIdx, resp["puzzle_index"])
	}
	gotGivens := ifaceToIntBoard(resp["givens"])
	if len(gotGivens) != 81 {
		t.Fatalf("givens length: expected 81, got %d", len(gotGivens))
	}
	for i, v := range gotGivens {
		if v != expGivens[i] {
			t.Errorf("givens[%d]: expected %d, got %d", i, expGivens[i], v)
			break
		}
	}
}

func TestMutation_PuzzleHandler_DefaultsDifficultyToMedium(t *testing.T) {
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/something", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["difficulty"] != "medium" {
		t.Errorf("expected default difficulty 'medium', got %v", resp["difficulty"])
	}
}

func TestMutation_InvalidDifficulty_ExactErrorMessage(t *testing.T) {
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/seed?d=bogus", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	errMsg, _ := resp["error"].(string)
	expected := "invalid difficulty 'bogus'. Must be one of: easy, medium, hard, extreme, impossible"
	if errMsg != expected {
		t.Errorf("error: expected %q, got %q", expected, errMsg)
	}
}

func TestMutation_SessionStart_InvalidDifficulty_ExactMessage(t *testing.T) {
	router := setupRouter()
	code, resp := postJSON(t, router, "/api/session/start", map[string]interface{}{
		"device_id": "d", "seed": "s", "difficulty": "nope",
	})
	if code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %v", code, resp)
	}
	errMsg, _ := resp["error"].(string)
	expected := "invalid difficulty 'nope'. Must be one of: easy, medium, hard, extreme, impossible"
	if errMsg != expected {
		t.Errorf("error: expected %q, got %q", expected, errMsg)
	}
}

func TestMutation_RequireBoardLength_ExactMessage(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	code, resp := postJSON(t, router, "/api/solve/next", map[string]interface{}{
		"token": token, "board": []int{1, 2, 3},
	})
	if code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %v", code, resp)
	}
	if errMsg, _ := resp["error"].(string); errMsg != "board must have 81 cells" {
		t.Errorf("error: expected 'board must have 81 cells', got %q", errMsg)
	}
}

func TestMutation_RequireBoardValues_ExactOutOfRangeMessage(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	over := make([]int, 81)
	over[0] = 10
	code, resp := postJSON(t, router, "/api/solve/next", map[string]interface{}{
		"token": token, "board": over,
	})
	if code != http.StatusBadRequest {
		t.Fatalf("over-range: expected 400, got %d: %v", code, resp)
	}
	if errMsg, _ := resp["error"].(string); errMsg != "board cell value 10 is out of range; each cell must be 0-9" {
		t.Errorf("over-range error: got %q", errMsg)
	}

	neg := make([]int, 81)
	neg[5] = -3
	code, resp = postJSON(t, router, "/api/solve/next", map[string]interface{}{
		"token": token, "board": neg,
	})
	if code != http.StatusBadRequest {
		t.Fatalf("negative: expected 400, got %d: %v", code, resp)
	}
	if errMsg, _ := resp["error"].(string); errMsg != "board cell value -3 is out of range; each cell must be 0-9" {
		t.Errorf("negative error: got %q", errMsg)
	}
}

func TestMutation_SolveNext_InvalidToken_ExactErrorPrefix(t *testing.T) {
	router := setupRouter()
	board := make([]int, 81)
	board[0] = 5
	code, resp := postJSON(t, router, "/api/solve/next", map[string]interface{}{
		"token": "not-a-real-token", "board": board,
	})
	if code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", code)
	}
	errMsg, _ := resp["error"].(string)
	if !strings.HasPrefix(errMsg, "invalid token:") {
		t.Errorf("expected 'invalid token:' prefix, got %q", errMsg)
	}
}

func TestMutation_SolveNext_ContradictionFixError_ExactFields(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)

	code, resp := postSolveNext(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a move, got: %v", resp)
	}
	if move["technique"] != "fix-error" || move["action"] != "fix-error" {
		t.Fatalf("expected fix-error technique/action, got %v", move)
	}
	if digit, _ := move["digit"].(float64); int(digit) != 1 {
		t.Errorf("expected digit 1 (value at blocking cell 1), got %v", digit)
	}
	targets, _ := move["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]interface{})
	if int(target["row"].(float64)) != 0 || int(target["col"].(float64)) != 1 {
		t.Errorf("expected target (row=0,col=1) for badCell=1, got %v", target)
	}
	highlights, _ := move["highlights"].(map[string]interface{})
	secondary, _ := highlights["secondary"].([]interface{})
	if len(secondary) != 1 {
		t.Fatalf("expected 1 secondary highlight, got %d", len(secondary))
	}
	sec, _ := secondary[0].(map[string]interface{})
	if int(sec["row"].(float64)) != 0 || int(sec["col"].(float64)) != 0 {
		t.Errorf("expected secondary (0,0) contradiction cell, got %v", sec)
	}
	explanation, _ := move["explanation"].(string)
	expected := "Contradiction detected! R1C1 had no valid candidates. Removing incorrect 1 from R1C2."
	if explanation != expected {
		t.Errorf("explanation:\n want %q\n got  %q", expected, explanation)
	}
	boardOut := ifaceToIntBoard(resp["board"])
	if boardOut[1] != 0 {
		t.Errorf("expected board[1] cleared to 0, got %d", boardOut[1])
	}
	if boardOut[9] != 9 {
		t.Errorf("cell 9 should remain 9, got %d", boardOut[9])
	}
}

func TestMutation_SolveNext_NormalMove_AppliesDigitToBoard(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	givens := make([]int, 81)
	givens[1] = 1
	givens[2] = 2
	givens[3] = 3
	givens[4] = 4
	givens[9] = 6
	givens[10] = 9
	givens[18] = 7
	givens[27] = 8

	prepBoard := human.NewBoard(givens)
	candidates := prepBoard.GetCandidates()

	code, resp := postSolveNext(t, router, map[string]interface{}{
		"token": token, "board": givens, "givens": givens, "candidates": candidates,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	boardOut := ifaceToIntBoard(resp["board"])
	if boardOut[0] != 5 {
		t.Errorf("expected board[0]=5 after naked-single assign, got %d", boardOut[0])
	}
	for i := 1; i <= 4; i++ {
		if boardOut[i] != givens[i] {
			t.Errorf("board[%d] should be unchanged at %d, got %d", i, givens[i], boardOut[i])
			break
		}
	}
}

func TestMutation_SessionStart_ExactPuzzleIDAndRFC3339Timestamp(t *testing.T) {
	router := setupRouter()
	_, resp := postJSON(t, router, "/api/session/start", map[string]interface{}{
		"device_id": "dev", "seed": "myseed", "difficulty": "hard",
	})
	expected := "myseed" + constants.PuzzleIDDl + "hard"
	if resp["puzzle_id"] != expected {
		t.Errorf("puzzle_id: expected %q, got %v", expected, resp["puzzle_id"])
	}
	startedAt, _ := resp["started_at"].(string)
	if _, err := time.Parse(time.RFC3339, startedAt); err != nil {
		t.Errorf("started_at not RFC3339-parseable: %q (%v)", startedAt, err)
	}
}

func TestMutation_CustomValidate_TooFewGivensExactReason(t *testing.T) {
	router := setupRouter()
	few := make([]int, 81)
	few[0] = 5
	few[1] = 3
	code, resp := postJSON(t, router, "/api/custom/validate", map[string]interface{}{
		"givens": few, "device_id": "d",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	if resp["valid"] != false {
		t.Errorf("expected valid=false, got %v", resp["valid"])
	}
	if resp["reason"] != "need at least 17 givens" {
		t.Errorf("reason: expected 'need at least 17 givens', got %v", resp["reason"])
	}
}

func TestMutation_CustomValidate_WrongLengthExactMessage(t *testing.T) {
	router := setupRouter()
	code, resp := postJSON(t, router, "/api/custom/validate", map[string]interface{}{
		"givens": []int{1, 2, 3}, "device_id": "d",
	})
	if code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %v", code, resp)
	}
	if errMsg, _ := resp["error"].(string); errMsg != "givens must have 81 cells" {
		t.Errorf("error: expected 'givens must have 81 cells', got %q", errMsg)
	}
}

func TestMutation_CustomValidate_ConflictsExactReason(t *testing.T) {
	router := setupRouter()
	solved := dp.GenerateFullGrid(42)
	conflict := make([]int, 81)
	copy(conflict, solved)
	conflict[1] = solved[0]
	_, resp := postJSON(t, router, "/api/custom/validate", map[string]interface{}{
		"givens": conflict, "device_id": "d",
	})
	if resp["valid"] != false {
		t.Errorf("expected valid=false for conflicting puzzle, got %v", resp["valid"])
	}
	if resp["reason"] != "puzzle contains conflicts" {
		t.Errorf("reason: expected 'puzzle contains conflicts', got %v", resp["reason"])
	}
}

func TestMutation_CustomValidate_NoSolutionExactReason(t *testing.T) {
	router := setupRouter()
	solved := dp.GenerateFullGrid(314)
	board := make([]int, 81)
	// Core: row 0 holds 1..8 (cells 1..8) and cell 9 holds 9, making cell 0 a
	// zero-candidate cell (all nine digits blocked) with no direct conflict.
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	// coreColDigit is the value the core places in each column; any added given
	// in that column whose value equals it would create a direct column conflict.
	coreColDigit := func(c int) int {
		if c == 0 {
			return 9
		}
		return c
	}
	// Add givens in rows 3..8 (disjoint boxes/rows from the core) drawn from a
	// valid solution, skipping the one value per column that would collide.
	for r := 3; r <= 8; r++ {
		for c := 0; c <= 8; c++ {
			v := solved[r*9+c]
			if v == coreColDigit(c) {
				continue
			}
			board[r*9+c] = v
		}
	}
	if !dp.IsValid(context.Background(), board) {
		t.Fatalf("setup: board must be conflict-free to reach the solvability check, conflicts=%v", dp.FindConflicts(board))
	}
	if count, _ := dp.CountSolutions(context.Background(), board, 1); count != 0 {
		t.Fatalf("setup: board must have zero solutions to reach the no-solution branch")
	}
	code, resp := postJSON(t, router, "/api/custom/validate", map[string]interface{}{
		"givens": board, "device_id": "d",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	if resp["reason"] != "puzzle has no solution" {
		t.Errorf("reason: expected 'puzzle has no solution', got %v", resp["reason"])
	}
	if resp["valid"] != false {
		t.Errorf("expected valid=false, got %v", resp["valid"])
	}
}

func TestMutation_CustomValidate_MultipleSolutionsExactReason(t *testing.T) {
	router := setupRouter()
	solved := dp.GenerateFullGrid(2718)
	givens := make([]int, 81)
	keep := []int{0, 4, 8, 11, 15, 20, 24, 28, 33, 37, 41, 45, 50, 54, 60, 70, 80}
	for _, i := range keep {
		givens[i] = solved[i]
	}
	if !dp.IsValid(context.Background(), givens) {
		t.Fatalf("setup: givens must be conflict-free")
	}
	if n, _ := dp.CountSolutions(context.Background(), givens, 2); n < 2 {
		t.Skipf("setup: this 17-given board has %d solution(s); cannot exercise multiple-solutions branch", n)
	}
	code, resp := postJSON(t, router, "/api/custom/validate", map[string]interface{}{
		"givens": givens, "device_id": "d",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	if resp["reason"] != "puzzle has multiple solutions" {
		t.Errorf("reason: expected 'puzzle has multiple solutions', got %v", resp["reason"])
	}
	if resp["valid"] != true || resp["unique"] != false {
		t.Errorf("expected valid=true unique=false, got valid=%v unique=%v", resp["valid"], resp["unique"])
	}
}

func TestMutation_CustomValidate_UniquePuzzleIDIsCustomPrefixPlusHash(t *testing.T) {
	router := setupRouter()
	solved := dp.GenerateFullGrid(42)
	givens := make([]int, 81)
	copy(givens, solved)
	givens[0] = 0
	givens[40] = 0
	_, resp := postJSON(t, router, "/api/custom/validate", map[string]interface{}{
		"givens": givens, "device_id": "d",
	})
	puzzleID, _ := resp["puzzle_id"].(string)
	expected := "custom-" + hashSolution(givens)[:16]
	if puzzleID != expected {
		t.Errorf("puzzle_id: expected %q, got %q", expected, puzzleID)
	}
	if len(puzzleID) != len("custom-")+16 {
		t.Errorf("puzzle_id length: expected %d, got %d", len("custom-")+16, len(puzzleID))
	}
}

func TestMutation_ValidateBoard_ConflictExactMessageAndCells(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	conflictBoard := make([]int, 81)
	conflictBoard[0] = 5
	conflictBoard[3] = 5
	_, resp := postJSON(t, router, "/api/validate", map[string]interface{}{
		"token": token, "board": conflictBoard,
	})
	if resp["valid"] != false {
		t.Errorf("expected valid=false, got %v", resp["valid"])
	}
	if resp["reason"] != "conflicts" {
		t.Errorf("reason: expected 'conflicts', got %v", resp["reason"])
	}
	if resp["message"] != "There are conflicting numbers in the puzzle" {
		t.Errorf("message: got %v", resp["message"])
	}
	conflicts, ok := resp["conflicts"].([]interface{})
	if !ok || len(conflicts) == 0 {
		t.Fatalf("expected conflicts array, got %v", resp["conflicts"])
	}
	first, _ := conflicts[0].(map[string]interface{})
	for _, k := range []string{"type", "cell1", "cell2", "value"} {
		if first[k] == nil {
			t.Errorf("conflict entry missing %q: %v", k, first)
		}
	}
	cellSet := map[int]bool{}
	for _, c := range ifaceToIntBoard(resp["conflictCells"]) {
		cellSet[c] = true
	}
	if !cellSet[0] || !cellSet[3] {
		t.Errorf("conflictCells must contain 0 and 3, got %v", cellSet)
	}
}

func TestMutation_ValidateBoard_UnsolvableExactMessage(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	unsolvable := make([]int, 81)
	for d := 1; d <= 8; d++ {
		unsolvable[d] = d
	}
	unsolvable[9] = 9
	unsolvable[27] = 8
	unsolvable[28] = 9
	unsolvable[29] = 1
	unsolvable[30] = 2
	unsolvable[31] = 3
	unsolvable[32] = 4
	unsolvable[33] = 5
	unsolvable[34] = 6
	unsolvable[35] = 7
	_, resp := postJSON(t, router, "/api/validate", map[string]interface{}{
		"token": token, "board": unsolvable,
	})
	if resp["valid"] != false {
		t.Errorf("expected valid=false, got %v", resp["valid"])
	}
	if resp["reason"] != "unsolvable" {
		t.Errorf("reason: expected 'unsolvable', got %v", resp["reason"])
	}
	if resp["message"] != "The puzzle cannot be solved from this state - a digit you entered is incorrect" {
		t.Errorf("message: got %v", resp["message"])
	}
}

func TestMutation_ValidateBoard_ValidExactMessage(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	empty := make([]int, 81)
	_, resp := postJSON(t, router, "/api/validate", map[string]interface{}{
		"token": token, "board": empty,
	})
	if resp["valid"] != true {
		t.Errorf("expected valid=true for empty board, got %v", resp["valid"])
	}
	if resp["message"] != "All entries are correct so far!" {
		t.Errorf("message: got %v", resp["message"])
	}
}

func TestMutation_SolveFull_HumanModeExactFields(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	solved := dp.GenerateFullGrid(42)
	partial := make([]int, 81)
	copy(partial, solved)
	partial[0] = 0
	partial[40] = 0
	_, resp := postJSON(t, router, "/api/solve/full", map[string]interface{}{
		"token": token, "board": partial,
	})
	for _, field := range []string{"moves", "final_board", "stopped_reason"} {
		if _, ok := resp[field]; !ok {
			t.Errorf("missing %q in human-mode solve/full response: %v", field, resp)
		}
	}
	if reason, _ := resp["stopped_reason"].(string); reason == "" {
		t.Errorf("stopped_reason should be non-empty, got %q", reason)
	}
	finalBoard := ifaceToIntBoard(resp["final_board"])
	if len(finalBoard) != 81 {
		t.Fatalf("final_board: expected 81 cells, got %d", len(finalBoard))
	}
	for i, v := range finalBoard {
		if v == 0 {
			t.Errorf("final_board cell %d empty after full solve of a solvable board", i)
			break
		}
	}
	if len(dp.FindConflicts(finalBoard)) != 0 {
		t.Errorf("final_board should be conflict-free")
	}
}

func TestMutation_SolveFull_DefaultsToHumanMode(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	board[0] = 5
	_, resp := postJSON(t, router, "/api/solve/full", map[string]interface{}{
		"token": token, "board": board,
	})
	if _, ok := resp["stopped_reason"]; !ok {
		t.Errorf("default mode should be human (stopped_reason present), got: %v", resp)
	}
}

func TestMutation_SolveFull_FastModeUnsolvableExactError(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	unsolvable := make([]int, 81)
	for d := 1; d <= 8; d++ {
		unsolvable[d] = d
	}
	unsolvable[9] = 9
	unsolvable[27] = 8
	unsolvable[28] = 9
	unsolvable[29] = 1
	unsolvable[30] = 2
	unsolvable[31] = 3
	unsolvable[32] = 4
	unsolvable[33] = 5
	unsolvable[34] = 6
	unsolvable[35] = 7
	code, resp := postJSON(t, router, "/api/solve/full?mode=fast", map[string]interface{}{
		"token": token, "board": unsolvable,
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400 for unsolvable fast solve, got %d", code)
	}
	if resp["error"] != "no solution found" {
		t.Errorf("error: expected 'no solution found', got %v", resp["error"])
	}
}

func TestMutation_SolveAll_TopLevelKeysPresent(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	board[0] = 5
	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board,
	})
	for _, k := range []string{"moves", "solved", "finalBoard"} {
		if _, ok := resp[k]; !ok {
			t.Errorf("missing top-level key %q in solveAll response: %v", k, resp)
		}
	}
}

func TestMutation_SolveAll_ErrorMoveExactExplanation(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	solved := dp.GenerateFullGrid(1)
	corruptions := map[int]int{}
	for i := 0; i < 9; i++ {
		if solved[i] == 9 {
			corruptions[i] = 1
		} else {
			corruptions[i] = solved[i] + 1
		}
	}
	board, givens := boardWithUserErrors(solved, corruptions)
	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	errMove := solveAllMoveByTechnique(resp, "error")
	if errMove == nil {
		t.Fatalf("expected an error move, sequence=%v", solveAllTechniques(resp))
	}
	if expl, _ := errMove["explanation"].(string); expl != "Too many incorrect entries to fix automatically." {
		t.Errorf("error explanation: got %q", expl)
	}
	if _, ok := errMove["userEntryCount"]; !ok {
		t.Errorf("error move must carry userEntryCount, got %v", errMove)
	}
}

func TestMutation_SolveAll_DiagnosticAndUnpinpointableExact(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	solved := dp.GenerateFullGrid(555555)
	targets := []int{1, 12, 22, 32, 42, 52, 62, 72}
	corruptions := map[int]int{}
	for _, idx := range targets {
		wrong := solved[idx]%9 + 1
		if wrong == solved[idx] {
			wrong = solved[idx]%9 + 2
		}
		corruptions[idx] = wrong
	}
	board, givens := boardWithUserErrors(solved, corruptions)
	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	diag := solveAllMoveByTechnique(resp, "diagnostic")
	if diag == nil {
		t.Fatalf("expected diagnostic move, sequence=%v", solveAllTechniques(resp))
	}
	if tech, _ := diag["technique"].(string); tech != "diagnostic" {
		t.Errorf("diagnostic technique: got %q", tech)
	}
	if act, _ := diag["action"].(string); act != "diagnostic" {
		t.Errorf("diagnostic action: got %q", act)
	}
	if expl, _ := diag["explanation"].(string); expl != "Taking another look at the candidates..." {
		t.Errorf("diagnostic explanation: got %q", expl)
	}

	unp := solveAllMoveByTechnique(resp, "unpinpointable-error")
	if unp == nil {
		t.Fatalf("expected unpinpointable-error move, sequence=%v", solveAllTechniques(resp))
	}
	if expl, _ := unp["explanation"].(string); !strings.HasPrefix(expl, "Hmm, I couldn't pinpoint the error.") {
		t.Errorf("unpinpointable explanation: got %q", expl)
	}
	if _, ok := unp["userEntryCount"]; !ok {
		t.Errorf("unpinpointable move must carry userEntryCount, got %v", unp)
	}
}

func TestMutation_SolveAll_StalledMoveExactExplanation(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)
	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	stalled := solveAllMoveByTechnique(resp, "stalled")
	if stalled == nil {
		t.Fatalf("expected stalled move, sequence=%v", solveAllTechniques(resp))
	}
	if expl, _ := stalled["explanation"].(string); expl != "I'm stuck. There might be another error in your entries." {
		t.Errorf("stalled explanation: got %q", expl)
	}
	if _, ok := stalled["userEntryCount"]; !ok {
		t.Errorf("stalled move must carry userEntryCount, got %v", stalled)
	}
}

func TestMutation_SolveAll_FirstFixErrorMoveExactShape(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)
	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	fix := solveAllMoveByTechnique(resp, "fix-error")
	if fix == nil {
		t.Fatalf("expected a fix-error move, sequence=%v", solveAllTechniques(resp))
	}
	if tech, _ := fix["technique"].(string); tech != "fix-error" {
		t.Errorf("technique: got %q", tech)
	}
	if act, _ := fix["action"].(string); act != "fix-error" {
		t.Errorf("action: got %q", act)
	}
	if digit, _ := fix["digit"].(float64); int(digit) != 1 {
		t.Errorf("expected digit 1, got %v", digit)
	}
	targets, _ := fix["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]interface{})
	if int(target["row"].(float64)) != 0 || int(target["col"].(float64)) != 1 {
		t.Errorf("expected target (0,1) for badCell=1, got %v", target)
	}
	if expl, _ := fix["explanation"].(string); expl != "Removing incorrect 1 from R1C2." {
		t.Errorf("fix-error explanation: got %q", expl)
	}
}

func TestMutation_PracticeHandler_SeedFormatMatchesIndex(t *testing.T) {
	resetPracticeCache()
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/hidden-single", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. body: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["cached"] != false {
		t.Errorf("first lookup: expected cached=false, got %v", resp["cached"])
	}
	if resp["technique"] != "hidden-single" {
		t.Errorf("technique: expected 'hidden-single', got %v", resp["technique"])
	}
	idx, _ := resp["puzzle_index"].(float64)
	expectedSeed := fmt.Sprintf(constants.PracticePuzzleIDFmt, "hidden-single", int(idx))
	if resp["seed"] != expectedSeed {
		t.Errorf("seed: expected %q, got %v", expectedSeed, resp["seed"])
	}
}

func TestMutation_PracticeHandler_NotFoundExactBody(t *testing.T) {
	resetPracticeCache()
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/als-xy-chain", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d. body: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "no puzzle found" {
		t.Errorf("error: expected 'no puzzle found', got %v", resp["error"])
	}
	if resp["technique"] != "als-xy-chain" {
		t.Errorf("technique: expected 'als-xy-chain', got %v", resp["technique"])
	}
	if resp["message"] != "Could not find a puzzle requiring this technique. Try a different technique or check back later." {
		t.Errorf("message: got %v", resp["message"])
	}
}

func TestMutation_PracticeHandler_503WhenPuzzlesNotLoaded(t *testing.T) {
	resetPracticeCache()
	original := puzzles.Global()
	puzzles.SetGlobal(nil)
	defer puzzles.SetGlobal(original)
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/naked-single", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "puzzles not loaded" {
		t.Errorf("error: expected 'puzzles not loaded', got %v", resp["error"])
	}
}

func TestMutation_PracticeHandler_MissingTechniqueExactError(t *testing.T) {
	resetPracticeCache()
	router := setupRouter()
	// The route is /practice/:technique; gin returns 404 for a bare path, so
	// register a one-off route that calls the handler with an empty technique.
	router.GET("/practice-empty-test", func(c *gin.Context) {
		practiceHandler(c)
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/practice-empty-test", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty technique, got %d. body: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "technique required" {
		t.Errorf("error: expected 'technique required', got %v", resp["error"])
	}
}

// --- Mutation kill-list: handler-level exact-response tests ---

// TestMutation_PuzzleAnalyze_ExactGivensCount pins the exact givens_count for a
// loader-served puzzle, killing the incrementer/decrementer/branch mutants on
// the non-zero counting loop.
func TestMutation_PuzzleAnalyze_ExactGivensCount(t *testing.T) {
	router := setupRouter()
	seed, diff := "givens-count-seed", "easy"
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/"+seed+"/analyze?d="+diff, nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	loader := puzzles.Global()
	givens, _, _, err := loader.GetPuzzleBySeed(seed, diff)
	if err != nil {
		t.Fatalf("loader error: %v", err)
	}
	expected := 0
	for _, v := range givens {
		if v != 0 {
			expected++
		}
	}
	got, _ := resp["givens_count"].(float64)
	if int(got) != expected {
		t.Errorf("givens_count: expected %d, got %v", expected, got)
	}
}

// TestMutation_CustomValidate_ExactlySixteenGivensTriggersMinCheck pins that a
// conflict-free board with exactly 16 givens is rejected for having too few.
// The givenCount incrementer (0 -> 1) would count 17 and skip this check.
func TestMutation_CustomValidate_ExactlySixteenGivensTriggersMinCheck(t *testing.T) {
	router := setupRouter()
	solved := dp.GenerateFullGrid(42)
	givens := make([]int, 81)
	copy(givens, solved)
	drop := 81 - 16
	for i := 0; i < drop; i++ {
		givens[i] = 0
	}
	if !dp.IsValid(context.Background(), givens) {
		t.Skipf("setup: 16-given board has conflicts, cannot exercise min-givens check")
	}
	code, resp := postJSON(t, router, "/api/custom/validate", map[string]interface{}{
		"givens": givens, "device_id": "d",
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	if resp["valid"] != false {
		t.Errorf("expected valid=false for 16 givens, got %v", resp["valid"])
	}
	if resp["reason"] != "need at least 17 givens" {
		t.Errorf("reason: expected 'need at least 17 givens', got %v", resp["reason"])
	}
}

// TestMutation_PuzzleHandler_GeneratesOnDemandWhenLoaderAbsent pins the
// generation fallback (loader == nil): givens are produced and puzzle_index is
// -1. This kills the givens-assignment removal and the puzzleIndex literals.
func TestMutation_PuzzleHandler_GeneratesOnDemandWhenLoaderAbsent(t *testing.T) {
	original := puzzles.Global()
	puzzles.SetGlobal(nil)
	defer puzzles.SetGlobal(original)
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/fallback-seed?d=medium", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["puzzle_index"] != nil && resp["puzzle_index"].(float64) != -1 {
		t.Errorf("puzzle_index: expected -1 for generated puzzle, got %v", resp["puzzle_index"])
	}
	gotGivens := ifaceToIntBoard(resp["givens"])
	if len(gotGivens) != 81 {
		t.Fatalf("givens length: expected 81, got %d", len(gotGivens))
	}
	nonZero := 0
	for _, v := range gotGivens {
		if v != 0 {
			nonZero++
		}
	}
	if nonZero == 0 {
		t.Errorf("expected generated givens to be non-empty, got all zeros")
	}
}

// TestMutation_PuzzleAnalyze_GeneratesGivensWhenLoaderAbsent pins the analyze
// generation fallback: givens_count must reflect a generated puzzle, not 0.
func TestMutation_PuzzleAnalyze_GeneratesGivensWhenLoaderAbsent(t *testing.T) {
	original := puzzles.Global()
	puzzles.SetGlobal(nil)
	defer puzzles.SetGlobal(original)
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/analyze-fallback-seed/analyze?d=medium", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	got, _ := resp["givens_count"].(float64)
	if int(got) <= 0 {
		t.Errorf("givens_count: expected >0 for generated puzzle, got %v", got)
	}
}

// TestMutation_DailyHandler_ExactPuzzleIndex pins puzzle_index to the loader's
// computed daily index, killing the branch mutant that drops the assignment.
func TestMutation_DailyHandler_ExactPuzzleIndex(t *testing.T) {
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/daily", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	loader := puzzles.Global()
	_, _, expectedIdx, err := loader.GetDailyPuzzle(time.Now(), "medium")
	if err != nil {
		t.Fatalf("loader error: %v", err)
	}
	got, _ := resp["puzzle_index"].(float64)
	if int(got) != expectedIdx {
		t.Errorf("puzzle_index: expected %d, got %v", expectedIdx, got)
	}
}

// TestMutation_SolveNext_NonDegenerateContradictionExactExplanation pins the
// contradiction fix path with a non-zero-row/col contradiction cell (cell 40).
// This kills the contradictionCell arithmetic mutants on line 681 (Row*Grid+Col
// -> Row*Grid-Col / Row/Grid+Col), which are degenerate (invisible) when the
// contradiction cell is 0.
func TestMutation_SolveNext_NonDegenerateContradictionExactExplanation(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	givens := make([]int, 81)
	board[36] = 1
	board[37] = 2
	board[38] = 3
	board[39] = 4
	board[41] = 5
	board[42] = 6
	board[43] = 7
	board[44] = 8
	board[4] = 9

	code, resp := postSolveNext(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a move, got: %v", resp)
	}
	if move["technique"] != "fix-error" {
		t.Errorf("expected fix-error, got %v", move["technique"])
	}
	explanation, _ := move["explanation"].(string)
	expected := "Contradiction detected! R5C5 had no valid candidates. Removing incorrect 4 from R5C4."
	if explanation != expected {
		t.Errorf("explanation:\n want %q\n got  %q", expected, explanation)
	}
}

// TestMutation_SolveAll_NonDegenerateContradictionFirstFix pins the first
// fix-error move of the autosolve loop with a non-degenerate contradiction cell,
// killing the contradictionCell arithmetic (1042) and the originalUserBoard
// clear-to-0 decrementer (1046) on the blocking path.
func TestMutation_SolveAll_NonDegenerateContradictionFirstFix(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	givens := make([]int, 81)
	board[36] = 1
	board[37] = 2
	board[38] = 3
	board[39] = 4
	board[41] = 5
	board[42] = 6
	board[43] = 7
	board[44] = 8
	board[4] = 9

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	fix := solveAllMoveByTechnique(resp, "fix-error")
	if fix == nil {
		t.Fatalf("expected a fix-error move, sequence=%v", solveAllTechniques(resp))
	}
	if digit, _ := fix["digit"].(float64); int(digit) != 4 {
		t.Errorf("expected digit 4 (cell 39 holds 4), got %v", digit)
	}
	targets, _ := fix["targets"].([]interface{})
	target, _ := targets[0].(map[string]interface{})
	if int(target["row"].(float64)) != 4 || int(target["col"].(float64)) != 3 {
		t.Errorf("expected target (4,3) for badCell=39, got %v", target)
	}
	wrap := solveAllMoveWrapperByTechnique(resp, "fix-error")
	if wrap == nil {
		t.Fatal("expected a fix-error move wrapper")
	}
	if ifaceToIntBoard(wrap["board"])[39] != 0 {
		t.Errorf("expected cell 39 cleared to 0 in the fix-error board snapshot")
	}
}

// TestMutation_SolveNext_RefillPathExactExplanation pins the "Found it!" fix
// path in handleSolveNextContradiction, reached when findBlockingUserCell cannot
// attribute the contradiction to a user cell but findErrorByCandidateRefill can.
// Cell 0 is zero-candidate purely from givens (so findBlockingUserCell returns
// -1), while cell 40 is zero-candidate because of the user-entered 9 at cell 49.
// The exact explanation and coordinates kill the arithmetic mutants on the
// zeroCand/badCell row/col computation, the respondSolveNextFix call removal,
// and every +1 formatting mutant on the explanation string.
func TestMutation_SolveNext_RefillPathExactExplanation(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	givens := make([]int, 81)
	given := func(i, v int) { board[i] = v; givens[i] = v }
	user := func(i, v int) { board[i] = v }
	for d := 1; d <= 8; d++ {
		given(d, d)
	}
	given(9, 9)
	given(36, 1)
	given(37, 2)
	given(38, 3)
	given(39, 4)
	given(41, 5)
	given(42, 6)
	given(43, 7)
	given(44, 8)
	user(49, 9)

	code, resp := postSolveNext(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a move, got: %v", resp)
	}
	if move["technique"] != "fix-error" || move["action"] != "fix-error" {
		t.Errorf("expected fix-error technique/action, got %v", move)
	}
	if digit, _ := move["digit"].(float64); int(digit) != 9 {
		t.Errorf("expected digit 9 (the user entry at cell 49), got %v", digit)
	}
	targets, _ := move["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]interface{})
	if int(target["row"].(float64)) != 5 || int(target["col"].(float64)) != 4 {
		t.Errorf("expected target (5,4) for badCell=49, got %v", target)
	}
	explanation, _ := move["explanation"].(string)
	expected := "Found it! R5C5 has no valid candidates. The 9 at R6C5 was causing the problem."
	if explanation != expected {
		t.Errorf("explanation:\n want %q\n got  %q", expected, explanation)
	}
	boardOut := ifaceToIntBoard(resp["board"])
	if boardOut[49] != 0 {
		t.Errorf("expected cell 49 cleared to 0, got %d", boardOut[49])
	}
	if boardOut[9] != 9 {
		t.Errorf("cell 9 (given) should remain 9, got %d", boardOut[9])
	}
}

// TestMutation_SolveAll_RefillPathFixErrorShape pins the fix-error move emitted
// by the candidate-refill path of handleAutosolveContradiction (the move that
// follows a diagnostic). The cleared-cell value, the secondary highlight
// coordinates, and the move's presence kill the board.ClearCell removal, the
// zeroCandCell row/col arithmetic, and the appendFixErrorMove call removal.
func TestMutation_SolveAll_RefillPathFixErrorShape(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	givens := make([]int, 81)
	given := func(i, v int) { board[i] = v; givens[i] = v }
	user := func(i, v int) { board[i] = v }
	for d := 1; d <= 8; d++ {
		given(d, d)
	}
	given(9, 9)
	given(36, 1)
	given(37, 2)
	given(38, 3)
	given(39, 4)
	given(41, 5)
	given(42, 6)
	given(43, 7)
	given(44, 8)
	user(49, 9)

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	fix := solveAllMoveByTechnique(resp, "fix-error")
	if fix == nil {
		t.Fatalf("expected a fix-error move, sequence=%v", solveAllTechniques(resp))
	}
	if digit, _ := fix["digit"].(float64); int(digit) != 9 {
		t.Errorf("expected digit 9, got %v", digit)
	}
	if expl, _ := fix["explanation"].(string); expl != "Removing incorrect 9 from R6C5." {
		t.Errorf("explanation: got %q", expl)
	}
	highlights, _ := fix["highlights"].(map[string]interface{})
	secondary, _ := highlights["secondary"].([]interface{})
	if len(secondary) != 1 {
		t.Fatalf("expected 1 secondary highlight, got %d", len(secondary))
	}
	sec, _ := secondary[0].(map[string]interface{})
	if int(sec["row"].(float64)) != 4 || int(sec["col"].(float64)) != 4 {
		t.Errorf("expected secondary (4,4) for zeroCandCell=40, got %v", sec)
	}
	wrap := solveAllMoveWrapperByTechnique(resp, "fix-error")
	if wrap == nil {
		t.Fatal("expected a fix-error move wrapper")
	}
	if ifaceToIntBoard(wrap["board"])[49] != 0 {
		t.Errorf("expected cell 49 cleared to 0 in the fix-error board snapshot")
	}
}

// TestMutation_SolveAll_FiveErrorsSolvedUnderCap corrupts exactly 5 cells of
// a solved grid. With maxFixes=5 the loop fixes all five and solves, emitting
// no "error" move. The maxFixes decrementer (5->4) would cap early and emit an
// error move instead of solving.
func TestMutation_SolveAll_FiveErrorsSolvedUnderCap(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(777)
	corruptions := map[int]int{}
	for i := 0; i < 5; i++ {
		corruptions[i] = wrongDigit(solved[i])
	}
	board, givens := boardWithUserErrors(solved, corruptions)

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	if hasTechnique(solveAllTechniques(resp), "error") {
		t.Errorf("expected no error move with 5 errors under the cap, sequence=%v", solveAllTechniques(resp))
	}
}

// TestMutation_SolveAll_SixErrorsHitCap corrupts exactly 6 cells. With
// maxFixes=5 the loop hits the cap and emits an "error" move. The incrementer
// (5->6) and the >= -> > comparison mutant would both allow a sixth fix and
// skip the error move.
func TestMutation_SolveAll_SixErrorsHitCap(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(888)
	corruptions := map[int]int{}
	for i := 0; i < 6; i++ {
		corruptions[i] = wrongDigit(solved[i])
	}
	board, givens := boardWithUserErrors(solved, corruptions)

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	if !hasTechnique(solveAllTechniques(resp), "error") {
		t.Errorf("expected an error move with 6 errors over the cap, sequence=%v", solveAllTechniques(resp))
	}
}

// wrongDigit returns a Sudoku digit (1-9) different from d.
func wrongDigit(d int) int {
	if d == 9 {
		return 1
	}
	return d + 1
}

// --- solveAll / solveFull / validate bad-input validation returns ---

// TestMutation_SolveAll_RejectsBadToken pins the 401 path, killing the
// branch/if and statement/remove mutants that drop the token-error response.
func TestMutation_SolveAll_RejectsBadToken(t *testing.T) {
	router := setupRouter()
	board := make([]int, 81)
	board[0] = 5
	code, resp := postJSON(t, router, "/api/solve/all", map[string]interface{}{
		"token": "not.a.token", "board": board,
	})
	if code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", code)
	}
	errMsg, _ := resp["error"].(string)
	if !strings.HasPrefix(errMsg, "invalid token:") {
		t.Errorf("expected 'invalid token:' prefix, got %q", errMsg)
	}
}

// TestMutation_SolveAll_RejectsWrongBoardLength pins the board-length 400 path.
func TestMutation_SolveAll_RejectsWrongBoardLength(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	code, resp := postJSON(t, router, "/api/solve/all", map[string]interface{}{
		"token": token, "board": []int{1, 2, 3},
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", code)
	}
	if errMsg, _ := resp["error"].(string); errMsg != "board must have 81 cells" {
		t.Errorf("error: got %q", errMsg)
	}
}

// TestMutation_SolveAll_RejectsOutOfRangeValue pins the board-value 400 path.
func TestMutation_SolveAll_RejectsOutOfRangeValue(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	board[0] = 99
	code, resp := postJSON(t, router, "/api/solve/all", map[string]interface{}{
		"token": token, "board": board,
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", code)
	}
	if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "out of range") {
		t.Errorf("error: got %q", errMsg)
	}
}

// TestMutation_SolveFull_RejectsWrongBoardLength pins solveFull length check.
func TestMutation_SolveFull_RejectsWrongBoardLength(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	code, resp := postJSON(t, router, "/api/solve/full", map[string]interface{}{
		"token": token, "board": []int{1, 2, 3},
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", code)
	}
	if errMsg, _ := resp["error"].(string); errMsg != "board must have 81 cells" {
		t.Errorf("error: got %q", errMsg)
	}
}

// TestMutation_SolveFull_RejectsOutOfRangeValue pins solveFull value check,
// killing the branch mutant that drops the early return.
func TestMutation_SolveFull_RejectsOutOfRangeValue(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	board[0] = 42
	code, resp := postJSON(t, router, "/api/solve/full", map[string]interface{}{
		"token": token, "board": board,
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400 for cell value 42, got %d", code)
	}
	if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "out of range") {
		t.Errorf("error: got %q", errMsg)
	}
}

// TestMutation_Practice_EmptyLoaderReturnsNotFound pins the puzzleCount==0
// early return in findPracticePuzzle. With an empty (but non-nil) loader the
// search must short-circuit to 404; the count==0 comparison mutants would
// fall through to a divide-by-zero on puzzleCount.
func TestMutation_Practice_EmptyLoaderReturnsNotFound(t *testing.T) {
	resetPracticeCache()
	original := puzzles.Global()
	puzzles.SetGlobal(puzzles.NewLoaderFromPuzzles([]puzzles.CompactPuzzle{}))
	defer puzzles.SetGlobal(original)
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/naked-single", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for empty loader, got %d. body: %s", w.Code, w.Body.String())
	}
}

// TestMutation_ValidateBoard_RejectsWrongLength pins validate length check.
func TestMutation_ValidateBoard_RejectsWrongLength(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	code, resp := postJSON(t, router, "/api/validate", map[string]interface{}{
		"token": token, "board": []int{1, 2, 3},
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", code)
	}
	if errMsg, _ := resp["error"].(string); errMsg != "board must have 81 cells" {
		t.Errorf("error: got %q", errMsg)
	}
}

// TestMutation_ValidateBoard_RejectsOutOfRangeValue pins validate value check.
func TestMutation_ValidateBoard_RejectsOutOfRangeValue(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	board[0] = 42
	code, resp := postJSON(t, router, "/api/validate", map[string]interface{}{
		"token": token, "board": board,
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", code)
	}
	if errMsg, _ := resp["error"].(string); !strings.Contains(errMsg, "out of range") {
		t.Errorf("error: got %q", errMsg)
	}
}

// --- solveNext both-givens conflict then fixable conflict ---

// TestMutation_SolveNext_SkipsBothGivensConflict pins that when a board has a
// both-givens conflict followed by a user-fixable conflict, the handler skips
// the unfixable one (continue) and fixes the fixable one. Kills the continue
// removal and continue->break mutants on the conflict loop.
func TestMutation_SolveNext_SkipsBothGivensConflict(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	board[0] = 5
	board[1] = 5
	board[2] = 7
	board[3] = 7
	givens := make([]int, 81)
	givens[0] = 5
	givens[1] = 5
	givens[2] = 7

	code, resp := postSolveNext(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, resp)
	}
	move, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a move, got: %v", resp)
	}
	if move["technique"] != "fix-conflict" {
		t.Errorf("expected fix-conflict (skipping both-givens), got %v", move["technique"])
	}
	boardOut := ifaceToIntBoard(resp["board"])
	if boardOut[3] != 0 {
		t.Errorf("expected cell 3 (user entry) cleared, got %d", boardOut[3])
	}
}

// --- solvable-board solveAll: clean completion ---

// TestMutation_SolveAll_SolvesCleanlyWithoutStalledMove pins that a solvable
// puzzle autosolves to completion with no stalled/error/unpinpointable move.
// This kills the IsSolved-break removal (extra stalled appended) and the
// normal-move continue removal (mishandles moves, fails to solve).
func TestMutation_SolveAll_SolvesCleanlyWithoutStalledMove(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	loader := puzzles.Global()
	givens, _, _, err := loader.GetPuzzleBySeed("clean-solve-seed", "easy")
	if err != nil {
		t.Fatalf("loader error: %v", err)
	}

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": givens, "givens": givens,
	})
	if solved, _ := resp["solved"].(bool); !solved {
		t.Errorf("expected solved=true for a solvable easy puzzle, sequence=%v", solveAllTechniques(resp))
	}
	for _, tech := range solveAllTechniques(resp) {
		if tech == "stalled" || tech == "error" || tech == "unpinpointable-error" {
			t.Errorf("expected no terminal error move, found %q in sequence %v", tech, solveAllTechniques(resp))
		}
	}
}

// TestMutation_SolveAll_FixErrorMoveCarriesCandidates pins that a fix-error
// move's snapshot includes a populated candidate grid. This kills the
// board.InitCandidates() removal in both contradiction-fix code paths.
func TestMutation_SolveAll_FixErrorMoveCarriesCandidates(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	fixWrapper := solveAllMoveWrapperByTechnique(resp, "fix-error")
	if fixWrapper == nil {
		t.Fatalf("expected a fix-error move, sequence=%v", solveAllTechniques(resp))
	}
	cands, ok := fixWrapper["candidates"].([]interface{})
	if !ok {
		t.Fatalf("fix-error move missing candidates field: %v", fixWrapper)
	}
	if len(cands) != 81 {
		t.Errorf("fix-error move candidates: expected 81 cells, got %d", len(cands))
	}
}

// --- token.go verify edge cases ---

// TestVerifyToken_RejectsNonJsonPayload pins that a payload that is valid
// base64 but not valid JSON returns an error (not a silent zero-value session).
// Kills the json.Unmarshal return-removal branch mutant.
func TestVerifyToken_RejectsNonJsonPayload(t *testing.T) {
	encoded := base64.URLEncoding.EncodeToString([]byte("not-json{"))
	h := hmac.New(sha256.New, []byte("secret"))
	h.Write([]byte(encoded))
	sig := base64.URLEncoding.EncodeToString(h.Sum(nil))
	tok := encoded + "." + sig

	got, err := verifyToken("secret", tok)
	if err == nil {
		t.Fatalf("expected error for non-JSON payload, got session=%+v", got)
	}
	if !strings.Contains(err.Error(), "invalid character") && !strings.Contains(err.Error(), "JSON") && !strings.Contains(err.Error(), "unexpected") {
		t.Errorf("expected a JSON parse error, got %q", err.Error())
	}
}

// TestVerifyToken_RejectsInvalidBase64Payload pins that a payload with a valid
// HMAC signature but invalid base64 returns the decode error, not a later
// expiry error. Kills the base64-decode return-removal branch mutant.
func TestVerifyToken_RejectsInvalidBase64Payload(t *testing.T) {
	encoded := "not_valid_base64!!"
	h := hmac.New(sha256.New, []byte("secret"))
	h.Write([]byte(encoded))
	sig := base64.URLEncoding.EncodeToString(h.Sum(nil))
	tok := encoded + "." + sig

	got, err := verifyToken("secret", tok)
	if err == nil {
		t.Fatalf("expected error for invalid base64 payload, got session=%+v", got)
	}
	if strings.Contains(err.Error(), "token expired") {
		t.Errorf("expected a base64/JSON error before expiry check, got %q", err.Error())
	}
}
