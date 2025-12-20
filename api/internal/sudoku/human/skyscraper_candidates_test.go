package human

import (
	"fmt"
	"testing"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/pkg/constants"
)

// TestSkyscraperCandidates tests candidate puzzles for skyscraper
// Run with: go test -v -run TestSkyscraperCandidates ./internal/sudoku/human/
func TestSkyscraperCandidates(t *testing.T) {
	// Candidate puzzles to test
	candidates := []string{
		// From user request
		"000010200000504030020000006050002040003000005600800070010405007000001020930068000",
		"900004000000901500500030002009040007010000040400010600200070009003809000000600001",
	}

	for i, puzzleStr := range candidates {
		t.Run(fmt.Sprintf("Candidate_%d", i+1), func(t *testing.T) {
			testSkyscraperPuzzle(t, puzzleStr)
		})
	}
}

func testSkyscraperPuzzle(t *testing.T, puzzleStr string) {
	puzzle := parsePuzzle(puzzleStr)

	// Step 1: Check DP validity
	solution := dp.Solve(puzzle)
	if solution == nil {
		t.Logf("❌ INVALID: DP solver cannot solve this puzzle")
		return
	}

	if !dp.HasUniqueSolution(puzzle) {
		t.Logf("❌ NOT UNIQUE: Puzzle has multiple solutions")
		return
	}

	t.Log("✅ Valid puzzle with unique solution")

	// Step 2: Test with full solver
	solver := NewSolver()
	board := NewBoard(puzzle)
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

	// Count techniques
	techCounts := make(map[string]int)
	for _, m := range moves {
		if m.Technique != "fill-candidate" {
			techCounts[m.Technique]++
		}
	}

	t.Logf("Full solver: status=%s, techniques=%v", status, techCounts)

	if techCounts["skyscraper"] > 0 {
		t.Logf("✅✅ PERFECT: This puzzle uses skyscraper!")
	} else if techCounts["x-chain"] > 0 {
		t.Logf("⚠️  Uses x-chain instead of skyscraper - need to test with x-chain disabled")
	}

	// Step 3: Test with x-chain disabled (skyscraper comes before x-chain in order)
	// Let's also disable other chain techniques that might fire first
	solverNoXChain := NewSolverWithoutTechniques("x-chain", "xy-chain")
	board2 := NewBoard(puzzle)
	moves2, status2 := solverNoXChain.SolveWithSteps(board2, constants.MaxSolverSteps)

	techCounts2 := make(map[string]int)
	for _, m := range moves2 {
		if m.Technique != "fill-candidate" {
			techCounts2[m.Technique]++
		}
	}

	t.Logf("Without x-chain/xy-chain: status=%s, techniques=%v", status2, techCounts2)

	if techCounts2["skyscraper"] > 0 && status2 == constants.StatusCompleted {
		t.Logf("✅✅ SUCCESS: Skyscraper fires when x-chain is disabled!")
	}

	// Step 4: Also try with DisableHigherTiers strategy
	config := DefaultTechniqueTestConfig()
	config.Strategy = DisableHigherTiers
	result := TestTechniqueDetection(puzzleStr, "skyscraper", config)

	t.Logf("With DisableHigherTiers: detected=%v, status=%s, techniques=%v",
		result.Detected, result.Status, result.TechniquesUsed)

	if result.Detected {
		t.Logf("✅✅ CONFIRMED: Skyscraper detected with higher tiers disabled!")
	}
}

// TestSkyscraperVsXChainOrder checks the technique order
func TestSkyscraperVsXChainOrder(t *testing.T) {
	registry := NewTechniqueRegistry()

	skyscraper := registry.GetBySlug("skyscraper")
	xchain := registry.GetBySlug("x-chain")

	t.Logf("Skyscraper: Order=%d, Tier=%s", skyscraper.Order, skyscraper.Tier)
	t.Logf("X-Chain: Order=%d, Tier=%s", xchain.Order, xchain.Tier)

	if skyscraper.Order > xchain.Order {
		t.Logf("⚠️  Skyscraper has HIGHER order than X-Chain, so X-Chain always fires first!")
		t.Logf("   This explains why skyscraper puzzles get solved by x-chain")
	} else if skyscraper.Order < xchain.Order {
		t.Logf("✅ Skyscraper has LOWER order than X-Chain, so it should fire first")
	} else {
		t.Logf("❓ Same order - depends on registration order")
	}
}

// TestSkyscraperDetectorDirect tests the skyscraper detector directly on the board state
func TestSkyscraperDetectorDirect(t *testing.T) {
	puzzleStr := "000010200000504030020000006050002040003000005600800070010405007000001020930068000"
	puzzle := parsePuzzle(puzzleStr)

	// First solve with simpler techniques to get to a state where skyscraper might apply
	solver := NewSolverWithOnlyTechniques(
		"naked-single", "hidden-single", "pointing-pair", "box-line-reduction",
		"naked-pair", "hidden-pair", "naked-triple", "hidden-triple",
		"x-wing", "swordfish",
	)

	board := NewBoard(puzzle)
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)
	t.Logf("After simple techniques: status=%s, moves=%d", status, len(moves))

	if status == constants.StatusStalled {
		// Good! Now test skyscraper detector directly
		move := TestTechniqueDetectionDirect(board, "skyscraper")
		if move != nil {
			t.Logf("✅ Skyscraper detected: %s", move.Explanation)
			t.Logf("   Targets: %v", move.Targets)
			t.Logf("   Eliminations: %v", move.Eliminations)
		} else {
			t.Log("❌ Skyscraper not detected at stalled state")

			// Also check x-chain
			xchainMove := TestTechniqueDetectionDirect(board, "x-chain")
			if xchainMove != nil {
				t.Logf("   (X-Chain would detect: %s)", xchainMove.Explanation)
			}
		}
	} else if status == constants.StatusCompleted {
		t.Log("Puzzle solved with simpler techniques - doesn't need skyscraper")
	}
}

// TestSkyscraperSolveTrace prints detailed trace of solve path
func TestSkyscraperSolveTrace(t *testing.T) {
	puzzleStr := "000010200000504030020000006050002040003000005600800070010405007000001020930068000"
	puzzle := parsePuzzle(puzzleStr)

	solver := NewSolver()
	board := NewBoard(puzzle)
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

	t.Logf("Total moves: %d, Status: %s", len(moves), status)
	t.Log("\nMove trace:")
	for i, m := range moves {
		if m.Technique != "fill-candidate" {
			t.Logf("  Move %d: %s - %s", i+1, m.Technique, m.Explanation)
		}
	}
}

// TestSkyscraperWithURDisabled tests with unique-rectangle disabled
func TestSkyscraperWithURDisabled(t *testing.T) {
	puzzleStr := "000010200000504030020000006050002040003000005600800070010405007000001020930068000"
	puzzle := parsePuzzle(puzzleStr)

	// Disable all techniques that might fire BEFORE skyscraper and steal its elimination
	solver := NewSolverWithoutTechniques(
		"unique-rectangle", "unique-rectangle-type-2", "unique-rectangle-type-3", "unique-rectangle-type-4",
		"x-chain", "xy-chain", "medusa-3d", // These are after skyscraper in theory
	)
	board := NewBoard(puzzle)
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

	techCounts := make(map[string]int)
	for _, m := range moves {
		if m.Technique != "fill-candidate" {
			techCounts[m.Technique]++
		}
	}

	t.Logf("Without UR/chains: status=%s, techniques=%v", status, techCounts)

	if techCounts["skyscraper"] > 0 {
		t.Logf("✅ SUCCESS: Skyscraper used!")
	} else {
		t.Logf("❌ Skyscraper still not used")
	}
}
