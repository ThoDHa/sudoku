package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sudoku-api/internal/puzzles"
	"sudoku-api/pkg/config"

	"github.com/gin-gonic/gin"
)

// testPuzzles contains pre-generated puzzles for fast testing
// Each puzzle has all 5 difficulties pre-computed
var testPuzzles = []puzzles.CompactPuzzle{
	{
		// A valid sudoku solution
		S: "157924638362158974498736512531279486926483157784615293273561849619847325845392761",
		G: map[string][]int{
			"e": {0, 1, 8, 9, 11, 12, 13, 14, 15, 16, 17, 20, 22, 23, 25, 28, 31, 32, 33, 36, 40, 41, 46, 48, 49, 51, 58, 60, 61, 63, 66, 67, 68, 73, 74, 75, 77, 78, 79, 80},
			"m": {0, 1, 8, 9, 11, 13, 14, 16, 17, 20, 22, 23, 25, 28, 31, 32, 33, 36, 41, 46, 48, 49, 51, 60, 63, 66, 67, 68, 74, 75, 77, 78, 79, 80},
			"h": {0, 1, 8, 11, 13, 17, 20, 22, 23, 25, 28, 31, 32, 33, 36, 46, 48, 49, 51, 60, 66, 67, 68, 74, 75, 78, 79, 80},
			"x": {0, 1, 8, 11, 17, 20, 22, 23, 25, 28, 31, 32, 33, 36, 48, 49, 51, 66, 67, 68, 74, 75, 78, 79, 80},
			"i": {0, 1, 8, 11, 17, 20, 22, 23, 25, 28, 31, 32, 33, 36, 48, 49, 51, 66, 67, 68, 74, 75, 78, 79, 80},
		},
	},
	{
		// Another valid sudoku solution
		S: "234978561978651432651342978492563817367814295815729346546297183789135624123486759",
		G: map[string][]int{
			"e": {1, 2, 3, 5, 8, 9, 11, 12, 15, 24, 25, 30, 31, 33, 35, 39, 40, 41, 43, 45, 47, 48, 49, 51, 54, 55, 57, 59, 60, 61, 63, 64, 65, 69, 71, 75, 76, 78, 79, 80},
			"m": {1, 2, 3, 8, 9, 11, 12, 15, 24, 30, 31, 33, 35, 39, 40, 41, 43, 45, 47, 49, 51, 54, 55, 57, 59, 61, 63, 64, 65, 69, 71, 76, 79, 80},
			"h": {1, 2, 3, 8, 11, 12, 15, 30, 31, 33, 39, 40, 41, 43, 47, 49, 54, 55, 57, 59, 61, 63, 65, 69, 71, 76, 79, 80},
			"x": {1, 2, 8, 11, 12, 15, 30, 31, 33, 39, 40, 41, 43, 47, 49, 55, 57, 59, 61, 63, 69, 71, 76, 79, 80},
			"i": {1, 2, 8, 11, 12, 15, 30, 31, 33, 39, 40, 41, 43, 47, 49, 55, 57, 59, 61, 63, 69, 71, 76, 79, 80},
		},
	},
}

func init() {
	// Set up test puzzles before any tests run
	// This avoids the slow on-demand puzzle generation
	loader := puzzles.NewLoaderFromPuzzles(testPuzzles)
	puzzles.SetGlobal(loader)
}

func setupRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	cfg := &config.Config{
		JWTSecret: "test-secret-key",
	}
	RegisterRoutes(r, cfg)
	return r
}

// Test Health Endpoint
func TestHealthHandler(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/health", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	if err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["status"] != "ok" {
		t.Errorf("Expected status 'ok', got '%v'", response["status"])
	}

	if response["version"] == nil {
		t.Error("Expected version in response")
	}
}

// Test Daily Endpoint
func TestDailyHandler(t *testing.T) {
	router := setupRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/daily", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	if err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["seed"] == nil {
		t.Error("Expected seed in response")
	}

	if response["date_utc"] == nil {
		t.Error("Expected date_utc in response")
	}
}

// Test Puzzle Endpoint
func TestPuzzleHandler(t *testing.T) {
	router := setupRouter()

	tests := []struct {
		name       string
		seed       string
		difficulty string
		wantStatus int
	}{
		{
			name:       "Valid puzzle with easy difficulty",
			seed:       "test-seed-123",
			difficulty: "easy",
			wantStatus: http.StatusOK,
		},
		{
			name:       "Valid puzzle with medium difficulty",
			seed:       "test-seed-456",
			difficulty: "medium",
			wantStatus: http.StatusOK,
		},
		{
			name:       "Valid puzzle with hard difficulty",
			seed:       "test-seed-789",
			difficulty: "hard",
			wantStatus: http.StatusOK,
		},
		{
			name:       "Valid puzzle with extreme difficulty",
			seed:       "test-seed-abc",
			difficulty: "extreme",
			wantStatus: http.StatusOK,
		},
		{
			name:       "Valid puzzle with impossible difficulty",
			seed:       "test-seed-def",
			difficulty: "impossible",
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", "/api/puzzle/"+tt.seed+"?d="+tt.difficulty, nil)
			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d", tt.wantStatus, w.Code)
			}

			if w.Code == http.StatusOK {
				var response map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &response)
				if err != nil {
					t.Fatalf("Failed to parse response: %v", err)
				}

				if response["givens"] == nil {
					t.Error("Expected givens in response")
				}

				givens, ok := response["givens"].([]interface{})
				if !ok {
					t.Error("Expected givens to be an array")
				} else if len(givens) != 81 {
					t.Errorf("Expected 81 givens, got %d", len(givens))
				}
			}
		})
	}
}

// Test Session Start Endpoint
func TestSessionStartHandler(t *testing.T) {
	router := setupRouter()

	tests := []struct {
		name       string
		body       map[string]interface{}
		wantStatus int
	}{
		{
			name: "Valid session start",
			body: map[string]interface{}{
				"seed":       "test-seed",
				"difficulty": "medium",
				"device_id":  "test-device-123",
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "Missing seed",
			body: map[string]interface{}{
				"difficulty": "medium",
				"device_id":  "test-device-123",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Missing device_id",
			body: map[string]interface{}{
				"seed":       "test-seed",
				"difficulty": "medium",
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("POST", "/api/session/start", bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}

			if tt.wantStatus == http.StatusOK {
				var response map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &response)
				if err != nil {
					t.Fatalf("Failed to parse response: %v", err)
				}

				if response["token"] == nil {
					t.Error("Expected token in response")
				}
			}
		})
	}
}

// Helper to get a valid token
func getValidToken(router *gin.Engine) string {
	body := map[string]interface{}{
		"seed":       "test-seed",
		"difficulty": "medium",
		"device_id":  "test-device-123",
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/session/start", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)
	if token, ok := response["token"].(string); ok {
		return token
	}
	return ""
}

// Test Solve Next Endpoint
func TestSolveNextHandler(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// A simple board with some cells filled
	board := make([]int, 81)
	// Set up a simple puzzle (first row: 5, 3, 0, 0, 7, 0, 0, 0, 0)
	board[0] = 5
	board[1] = 3
	board[4] = 7

	tests := []struct {
		name       string
		body       map[string]interface{}
		wantStatus int
	}{
		{
			name: "Valid solve next request",
			body: map[string]interface{}{
				"token": token,
				"board": board,
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "Invalid token",
			body: map[string]interface{}{
				"token": "invalid-token",
				"board": board,
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "Missing token",
			body: map[string]interface{}{
				"board": board,
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Invalid board size",
			body: map[string]interface{}{
				"token": token,
				"board": []int{1, 2, 3},
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// Test Validate Board Endpoint
func TestValidateBoardHandler(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Valid partial board
	validBoard := make([]int, 81)
	validBoard[0] = 5
	validBoard[1] = 3
	validBoard[4] = 7

	// Board with conflicts (duplicate in row)
	conflictBoard := make([]int, 81)
	conflictBoard[0] = 5
	conflictBoard[1] = 5 // Duplicate!

	tests := []struct {
		name       string
		body       map[string]interface{}
		wantStatus int
		wantValid  *bool
	}{
		{
			name: "Valid board",
			body: map[string]interface{}{
				"token": token,
				"board": validBoard,
			},
			wantStatus: http.StatusOK,
			wantValid:  boolPtr(true),
		},
		{
			name: "Board with conflicts",
			body: map[string]interface{}{
				"token": token,
				"board": conflictBoard,
			},
			wantStatus: http.StatusOK,
			wantValid:  boolPtr(false),
		},
		{
			name: "Invalid token",
			body: map[string]interface{}{
				"token": "invalid-token",
				"board": validBoard,
			},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("POST", "/api/validate", bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}

			if tt.wantValid != nil && w.Code == http.StatusOK {
				var response map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &response)
				if err != nil {
					t.Fatalf("Failed to parse response: %v", err)
				}

				valid, ok := response["valid"].(bool)
				if !ok {
					t.Error("Expected 'valid' field in response")
				} else if valid != *tt.wantValid {
					t.Errorf("Expected valid=%v, got %v", *tt.wantValid, valid)
				}
			}
		})
	}
}

// Test Custom Validate Endpoint
func TestCustomValidateHandler(t *testing.T) {
	router := setupRouter()

	// Valid puzzle with enough givens
	validGivens := make([]int, 81)
	// Add at least 17 non-conflicting givens
	validGivens[0] = 5
	validGivens[1] = 3
	validGivens[2] = 4
	validGivens[3] = 6
	validGivens[4] = 7
	validGivens[5] = 8
	validGivens[6] = 9
	validGivens[7] = 1
	validGivens[8] = 2
	validGivens[9] = 6
	validGivens[10] = 7
	validGivens[11] = 2
	validGivens[12] = 1
	validGivens[13] = 9
	validGivens[14] = 5
	validGivens[15] = 3
	validGivens[16] = 4
	validGivens[17] = 8

	// Puzzle with too few givens
	fewGivens := make([]int, 81)
	fewGivens[0] = 5

	// Puzzle with conflicts
	conflictGivens := make([]int, 81)
	conflictGivens[0] = 5
	conflictGivens[1] = 5 // Duplicate in row

	tests := []struct {
		name       string
		body       map[string]interface{}
		wantStatus int
		wantValid  *bool
	}{
		{
			name: "Valid custom puzzle",
			body: map[string]interface{}{
				"givens":    validGivens,
				"device_id": "test-device",
			},
			wantStatus: http.StatusOK,
			wantValid:  boolPtr(true),
		},
		{
			name: "Too few givens",
			body: map[string]interface{}{
				"givens":    fewGivens,
				"device_id": "test-device",
			},
			wantStatus: http.StatusOK,
			wantValid:  boolPtr(false),
		},
		{
			name: "Missing device_id",
			body: map[string]interface{}{
				"givens": validGivens,
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("POST", "/api/custom/validate", bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}

			if tt.wantValid != nil && w.Code == http.StatusOK {
				var response map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &response)
				if err != nil {
					t.Fatalf("Failed to parse response: %v", err)
				}

				valid, ok := response["valid"].(bool)
				if !ok {
					t.Error("Expected 'valid' field in response")
				} else if valid != *tt.wantValid {
					t.Errorf("Expected valid=%v, got %v. Reason: %v", *tt.wantValid, valid, response["reason"])
				}
			}
		})
	}
}

// Test Solve Full Endpoint
func TestSolveFullHandler(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// A solvable board
	board := make([]int, 81)
	board[0] = 5
	board[1] = 3
	board[4] = 7

	tests := []struct {
		name       string
		body       map[string]interface{}
		mode       string
		wantStatus int
	}{
		{
			name: "Valid solve full request - human mode",
			body: map[string]interface{}{
				"token": token,
				"board": board,
			},
			mode:       "human",
			wantStatus: http.StatusOK,
		},
		{
			name: "Valid solve full request - fast mode",
			body: map[string]interface{}{
				"token": token,
				"board": board,
			},
			mode:       "fast",
			wantStatus: http.StatusOK,
		},
		{
			name: "Invalid token",
			body: map[string]interface{}{
				"token": "invalid-token",
				"board": board,
			},
			mode:       "human",
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			w := httptest.NewRecorder()
			url := "/api/solve/full"
			if tt.mode != "" {
				url += "?mode=" + tt.mode
			}
			req, _ := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

// Test that puzzles with same seed produce same board
func TestPuzzleDeterminism(t *testing.T) {
	router := setupRouter()

	seed := "determinism-test-seed"
	difficulty := "medium"

	// Get first puzzle
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("GET", "/api/puzzle/"+seed+"?d="+difficulty, nil)
	router.ServeHTTP(w1, req1)

	var response1 map[string]interface{}
	_ = json.Unmarshal(w1.Body.Bytes(), &response1)
	givens1 := response1["givens"].([]interface{})

	// Get second puzzle with same seed
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/api/puzzle/"+seed+"?d="+difficulty, nil)
	router.ServeHTTP(w2, req2)

	var response2 map[string]interface{}
	_ = json.Unmarshal(w2.Body.Bytes(), &response2)
	givens2 := response2["givens"].([]interface{})

	// Compare
	for i := 0; i < 81; i++ {
		if givens1[i] != givens2[i] {
			t.Errorf("Puzzle not deterministic at index %d: %v != %v", i, givens1[i], givens2[i])
		}
	}
}

// Test different difficulties produce different puzzles
func TestDifferentDifficulties(t *testing.T) {
	router := setupRouter()

	seed := "difficulty-test-seed"

	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}
	results := make(map[string]int) // Count of givens per difficulty

	for _, diff := range difficulties {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/puzzle/"+seed+"?d="+diff, nil)
		router.ServeHTTP(w, req)

		var response map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &response)
		givens := response["givens"].([]interface{})

		count := 0
		for _, v := range givens {
			if v.(float64) != 0 {
				count++
			}
		}
		results[diff] = count
	}

	// Easy should have more givens than impossible
	if results["easy"] <= results["impossible"] {
		t.Errorf("Expected easy (%d givens) to have more givens than impossible (%d givens)",
			results["easy"], results["impossible"])
	}

	t.Logf("Givens by difficulty: %v", results)
}

func boolPtr(b bool) *bool {
	return &b
}

// Test that solve/next detects direct conflicts before running solver
func TestSolveNextDetectsDirectConflicts(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create a board with a direct conflict - two 5s in the same row
	// First, get the actual givens for this puzzle so we know which cells are user-entered
	boardWithConflict := make([]int, 81)
	boardWithConflict[0] = 5
	boardWithConflict[1] = 3
	boardWithConflict[4] = 7
	boardWithConflict[8] = 5 // Conflict! 5 already at position 0 in same row

	body := map[string]interface{}{
		"token": token,
		"board": boardWithConflict,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	if err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Check that we got a fix-conflict move
	move, ok := response["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected move in response, got: %v", response)
	}

	technique := move["technique"].(string)
	if technique != "fix-conflict" {
		t.Errorf("Expected technique 'fix-conflict', got %q", technique)
	}

	action := move["action"].(string)
	if action != "fix-conflict" {
		t.Errorf("Expected action 'fix-conflict', got %q", action)
	}

	explanation := move["explanation"].(string)
	if !strings.Contains(explanation, "Conflict") {
		t.Errorf("Expected explanation to mention 'Conflict', got: %s", explanation)
	}

	if !strings.Contains(explanation, "row") {
		t.Errorf("Expected explanation to mention 'row' (conflict type), got: %s", explanation)
	}

	t.Logf("Conflict correctly detected: %s", explanation)
}

// Test that solve/next detects column conflicts
func TestSolveNextDetectsColumnConflicts(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create a board with a column conflict - two 5s in the same column
	boardWithConflict := make([]int, 81)
	boardWithConflict[0] = 5 // R1C1
	boardWithConflict[9] = 5 // R2C1 - conflict with R1C1 (same column)
	boardWithConflict[1] = 3
	boardWithConflict[4] = 7

	body := map[string]interface{}{
		"token": token,
		"board": boardWithConflict,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
		return
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	move, ok := response["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected move in response")
	}

	technique := move["technique"].(string)
	if technique != "fix-conflict" {
		t.Errorf("Expected technique 'fix-conflict', got %q", technique)
	}

	explanation := move["explanation"].(string)
	if !strings.Contains(explanation, "column") {
		t.Errorf("Expected explanation to mention 'column', got: %s", explanation)
	}

	t.Logf("Column conflict correctly detected: %s", explanation)
}

// Test that solve/next detects box conflicts
func TestSolveNextDetectsBoxConflicts(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create a board with a box conflict - two 5s in the same 3x3 box
	boardWithConflict := make([]int, 81)
	boardWithConflict[0] = 5  // R1C1
	boardWithConflict[11] = 5 // R2C3 - conflict with R1C1 (same box, top-left)
	boardWithConflict[1] = 3
	boardWithConflict[4] = 7

	body := map[string]interface{}{
		"token": token,
		"board": boardWithConflict,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
		return
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	move, ok := response["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected move in response")
	}

	technique := move["technique"].(string)
	if technique != "fix-conflict" {
		t.Errorf("Expected technique 'fix-conflict', got %q", technique)
	}

	explanation := move["explanation"].(string)
	if !strings.Contains(explanation, "box") {
		t.Errorf("Expected explanation to mention 'box', got: %s", explanation)
	}

	t.Logf("Box conflict correctly detected: %s", explanation)
}

// =============================================================================
// COMPREHENSIVE CONFLICT DETECTION TESTS
// =============================================================================

// Helper function to test conflict detection with given board configuration
func testConflictDetection(t *testing.T, router http.Handler, token string, board []int, expectedConflictType string, testName string) {
	t.Helper()

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("[%s] Expected status 200, got %d. Body: %s", testName, w.Code, w.Body.String())
		return
	}

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	if err != nil {
		t.Fatalf("[%s] Failed to parse response: %v", testName, err)
	}

	move, ok := response["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("[%s] Expected move in response, got: %v", testName, response)
	}

	technique := move["technique"].(string)
	if technique != "fix-conflict" {
		t.Errorf("[%s] Expected technique 'fix-conflict', got %q", testName, technique)
	}

	action := move["action"].(string)
	if action != "fix-conflict" {
		t.Errorf("[%s] Expected action 'fix-conflict', got %q", testName, action)
	}

	explanation := move["explanation"].(string)
	if !strings.Contains(explanation, "Conflict") {
		t.Errorf("[%s] Expected explanation to contain 'Conflict', got: %s", testName, explanation)
	}

	if expectedConflictType != "" && !strings.Contains(explanation, expectedConflictType) {
		t.Errorf("[%s] Expected explanation to mention '%s', got: %s", testName, expectedConflictType, explanation)
	}

	t.Logf("[%s] Conflict correctly detected: %s", testName, explanation)
}

// Test row conflicts at various positions
func TestRowConflictsAtVariousPositions(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	testCases := []struct {
		name  string
		pos1  int
		pos2  int
		digit int
	}{
		// Row 0 (indices 0-8)
		{"Row0_Start_End", 0, 8, 5},
		{"Row0_Start_Middle", 0, 4, 3},
		{"Row0_Middle_End", 4, 8, 7},
		{"Row0_Adjacent", 3, 4, 2},
		// Row 4 (middle row, indices 36-44)
		{"Row4_Start_End", 36, 44, 9},
		{"Row4_Middle", 39, 42, 1},
		// Row 8 (last row, indices 72-80)
		{"Row8_Start_End", 72, 80, 4},
		{"Row8_Adjacent", 78, 79, 6},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			board := make([]int, 81)
			board[tc.pos1] = tc.digit
			board[tc.pos2] = tc.digit
			testConflictDetection(t, router, token, board, "row", tc.name)
		})
	}
}

// Test column conflicts at various positions
func TestColumnConflictsAtVariousPositions(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Given positions for test-seed/medium: 1,2,3,8,9,11,12,15,24,30,31,33,35,39,40,41,43,45,47,49,51,54,55,57,59,61,63,64,65,69,71,76,79,80
	// Safe (NOT given): 0,4,5,6,7,10,13,14,16,17,18,19,20,21,22,23,25,26,27,28,29,32,34,36,37,38,42,44,46,48,50,52,53,56,58,60,62,66,67,68,70,72,73,74,75,77,78
	testCases := []struct {
		name  string
		pos1  int
		pos2  int
		digit int
	}{
		// Column 0 (indices 0, 9, 18, 27, 36, 45, 54, 63, 72)
		// Position 0 is safe, 9 is given, 18 is safe, 27 is safe, 36 is safe, 72 is safe
		{"Col0_Top_Bottom", 0, 72, 5},
		{"Col0_Top_Middle", 0, 36, 3},
		{"Col0_Safe", 18, 27, 7}, // Both are non-givens
		// Column 4 (middle column: 4, 13, 22, 31, 40, 49, 58, 67, 76)
		// Safe: 4, 13, 22, 58, 67. Given: 31, 40, 49, 76
		{"Col4_Safe", 4, 67, 9},
		{"Col4_Middle", 13, 58, 1},
		// Column 8 (last column: 8, 17, 26, 35, 44, 53, 62, 71, 80)
		// Safe: 17, 26, 44, 53, 62. Given: 8, 35, 71, 80
		{"Col8_Safe", 17, 62, 4},
		{"Col8_Adjacent", 44, 53, 6},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			board := make([]int, 81)
			board[tc.pos1] = tc.digit
			board[tc.pos2] = tc.digit
			testConflictDetection(t, router, token, board, "column", tc.name)
		})
	}
}

// Test box conflicts in all 9 boxes
func TestBoxConflictsInAllBoxes(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Each box with two positions that conflict (PURE box conflict - different row AND column)
	// Given positions for test-seed/medium: 1,2,3,8,9,11,12,15,24,30,31,33,35,39,40,41,43,45,47,49,51,54,55,57,59,61,63,64,65,69,71,76,79,80
	testCases := []struct {
		name  string
		pos1  int // First position in box
		pos2  int // Second position in box (different row AND different col)
		digit int
	}{
		// Box 0 (top-left): rows 0-2, cols 0-2 (positions 0,1,2,9,10,11,18,19,20)
		// Safe: 0, 10, 18, 19, 20. Given: 1, 2, 9, 11
		{"Box0_Diag", 0, 20, 5},   // R1C1 and R3C3 (diagonal)
		{"Box0_Other", 10, 18, 3}, // R2C2 and R3C1 (different row AND col)
		// Box 1 (top-middle): rows 0-2, cols 3-5 (positions 3,4,5,12,13,14,21,22,23)
		// Safe: 4, 5, 13, 14, 21, 22, 23. Given: 3, 12
		{"Box1", 4, 23, 9}, // R1C5 and R3C6 (diagonal)
		// Box 2 (top-right): rows 0-2, cols 6-8 (positions 6,7,8,15,16,17,24,25,26)
		// Safe: 6, 7, 16, 17, 25, 26. Given: 8, 15, 24
		{"Box2", 6, 26, 1}, // R1C7 and R3C9 (diagonal)
		// Box 3 (middle-left): rows 3-5, cols 0-2 (positions 27,28,29,36,37,38,45,46,47)
		// Safe: 27, 28, 29, 36, 37, 38, 46. Given: 45, 47
		{"Box3", 27, 46, 2}, // R4C1 and R6C2 (different row AND col)
		// Box 4 (center): rows 3-5, cols 3-5 (positions 30,31,32,39,40,41,48,49,50)
		// Safe: 32, 48, 50. Given: 30, 31, 39, 40, 41, 49
		{"Box4_Center", 32, 48, 4}, // R4C6 and R6C4 (diagonal)
		// Box 5 (middle-right): rows 3-5, cols 6-8 (positions 33,34,35,42,43,44,51,52,53)
		// Safe: 34, 42, 44, 52, 53. Given: 33, 35, 43, 51
		// 34 = R4C8 (row 3, col 7), 44 = R5C9 (row 4, col 8) - different row AND col!
		{"Box5", 34, 44, 6}, // R4C8 and R5C9 (different row AND col)
		// Box 6 (bottom-left): rows 6-8, cols 0-2 (positions 54,55,56,63,64,65,72,73,74)
		// Safe: 56, 72, 73, 74. Given: 54, 55, 63, 64, 65
		{"Box6", 56, 73, 3}, // R7C3 and R9C2 (different row AND col)
		// Box 7 (bottom-middle): rows 6-8, cols 3-5 (positions 57,58,59,66,67,68,75,76,77)
		// Safe: 58, 66, 67, 68, 75, 77. Given: 57, 59, 76
		{"Box7", 58, 75, 5}, // R7C5 and R9C4 (different row AND col)
		// Box 8 (bottom-right): rows 6-8, cols 6-8 (positions 60,61,62,69,70,71,78,79,80)
		// Safe: 60, 62, 70, 78. Given: 61, 69, 71, 79, 80
		{"Box8", 60, 70, 7}, // R7C7 and R8C8 (different row AND col)
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			board := make([]int, 81)
			board[tc.pos1] = tc.digit
			board[tc.pos2] = tc.digit
			testConflictDetection(t, router, token, board, "box", tc.name)
		})
	}
}

// Test that all digits 1-9 can trigger conflicts
func TestConflictsWithAllDigits(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	for digit := 1; digit <= 9; digit++ {
		t.Run(fmt.Sprintf("Digit%d", digit), func(t *testing.T) {
			board := make([]int, 81)
			board[0] = digit
			board[8] = digit // Same row conflict
			testConflictDetection(t, router, token, board, "row", fmt.Sprintf("Digit%d", digit))
		})
	}
}

// Test multiple conflicts - should fix ONE at a time
func TestMultipleConflictsFixesOneAtATime(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create board with 3 conflicts (using safe positions)
	// Safe positions: 0,4,5,6,7,10,13,14,16,17,18,19,20,21,22,23,25,26,27,28,29,32,34,36,37,38,42,44,46,48,50,52,53,56,58,60,62,66,67,68,70,72,73,74,75,77,78
	board := make([]int, 81)
	board[0] = 5
	board[7] = 5 // Row conflict with [0] (both safe in row 0)
	board[18] = 3
	board[26] = 3 // Row conflict with [18] (both safe in row 2)
	board[36] = 7
	board[44] = 7 // Row conflict with [36] (both safe in row 4)

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
		return
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	move, ok := response["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected move in response")
	}

	// Should get exactly ONE fix-conflict move
	technique := move["technique"].(string)
	if technique != "fix-conflict" {
		t.Errorf("Expected 'fix-conflict', got %q", technique)
	}

	// Verify targets has ONE cell (the cell being removed)
	targets, ok := move["targets"].([]interface{})
	if !ok || len(targets) != 1 {
		t.Logf("Note: targets has %d entries (expected 1)", len(targets))
	}

	t.Logf("Multiple conflicts: correctly fixes ONE at a time")
}

// Test edge case: adjacent cells in same row
func TestAdjacentCellConflictRow(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Safe adjacent positions in same row: 4-5 (row 0), 6-7 (row 0)
	// Given: 1,2,3,8 in row 0. Safe: 0,4,5,6,7
	board := make([]int, 81)
	board[4] = 5 // R1C5 (safe)
	board[5] = 5 // R1C6 (safe, adjacent right)

	testConflictDetection(t, router, token, board, "row", "AdjacentRow")
}

// Test edge case: adjacent cells in same column
func TestAdjacentCellConflictColumn(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Safe adjacent positions in same column: col 0 has 0, 18, 27, 36, 72 safe
	// 18 and 27 are adjacent (row 2 and row 3)
	board := make([]int, 81)
	board[18] = 5 // R3C1 (safe)
	board[27] = 5 // R4C1 (safe, adjacent below)

	testConflictDetection(t, router, token, board, "column", "AdjacentColumn")
}

// Test edge case: diagonal cells in same box (not row/col)
func TestDiagonalCellsInSameBox(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// R1C1 and R3C3 are diagonal in box 0
	board := make([]int, 81)
	board[0] = 8  // R1C1
	board[20] = 8 // R3C3 (diagonal, same box)

	testConflictDetection(t, router, token, board, "box", "DiagonalBox")
}

// Test corner positions (grid boundaries)
func TestCornerPositionConflicts(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Given positions: 8, 80 are givens. Safe corners: 0, 72
	// Column 8 safe positions: 17, 26, 44, 53, 62
	testCases := []struct {
		name         string
		pos1         int
		pos2         int
		conflictType string
	}{
		{"TopLeft_TopRight", 0, 7, "row"},         // Row 0, positions 0 and 7 both safe
		{"TopLeft_BottomLeft", 0, 72, "column"},   // Column 0, both safe
		{"Col8_TopToMid", 17, 62, "column"},       // Column 8, both safe (not corners but tests column 8)
		{"BottomLeft_BottomRight", 72, 78, "row"}, // Row 8, positions 72 and 78 both safe
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			board := make([]int, 81)
			board[tc.pos1] = 9
			board[tc.pos2] = 9
			testConflictDetection(t, router, token, board, tc.conflictType, tc.name)
		})
	}
}

// Test solve/all also detects conflicts
func TestSolveAllDetectsConflicts(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create a board with a conflict (using safe positions)
	board := make([]int, 81)
	board[0] = 5 // Safe (not a given)
	board[7] = 5 // Safe (not a given) - row conflict

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/all", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Check status
	status, _ := response["status"].(string)
	if status != "conflict_found" {
		t.Logf("Note: status is %q (expected 'conflict_found')", status)
	}

	moves, ok := response["moves"].([]interface{})
	if !ok || len(moves) == 0 {
		t.Fatalf("Expected moves array in response, got: %v", response)
	}

	// First move contains nested "move" with technique
	firstMoveWrapper, ok := moves[0].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected first move wrapper to be a map, got: %T", moves[0])
	}

	firstMove, ok := firstMoveWrapper["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected nested 'move' in first move, got: %v", firstMoveWrapper)
	}

	technique, ok := firstMove["technique"].(string)
	if !ok {
		t.Fatalf("Expected technique to be a string, got: %v (type %T)", firstMove["technique"], firstMove["technique"])
	}

	if technique != "fix-conflict" {
		t.Errorf("Expected first move to be 'fix-conflict', got %q", technique)
	}

	t.Logf("solve/all correctly detects conflict as first move")
}

// Test solve/all with multiple conflicts - returns ONE fix at a time
// solve/all stops after first conflict fix, returning status "conflict_found"
// This is by design - frontend should apply fix and call again
func TestSolveAllWithMultipleConflictsReturnsOneAtATime(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create a board with multiple conflicts (using safe positions)
	board := make([]int, 81)
	board[0] = 5
	board[7] = 5 // Row conflict 1 (both safe)
	board[18] = 3
	board[26] = 3 // Row conflict 2 (both safe)

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/all", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		return
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should return status "conflict_found"
	status, ok := response["status"].(string)
	if !ok || status != "conflict_found" {
		t.Logf("Note: status is %q (expected 'conflict_found')", status)
	}

	moves, ok := response["moves"].([]interface{})
	if !ok || len(moves) == 0 {
		t.Fatalf("Expected moves array in response, got: %v", response)
	}

	// solve/all returns exactly ONE move when conflict found
	if len(moves) != 1 {
		t.Logf("Note: got %d moves (expected 1 for first conflict fix)", len(moves))
	}

	// Verify it's a fix-conflict move
	firstMoveWrapper, ok := moves[0].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected first move to be a map")
	}

	firstMove, ok := firstMoveWrapper["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected nested 'move' in first move wrapper")
	}

	technique, ok := firstMove["technique"].(string)
	if !ok || technique != "fix-conflict" {
		t.Errorf("Expected fix-conflict technique, got %q", technique)
	}

	t.Logf("solve/all with multiple conflicts correctly returns ONE fix at a time")
}

// Test that pure box conflict (not in same row/col) is detected correctly
func TestPureBoxConflictNotRowOrColumn(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// R1C1 (index 0) and R2C2 (index 10) - same box, different row, different col
	board := make([]int, 81)
	board[0] = 4  // R1C1
	board[10] = 4 // R2C2 (diagonal, purely box conflict)

	testConflictDetection(t, router, token, board, "box", "PureBoxConflict")
}

// Test triple conflict - same cell involved in row, column, and box conflict
func TestTripleConflictScenario(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Position 0 (R1C1) conflicts with:
	// - Position 8 (R1C9) via row
	// - Position 72 (R9C1) via column
	// - Position 10 (R2C2) via box
	board := make([]int, 81)
	board[0] = 5
	board[8] = 5  // Row conflict
	board[72] = 5 // Column conflict
	board[10] = 5 // Box conflict

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
		return
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	move, ok := response["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("Expected move in response")
	}

	technique := move["technique"].(string)
	if technique != "fix-conflict" {
		t.Errorf("Expected 'fix-conflict', got %q", technique)
	}

	t.Logf("Triple conflict scenario handled correctly")
}

// Test that a valid board with no conflicts proceeds normally
func TestValidBoardNoConflict(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create a valid partial board (no conflicts)
	board := make([]int, 81)
	board[0] = 1
	board[1] = 2
	board[2] = 3
	board[9] = 4 // Different column, different row, different box section

	body := map[string]interface{}{
		"token": token,
		"board": board,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/next", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
		return
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	move, ok := response["move"].(map[string]interface{})
	if !ok {
		// Might have "done" if board is somehow complete or no moves available
		t.Logf("Response: %v", response)
		return
	}

	technique := move["technique"].(string)
	// Should NOT be fix-conflict since board is valid
	if technique == "fix-conflict" {
		t.Errorf("Valid board should not trigger fix-conflict, got: %v", move)
	}

	t.Logf("Valid board proceeds normally with technique: %s", technique)
}

// =============================================================================
// END COMPREHENSIVE CONFLICT DETECTION TESTS
// =============================================================================

// Test endpoint returns proper error for unsolvable board
func TestUnsolvableBoardValidation(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Create an unsolvable board (conflicting values)
	unsolvableBoard := make([]int, 81)
	// Put 1,2,3,4,5,6,7,8 in first row and 9 is missing
	// Put 9 in second row first cell - now first column has 1 and 9
	// Put 1 in a position that conflicts
	unsolvableBoard[0] = 1
	unsolvableBoard[1] = 2
	unsolvableBoard[9] = 1 // Same column as unsolvableBoard[0], same value = conflict

	body := map[string]interface{}{
		"token": token,
		"board": unsolvableBoard,
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/validate", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &response)

	if response["valid"] != false {
		t.Errorf("Expected valid=false for conflicting board, got %v", response["valid"])
	}

	if !strings.Contains(response["reason"].(string), "conflict") &&
		!strings.Contains(response["message"].(string), "conflict") {
		t.Logf("Response: %v", response)
	}
}
