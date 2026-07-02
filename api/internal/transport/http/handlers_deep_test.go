package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"

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

	fixedBoard, _ := resp["board"].([]interface{})
	if filledFromIface(fixedBoard) >= filledFromInt(board) {
		t.Errorf("expected the fix-error move to clear a cell; input filled=%d, output filled=%d",
			filledFromInt(board), filledFromIface(fixedBoard))
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
