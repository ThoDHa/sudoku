package human

import (
	"fmt"
	"testing"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/pkg/constants"
)

// ValidatePuzzle checks if a puzzle is valid, unique, and uses the target technique
func ValidatePuzzle(puzzle string, technique string) (valid bool, unique bool, usesTechnique bool, usedTechniques map[string]int) {
	usedTechniques = make(map[string]int)

	if len(puzzle) != 81 {
		return false, false, false, usedTechniques
	}

	cells := make([]int, 81)
	for i, c := range puzzle {
		if c >= '0' && c <= '9' {
			cells[i] = int(c - '0')
		} else {
			return false, false, false, usedTechniques
		}
	}

	// Check with DP solver
	solution := dp.Solve(cells)
	if solution == nil {
		return false, false, false, usedTechniques
	}
	valid = true

	unique = dp.HasUniqueSolution(cells)
	if !unique {
		return valid, false, false, usedTechniques
	}

	// Check with human solver
	humanSolver := NewSolver()
	board := NewBoard(cells)
	moves, _ := humanSolver.SolveWithSteps(board, constants.MaxSolverSteps)

	for _, move := range moves {
		usedTechniques[move.Technique]++
	}

	usesTechnique = usedTechniques[technique] > 0
	return valid, unique, usesTechnique, usedTechniques
}

// TestValidatePuzzleCandidates is a helper test to validate puzzles for specific techniques.
// Run with: go test -v -run "TestValidatePuzzleCandidates" ./internal/sudoku/human/
//
// This test takes puzzles and checks:
// 1. Valid format (81 characters, digits 0-9)
// 2. Has unique solution (DP solver can solve it)
// 3. Actually uses the target technique during solve
//
// NOTE: This is a DIAGNOSTIC test. It reports puzzle issues but does NOT fail.
// Use this to find valid puzzles from external sources.
func TestValidatePuzzleCandidates(t *testing.T) {
	// Candidate puzzles to validate for missing techniques
	// Sources: SudokuWiki "Load Example" links, Hodoku, forums
	// NOTE: Many puzzles from websites are in "candidate" format or partially solved states
	// We need puzzles that are valid starting positions (only clues, no candidates)
	candidates := map[string][]struct {
		puzzle string
		source string
	}{
		// HIDDEN QUAD - need puzzles where 4 digits can only go in 4 cells
		// Hidden quads are VERY rare - most puzzles solve with simpler techniques first
		"hidden-quad": {
			// From SudokuWiki - Klaus Brenner example (confirmed valid on SudokuWiki Nov 2024)
			{puzzle: "650087024000649050040025000570438061000501000310902085000890010000213000130750098", source: "SudokuWiki Klaus Brenner"},
			// From SudokuWiki hidden quad dropdown example
			{puzzle: "000000012000035000000600070700000300080004002003000500020100060500006000010020000", source: "SudokuWiki hidden quad example"},
		},

		// UNIQUE RECTANGLE TYPE 2 - roof cells have same extra candidate
		// Klaus Brenner created exemplar puzzles specifically for UR Types
		"unique-rectangle-type-2": {
			// SudokuWiki UR Type 2 - from dropdown examples
			{puzzle: "040080090000100050800600000500040070090000010010050009000007008020009000080030020", source: "SudokuWiki UR Type 2 dropdown"},
			// Klaus Brenner Exemplar 1 - Type 1 + Type 2
			{puzzle: "000004080000010200300000001060300007000060000900008050200000003003090000010800000", source: "Klaus Brenner Exemplar 1"},
			// Klaus Brenner Exemplar 2 - Type 1 + Type 2
			{puzzle: "000900040005000100002004000000200503040000080106008000000100800009000600020003000", source: "Klaus Brenner Exemplar 2"},
		},

		// UNIQUE RECTANGLE TYPE 3 - extra candidates form naked pair/triple
		"unique-rectangle-type-3": {
			// SudokuWiki UR Type 3 - from dropdown
			{puzzle: "809200000600080000200900050080070030000000000030010020040003007000060008000008605", source: "SudokuWiki UR Type 3 dropdown"},
			// Klaus Brenner Exemplar 7 - Type 3b
			{puzzle: "003700008002800000000009051000008109008000300604900000250100000000002700100003600", source: "Klaus Brenner Exemplar 7"},
		},

		// UNIQUE RECTANGLE TYPE 4 - conjugate pair cracks rectangle
		"unique-rectangle-type-4": {
			// SudokuWiki UR Type 4 - from dropdown
			{puzzle: "000007801007500000060000300010008003300000006400900010001000040000004100903100000", source: "SudokuWiki UR Type 4 dropdown"},
			// Klaus Brenner Exemplar 3 - Type 1 + Type 4
			{puzzle: "700000200060020040003800000000001080040000090020400000000009300080050010002000005", source: "Klaus Brenner Exemplar 3"},
			// Klaus Brenner Exemplar 8 - Type 4 + Type 4
			{puzzle: "000008006004000003020040000100003400003020700006700002000090060700000200500200000", source: "Klaus Brenner Exemplar 8"},
		},

		// WXYZ-WING - 4 cells with 4 digits, one non-restricted common
		"wxyz-wing": {
			// SudokuWiki WXYZ-Wing x3 - from dropdown examples
			{puzzle: "090000150000030000603080000000500840000010000024003000000060205000020000071000030", source: "SudokuWiki WXYZ-Wing dropdown"},
			// SudokuWiki WXYZ-Wing example 1 from documentation
			{puzzle: "000240000008000300010006007100960500006010900004089001400100070007000100000058000", source: "SudokuWiki WXYZ example 1"},
		},

		// AIC - Alternating Inference Chain
		"aic": {
			// SudokuWiki AIC - strong link from dropdown
			{puzzle: "000050200003010940000207001072000000001000700000000430400703000057040100008060000", source: "SudokuWiki AIC strong link dropdown"},
			// SudokuWiki AIC - weak link from dropdown
			{puzzle: "030500000078030005600000070300080207000040000107060004040000009500010640000009010", source: "SudokuWiki AIC weak link dropdown"},
			// SudokuWiki AIC - off chain from dropdown
			{puzzle: "001090040076500002200100007600000901509000806108000003300006005800005170040070600", source: "SudokuWiki AIC off chain dropdown"},
		},

		// DEATH BLOSSOM - ALS pattern with stem and petals
		"death-blossom": {
			// SudokuWiki Death Blossom - Example from documentation page
			{puzzle: "090002000001405200003090000900050000000801000000040009000010600008506400000200070", source: "SudokuWiki Death Blossom figure 1"},
			// Klaus Brenner DB example with 6 eliminations
			{puzzle: "010020300002003010003010020020001003001030200300200040030002001040100600006040070", source: "Klaus Brenner DB 6 elims"},
		},

		// DIGIT FORCING CHAIN - forcing chain on single digit
		"digit-forcing-chain": {
			// SudokuWiki DFC - Figure 1 from documentation
			{puzzle: "800020100700031000000065000080010004030000090600050010000240000000180007004090006", source: "SudokuWiki DFC figure 1"},
			// SudokuWiki Dual Cell Forcing Chain from dropdown
			{puzzle: "000000008090005000065040090700001800049060510006400009050030640000800070300000000", source: "SudokuWiki Dual Cell FC dropdown"},
		},
	}

	humanSolver := NewSolver()

	for technique, puzzles := range candidates {
		for i, pz := range puzzles {
			name := fmt.Sprintf("%s_candidate_%d", technique, i+1)
			t.Run(name, func(t *testing.T) {
				valid, unique, usesTechnique, usedTechniques := ValidatePuzzle(pz.puzzle, technique)

				if !valid {
					t.Skipf("INVALID: Puzzle has no solution. Source: %s", pz.source)
					return
				}
				t.Logf("✓ Puzzle has a solution")

				if !unique {
					t.Skipf("NOT UNIQUE: Puzzle has multiple solutions. Source: %s", pz.source)
					return
				}
				t.Logf("✓ Puzzle has unique solution")

				// Check if human solver can complete it
				cells := make([]int, 81)
				for j, c := range pz.puzzle {
					cells[j] = int(c - '0')
				}
				board := NewBoard(cells)
				moves, status := humanSolver.SolveWithSteps(board, constants.MaxSolverSteps)

				if status != constants.StatusCompleted {
					t.Logf("⚠ Human solver status: %s after %d moves", status, len(moves))
				} else {
					t.Logf("✓ Human solver completed in %d moves", len(moves))
				}

				if usesTechnique {
					t.Logf("✓ SUCCESS: Technique '%s' was used %d times!", technique, usedTechniques[technique])
					t.Logf("  Puzzle: %s", pz.puzzle)
					t.Logf("  Source: %s", pz.source)
				} else {
					t.Skipf("✗ Technique '%s' was NOT used. Techniques used: %v", technique, usedTechniques)
				}
			})
		}
	}
}
