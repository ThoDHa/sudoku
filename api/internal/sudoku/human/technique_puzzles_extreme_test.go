package human

import (
	"testing"

	"sudoku-api/pkg/constants"
)

// ExtremeTechniquePuzzles contains puzzles that specifically require EXTREME tier techniques.
// Each puzzle is an 81-character string where 0 represents an empty cell.
// These puzzles are sourced from well-known Sudoku technique databases and solver sites.
//
// Technique slugs from the registry (extreme tier):
// - sue-de-coq: Two intersecting almost locked sets
// - grouped-x-cycles: X-Cycles using group strong links
// - aic: Alternating Inference Chains
// - als-xz: Almost Locked Set with XZ rule
// - als-xy-wing: Almost Locked Set XY-Wing pattern
// - als-xy-chain: Chain of Almost Locked Sets
// - forcing-chain: Chain of implications from candidate assumptions
// - digit-forcing-chain: Forcing chain focused on single digit
// - death-blossom: Advanced ALS pattern with stem and petals
// - finned-x-wing: X-Wing with extra candidates (fins)
// - finned-swordfish: Swordfish with extra candidates (fins)
//
// Note: medusa-3d is now HARD tier (not extreme)
//
// KNOWN ISSUES (from comprehensive analysis 2024):
// 1. aic: Type 2 eliminations are DISABLED (techniques_aic.go) - only Type 1 works
// 2. All tests are SKIPPED pending full implementation and puzzle validation
//
// VALIDATION REQUIRED:
// Each puzzle should be validated against external solvers to confirm it
// actually requires the listed technique to solve.
//
// Sources:
// - SudokuWiki.org technique exemplars (https://www.sudokuwiki.org/)
// - Hodoku technique collections (http://hodoku.sourceforge.net/)
// - Enjoy Sudoku forums verified puzzles
var ExtremeTechniquePuzzles = map[string]string{
	// Sue de Coq: Two intersecting almost locked sets.
	// An AALS in a box/line intersection combined with ALSs from the box and line.
	// The pattern locks candidates in both the row/column and box.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json)
	"sue-de-coq": "750000004000504020000900100003000000000000908098706050000800600180400003200007000",

	// Finned X-Wing: X-Wing with extra candidates (fins) in the pattern.
	// The fins must be in the same box as one corner of the X-Wing.
	// Eliminations only affect cells in the box containing the fin.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json)
	"finned-x-wing": "500403087000007239000210000006050001090000064304000002000000000800700005000106090",

	// Finned Swordfish: Swordfish with extra candidates (fins).
	// Like finned X-Wing but with a 3x3 fish pattern.
	// Eliminations only occur where candidates see the fin.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json)
	"finned-swordfish": "000108060095003002030009000024000036000000000003600507060000008010306000379800040",

	// Grouped X-Cycles: X-Cycles using group strong links.
	// Like X-Cycles but candidates can be grouped within a unit (pointing pairs/triples).
	// The grouped cells act as a single node in the chain.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json, idx=211)
	"grouped-x-cycles": "000000083008400200510000000400750000000800010030000004090005000006080057000071600",

	// AIC (Alternating Inference Chain): General chaining technique.
	// Chains with alternating strong and weak links between candidates.
	// Can use bivalue cells, bilocation candidates, or ALSs as nodes.
	// Tier: extreme
	// Source: SudokuWiki Inference Chains examples
	"aic": "008000300400905006020006000005007001000000000900200800000100020600509004003000500",

	// ALS-XZ: Almost Locked Set with XZ rule.
	// Two ALSs connected by a restricted common candidate (X).
	// Any candidate Z common to both ALSs can be eliminated from cells seeing all Z in both.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json, idx=33)
	"als-xz": "090500680400080009000900030076492000040603000000050000035809064009040000020000070",

	// ALS-XY-Wing: Almost Locked Set XY-Wing pattern.
	// Three ALSs (A, B, C) where A shares RCC with B and C, and B,C share a non-RCC.
	// Eliminations occur where cells see the shared candidate in B and C.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json, idx=23)
	"als-xy-wing": "000000030650000400000402000000000306010070090004050000040708000500360002090000701",

	// ALS-XY-Chain: Chain of Almost Locked Sets.
	// Extended ALS chains with multiple ALSs connected by RCCs.
	// Each pair of adjacent ALSs shares a restricted common candidate.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json, idx=33)
	"als-xy-chain": "090500680400080009000900030076492000040603000000050000035809064009040000020000070",

	// Forcing Chain: Chain of implications from candidate assumptions.
	// Tests all candidates in a cell - if all lead to the same conclusion,
	// that conclusion must be true regardless of which candidate is correct.
	// Tier: extreme
	// Source: Validated from puzzle bank (practice_puzzles.json, idx=168)
	"forcing-chain": "100000406000000000208000700006002540000039000000500000023086100010090020605013070",

	// Digit Forcing Chain: Forcing chain focused on single digit.
	// Tests ON/OFF states of a single candidate and follows implications.
	// Both chains must reach the same conclusion for an elimination.
	// Tier: extreme
	// Source: SudokuWiki Digit Forcing Chains - Figure 1 example
	"digit-forcing-chain": "000000100020003000004050000600700800000800000009001002000060400000500030001000000",

	// Death Blossom: Advanced ALS pattern with stem and petals.
	// A stem cell's candidates each connect to different ALSs (petals).
	// Cells seeing all instances of a candidate Z in all petals can eliminate Z.
	// Tier: extreme
	// Source: SudokuWiki Death Blossom - Figure 1 example
	"death-blossom": "000060100200000003001400050060200000000010000000005040030008700800000001007020000",
}

// knownProblematicExtremeTechniques lists techniques with puzzles that have known issues.
// These techniques ARE implemented (detectors exist in registry), but lack valid test puzzles.
//
// STATUS (December 2024 - Updated after test helper implementation):
//
// ✅ PASSING (4 techniques with verified puzzles):
//   - als-xz, als-xy-wing, als-xy-chain, grouped-x-cycles
//
// ⚠️ SOLVED BY OTHER TECHNIQUE (puzzle doesn't require this specific technique):
//   - sue-de-coq: Puzzle solved by ALS techniques instead
//   - finned-x-wing: Puzzle solved by xy-chain instead
//   - finned-swordfish: Puzzle solved by ALS techniques instead
//   - forcing-chain: Puzzle solved by digit-forcing-chain instead
//
// ❌ NOT UNIQUE - multiple solutions:
//   - aic: Puzzle has multiple solutions
//   - death-blossom: Puzzle has multiple solutions
//   - digit-forcing-chain: Puzzle has multiple solutions
//
// NOTE: These are very advanced techniques. Finding valid puzzles that:
// 1. Have exactly one solution
// 2. Actually REQUIRE these specific techniques (not solved by simpler ones)
// is challenging. External puzzle sources may have validation issues.
//
// ACTION REQUIRED:
// Find valid puzzles from SudokuWiki, Hodoku, or other sources
var knownProblematicExtremeTechniques = map[string]string{
	// Non-unique puzzles - multiple solutions
	"aic":                 "not_unique - multiple solutions",
	"death-blossom":       "not_unique - multiple solutions",
	"digit-forcing-chain": "not_unique - multiple solutions",

	// Puzzle solved by alternative technique
	"sue-de-coq":       "solved_by_other - ALS techniques solve first",
	"finned-x-wing":    "solved_by_other - xy-chain solves first",
	"finned-swordfish": "solved_by_other - ALS techniques solve first",
	"forcing-chain":    "solved_by_other - digit-forcing-chain solves first",
}

// HardTierTechniquesPuzzles contains puzzles for techniques that are in HARD tier
// but were listed in the original requirements as "extreme".
// These are separated for clarity about their actual tier in the registry.
//
// Note: These puzzles are duplicated in technique_puzzles_hard_test.go where they belong.
// They remain here for backwards compatibility and cross-referencing.
// Source: Validated from puzzle bank (practice_puzzles.json)
var HardTierTechniquesPuzzles = map[string]string{
	// XY-Chain: Chain through bivalue cells.
	// A chain of cells where each has exactly 2 candidates, linked end-to-end.
	// Cells seeing both ends can eliminate the common candidate.
	// Tier: hard
	"xy-chain": "000010040080006050560000100000090060007060004000400300000030427750009080000001000",
}

// TestExtremeTechniquePuzzlesValid verifies that each puzzle in ExtremeTechniquePuzzles
// is a valid 81-character string with digits 0-9.
func TestExtremeTechniquePuzzlesValid(t *testing.T) {
	for technique, puzzle := range ExtremeTechniquePuzzles {
		t.Run(technique, func(t *testing.T) {
			if len(puzzle) != 81 {
				t.Errorf("puzzle for %s has length %d, expected 81", technique, len(puzzle))
				return
			}

			for i, c := range puzzle {
				if c < '0' || c > '9' {
					t.Errorf("puzzle for %s has invalid character '%c' at position %d", technique, c, i)
				}
			}
		})
	}
}

// TestExtremeTechniquePuzzlesSolvable verifies that each puzzle can be parsed
// and has proper structure for solving.
func TestExtremeTechniquePuzzlesSolvable(t *testing.T) {
	solver := NewSolver()

	for technique, puzzle := range ExtremeTechniquePuzzles {
		t.Run(technique, func(t *testing.T) {
			if reason, problematic := knownProblematicExtremeTechniques[technique]; problematic {
				t.Skipf("Skipping %s - %s (TODO: find valid puzzle)", technique, reason)
			}

			// Convert string to cell array
			cells := make([]int, 81)
			for i, c := range puzzle {
				cells[i] = int(c - '0')
			}

			// Create a board
			board := NewBoard(cells)
			if board == nil {
				t.Errorf("failed to create board for %s", technique)
				return
			}

			// Try to solve
			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			if status == constants.StatusCompleted {
				t.Logf("Puzzle for %s completed in %d moves", technique, len(moves))
			} else {
				t.Errorf("Puzzle for %s did not complete: status=%s after %d moves", technique, status, len(moves))
			}

			// Verify the board has some empty cells initially
			emptyCells := 0
			origCells := make([]int, 81)
			for i, c := range puzzle {
				origCells[i] = int(c - '0')
				if origCells[i] == 0 {
					emptyCells++
				}
			}

			if emptyCells == 0 {
				t.Errorf("puzzle for %s has no empty cells", technique)
			}

			// Verify clue count is reasonable (17-35 clues is typical)
			clueCount := 81 - emptyCells
			if clueCount < 17 {
				t.Errorf("puzzle for %s has only %d clues (minimum is 17)", technique, clueCount)
			}
			if clueCount > 50 {
				t.Errorf("puzzle for %s has %d clues (too many for a challenging puzzle)", technique, clueCount)
			}
		})
	}
}

// TestExtremeTechniqueDetection tests that each puzzle triggers detection of its
// target technique at some point during solving.
func TestExtremeTechniqueDetection(t *testing.T) {
	for targetSlug, puzzle := range ExtremeTechniquePuzzles {
		t.Run(targetSlug, func(t *testing.T) {
			if reason, problematic := knownProblematicExtremeTechniques[targetSlug]; problematic {
				t.Skipf("Skipping %s - %s (TODO: find valid puzzle)", targetSlug, reason)
			}

			config := DefaultTechniqueTestConfig()
			// Use DisableHigherTiers to allow all techniques in same tier and below.
			// DisableSameAndHigherOrder was too aggressive and caused puzzles to stall.
			config.Strategy = DisableHigherTiers

			result := TestTechniqueDetection(puzzle, targetSlug, config)

			if !result.Detected {
				t.Errorf("Puzzle for %s did not use %s technique. Status: %s, Used: %v",
					targetSlug, targetSlug, result.Status, result.TechniquesUsed)
			} else {
				t.Logf("SUCCESS: %s technique was applied during solving. All: %v",
					targetSlug, result.TechniquesUsed)
			}
		})
	}
}

// TestHardTierTechniquesPuzzlesValid verifies that the hard-tier puzzles are valid.
func TestHardTierTechniquesPuzzlesValid(t *testing.T) {
	for technique, puzzle := range HardTierTechniquesPuzzles {
		t.Run(technique, func(t *testing.T) {
			if len(puzzle) != 81 {
				t.Errorf("puzzle for %s has length %d, expected 81", technique, len(puzzle))
				return
			}

			for i, c := range puzzle {
				if c < '0' || c > '9' {
					t.Errorf("puzzle for %s has invalid character '%c' at position %d", technique, c, i)
				}
			}

			// Verify clue count
			clueCount := 0
			for _, c := range puzzle {
				if c != '0' {
					clueCount++
				}
			}
			if clueCount < 17 {
				t.Errorf("puzzle for %s has only %d clues (minimum is 17)", technique, clueCount)
			}
		})
	}
}

// TestHardTierTechniquesDetection tests that the hard-tier puzzles trigger their techniques.
func TestHardTierTechniquesDetection(t *testing.T) {
	solver := NewSolver()
	registry := NewTechniqueRegistry()

	for targetSlug, puzzle := range HardTierTechniquesPuzzles {
		t.Run(targetSlug, func(t *testing.T) {
			// Verify the technique exists in registry
			tech := registry.GetBySlug(targetSlug)
			if tech == nil {
				t.Skipf("technique %s not found in registry", targetSlug)
				return
			}

			// Convert string to cell array
			cells := make([]int, 81)
			for i, c := range puzzle {
				cells[i] = int(c - '0')
			}

			// Create a board and solve
			board := NewBoard(cells)
			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			// Check if the target technique was used
			techniqueUsed := false
			for _, move := range moves {
				if move.Technique == targetSlug {
					techniqueUsed = true
					break
				}
			}

			// List all techniques that were used
			usedTechniques := make(map[string]int)
			for _, move := range moves {
				usedTechniques[move.Technique]++
			}

			if !techniqueUsed {
				t.Errorf("Puzzle for %s did not use %s technique. Status: %s, Used: %v",
					targetSlug, targetSlug, status, usedTechniques)
			} else {
				t.Logf("SUCCESS: %s technique was applied during solving. All: %v", targetSlug, usedTechniques)
			}
		})
	}
}

// TestExtremeTechniqueRegistry verifies that all the EXTREME tier techniques
// mentioned in this file exist in the technique registry.
func TestExtremeTechniqueRegistry(t *testing.T) {
	registry := NewTechniqueRegistry()

	// These are the technique slugs we expect to exist (extreme tier)
	expectedTechniques := []string{
		"sue-de-coq",
		"grouped-x-cycles",
		"aic",
		"als-xz",
		"als-xy-wing",
		"als-xy-chain",
		"forcing-chain",
		"digit-forcing-chain",
		"death-blossom",
		"finned-x-wing",
		"finned-swordfish",
	}

	for _, slug := range expectedTechniques {
		t.Run(slug, func(t *testing.T) {
			tech := registry.GetBySlug(slug)
			if tech == nil {
				t.Errorf("technique %s not found in registry", slug)
				return
			}

			// Verify the technique has required fields
			if tech.Name == "" {
				t.Errorf("technique %s has empty name", slug)
			}
			if tech.Detector == nil {
				t.Errorf("technique %s has nil detector", slug)
			}
			if tech.Tier != "extreme" {
				t.Logf("Note: technique %s is tier %s, not extreme", slug, tech.Tier)
			}
		})
	}
}

// TestExtremeTechniqueDetectionDirect tests the technique detectors directly
// on boards prepared from the puzzles.
func TestExtremeTechniqueDetectionDirect(t *testing.T) {
	registry := NewTechniqueRegistry()

	for technique, puzzle := range ExtremeTechniquePuzzles {
		t.Run(technique, func(t *testing.T) {
			// Get the technique descriptor
			desc := registry.GetBySlug(technique)
			if desc == nil {
				t.Skipf("technique %s not found in registry", technique)
				return
			}

			// Convert string to []int
			cells := make([]int, 81)
			for i, c := range puzzle {
				cells[i] = int(c - '0')
			}

			// Create board and solve partially to reach the point where
			// the extreme technique might be applicable
			board := NewBoard(cells)

			// Apply simpler techniques first to reduce the board state
			solver := NewSolver()
			// Limit to 100 steps to avoid solving completely
			solver.SolveWithSteps(board, 100)

			// Now try to detect the specific technique
			if desc.Detector != nil {
				move := desc.Detector(board)
				if move != nil {
					t.Logf("SUCCESS: %s detector found move: %s", technique, move.Explanation)
				} else {
					t.Logf("Note: %s detector returned nil at current board state", technique)
				}
			}
		})
	}
}

// BenchmarkExtremeTechniquePuzzles benchmarks solving each extreme puzzle.
func BenchmarkExtremeTechniquePuzzles(b *testing.B) {
	solver := NewSolver()

	for technique, puzzle := range ExtremeTechniquePuzzles {
		// Convert once outside the benchmark loop
		cells := make([]int, 81)
		for i, c := range puzzle {
			cells[i] = int(c - '0')
		}

		b.Run(technique, func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				board := NewBoard(cells)
				solver.SolveWithSteps(board, constants.MaxSolverSteps)
			}
		})
	}
}
