package human

import (
	"encoding/json"
	"os"
	"testing"

	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/pkg/constants"
)

// =============================================================================
// ISOLATED TECHNIQUE TESTS
//
// Each technique has its own test function that:
// 1. Loads a puzzle known to use that technique
// 2. Creates an isolated solver with only the target technique + basic singles
// 3. Runs until the technique fires
// 4. Validates the move against the DP solver solution
//
// Deep validation ensures:
// - Assignments match the correct solution digit
// - Eliminations do not remove the solution digit from any cell
// =============================================================================

// loadTestPuzzle loads a puzzle for testing, either from puzzles.json or from a string
func loadTestPuzzle(t *testing.T, data TechniquePuzzleData) ([]int, []int) {
	t.Helper()

	if data.PuzzleIndex >= 0 {
		// Load from puzzles.json
		puzzlePath := "../../../../frontend/puzzles.json"

		loader, err := puzzles.Load(puzzlePath)
		if err != nil {
			t.Fatalf("Failed to load puzzles.json: %v", err)
		}

		givens, solution, err := loader.GetPuzzle(data.PuzzleIndex, data.Difficulty)
		if err != nil {
			t.Fatalf("Failed to get puzzle %d at difficulty %s: %v", data.PuzzleIndex, data.Difficulty, err)
		}

		return givens, solution
	}

	// Parse puzzle string
	if len(data.PuzzleString) != 81 {
		t.Fatalf("Invalid puzzle string length: %d (expected 81)", len(data.PuzzleString))
	}

	givens := make([]int, 81)
	for i, c := range data.PuzzleString {
		if c >= '1' && c <= '9' {
			givens[i] = int(c - '0')
		}
	}

	// Get solution from DP solver
	solution := dp.Solve(givens)
	if solution == nil {
		t.Fatalf("DP solver cannot solve puzzle: %s", data.PuzzleString)
	}

	return givens, solution
}

// validateMoveAgainstSolution validates that a move is correct according to the DP solution
func validateMoveAgainstSolution(t *testing.T, board *Board, solution []int, technique string) {
	t.Helper()

	// Check all cells after the move
	for i := 0; i < 81; i++ {
		// If cell has a value, it must match the solution
		if board.Cells[i] != 0 {
			if board.Cells[i] != solution[i] {
				t.Errorf("%s: Cell %d has incorrect value %d (expected %d)",
					technique, i, board.Cells[i], solution[i])
			}
			continue
		}

		// If cell is empty, the solution digit must still be a candidate
		solutionDigit := solution[i]
		if !board.Candidates[i].Has(solutionDigit) {
			t.Errorf("%s: Cell %d eliminated solution digit %d from candidates",
				technique, i, solutionDigit)
		}
	}
}

// runIsolatedTechniqueTest is the common test logic for all technique tests.
// It uses the DisableHigherTiers strategy, which allows all techniques in the
// same tier and below to run. This is more realistic than only enabling the
// target technique + singles, as many puzzles need intermediate techniques
// to set up the board state before the target technique can fire.
func runIsolatedTechniqueTest(t *testing.T, slug string) {
	t.Helper()

	// Get puzzle data
	data, ok := GetTechniquePuzzle(slug)
	if !ok {
		t.Fatalf("No puzzle data for technique: %s", slug)
	}

	// Load puzzle
	givens, solution := loadTestPuzzle(t, data)

	// Verify puzzle has unique solution
	if !dp.HasUniqueSolution(givens) {
		t.Fatalf("Puzzle does not have unique solution")
	}

	// Convert givens to puzzle string for TestTechniqueDetection
	puzzleString := ""
	for _, v := range givens {
		if v == 0 {
			puzzleString += "0"
		} else {
			puzzleString += string(rune('0' + v))
		}
	}

	// Use DisableHigherTiers strategy - allows techniques in same tier and below
	config := TechniqueTestConfig{
		MaxSteps: constants.MaxSolverSteps,
		Strategy: DisableHigherTiers,
	}
	result := TestTechniqueDetection(puzzleString, slug, config)

	if !result.Detected {
		t.Errorf("Technique %s was never used. Status: %s, Moves: %d, Used: %v",
			slug, result.Status, result.TotalMoves, result.TechniquesUsed)
		return
	}

	// Create board and apply all moves for validation
	board := NewBoard(givens)

	// Create solver with same strategy to replay moves
	registry := NewTechniqueRegistry()
	targetTech := registry.GetBySlug(slug)
	if targetTech != nil {
		applyIsolationStrategy(registry, slug, targetTech, DisableHigherTiers)
	}
	solver := NewSolverWithRegistry(registry)
	solver.SolveWithSteps(board, constants.MaxSolverSteps)

	// Validate final board state against solution
	validateMoveAgainstSolution(t, board, solution, slug)

	t.Logf("SUCCESS: %s used %d times, status: %s, total moves: %d",
		slug, result.TechniquesUsed[slug], result.Status, result.TotalMoves)
}

// runFullSolverTechniqueTest is for rare techniques that require the full solver
// to fire. Some techniques like jellyfish are so rare that they need higher-tier
// techniques to set up the board state before they can be applied.
//
//nolint:unused // Reserved for future tests
func runFullSolverTechniqueTest(t *testing.T, slug string) {
	t.Helper()

	// Get puzzle data
	data, ok := GetTechniquePuzzle(slug)
	if !ok {
		t.Fatalf("No puzzle data for technique: %s", slug)
	}

	// Load puzzle
	givens, solution := loadTestPuzzle(t, data)

	// Verify puzzle has unique solution
	if !dp.HasUniqueSolution(givens) {
		t.Fatalf("Puzzle does not have unique solution")
	}

	// Use full solver
	board := NewBoard(givens)
	solver := NewSolver()
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

	// Check if technique was used
	techniqueCount := 0
	for _, move := range moves {
		if move.Technique == slug {
			techniqueCount++
		}
	}

	if techniqueCount == 0 {
		usedTechniques := make(map[string]int)
		for _, move := range moves {
			usedTechniques[move.Technique]++
		}
		t.Errorf("Technique %s was never used (full solver). Status: %s, Moves: %d, Used: %v",
			slug, status, len(moves), usedTechniques)
		return
	}

	// Validate final board state against solution
	validateMoveAgainstSolution(t, board, solution, slug)

	t.Logf("SUCCESS: %s used %d times, status: %s, total moves: %d",
		slug, techniqueCount, status, len(moves))
}

// runDirectDetectionTest tests that the technique detector fires immediately on
// the given partial solve state. This is the fastest test mode - it only calls
// the detector once and validates the move. Use this for expensive techniques
// where we have a partial state that triggers the technique on the first move.
//
//nolint:unused // Reserved for future tests
func runDirectDetectionTest(t *testing.T, slug string) {
	t.Helper()

	// Get puzzle data
	data, ok := GetTechniquePuzzle(slug)
	if !ok {
		t.Fatalf("No puzzle data for technique: %s", slug)
	}

	// Load puzzle
	givens, solution := loadTestPuzzle(t, data)

	// Verify puzzle has unique solution
	if !dp.HasUniqueSolution(givens) {
		t.Fatalf("Puzzle does not have unique solution")
	}

	// Create board and test direct detection
	board := NewBoard(givens)
	move := TestTechniqueDetectionDirect(board, slug)

	if move == nil {
		// Try with solver's FindNextMove as fallback
		solver := NewSolver()
		move = solver.FindNextMove(board)
		if move == nil || move.Technique != slug {
			t.Errorf("Technique %s was not detected on first move (got: %v)", slug, move)
			return
		}
	}

	if move.Technique != slug {
		t.Errorf("Expected technique %s but got %s", slug, move.Technique)
		return
	}

	// Validate the move against the solution
	// Apply the move and check validity
	solver := NewSolver()
	solver.ApplyMove(board, move)
	validateMoveAgainstSolution(t, board, solution, slug)

	t.Logf("SUCCESS: %s detected directly", slug)
}

// runEarlyStopTechniqueTest runs until the target technique fires, then stops.
// This is faster than runIsolatedTechniqueTest for expensive techniques because
// it doesn't continue solving after the technique is detected.
//
// If the early stop approach fails to detect the technique, it falls back to
// runIsolatedTechniqueTest which uses a different isolation strategy that may
// allow the technique to fire.
func runEarlyStopTechniqueTest(t *testing.T, slug string) {
	t.Helper()

	// Try the fast path first
	if tryEarlyStopTechniqueTest(t, slug) {
		return // Success!
	}

	// Fast path failed - fall back to the slower but more thorough approach
	t.Logf("Early stop failed for %s, falling back to isolated test", slug)
	runIsolatedTechniqueTest(t, slug)
}

// tryEarlyStopTechniqueTest attempts to detect the technique using early stopping.
// Returns true if the technique was detected and validated, false otherwise.
func tryEarlyStopTechniqueTest(t *testing.T, slug string) bool {
	t.Helper()

	// Get puzzle data
	data, ok := GetTechniquePuzzle(slug)
	if !ok {
		return false // Let the fallback handle the error
	}

	// Load puzzle
	givens, solution := loadTestPuzzle(t, data)

	// Verify puzzle has unique solution
	if !dp.HasUniqueSolution(givens) {
		return false // Let the fallback handle the error
	}

	// Create board and solver
	board := NewBoard(givens)
	solver := NewSolver()

	// Solve step by step until technique fires
	for step := 0; step < constants.MaxSolverSteps; step++ {
		move := solver.FindNextMove(board)
		if move == nil {
			return false // Stalled - try fallback
		}

		solver.ApplyMove(board, move)

		if move.Technique == slug {
			// Technique fired! Validate and stop
			validateMoveAgainstSolution(t, board, solution, slug)
			t.Logf("SUCCESS: %s fired at step %d", slug, step)
			return true
		}
	}

	return false // Max steps reached - try fallback
}

// runEarlyStopWithDisabledTechniques runs until the target technique fires, with
// specified techniques disabled to prevent them from preempting the target.
// This is useful when a technique (like AIC) would otherwise fire before the target.
func runEarlyStopWithDisabledTechniques(t *testing.T, slug string, disabledTechniques []string) {
	t.Helper()

	// Get puzzle data
	data, ok := GetTechniquePuzzle(slug)
	if !ok {
		t.Fatalf("No puzzle data for technique: %s", slug)
	}

	// Load puzzle
	givens, solution := loadTestPuzzle(t, data)

	// Verify puzzle has unique solution
	if !dp.HasUniqueSolution(givens) {
		t.Fatalf("Puzzle does not have unique solution")
	}

	// Create board and solver with disabled techniques
	board := NewBoard(givens)
	solver := CreateSolverWithDisabledTechniques(disabledTechniques)

	// Solve step by step until technique fires
	for step := 0; step < constants.MaxSolverSteps; step++ {
		move := solver.FindNextMove(board)
		if move == nil {
			t.Errorf("Stalled at step %d without firing %s", step, slug)
			return
		}

		solver.ApplyMove(board, move)

		if move.Technique == slug {
			// Technique fired! Validate and stop
			validateMoveAgainstSolution(t, board, solution, slug)
			t.Logf("SUCCESS: %s fired at step %d (with %v disabled)", slug, step, disabledTechniques)
			return
		}
	}

	t.Errorf("Max steps reached without firing %s", slug)
}

// =============================================================================
// SIMPLE TIER TESTS (8 techniques)
// =============================================================================

func TestTechniqueIsolated_HiddenSingle(t *testing.T) {
	runIsolatedTechniqueTest(t, "hidden-single")
}

func TestTechniqueIsolated_NakedSingle(t *testing.T) {
	runIsolatedTechniqueTest(t, "naked-single")
}

func TestTechniqueIsolated_NakedPair(t *testing.T) {
	runIsolatedTechniqueTest(t, "naked-pair")
}

func TestTechniqueIsolated_HiddenPair(t *testing.T) {
	runIsolatedTechniqueTest(t, "hidden-pair")
}

func TestTechniqueIsolated_PointingPair(t *testing.T) {
	runIsolatedTechniqueTest(t, "pointing-pair")
}

func TestTechniqueIsolated_BoxLineReduction(t *testing.T) {
	runIsolatedTechniqueTest(t, "box-line-reduction")
}

func TestTechniqueIsolated_NakedTriple(t *testing.T) {
	runIsolatedTechniqueTest(t, "naked-triple")
}

func TestTechniqueIsolated_HiddenTriple(t *testing.T) {
	runIsolatedTechniqueTest(t, "hidden-triple")
}

// =============================================================================
// MEDIUM TIER TESTS (9 techniques)
// =============================================================================

func TestTechniqueIsolated_Bug(t *testing.T) {
	runIsolatedTechniqueTest(t, "bug")
}

func TestTechniqueIsolated_XWing(t *testing.T) {
	runIsolatedTechniqueTest(t, "x-wing")
}

func TestTechniqueIsolated_UniqueRectangle(t *testing.T) {
	runIsolatedTechniqueTest(t, "unique-rectangle")
}

func TestTechniqueIsolated_XYWing(t *testing.T) {
	runIsolatedTechniqueTest(t, "xy-wing")
}

func TestTechniqueIsolated_SimpleColoring(t *testing.T) {
	runIsolatedTechniqueTest(t, "simple-coloring")
}

func TestTechniqueIsolated_NakedQuad(t *testing.T) {
	runIsolatedTechniqueTest(t, "naked-quad")
}

func TestTechniqueIsolated_HiddenQuad(t *testing.T) {
	runIsolatedTechniqueTest(t, "hidden-quad")
}

func TestTechniqueIsolated_Swordfish(t *testing.T) {
	runIsolatedTechniqueTest(t, "swordfish")
}

func TestTechniqueIsolated_XYZWing(t *testing.T) {
	runIsolatedTechniqueTest(t, "xyz-wing")
}

// =============================================================================
// HARD TIER TESTS (11 techniques)
// =============================================================================

func TestTechniqueIsolated_Skyscraper(t *testing.T) {
	runIsolatedTechniqueTest(t, "skyscraper")
}

func TestTechniqueIsolated_XChain(t *testing.T) {
	runIsolatedTechniqueTest(t, "x-chain")
}

func TestTechniqueIsolated_XYChain(t *testing.T) {
	runIsolatedTechniqueTest(t, "xy-chain")
}

func TestTechniqueIsolated_Medusa3D(t *testing.T) {
	runIsolatedTechniqueTest(t, "medusa-3d")
}

func TestTechniqueIsolated_Jellyfish(t *testing.T) {
	// Uses a partial solve state where jellyfish fires immediately
	runIsolatedTechniqueTest(t, "jellyfish")
}

func TestTechniqueIsolated_UniqueRectangleType2(t *testing.T) {
	// Disable chain-based techniques that often solve before UR Type 2 fires
	runEarlyStopWithDisabledTechniques(t, "unique-rectangle-type-2", []string{"aic", "medusa-3d", "x-chain", "xy-chain", "grouped-x-cycles", "simple-coloring"})
}

func TestTechniqueIsolated_UniqueRectangleType3(t *testing.T) {
	// Disable chain-based and fish techniques that often solve before UR Type 3 fires
	runEarlyStopWithDisabledTechniques(t, "unique-rectangle-type-3", []string{
		"aic", "medusa-3d", "x-chain", "xy-chain", "grouped-x-cycles", "simple-coloring",
		"skyscraper", "empty-rectangle", "w-wing", "finned-x-wing", "finned-swordfish",
	})
}

func TestTechniqueIsolated_UniqueRectangleType4(t *testing.T) {
	// Uses early stop with disabled techniques - medusa-3d can find same eliminations first
	runEarlyStopWithDisabledTechniques(t, "unique-rectangle-type-4", []string{
		"medusa-3d",
	})
}

func TestTechniqueIsolated_WXYZWing(t *testing.T) {
	// Uses early stop for faster execution - full solver until technique fires
	runEarlyStopTechniqueTest(t, "wxyz-wing")
}

func TestTechniqueIsolated_WWing(t *testing.T) {
	runIsolatedTechniqueTest(t, "w-wing")
}

func TestTechniqueIsolated_EmptyRectangle(t *testing.T) {
	runIsolatedTechniqueTest(t, "empty-rectangle")
}

// =============================================================================
// EXTREME TIER TESTS (11 techniques)
// =============================================================================

func TestTechniqueIsolated_GroupedXCycles(t *testing.T) {
	// Uses early stop for faster execution - full solver until technique fires
	runEarlyStopTechniqueTest(t, "grouped-x-cycles")
}

func TestTechniqueIsolated_FinnedXWing(t *testing.T) {
	// Uses early stop - full solver until technique fires
	runEarlyStopTechniqueTest(t, "finned-x-wing")
}

func TestTechniqueIsolated_FinnedSwordfish(t *testing.T) {
	runIsolatedTechniqueTest(t, "finned-swordfish")
}

func TestTechniqueIsolated_AIC(t *testing.T) {
	// AIC uses Type 2 elimination: when both endpoints have the same digit,
	// both are ON, and they see each other, we eliminate the start candidate
	// (since Start=ON leads to End=ON but they can't both be ON - contradiction).
	runEarlyStopTechniqueTest(t, "aic")
}

func TestTechniqueIsolated_ALSXZ(t *testing.T) {
	// AIC is disabled to prevent it from preempting ALS techniques
	runEarlyStopWithDisabledTechniques(t, "als-xz", []string{"aic"})
}

func TestTechniqueIsolated_ALSXYWing(t *testing.T) {
	// AIC is disabled to prevent it from preempting ALS techniques
	runEarlyStopWithDisabledTechniques(t, "als-xy-wing", []string{"aic"})
}

func TestTechniqueIsolated_ALSXYChain(t *testing.T) {
	// AIC is disabled to prevent it from preempting ALS techniques
	runEarlyStopWithDisabledTechniques(t, "als-xy-chain", []string{"aic"})
}

func TestTechniqueIsolated_SueDeCoq(t *testing.T) {
	// AIC and ALS techniques are disabled to prevent them from preempting Sue-de-Coq
	runEarlyStopWithDisabledTechniques(t, "sue-de-coq", []string{"aic", "als-xz", "als-xy-wing", "als-xy-chain", "digit-forcing-chain", "forcing-chain"})
}

func TestTechniqueIsolated_DigitForcingChain(t *testing.T) {
	// Disable AIC and ALS techniques that would fire before digit-forcing-chain
	// This allows testing digit-forcing-chain detection in isolation
	runEarlyStopWithDisabledTechniques(t, "digit-forcing-chain", []string{"aic", "als-xz", "als-xy-wing", "als-xy-chain"})
}

func TestTechniqueIsolated_ForcingChain(t *testing.T) {
	// Disable AIC and other forcing/ALS techniques that would fire before forcing-chain
	// This allows testing forcing-chain detection in isolation without waiting for slower techniques
	runEarlyStopWithDisabledTechniques(t, "forcing-chain", []string{"aic", "als-xz", "als-xy-wing", "als-xy-chain", "digit-forcing-chain"})
}

func TestTechniqueIsolated_DeathBlossom(t *testing.T) {
	// AIC and ALS chain techniques are disabled to prevent them from preempting Death Blossom
	runEarlyStopWithDisabledTechniques(t, "death-blossom", []string{"aic", "als-xz", "als-xy-wing", "als-xy-chain", "digit-forcing-chain", "forcing-chain"})
}

// =============================================================================
// REGISTRY COMPLETENESS TEST
// =============================================================================

// TestAllTechniquesHavePuzzles verifies every registered technique has puzzle data
func TestAllTechniquesHavePuzzles(t *testing.T) {
	registry := NewTechniqueRegistry()

	for _, tech := range registry.GetAll() {
		t.Run(tech.Slug, func(t *testing.T) {
			data, ok := GetTechniquePuzzle(tech.Slug)
			if !ok {
				t.Errorf("Technique %s has no puzzle data", tech.Slug)
				return
			}

			if data.Tier != tech.Tier {
				t.Errorf("Technique %s tier mismatch: data says %s, registry says %s",
					tech.Slug, data.Tier, tech.Tier)
			}
		})
	}
}

// TestAllPuzzlesHaveTechniques verifies every puzzle data entry has a registered technique
func TestAllPuzzlesHaveTechniques(t *testing.T) {
	registry := NewTechniqueRegistry()

	for _, data := range TechniquePuzzles {
		t.Run(data.Slug, func(t *testing.T) {
			tech := registry.GetBySlug(data.Slug)
			if tech == nil {
				t.Errorf("Puzzle data for %s has no registered technique", data.Slug)
				return
			}

			if tech.Detector == nil {
				t.Errorf("Technique %s has nil detector", data.Slug)
			}
		})
	}
}

// =============================================================================
// PUZZLE VALIDATION TESTS
// =============================================================================

// Techniques with known invalid or missing puzzle strings.
// These are rare techniques that need valid puzzles from external sources.
// Currently all techniques have valid puzzles!
var techniquesWithInvalidPuzzles = map[string]bool{}

// TestAllPuzzlesAreValid verifies all test puzzles are valid and have unique solutions
func TestAllPuzzlesAreValid(t *testing.T) {
	// Load puzzles.json for indexed puzzles
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	for _, data := range TechniquePuzzles {
		t.Run(data.Slug, func(t *testing.T) {
			// Skip techniques with known invalid puzzles
			if techniquesWithInvalidPuzzles[data.Slug] {
				t.Skipf("Skipping validation for %s: known invalid puzzle", data.Slug)
				return
			}

			var givens []int

			if data.PuzzleIndex >= 0 {
				var err error
				givens, _, err = loader.GetPuzzle(data.PuzzleIndex, data.Difficulty)
				if err != nil {
					t.Fatalf("Failed to get puzzle: %v", err)
				}
			} else {
				givens = make([]int, 81)
				for i, c := range data.PuzzleString {
					if c >= '1' && c <= '9' {
						givens[i] = int(c - '0')
					}
				}
			}

			// Check DP solver can solve it
			solution := dp.Solve(givens)
			if solution == nil {
				t.Errorf("Puzzle for %s is invalid (DP solver cannot solve)", data.Slug)
				return
			}

			// Check uniqueness
			if !dp.HasUniqueSolution(givens) {
				t.Errorf("Puzzle for %s has multiple solutions", data.Slug)
			}
		})
	}
}

// =============================================================================
// DIAGNOSTICS
// =============================================================================

// TestDiagnosticTechniqueUsage runs all puzzles through the full solver and reports
// which techniques are actually used. This helps identify puzzles that don't use
// their expected technique.
func TestDiagnosticTechniqueUsage(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping diagnostic test in short mode")
	}

	// Load puzzles.json
	puzzlePath := "../../../../frontend/puzzles.json"
	loader, err := puzzles.Load(puzzlePath)
	if err != nil {
		t.Fatalf("Failed to load puzzles.json: %v", err)
	}

	solver := NewSolver()

	type result struct {
		Slug           string
		UsedTarget     bool
		TargetCount    int
		Status         string
		TechniquesUsed map[string]int
	}
	var results []result

	for _, data := range TechniquePuzzles {
		var givens []int

		if data.PuzzleIndex >= 0 {
			var err error
			givens, _, err = loader.GetPuzzle(data.PuzzleIndex, data.Difficulty)
			if err != nil {
				t.Logf("Failed to get puzzle for %s: %v", data.Slug, err)
				continue
			}
		} else {
			givens = make([]int, 81)
			for i, c := range data.PuzzleString {
				if c >= '1' && c <= '9' {
					givens[i] = int(c - '0')
				}
			}
		}

		board := NewBoard(givens)
		moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

		techCounts := make(map[string]int)
		targetCount := 0
		for _, move := range moves {
			techCounts[move.Technique]++
			if move.Technique == data.Slug {
				targetCount++
			}
		}

		results = append(results, result{
			Slug:           data.Slug,
			UsedTarget:     targetCount > 0,
			TargetCount:    targetCount,
			Status:         status,
			TechniquesUsed: techCounts,
		})
	}

	// Print summary
	t.Log("\n=== TECHNIQUE USAGE DIAGNOSTIC ===")
	passing := 0
	failing := 0
	for _, r := range results {
		if r.UsedTarget {
			t.Logf("PASS: %s (used %d times, status: %s)", r.Slug, r.TargetCount, r.Status)
			passing++
		} else {
			t.Logf("FAIL: %s (not used, status: %s, used: %v)", r.Slug, r.Status, r.TechniquesUsed)
			failing++
		}
	}
	t.Logf("\nSummary: %d passing, %d failing", passing, failing)
}

// =============================================================================
// PRACTICE PUZZLES JSON VERIFICATION
// =============================================================================

// PracticePuzzlesFile represents the structure of practice_puzzles.json
type PracticePuzzlesFile struct {
	Version    int                              `json:"version"`
	Generated  string                           `json:"generated"`
	Techniques map[string][]PracticePuzzleEntry `json:"techniques"`
}

// PracticePuzzleEntry represents a single puzzle entry
type PracticePuzzleEntry struct {
	Index      int    `json:"i"`
	Difficulty string `json:"d"`
}

// TestPracticePuzzlesAlignment verifies our test data matches practice_puzzles.json
func TestPracticePuzzlesAlignment(t *testing.T) {
	// Load practice_puzzles.json
	data, err := os.ReadFile("../../../../frontend/practice_puzzles.json")
	if err != nil {
		t.Skipf("Could not load practice_puzzles.json: %v", err)
		return
	}

	var ppFile PracticePuzzlesFile
	if err := json.Unmarshal(data, &ppFile); err != nil {
		t.Fatalf("Failed to parse practice_puzzles.json: %v", err)
	}

	// For each technique in our test data with a puzzle index, verify it matches
	for _, td := range TechniquePuzzles {
		if td.PuzzleIndex < 0 {
			continue // Skip string-based puzzles
		}

		t.Run(td.Slug, func(t *testing.T) {
			entries, ok := ppFile.Techniques[td.Slug]
			if !ok {
				t.Logf("Technique %s not found in practice_puzzles.json", td.Slug)
				return
			}

			// Check if our index/difficulty combo is in the practice puzzles
			found := false
			for _, entry := range entries {
				if entry.Index == td.PuzzleIndex {
					found = true
					// Verify difficulty matches
					diffKey := puzzles.DifficultyKey[td.Difficulty]
					if entry.Difficulty != diffKey {
						t.Logf("Note: Using difficulty %s but practice_puzzles has %s for index %d",
							td.Difficulty, entry.Difficulty, td.PuzzleIndex)
					}
					break
				}
			}

			if !found {
				t.Logf("Puzzle index %d not found in practice_puzzles.json for %s (entries: %v)",
					td.PuzzleIndex, td.Slug, entries)
			}
		})
	}
}
