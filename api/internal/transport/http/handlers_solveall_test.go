package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sudoku-api/internal/sudoku/dp"

	"github.com/gin-gonic/gin"
)

const maxMovesCap = 2000

// postJSON posts a JSON body and returns the status code and decoded body.
func postJSON(t *testing.T, router *gin.Engine, path string, body map[string]interface{}) (int, map[string]interface{}) {
	t.Helper()
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", path, bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return w.Code, resp
}

func postSolveAll(t *testing.T, router *gin.Engine, body map[string]interface{}) (int, map[string]interface{}) {
	return postJSON(t, router, "/api/solve/all", body)
}

// solveAllTechniques returns the ordered list of move "technique" values from a
// solve/all response. Each element of the moves array wraps its move under a
// nested "move" key, so the technique is read one level down.
func solveAllTechniques(resp map[string]interface{}) []string {
	moves, ok := resp["moves"].([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(moves))
	for _, m := range moves {
		wrapper, ok := m.(map[string]interface{})
		if !ok {
			continue
		}
		if mv, ok := wrapper["move"].(map[string]interface{}); ok {
			if tech, ok := mv["technique"].(string); ok {
				out = append(out, tech)
			}
		}
	}
	return out
}

// solveAllMoveByTechnique returns the first move wrapper carrying the given
// technique, or nil when absent. Used to pin exact move shapes.
func solveAllMoveByTechnique(resp map[string]interface{}, want string) map[string]interface{} {
	moves, ok := resp["moves"].([]interface{})
	if !ok {
		return nil
	}
	for _, m := range moves {
		wrapper, ok := m.(map[string]interface{})
		if !ok {
			continue
		}
		if mv, ok := wrapper["move"].(map[string]interface{}); ok {
			if tech, _ := mv["technique"].(string); tech == want {
				return mv
			}
		}
	}
	return nil
}

func hasTechnique(techniques []string, want string) bool {
	for _, tc := range techniques {
		if tc == want {
			return true
		}
	}
	return false
}

// ifaceToIntBoard converts the []interface{} returned by JSON decoding back to
// an []int board. Missing/non-number entries become 0.
func ifaceToIntBoard(from interface{}) []int {
	arr, ok := from.([]interface{})
	if !ok {
		return nil
	}
	out := make([]int, len(arr))
	for i, v := range arr {
		if n, ok := v.(float64); ok {
			out[i] = int(n)
		}
	}
	return out
}

// boardWithUserErrors returns a board derived from a solved grid where each
// listed index is overwritten with the given wrong digit. The accompanying
// givens slice marks every solved-grid cell as given except the corrupted
// indices, which are treated as user entries.
func boardWithUserErrors(solved []int, corruptions map[int]int) (board []int, givens []int) {
	board = make([]int, 81)
	givens = make([]int, 81)
	copy(board, solved)
	copy(givens, solved)
	for idx := range corruptions {
		givens[idx] = 0
	}
	for idx, digit := range corruptions {
		board[idx] = digit
	}
	return board, givens
}

func contains(haystack, needle string) bool {
	return bytes.Contains([]byte(haystack), []byte(needle))
}

// =============================================================================
// SCOPE-TEST-003: solveAllHandler multi-move loop internals
//
// These tests exercise the deep autosolve branches (conflict-then-complete,
// contradiction fix-error, diagnostic, unpinpointable, the maxFixes cap, and
// the stall termination) through observable endpoints only: the solved flag,
// the finalBoard, the set of move techniques, and the move count vs the cap.
// No test asserts on intermediate loop variables or solver-internal state.
// =============================================================================

// TestSolveAllCompletesAfterFixingDirectConflict drives the STEP 1 conflict
// branch that fixes a single user conflict and then autosolves to completion.
func TestSolveAllCompletesAfterFixingDirectConflict(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(987654)
	// Cells 0 and 1 share row 0; overwrite cell 1 with cell 0's digit to make a
	// direct row conflict, treated as a user entry.
	board, givens := boardWithUserErrors(solved, map[int]int{1: solved[0]})

	code, resp := postSolveAll(t, router, map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%v", code, resp)
	}

	techs := solveAllTechniques(resp)
	if !hasTechnique(techs, "fix-conflict") {
		t.Errorf("expected a fix-conflict move in sequence %v", techs)
	}
	if solvedFlag, _ := resp["solved"].(bool); !solvedFlag {
		t.Errorf("expected solved=true after fixing conflict, sequence=%v", techs)
	}
	final := ifaceToIntBoard(resp["finalBoard"])
	if len(final) != 81 {
		t.Fatalf("finalBoard must have 81 cells, got %d", len(final))
	}
	for i, v := range final {
		if v == 0 {
			t.Errorf("finalBoard cell %d is empty after a solved run", i)
		}
	}
	if conflicts := dp.FindConflicts(final); len(conflicts) != 0 {
		t.Errorf("finalBoard must be conflict-free, got %d conflicts", len(conflicts))
	}
	for i, v := range final {
		if v != solved[i] {
			t.Errorf("finalBoard[%d]=%d, expected %d (original solved grid)", i, v, solved[i])
			break
		}
	}
	if len(techs) > maxMovesCap {
		t.Errorf("move count %d exceeds cap %d", len(techs), maxMovesCap)
	}
}

// TestSolveAllContradictionLoopEmitsFixErrorThenStall covers the STEP 2
// contradiction branch and the stall termination. A board with no direct
// conflict but a zero-candidate cell forces the autosolver to fix user errors
// via fix-error moves; because the board is not solvable as given, the loop
// eventually stalls and emits a stalled move.
func TestSolveAllContradictionLoopEmitsFixErrorThenStall(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Row 0 holds digits 1..8 in cells 1..8 and digit 9 sits at cell 9 (same
	// column as cell 0), so cell 0 is a zero-candidate contradiction with no
	// direct duplicate conflict.
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81) // all entries are user-entered

	code, resp := postSolveAll(t, router, map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%v", code, resp)
	}

	techs := solveAllTechniques(resp)
	if !hasTechnique(techs, "fix-error") {
		t.Errorf("expected a fix-error move from the contradiction branch, sequence=%v", techs)
	}
	if !hasTechnique(techs, "stalled") {
		t.Errorf("expected a stalled move when the loop cannot complete, sequence=%v", techs)
	}
	if solvedFlag, _ := resp["solved"].(bool); solvedFlag {
		t.Errorf("expected solved=false for an unsolvable board, sequence=%v", techs)
	}
	if len(techs) > maxMovesCap {
		t.Errorf("move count %d exceeds cap %d", len(techs), maxMovesCap)
	}
	if final := ifaceToIntBoard(resp["finalBoard"]); len(final) != 81 {
		t.Errorf("finalBoard must have 81 cells, got %d", len(final))
	}
}

// TestSolveAllEmitsDiagnosticAndUnpinpointableOnUncorrelatedErrors covers the
// diagnostic candidate-refill move and the unpinpointable-error termination:
// when a contradiction cannot be attributed to a single user cell, the loop
// emits a diagnostic step and, if refill also fails, an unpinpointable-error.
func TestSolveAllEmitsDiagnosticAndUnpinpointableOnUncorrelatedErrors(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(555555)
	// Several corruptions spread across distinct regions produce contradictions
	// that the loop cannot cleanly attribute, driving the diagnostic + the
	// unpinpointable path.
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

	code, resp := postSolveAll(t, router, map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%v", code, resp)
	}

	techs := solveAllTechniques(resp)
	if !hasTechnique(techs, "unpinpointable-error") {
		t.Errorf("expected an unpinpointable-error move, sequence=%v", techs)
	}
	if len(techs) > maxMovesCap {
		t.Errorf("move count %d exceeds cap %d", len(techs), maxMovesCap)
	}
}

// TestSolveAllRespectsMaxFixesCap drives the maxFixes exhaustion branch.
// Corrupting every cell of row 0 with a wrong user entry creates more
// correctable errors than the cap, so the handler must stop and emit an "error"
// move rather than looping unbounded; solved must be false.
func TestSolveAllRespectsMaxFixesCap(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(1)
	corruptions := map[int]int{}
	for i := 0; i < 9; i++ { // all of row 0
		if solved[i] == 9 {
			corruptions[i] = 1
		} else {
			corruptions[i] = solved[i] + 1
		}
	}
	board, givens := boardWithUserErrors(solved, corruptions)

	code, resp := postSolveAll(t, router, map[string]interface{}{
		"token":  token,
		"board":  board,
		"givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%v", code, resp)
	}

	techs := solveAllTechniques(resp)
	if !hasTechnique(techs, "error") {
		t.Errorf("expected an error (cap) move when fixes are exhausted, sequence=%v", techs)
	}
	if solvedFlag, _ := resp["solved"].(bool); solvedFlag {
		t.Errorf("expected solved=false when the cap move is emitted, sequence=%v", techs)
	}
	if len(techs) > maxMovesCap {
		t.Errorf("move count %d exceeds cap %d (cap not respected)", len(techs), maxMovesCap)
	}
}

// =============================================================================
// TECHDEBT-002 characterization: pin exact solveAll move shapes so the
// conflict-fix extraction refactor is provably behavior-preserving.
// =============================================================================

// TestSolveAllCharacterizationPinsMoveShapes pins the technique, action, and
// explanation substrings for the fix-conflict, fix-error, and stalled moves
// emitted by solveAll. These assertions fail if the upcoming conflict-fix
// extraction changes any observable output.
func TestSolveAllCharacterizationPinsMoveShapes(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// fix-conflict move: a direct row conflict between cells 0 and 1.
	solved := dp.GenerateFullGrid(987654)
	conflictBoard, conflictGivens := boardWithUserErrors(solved, map[int]int{1: solved[0]})
	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": conflictBoard, "givens": conflictGivens,
	})
	fixConflict := solveAllMoveByTechnique(resp, "fix-conflict")
	if fixConflict == nil {
		t.Fatalf("expected a fix-conflict move, sequence=%v", solveAllTechniques(resp))
	}
	if act, _ := fixConflict["action"].(string); act != "fix-conflict" {
		t.Errorf("fix-conflict action: want %q got %q", "fix-conflict", act)
	}
	if _, ok := fixConflict["digit"]; !ok {
		t.Errorf("fix-conflict move must carry a digit field, got %v", fixConflict)
	}
	if expl, _ := fixConflict["explanation"].(string); !contains(expl, "Conflict") || !contains(expl, "in the same row") {
		t.Errorf("fix-conflict explanation: want 'Conflict' + 'in the same row', got %q", expl)
	}

	// fix-error + stalled moves: the zero-candidate contradiction board.
	contradictionBoard := make([]int, 81)
	for d := 1; d <= 8; d++ {
		contradictionBoard[d] = d
	}
	contradictionBoard[9] = 9
	_, resp2 := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": contradictionBoard, "givens": make([]int, 81),
	})
	fixError := solveAllMoveByTechnique(resp2, "fix-error")
	if fixError == nil {
		t.Fatalf("expected a fix-error move, sequence=%v", solveAllTechniques(resp2))
	}
	if act, _ := fixError["action"].(string); act != "fix-error" {
		t.Errorf("fix-error action: want %q got %q", "fix-error", act)
	}
	if expl, _ := fixError["explanation"].(string); !contains(expl, "Removing incorrect") {
		t.Errorf("fix-error explanation: want 'Removing incorrect', got %q", expl)
	}
	stalled := solveAllMoveByTechnique(resp2, "stalled")
	if stalled == nil {
		t.Fatalf("expected a stalled move, sequence=%v", solveAllTechniques(resp2))
	}
	if expl, _ := stalled["explanation"].(string); !contains(expl, "stuck") {
		t.Errorf("stalled explanation: want 'stuck', got %q", expl)
	}
}
