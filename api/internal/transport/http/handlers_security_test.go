package http

import (
	"net/http"
	"testing"

	"sudoku-api/internal/sudoku/dp"
)

// =============================================================================
// range-validate cell values at HTTP solver boundaries.
//
// These tests are intentionally in a separate file from the solveAll
// characterization suite so the characterization commit lands green on its
// own; the requireBoardValues hardening (routes.go) lands together with this
// file in the fix commit.
// =============================================================================

// TestSolverEndpointsRejectOutOfRangeCellValues verifies every solver POST
// endpoint rejects a board/givens body containing a cell value outside 0-9 with
// HTTP 400. A negative value and a value greater than 9 are both rejected.
func TestSolverEndpointsRejectOutOfRangeCellValues(t *testing.T) {
	solved := dp.GenerateFullGrid(20260625)

	cases := []struct {
		name     string
		path     string
		body     map[string]any
		badValue int
	}{
		{"solveNext/negative", "/api/solve/next", map[string]any{"board": dup(solved), "givens": dup(solved)}, -1},
		{"solveNext/overNine", "/api/solve/next", map[string]any{"board": dup(solved), "givens": dup(solved)}, 10},
		{"solveAll/negative", "/api/solve/all", map[string]any{"board": dup(solved), "givens": dup(solved)}, -5},
		{"solveAll/overNine", "/api/solve/all", map[string]any{"board": dup(solved), "givens": dup(solved)}, 99},
		{"solveFull/negative", "/api/solve/full", map[string]any{"board": dup(solved)}, -1},
		{"solveFull/overNine", "/api/solve/full", map[string]any{"board": dup(solved)}, 12},
		{"validate/negative", "/api/validate", map[string]any{"board": dup(solved)}, -1},
		{"validate/overNine", "/api/validate", map[string]any{"board": dup(solved)}, 42},
		{"customValidate/negative", "/api/custom/validate", map[string]any{"givens": dup(solved), "device_id": "dev-1"}, -1},
		{"customValidate/overNine", "/api/custom/validate", map[string]any{"givens": dup(solved), "device_id": "dev-1"}, 50},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			router := setupRouter()
			token := getValidToken(router)
			body := tc.body
			setFirstCell(body, tc.badValue)
			if _, hasToken := body["token"]; !hasToken {
				body["token"] = token
			}

			code, resp := postJSON(t, router, tc.path, body)
			if code != http.StatusBadRequest {
				t.Errorf("expected 400 for out-of-range cell value, got %d body=%v", code, resp)
			}
		})
	}
}

// TestSolverEndpointsAcceptValidRangeCellValues guards against an overly strict
// range check: a well-formed board whose every cell is in 0-9 must not be
// rejected by the new validation for any endpoint.
func TestSolverEndpointsAcceptValidRangeCellValues(t *testing.T) {
	solved := dp.GenerateFullGrid(777)

	for _, ep := range []string{"/api/solve/next", "/api/solve/all", "/api/validate"} {
		t.Run(ep, func(t *testing.T) {
			router := setupRouter()
			token := getValidToken(router)
			code, resp := postJSON(t, router, ep, map[string]any{
				"token":  token,
				"board":  solved,
				"givens": solved,
			})
			if code == http.StatusBadRequest {
				t.Errorf("valid-range board rejected at %s: %v", ep, resp)
			}
		})
	}
}

func dup(b []int) []int {
	out := make([]int, len(b))
	copy(out, b)
	return out
}

// TestSolveFullFastMode_RejectsSparseBoard verifies that /solve/full?mode=fast
// rejects a board with fewer than MinGivens non-empty cells before the DP solver.
func TestSolveFullFastMode_RejectsSparseBoard(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)
	board := make([]int, 81)
	board[0] = 1
	board[1] = 2

	code, resp := postJSON(t, router, "/api/solve/full?mode=fast", map[string]any{
		"token": token,
		"board": board,
	})
	if code != http.StatusBadRequest {
		t.Errorf("expected 400 for 2-given board in fast mode, got %d: %v", code, resp)
	}
}

// setFirstCell mutates the first cell of the board or givens slice in a JSON
// body so an out-of-range value reaches the handler intact.
func setFirstCell(body map[string]any, value int) {
	if b, ok := body["board"].([]int); ok && len(b) > 0 {
		b[0] = value
		body["board"] = b
	}
	if g, ok := body["givens"].([]int); ok && len(g) > 0 {
		g[0] = value
		body["givens"] = g
	}
}
