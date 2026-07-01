package http

import (
	"net/http"
	"strings"
	"testing"

	"sudoku-api/internal/sudoku/dp"
)

// Mutation-driven killing tests for transport/http.
// Each test pins exact observable properties that escaped mutants break.

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
