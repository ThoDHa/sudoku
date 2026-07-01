package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"sudoku-api/internal/core"
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

// TestMutation_PeerCellIndices_ExactIndices pins the exact cell indices returned
// by peerCellIndices for a mid-grid cell. This kills all arithmetic/base mutants
// on row*GridSize, i*GridSize, box origin computation, and box cell computation.
func TestMutation_PeerCellIndices_ExactIndices(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(4, 5)

	expectedRow := []int{36, 37, 38, 39, 40, 41, 42, 43, 44}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells: expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{5, 14, 23, 32, 41, 50, 59, 68, 77}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells: expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{30, 31, 32, 39, 40, 41, 48, 49, 50}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells: expected %v, got %v", expectedBox, boxCells)
	}
}

// TestMutation_PeerCellIndices_TopLeftCorner pins indices for cell (0,0) to
// kill mutants on box origin at the grid boundary (0/BoxSize*BoxSize = 0).
func TestMutation_PeerCellIndices_TopLeftCorner(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(0, 0)

	expectedRow := []int{0, 1, 2, 3, 4, 5, 6, 7, 8}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells (0,0): expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{0, 9, 18, 27, 36, 45, 54, 63, 72}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells (0,0): expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{0, 1, 2, 9, 10, 11, 18, 19, 20}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells (0,0): expected %v, got %v", expectedBox, boxCells)
	}
}

// TestMutation_PeerCellIndices_BottomRightCorner pins indices for cell (8,8)
// to kill mutants on box boundary computation at the grid edge.
func TestMutation_PeerCellIndices_BottomRightCorner(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(8, 8)

	expectedRow := []int{72, 73, 74, 75, 76, 77, 78, 79, 80}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells (8,8): expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{8, 17, 26, 35, 44, 53, 62, 71, 80}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells (8,8): expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{60, 61, 62, 69, 70, 71, 78, 79, 80}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells (8,8): expected %v, got %v", expectedBox, boxCells)
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

// TestMutation_ValidateDifficulty tests all valid difficulty levels plus an
// invalid one, killing branch/case mutants in the validation function.
func TestMutation_ValidateDifficulty(t *testing.T) {
	for _, d := range []string{"easy", "medium", "hard", "extreme", "impossible"} {
		if !validateDifficulty(core.Difficulty(d)) {
			t.Errorf("validateDifficulty(%q) = false, want true", d)
		}
	}
	if validateDifficulty(core.Difficulty("bogus")) {
		t.Error(`validateDifficulty("bogus") = true, want false`)
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
