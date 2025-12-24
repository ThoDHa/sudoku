package puzzles

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Test fixture: minimal valid puzzle data
const validPuzzleJSON = `{
	"version": 1,
	"count": 2,
	"puzzles": [
		{
			"s": "157924638362158974498736512531279486926483157784615293273561849619847325845392761",
			"g": {
				"e": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39],
				"m": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,27,28,29,30,31,32,33,34,35],
				"h": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,27,28,29,30],
				"x": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
				"i": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
			}
		},
		{
			"s": "234978561978651432651342978492563817367814295815729346546297183789135624123486759",
			"g": {
				"e": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39],
				"m": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,27,28,29,30,31,32,33,34,35],
				"h": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,27,28,29,30],
				"x": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
				"i": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
			}
		}
	]
}`

// createTempPuzzleFile creates a temporary puzzle file for testing
func createTempPuzzleFile(t *testing.T, content string) string {
	t.Helper()
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test_puzzles.json")
	err := os.WriteFile(path, []byte(content), 0644)
	if err != nil {
		t.Fatalf("failed to create temp puzzle file: %v", err)
	}
	return path
}

// ============================================================================
// Load() Tests
// ============================================================================

func TestLoad_ValidFile(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)

	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	if loader == nil {
		t.Fatal("Load() returned nil loader")
	}
	if loader.Count() != 2 {
		t.Errorf("Expected 2 puzzles, got %d", loader.Count())
	}
}

func TestLoad_NonExistentFile(t *testing.T) {
	_, err := Load("/nonexistent/path/puzzles.json")
	if err == nil {
		t.Error("Load() should fail for non-existent file")
	}
}

func TestLoad_MalformedJSON(t *testing.T) {
	path := createTempPuzzleFile(t, "{ this is not valid json }")

	_, err := Load(path)
	if err == nil {
		t.Error("Load() should fail for malformed JSON")
	}
}

func TestLoad_EmptyFile(t *testing.T) {
	path := createTempPuzzleFile(t, "")

	_, err := Load(path)
	if err == nil {
		t.Error("Load() should fail for empty file")
	}
}

func TestLoad_EmptyPuzzleArray(t *testing.T) {
	path := createTempPuzzleFile(t, `{"version": 1, "count": 0, "puzzles": []}`)

	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	if loader.Count() != 0 {
		t.Errorf("Expected 0 puzzles, got %d", loader.Count())
	}
}

// ============================================================================
// NewLoaderFromPuzzles() Tests
// ============================================================================

func TestNewLoaderFromPuzzles(t *testing.T) {
	puzzles := []CompactPuzzle{
		{S: "123456789" + "234567891" + "345678912" + "456789123" + "567891234" + "678912345" + "789123456" + "891234567" + "912345678", G: map[string][]int{"e": {0, 1, 2}}},
	}
	loader := NewLoaderFromPuzzles(puzzles)
	if loader.Count() != 1 {
		t.Errorf("Expected 1 puzzle, got %d", loader.Count())
	}
}

// ============================================================================
// Count() Tests
// ============================================================================

func TestCount(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	count := loader.Count()
	if count != 2 {
		t.Errorf("Expected count 2, got %d", count)
	}
}

func TestCount_EmptyLoader(t *testing.T) {
	loader := NewLoaderFromPuzzles([]CompactPuzzle{})
	if loader.Count() != 0 {
		t.Errorf("Expected 0 puzzles, got %d", loader.Count())
	}
}

// ============================================================================
// GetPuzzle() Tests
// ============================================================================

func TestGetPuzzle_ValidIndex(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	givens, solution, err := loader.GetPuzzle(0, "easy")
	if err != nil {
		t.Fatalf("GetPuzzle() failed: %v", err)
	}
	if len(givens) != 81 {
		t.Errorf("Expected 81 givens, got %d", len(givens))
	}
	if len(solution) != 81 {
		t.Errorf("Expected 81 solution cells, got %d", len(solution))
	}
}

func TestGetPuzzle_AllDifficulties(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}
	for _, diff := range difficulties {
		t.Run(diff, func(t *testing.T) {
			givens, solution, err := loader.GetPuzzle(0, diff)
			if err != nil {
				t.Fatalf("GetPuzzle() failed for difficulty %s: %v", diff, err)
			}
			if len(givens) != 81 {
				t.Errorf("Expected 81 givens, got %d", len(givens))
			}
			if len(solution) != 81 {
				t.Errorf("Expected 81 solution cells, got %d", len(solution))
			}

			// Verify givens are subset of solution
			for i, g := range givens {
				if g != 0 && g != solution[i] {
					t.Errorf("Given at index %d (%d) doesn't match solution (%d)", i, g, solution[i])
				}
			}
		})
	}
}

func TestGetPuzzle_NegativeIndex(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, _, err = loader.GetPuzzle(-1, "easy")
	if err == nil {
		t.Error("GetPuzzle() should fail for negative index")
	}
}

func TestGetPuzzle_IndexOutOfBounds(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, _, err = loader.GetPuzzle(100, "easy")
	if err == nil {
		t.Error("GetPuzzle() should fail for out-of-bounds index")
	}
}

func TestGetPuzzle_UnknownDifficulty(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, _, err = loader.GetPuzzle(0, "nightmare")
	if err == nil {
		t.Error("GetPuzzle() should fail for unknown difficulty")
	}
}

func TestGetPuzzle_SolutionValuesInRange(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, solution, err := loader.GetPuzzle(0, "easy")
	if err != nil {
		t.Fatalf("GetPuzzle() failed: %v", err)
	}

	for i, v := range solution {
		if v < 1 || v > 9 {
			t.Errorf("Solution value at index %d out of range: %d", i, v)
		}
	}
}

func TestGetPuzzle_DifferentPuzzles(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, solution1, err := loader.GetPuzzle(0, "easy")
	if err != nil {
		t.Fatalf("GetPuzzle(0) failed: %v", err)
	}

	_, solution2, err := loader.GetPuzzle(1, "easy")
	if err != nil {
		t.Fatalf("GetPuzzle(1) failed: %v", err)
	}

	// Solutions should be different
	same := true
	for i := range solution1 {
		if solution1[i] != solution2[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("Different puzzle indices should return different puzzles")
	}
}

// ============================================================================
// GetPuzzleBySeed() Tests
// ============================================================================

func TestGetPuzzleBySeed_Determinism(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	seed := "test-seed-123"

	givens1, solution1, idx1, err := loader.GetPuzzleBySeed(seed, "easy")
	if err != nil {
		t.Fatalf("GetPuzzleBySeed() first call failed: %v", err)
	}

	givens2, solution2, idx2, err := loader.GetPuzzleBySeed(seed, "easy")
	if err != nil {
		t.Fatalf("GetPuzzleBySeed() second call failed: %v", err)
	}

	// Same seed should return same puzzle
	if idx1 != idx2 {
		t.Errorf("Same seed should return same index: got %d and %d", idx1, idx2)
	}

	for i := range givens1 {
		if givens1[i] != givens2[i] {
			t.Errorf("Givens mismatch at index %d", i)
		}
		if solution1[i] != solution2[i] {
			t.Errorf("Solution mismatch at index %d", i)
		}
	}
}

func TestGetPuzzleBySeed_DifferentSeeds(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, _, idx1, err := loader.GetPuzzleBySeed("seed-alpha", "easy")
	if err != nil {
		t.Fatalf("GetPuzzleBySeed() failed: %v", err)
	}

	_, _, idx2, err := loader.GetPuzzleBySeed("seed-beta", "easy")
	if err != nil {
		t.Fatalf("GetPuzzleBySeed() failed: %v", err)
	}

	// Different seeds should (usually) produce different indices
	// With only 2 puzzles, there's a 50% chance of collision, so we just verify both are valid
	if idx1 < 0 || idx1 >= 2 {
		t.Errorf("Index out of range: %d", idx1)
	}
	if idx2 < 0 || idx2 >= 2 {
		t.Errorf("Index out of range: %d", idx2)
	}
}

func TestGetPuzzleBySeed_EmptyLoader(t *testing.T) {
	loader := NewLoaderFromPuzzles([]CompactPuzzle{})

	_, _, _, err := loader.GetPuzzleBySeed("any-seed", "easy")
	if err == nil {
		t.Error("GetPuzzleBySeed() should fail with no puzzles loaded")
	}
}

func TestGetPuzzleBySeed_EmptySeed(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Empty seed should still work (hash of empty string)
	_, _, _, err = loader.GetPuzzleBySeed("", "easy")
	if err != nil {
		t.Fatalf("GetPuzzleBySeed() with empty seed failed: %v", err)
	}
}

func TestGetPuzzleBySeed_InvalidDifficulty(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, _, _, err = loader.GetPuzzleBySeed("test-seed", "invalid")
	if err == nil {
		t.Error("GetPuzzleBySeed() should fail for invalid difficulty")
	}
}

// ============================================================================
// GetDailyPuzzle() Tests
// ============================================================================

func TestGetDailyPuzzle_Consistency(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	date := time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC)

	givens1, _, idx1, err := loader.GetDailyPuzzle(date, "easy")
	if err != nil {
		t.Fatalf("GetDailyPuzzle() first call failed: %v", err)
	}

	givens2, _, idx2, err := loader.GetDailyPuzzle(date, "easy")
	if err != nil {
		t.Fatalf("GetDailyPuzzle() second call failed: %v", err)
	}

	// Same date should return same puzzle
	if idx1 != idx2 {
		t.Errorf("Same date should return same index: got %d and %d", idx1, idx2)
	}

	for i := range givens1 {
		if givens1[i] != givens2[i] {
			t.Errorf("Givens mismatch at index %d", i)
		}
	}
}

func TestGetDailyPuzzle_DifferentDates(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	date1 := time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC)
	date2 := time.Date(2024, 12, 26, 0, 0, 0, 0, time.UTC)

	_, _, idx1, err := loader.GetDailyPuzzle(date1, "easy")
	if err != nil {
		t.Fatalf("GetDailyPuzzle() failed: %v", err)
	}

	_, _, idx2, err := loader.GetDailyPuzzle(date2, "easy")
	if err != nil {
		t.Fatalf("GetDailyPuzzle() failed: %v", err)
	}

	// Different dates should (usually) produce different puzzles
	// With 2 puzzles, collision possible but indices should be valid
	if idx1 < 0 || idx1 >= 2 {
		t.Errorf("Index out of range: %d", idx1)
	}
	if idx2 < 0 || idx2 >= 2 {
		t.Errorf("Index out of range: %d", idx2)
	}
}

func TestGetDailyPuzzle_TimeZoneNormalization(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// Same date in different timezones should produce same puzzle (UTC normalization)
	utcDate := time.Date(2024, 12, 25, 12, 0, 0, 0, time.UTC)
	pstLoc, _ := time.LoadLocation("America/Los_Angeles")
	pstDate := time.Date(2024, 12, 25, 4, 0, 0, 0, pstLoc) // Same moment as UTC 12:00

	// Note: The function uses date.UTC().Format("2006-01-02"), so different times
	// on the same UTC date should produce the same puzzle
	_, _, idx1, err := loader.GetDailyPuzzle(utcDate, "easy")
	if err != nil {
		t.Fatalf("GetDailyPuzzle() failed: %v", err)
	}

	// PST 4:00 AM on Dec 25 = UTC 12:00 PM on Dec 25
	_, _, idx2, err := loader.GetDailyPuzzle(pstDate, "easy")
	if err != nil {
		t.Fatalf("GetDailyPuzzle() failed: %v", err)
	}

	if idx1 != idx2 {
		t.Errorf("Same UTC date should return same puzzle: got indices %d and %d", idx1, idx2)
	}
}

func TestGetDailyPuzzle_AllDifficulties(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	date := time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC)
	difficulties := []string{"easy", "medium", "hard", "extreme", "impossible"}

	for _, diff := range difficulties {
		t.Run(diff, func(t *testing.T) {
			givens, solution, _, err := loader.GetDailyPuzzle(date, diff)
			if err != nil {
				t.Fatalf("GetDailyPuzzle() failed for %s: %v", diff, err)
			}
			if len(givens) != 81 {
				t.Errorf("Expected 81 givens, got %d", len(givens))
			}
			if len(solution) != 81 {
				t.Errorf("Expected 81 solution cells, got %d", len(solution))
			}
		})
	}
}

// ============================================================================
// GetTodayPuzzle() Tests
// ============================================================================

func TestGetTodayPuzzle_ReturnsValidPuzzle(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	givens, solution, idx, err := loader.GetTodayPuzzle("easy")
	if err != nil {
		t.Fatalf("GetTodayPuzzle() failed: %v", err)
	}

	if len(givens) != 81 {
		t.Errorf("Expected 81 givens, got %d", len(givens))
	}
	if len(solution) != 81 {
		t.Errorf("Expected 81 solution cells, got %d", len(solution))
	}
	if idx < 0 || idx >= 2 {
		t.Errorf("Index out of range: %d", idx)
	}
}

func TestGetTodayPuzzle_InvalidDifficulty(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	_, _, _, err = loader.GetTodayPuzzle("super-hard")
	if err == nil {
		t.Error("GetTodayPuzzle() should fail for invalid difficulty")
	}
}

// ============================================================================
// DifficultyKey Mapping Tests
// ============================================================================

func TestDifficultyKeyMapping(t *testing.T) {
	expectedMappings := map[string]string{
		"easy":       "e",
		"medium":     "m",
		"hard":       "h",
		"extreme":    "x",
		"impossible": "i",
	}

	for full, key := range expectedMappings {
		if DifficultyKey[full] != key {
			t.Errorf("DifficultyKey[%q] = %q, expected %q", full, DifficultyKey[full], key)
		}
	}
}

func TestKeyToDifficultyMapping(t *testing.T) {
	expectedMappings := map[string]string{
		"e": "easy",
		"m": "medium",
		"h": "hard",
		"x": "extreme",
		"i": "impossible",
	}

	for key, full := range expectedMappings {
		if KeyToDifficulty[key] != full {
			t.Errorf("KeyToDifficulty[%q] = %q, expected %q", key, KeyToDifficulty[key], full)
		}
	}
}

// ============================================================================
// Global Loader Tests
// ============================================================================

func TestSetGlobal(t *testing.T) {
	// Save original
	original := Global()
	defer SetGlobal(original)

	// Create and set test loader
	testLoader := NewLoaderFromPuzzles([]CompactPuzzle{
		{S: "123456789234567891345678912456789123567891234678912345789123456891234567912345678", G: map[string][]int{"e": {0}}},
	})
	SetGlobal(testLoader)

	if Global() != testLoader {
		t.Error("SetGlobal() did not set the global loader correctly")
	}
	if Global().Count() != 1 {
		t.Errorf("Expected 1 puzzle in global loader, got %d", Global().Count())
	}
}

// ============================================================================
// Edge Case Tests
// ============================================================================

func TestGetPuzzle_MissingDifficultyInPuzzle(t *testing.T) {
	// Create puzzle missing the "extreme" difficulty
	puzzleJSON := `{
		"version": 1,
		"count": 1,
		"puzzles": [{
			"s": "157924638362158974498736512531279486926483157784615293273561849619847325845392761",
			"g": {
				"e": [0,1,2,3,4,5,6,7,8],
				"m": [0,1,2,3,4,5,6,7,8]
			}
		}]
	}`
	path := createTempPuzzleFile(t, puzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	// "extreme" maps to "x" which is not in the puzzle
	_, _, err = loader.GetPuzzle(0, "extreme")
	if err == nil {
		t.Error("GetPuzzle() should fail when difficulty not found in puzzle")
	}
}

func TestGetPuzzle_GivensMatchSolution(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	givens, solution, err := loader.GetPuzzle(0, "easy")
	if err != nil {
		t.Fatalf("GetPuzzle() failed: %v", err)
	}

	nonZeroCount := 0
	for i, g := range givens {
		if g != 0 {
			nonZeroCount++
			if g != solution[i] {
				t.Errorf("Given value %d at index %d doesn't match solution value %d", g, i, solution[i])
			}
		}
	}

	if nonZeroCount == 0 {
		t.Error("Expected at least some given values")
	}
}

func TestGetPuzzle_HarderDifficultyHasFewerGivens(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	countGivens := func(givens []int) int {
		count := 0
		for _, g := range givens {
			if g != 0 {
				count++
			}
		}
		return count
	}

	easyGivens, _, _ := loader.GetPuzzle(0, "easy")
	hardGivens, _, _ := loader.GetPuzzle(0, "hard")
	impossibleGivens, _, _ := loader.GetPuzzle(0, "impossible")

	easyCount := countGivens(easyGivens)
	hardCount := countGivens(hardGivens)
	impossibleCount := countGivens(impossibleGivens)

	if easyCount <= hardCount {
		t.Errorf("Easy should have more givens than hard: easy=%d, hard=%d", easyCount, hardCount)
	}
	if hardCount <= impossibleCount {
		t.Errorf("Hard should have more givens than impossible: hard=%d, impossible=%d", hardCount, impossibleCount)
	}
}
