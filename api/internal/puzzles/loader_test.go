package puzzles

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"sudoku-api/pkg/constants"
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

// Load() Tests

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

// NewLoaderFromPuzzles() Tests

func TestNewLoaderFromPuzzles(t *testing.T) {
	puzzles := []CompactPuzzle{
		{S: "123456789" + "234567891" + "345678912" + "456789123" + "567891234" + "678912345" + "789123456" + "891234567" + "912345678", G: map[string][]int{"e": {0, 1, 2}}},
	}
	loader := NewLoaderFromPuzzles(puzzles)
	if loader.Count() != 1 {
		t.Errorf("Expected 1 puzzle, got %d", loader.Count())
	}
}

// Count() Tests

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

// GetPuzzle() Tests

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

func TestGetPuzzle_MalformedSolutionStringReturnsError(t *testing.T) {
	cases := []struct {
		name     string
		solution string
	}{
		{"too short", "123"},
		{"too long", strings.Repeat("1", constants.TotalCells+1)},
		{"non-digit character", strings.Repeat("1", constants.TotalCells-1) + "x"},
		{"zero digit", strings.Repeat("1", constants.TotalCells-1) + "0"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			loader := NewLoaderFromPuzzles([]CompactPuzzle{
				{S: tc.solution, G: map[string][]int{"e": {0}}},
			})
			_, _, err := loader.GetPuzzle(0, "easy")
			if err == nil {
				t.Fatal("GetPuzzle() should return an error for a malformed solution string")
			}
		})
	}
}

func TestGetPuzzle_GivensIndexOutOfBoundsReturnsError(t *testing.T) {
	validSolution := "157924638362158974498736512531279486926483157784615293273561849619847325845392761"
	cases := []struct {
		name  string
		index int
	}{
		{"equal to total cells", constants.TotalCells},
		{"greater than total cells", constants.TotalCells + 5},
		{"negative", -1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			loader := NewLoaderFromPuzzles([]CompactPuzzle{
				{S: validSolution, G: map[string][]int{"e": {0, tc.index}}},
			})
			_, _, err := loader.GetPuzzle(0, "easy")
			if err == nil {
				t.Fatal("GetPuzzle() should return an error for an out-of-range givens index")
			}
		})
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

// GetPuzzleBySeed() Tests

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

// GetDailyPuzzle() Tests

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

// GetTodayPuzzle() Tests

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

// --- BUG-15: daily seed and index must agree ---

// TestDailySeed_CanonicalForm pins the exact seed string both dailyHandler and
// GetDailyPuzzle derive their index from. A client fetching /puzzle/<seed>
// receives the puzzle at GetPuzzleBySeed(<seed>); if the seed format drifts
// from what GetDailyPuzzle hashes, the advertised index and the served puzzle
// silently diverge.
func TestDailySeed_CanonicalForm(t *testing.T) {
	cases := []struct {
		name string
		date time.Time
		want string
	}{
		{"UTC date", time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC), "D2026-07-10"},
		{"timezone normalized to UTC", tzDate(t, 2026, 7, 10, 4, 0, "America/Los_Angeles"), "D2026-07-10"},
		{"year boundary", time.Date(2027, 1, 1, 23, 59, 0, 0, time.UTC), "D2027-01-01"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DailySeed(tc.date); got != tc.want {
				t.Errorf("DailySeed(%v) = %q, want %q", tc.date, got, tc.want)
			}
		})
	}
}

// TestGetDailyPuzzle_IndexMatchesGetPuzzleBySeed is the core BUG-15 regression
// assertion: the index returned by GetDailyPuzzle must equal the index a client
// gets by calling GetPuzzleBySeed with the advertised daily seed string. Before
// the fix the two hashed different strings ("daily:<date>" vs "D<date>") and
// landed on different puzzles for the same day.
func TestGetDailyPuzzle_IndexMatchesGetPuzzleBySeed(t *testing.T) {
	path := createTempPuzzleFile(t, validPuzzleJSON)
	loader, err := Load(path)
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	dates := []time.Time{
		time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 7, 11, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC),
		time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 2, 29, 0, 0, 0, 0, time.UTC),
	}

	for _, date := range dates {
		seed := DailySeed(date)
		_, _, dailyIdx, err := loader.GetDailyPuzzle(date, "medium")
		if err != nil {
			t.Fatalf("GetDailyPuzzle(%v): %v", date, err)
		}
		_, _, fetchIdx, err := loader.GetPuzzleBySeed(seed, "medium")
		if err != nil {
			t.Fatalf("GetPuzzleBySeed(%v): %v", seed, err)
		}
		if dailyIdx != fetchIdx {
			t.Errorf("date %v: daily index %d != seed-fetched index %d (seed=%q)",
				date.UTC().Format("2006-01-02"), dailyIdx, fetchIdx, seed)
		}
	}
}

// TestGetDailyPuzzle_IndexMatchesGetPuzzleBySeedLargeLoader repeats the
// consistency check against a larger pool so a collision at count==2 cannot
// mask a real divergence (with 2 puzzles the index space is [0,1] and a
// mismatch is only detectable on roughly half of dates).
func TestGetDailyPuzzle_IndexMatchesGetPuzzleBySeedLargeLoader(t *testing.T) {
	const n = 1000
	reps := make([]CompactPuzzle, 0, n)
	for range n {
		reps = append(reps, CompactPuzzle{
			S: "157924638362158974498736512531279486926483157784615293273561849619847325845392761",
			G: map[string][]int{"m": {0, 1, 2}},
		})
	}
	loader := NewLoaderFromPuzzles(reps)

	for d := 1; d <= 28; d++ {
		date := time.Date(2026, 7, d, 0, 0, 0, 0, time.UTC)
		seed := DailySeed(date)
		_, _, dailyIdx, err := loader.GetDailyPuzzle(date, "medium")
		if err != nil {
			t.Fatalf("GetDailyPuzzle(%v): %v", date, err)
		}
		_, _, fetchIdx, err := loader.GetPuzzleBySeed(seed, "medium")
		if err != nil {
			t.Fatalf("GetPuzzleBySeed(%v): %v", seed, err)
		}
		if dailyIdx != fetchIdx {
			t.Fatalf("date %v: daily index %d != seed-fetched index %d (seed=%q)",
				date.UTC().Format("2006-01-02"), dailyIdx, fetchIdx, seed)
		}
	}
}

// tzDate builds a time.Time in the named location, failing the test if the
// location cannot be loaded. Used by DailySeed timezone-normalization cases.
func tzDate(t *testing.T, year, month, day, hour int, min int, locName string) time.Time {
	t.Helper()
	loc, err := time.LoadLocation(locName)
	if err != nil {
		t.Fatalf("LoadLocation(%q): %v", locName, err)
	}
	return time.Date(year, time.Month(month), day, hour, min, 0, 0, loc)
}

// DifficultyKey Mapping Tests

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

// Global Loader Tests

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

// Edge Case Tests

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

// LoadGlobal() Tests

func TestLoadGlobal(t *testing.T) {
	// sync.Once fires LoadGlobal's closure exactly once per process; subtests
	// are sequenced (no t.Parallel) so the first call drives the closure body
	// and later calls verify the cached return path.
	t.Run("ErrorPathFiresClosure", func(t *testing.T) {
		if err := LoadGlobal("/nonexistent/sudoku/puzzles.json"); err == nil {
			t.Fatal("LoadGlobal should return error for nonexistent path on first call")
		}
		if Global() != nil {
			t.Error("Global() should be nil after failed LoadGlobal")
		}
	})

	t.Run("CachedErrorPersistsAfterOnceFired", func(t *testing.T) {
		// Once already fired; the path argument is ignored.
		path := createTempPuzzleFile(t, validPuzzleJSON)
		if err := LoadGlobal(path); err == nil {
			t.Fatal("LoadGlobal should return cached error after Once fired")
		}
		if Global() != nil {
			t.Error("Global() should remain nil after Once fired with error")
		}
	})

	t.Run("SetGlobalSurfacesLoaderInstance", func(t *testing.T) {
		// SetGlobal replaces globalLoader without resetting loadOnce.
		original := Global()
		defer SetGlobal(original)
		injected := NewLoaderFromPuzzles([]CompactPuzzle{
			{S: "157924638362158974498736512531279486926483157784615293273561849619847325845392761",
				G: map[string][]int{"e": {0}}},
		})
		SetGlobal(injected)
		if Global() != injected {
			t.Error("Global() should return the loader set by SetGlobal")
		}
		if Global().Count() != 1 {
			t.Errorf("expected 1 puzzle, got %d", Global().Count())
		}
	})
}
