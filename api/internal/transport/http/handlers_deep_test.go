package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sudoku-api/internal/sudoku/dp"

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
