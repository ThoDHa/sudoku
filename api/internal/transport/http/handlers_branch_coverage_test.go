package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"

	"github.com/gin-gonic/gin"
)

// TestResolveGivens_GeneratesOnDemandWhenLoaderUnavailable covers the on-demand
// generation fallback in resolveGivens: when the request givens are the wrong
// length and no loader is available, the function must synthesize the puzzle's
// givens from the session seed and difficulty. With the global loader unset and
// a short request-givens slice, the returned board must be a full 81 cells.
func TestResolveGivens_GeneratesOnDemandWhenLoaderUnavailable(t *testing.T) {
	original := puzzles.Global()
	puzzles.SetGlobal(nil)
	defer puzzles.SetGlobal(original)

	session := &SessionToken{
		Seed:       "resolve-givens-fallback-seed",
		Difficulty: "medium",
	}

	givens, err := resolveGivens(context.Background(), session, []int{1, 2, 3})
	if err != nil {
		t.Fatalf("resolveGivens errored: %v", err)
	}

	if len(givens) != constants.TotalCells {
		t.Fatalf("expected on-demand generation to produce %d givens, got %d", constants.TotalCells, len(givens))
	}
}

// TestServeCachedPractice_ReturnsFalseWhenCachedIndexInvalid covers the
// loader-error branch of serveCachedPractice: a cached entry pointing at an
// out-of-range puzzle index must make the loader error, so the helper returns
// false (caller falls through to the search path) and writes no response.
func TestServeCachedPractice_ReturnsFalseWhenCachedIndexInvalid(t *testing.T) {
	loader := puzzles.NewLoaderFromPuzzles(testPuzzles)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	cached := []practicePuzzle{{index: 9999, difficulty: "medium"}}
	ok := serveCachedPractice(c, "x-wing", cached, loader)

	if ok {
		t.Fatalf("expected serveCachedPractice to return false when the cached index is out of range")
	}
	if w.Body.Len() != 0 {
		t.Errorf("expected no response body on cache-miss fallthrough, got %q", w.Body.String())
	}
}

// TestFindPracticePuzzle_ContinuesPastLoaderError covers the loader-error
// continue in findPracticePuzzle: a loader whose puzzle has no difficulty
// entries makes GetPuzzle error for every index, so the scan finds nothing and
// returns not-found rather than panicking on the nil givens.
func TestFindPracticePuzzle_ContinuesPastLoaderError(t *testing.T) {
	loader := brokenGLoader()
	solver := human.NewSolver()

	givens, _, _, ok := findPracticePuzzle(context.Background(), loader, solver, "hidden-single", []string{"medium"}, 1, 1)

	if ok {
		t.Fatalf("expected not-found when every loader index errors, got givens=%v", givens)
	}
}

// TestFindPracticePuzzle_SkipsIncompleteAnalysis covers the status-check
// continue in findPracticePuzzle: a puzzle that loads correctly but is too
// sparse for the human solver to finish yields a non-"completed" analysis, so
// the scan skips it and returns not-found.
func TestFindPracticePuzzle_SkipsIncompleteAnalysis(t *testing.T) {
	sparse := puzzles.NewLoaderFromPuzzles([]puzzles.CompactPuzzle{
		{S: testPuzzles[0].S, G: map[string][]int{"m": {0, 1}}},
	})
	solver := human.NewSolver()

	givens, _, _, ok := findPracticePuzzle(context.Background(), sparse, solver, "hidden-single", []string{"medium"}, 1, 1)

	if ok {
		t.Fatalf("expected not-found for a puzzle whose analysis never completes, got givens=%v", givens)
	}
}

// TestPracticeHandler_UnknownTechniqueUsesDefaultDifficulties covers the
// unknown-technique branch of practiceHandler: a technique absent from the
// technique-to-difficulty map falls back to the default difficulty set, the
// search finds no matching puzzle, and the handler responds 404 with the
// requested technique echoed back.
func TestPracticeHandler_UnknownTechniqueUsesDefaultDifficulties(t *testing.T) {
	resetPracticeCache()
	router := setupRouter()

	const technique = "totally-unknown-technique"
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/"+technique, nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown technique, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["technique"] != technique {
		t.Errorf("expected technique %q echoed in 404 body, got %v", technique, resp["technique"])
	}
}

// TestSolveAll_WithCandidatesReachesAutosolveLoop covers the with-candidates
// branch of solveAllHandler: a conflict-free board carrying an explicit
// candidate grid must be built via NewBoardWithCandidates and run through the
// autosolve loop, returning a 200 with a moves array and a finalBoard.
func TestSolveAll_WithCandidatesReachesAutosolveLoop(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	givens, _, err := puzzles.NewLoaderFromPuzzles(testPuzzles).GetPuzzle(0, "medium")
	if err != nil {
		t.Fatalf("failed to load test puzzle givens: %v", err)
	}

	// Provide a full 81-cell candidate grid so len(req.Candidates) != 0, routing
	// the handler through NewBoardWithCandidates. Empty per-cell lists are valid;
	// the solver populates candidates as it runs.
	candidates := make([][]int, constants.TotalCells)
	for i := range candidates {
		candidates[i] = []int{}
	}

	code, resp := postJSON(t, router, "/api/solve/all", map[string]any{
		"token":      token,
		"board":      givens,
		"givens":     givens,
		"candidates": candidates,
	})

	if code != http.StatusOK {
		t.Fatalf("expected 200 from solve/all with candidates, got %d: %v", code, resp)
	}
	if _, ok := resp["moves"].([]any); !ok {
		t.Errorf("expected a moves array in the response, got %v", resp["moves"])
	}
	if _, ok := resp["finalBoard"].([]any); !ok {
		t.Errorf("expected a finalBoard in the response, got %v", resp["finalBoard"])
	}
}
