package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sudoku-api/internal/puzzles"
)

func resetPracticeCache() {
	practiceCache.Lock()
	practiceCache.puzzles = map[string][]practicePuzzle{}
	practiceCache.Unlock()
}

func TestVersionHandlerReturnsApiAndSolverVersions(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/version", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. body: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["api_version"] == nil {
		t.Error("expected api_version in response")
	}
	if response["solver_version"] == nil {
		t.Error("expected solver_version in response")
	}
}

func TestPuzzleAnalyzeHandlerReturnsAnalysisForValidRequest(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/test-seed-123/analyze?d=easy", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. body: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["seed"] != "test-seed-123" {
		t.Errorf("expected seed 'test-seed-123', got %v", response["seed"])
	}
	if response["difficulty"] != "easy" {
		t.Errorf("expected difficulty 'easy', got %v", response["difficulty"])
	}
	for _, key := range []string{"givens_count", "required_difficulty", "status", "techniques"} {
		if _, ok := response[key]; !ok {
			t.Errorf("expected %q in analysis response, got: %v", key, response)
		}
	}
}

func TestPuzzleAnalyzeHandlerDefaultsToMediumDifficulty(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/test-seed-456/analyze", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d. body: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	if response["difficulty"] != "medium" {
		t.Errorf("expected default difficulty 'medium', got %v", response["difficulty"])
	}
}

func TestPuzzleAnalyzeHandlerRejectsInvalidDifficulty(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/test-seed-789/analyze?d=foobar", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid difficulty, got %d. body: %s", w.Code, w.Body.String())
	}
}

func TestPracticeHandlerFindsAndCachesPuzzleForCommonTechnique(t *testing.T) {
	resetPracticeCache()
	router := setupRouter()

	// hidden-single is present in every test puzzle at easy/medium difficulty
	// with a completed solve, so the practice search will find and cache it.
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/hidden-single", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 for hidden-single, got %d. body: %s", w.Code, w.Body.String())
	}

	var first map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &first); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if first["technique"] != "hidden-single" {
		t.Errorf("expected technique 'hidden-single', got %v", first["technique"])
	}
	if first["cached"] != false {
		t.Errorf("expected cached=false on first lookup, got %v", first["cached"])
	}
	for _, key := range []string{"seed", "difficulty", "givens", "puzzle_index"} {
		if _, ok := first[key]; !ok {
			t.Errorf("expected %q in practice response, got: %v", key, first)
		}
	}

	// Second request for the same technique must be served from the cache.
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/api/practice/hidden-single", nil)
	router.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected status 200 on cached lookup, got %d. body: %s", w2.Code, w2.Body.String())
	}

	var second map[string]interface{}
	_ = json.Unmarshal(w2.Body.Bytes(), &second)

	if second["cached"] != true {
		t.Errorf("expected cached=true on second lookup, got %v", second["cached"])
	}
}

func TestPracticeHandlerReturnsNotFoundForRareTechnique(t *testing.T) {
	resetPracticeCache()
	router := setupRouter()

	// An obscure technique that the small easy/medium test puzzle set will not
	// require; the handler should exhaust its sample search and return 404.
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/als-xy-chain", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404 for unfound technique, got %d. body: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	if response["technique"] != "als-xy-chain" {
		t.Errorf("expected technique echoed in 404 response, got %v", response["technique"])
	}
}

func TestPracticeHandlerReportsUnavailableWhenPuzzlesNotLoaded(t *testing.T) {
	resetPracticeCache()
	// Temporarily remove the global loader so the handler takes its 503 path.
	original := puzzles.Global()
	puzzles.SetGlobal(nil)
	defer puzzles.SetGlobal(original)

	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/practice/naked-single", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503 when puzzles not loaded, got %d. body: %s", w.Code, w.Body.String())
	}
}

// POST handlers must reject malformed JSON bodies with 400 rather than crashing.
func TestPostHandlersRejectMalformedJson(t *testing.T) {
	router := setupRouter()
	endpoints := []string{
		"/api/session/start",
		"/api/solve/next",
		"/api/solve/all",
		"/api/solve/full",
		"/api/validate",
		"/api/custom/validate",
	}

	for _, ep := range endpoints {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", ep, bytes.NewBufferString("{not valid json"))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400 for malformed JSON, got %d. body: %s", ep, w.Code, w.Body.String())
		}
	}
}
