package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"sudoku-api/pkg/config"
)

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
