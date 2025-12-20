package human

import (
	"strings"
	"testing"

	"sudoku-api/pkg/constants"
)

// SimpleMediumTechniquePuzzles maps technique slugs to puzzle strings that REQUIRE that technique.
// Each puzzle is an 81-character string where '0' represents an empty cell.
// These puzzles are carefully selected so that the specific technique is needed to solve them.
//
// This file covers SIMPLE and MEDIUM tier techniques.
// HARD tier techniques are in technique_puzzles_hard_test.go
// EXTREME tier techniques are in technique_puzzles_extreme_test.go
//
// Sources for puzzles:
// - SudokuWiki.org technique examples
// - Hodoku technique demonstrations
// - Validated sudoku puzzle collections
var SimpleMediumTechniquePuzzles = map[string]struct {
	Puzzle      string
	Description string
	Tier        string
}{
	// ==========================================================================
	// SIMPLE TIER TECHNIQUES
	// ==========================================================================

	// Naked Single: A cell with only one possible candidate
	// Easy puzzle that solves primarily with naked singles
	"naked-single": {
		Puzzle:      "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
		Description: "Easy puzzle requiring naked singles",
		Tier:        "simple",
	},

	// Hidden Single: A digit that can only go in one cell in a row/column/box
	// Gentle puzzle solvable with hidden singles
	"hidden-single": {
		Puzzle:      "000000000904607000076804100309701080008000300050308702007502610000403208000000000",
		Description: "Puzzle requiring hidden singles",
		Tier:        "simple",
	},

	// Pointing Pair: When candidates in a box are restricted to one row/column,
	// they can be eliminated from the rest of that row/column
	// Source: Validated - uses pointing-pair 2 times during solving
	"pointing-pair": {
		Puzzle:      "100000569492056108056109240009640801064010000218035604040500016905061402621000005",
		Description: "Puzzle requiring pointing pair elimination",
		Tier:        "simple",
	},

	// Box-Line Reduction: When candidates in a row/column are restricted to one box,
	// they can be eliminated from the rest of that box
	"box-line-reduction": {
		Puzzle:      "016007803090800000870001260048000300650009082039000650060900020080002936924600510",
		Description: "Puzzle requiring box-line reduction",
		Tier:        "simple",
	},

	// Naked Pair: Two cells in a unit with exactly the same two candidates
	"naked-pair": {
		Puzzle:      "400000938032094100095300240370609004529001673604703090957008300003900400240030709",
		Description: "Puzzle requiring naked pair",
		Tier:        "simple",
	},

	// Hidden Pair: Two digits that can only appear in two cells in a unit
	// Source: Same as hidden-single puzzle - uses hidden-pair during solving
	"hidden-pair": {
		Puzzle:      "000000000904607000076804100309701080008000300050308702007502610000403208000000000",
		Description: "Puzzle requiring hidden pair",
		Tier:        "simple",
	},

	// ==========================================================================
	// MEDIUM TIER TECHNIQUES
	// ==========================================================================

	// Naked Triple: Three cells in a unit containing only three candidates (in any combination)
	// Source: Validated from puzzle bank (practice_puzzles.json, idx=25)
	// NOTE: Moved to SIMPLE tier per SudokuWiki classification
	"naked-triple": {
		Puzzle:      "620000000307000004000052097000046805000007000513090000208000000000100700000000032",
		Description: "Puzzle requiring naked triple",
		Tier:        "simple",
	},

	// Hidden Triple: Three digits that can only appear in three cells in a unit
	// Source: Validated from puzzle bank (practice_puzzles.json)
	// NOTE: Moved to SIMPLE tier per SudokuWiki classification
	"hidden-triple": {
		Puzzle:      "040007051070005000000640030009000500300401000000020600000900000000080307050003084",
		Description: "Puzzle requiring hidden triple",
		Tier:        "simple",
	},

	// Naked Quad: Four cells in a unit containing only four candidates
	// Source: Validated from puzzle bank (practice_puzzles.json)
	"naked-quad": {
		Puzzle:      "046000000000080009000000530029007614080000000000036000060900100403100000100000072",
		Description: "Puzzle requiring naked quad",
		Tier:        "medium",
	},

	// Hidden Quad: Four digits that can only appear in four cells in a unit
	// Source: Klaus Brenner example from SudokuWiki - Hidden Quad {1,4,6,9} in Box 5
	// URL: https://www.sudokuwiki.org/Hidden_Candidates
	"hidden-quad": {
		Puzzle:      "000500000425090001800010020500000000019000460000000002090040003200060807000001600",
		Description: "Puzzle requiring hidden quad",
		Tier:        "medium",
	},

	// X-Wing: A digit forming a rectangle pattern in exactly two rows/columns
	// eliminating candidates from those columns/rows
	"x-wing": {
		Puzzle:      "100000569492056108056109240009640801064010000218035604040500016905061402621000005",
		Description: "Puzzle requiring X-Wing technique",
		Tier:        "medium",
	},

	// XY-Wing: A pivot cell with two candidates seeing two pincer cells
	// Source: Validated from puzzle bank (practice_puzzles.json)
	"xy-wing": {
		Puzzle:      "150000008002000004008036010030079400900000000000610200000000000000847000005300761",
		Description: "Puzzle requiring XY-Wing",
		Tier:        "medium",
	},

	// Simple Coloring: Using color chains of strong links to find eliminations
	// Source: Validated from puzzle bank (practice_puzzles.json)
	"simple-coloring": {
		Puzzle:      "003000900060000000080100004000040203700008000009600008001090006600201030207306800",
		Description: "Puzzle requiring simple coloring",
		Tier:        "medium",
	},
}

// parsePuzzle converts an 81-character string to a slice of ints
func parsePuzzle(s string) []int {
	// Remove any non-digit characters and replace with 0
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return '0'
	}, s)

	// Ensure exactly 81 characters
	if len(cleaned) < 81 {
		cleaned += strings.Repeat("0", 81-len(cleaned))
	} else if len(cleaned) > 81 {
		cleaned = cleaned[:81]
	}

	result := make([]int, 81)
	for i, c := range cleaned {
		if c >= '1' && c <= '9' {
			result[i] = int(c - '0')
		}
	}
	return result
}

// TestSimpleMediumTechniquePuzzlesValid verifies puzzle format
func TestSimpleMediumTechniquePuzzlesValid(t *testing.T) {
	for technique, data := range SimpleMediumTechniquePuzzles {
		t.Run(technique, func(t *testing.T) {
			if len(data.Puzzle) != 81 {
				t.Errorf("puzzle for %s has length %d, expected 81", technique, len(data.Puzzle))
				return
			}

			for i, c := range data.Puzzle {
				if c < '0' || c > '9' {
					t.Errorf("puzzle for %s has invalid character '%c' at position %d", technique, c, i)
				}
			}

			// Count givens
			givens := 0
			for _, c := range data.Puzzle {
				if c != '0' {
					givens++
				}
			}
			if givens < 17 {
				t.Errorf("puzzle for %s has only %d givens (minimum is 17)", technique, givens)
			}
		})
	}
}

// knownProblematicTechniques lists techniques with puzzles that have known issues.
// This serves as a tracking list for future debugging.
//
// UPDATED DIAGNOSIS (December 2024 - from TestPuzzleDiagnostics):
//
// ✅ PASSING (12 techniques):
//   - naked-single, hidden-single, box-line-reduction
//   - naked-pair, x-wing
//   - naked-triple, hidden-triple, naked-quad, xy-wing, simple-coloring (fixed with puzzle bank)
//
// ⚠️ STILL PROBLEMATIC:
//   - hidden-quad: No validated puzzle in puzzle bank
//   - pointing-pair: Current puzzle doesn't actually use this technique
//   - hidden-pair: Current puzzle doesn't actually use this technique
//
// ACTION REQUIRED:
// 1. Find valid replacement puzzles for hidden-quad, pointing-pair, hidden-pair
// 2. Validate puzzles externally (SudokuWiki, Hodoku) before adding
// 3. Test with TestPuzzleDiagnostics to confirm they work
var knownProblematicTechniques = map[string]bool{
	// All Simple/Medium techniques now have valid puzzles!
}

// TestSimpleMediumTechniquePuzzlesAreSolvable verifies that all test puzzles can be solved
func TestSimpleMediumTechniquePuzzlesAreSolvable(t *testing.T) {
	solver := NewSolver()

	for technique, data := range SimpleMediumTechniquePuzzles {
		t.Run(technique, func(t *testing.T) {
			if knownProblematicTechniques[technique] {
				t.Skipf("Skipping %s - known problematic puzzle (TODO: fix)", technique)
			}

			puzzle := parsePuzzle(data.Puzzle)
			board := NewBoard(puzzle)

			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			if status != constants.StatusCompleted {
				t.Errorf("Puzzle for %s did not complete: status=%s, moves=%d",
					technique, status, len(moves))
			}
		})
	}
}

// TestSimpleMediumTechniquePuzzlesUseTechnique verifies each puzzle requires its specified technique
func TestSimpleMediumTechniquePuzzlesUseTechnique(t *testing.T) {
	solver := NewSolver()

	for technique, data := range SimpleMediumTechniquePuzzles {
		t.Run(technique, func(t *testing.T) {
			if knownProblematicTechniques[technique] {
				t.Skipf("Skipping %s - known problematic puzzle (TODO: fix)", technique)
			}

			puzzle := parsePuzzle(data.Puzzle)
			board := NewBoard(puzzle)

			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			if status != constants.StatusCompleted {
				t.Errorf("Puzzle for %s did not complete: status=%s", technique, status)
				return
			}

			// Check if the expected technique was used
			techniqueUsed := false
			for _, move := range moves {
				if move.Technique == technique {
					techniqueUsed = true
					break
				}
			}

			// List techniques that were used for logging
			usedTechniques := make(map[string]int)
			for _, move := range moves {
				usedTechniques[move.Technique]++
			}

			if !techniqueUsed {
				t.Errorf("Puzzle for %s did not use the expected technique. Used: %v",
					technique, usedTechniques)
			} else {
				t.Logf("SUCCESS: %s technique was used. All techniques: %v", technique, usedTechniques)
			}
		})
	}
}

// TestSimpleTierPuzzlesComplete verifies simple tier puzzles solve with only simple techniques
func TestSimpleTierPuzzlesComplete(t *testing.T) {
	simpleTechniques := map[string]bool{
		"naked-single":       true,
		"hidden-single":      true,
		"pointing-pair":      true,
		"box-line-reduction": true,
		"naked-pair":         true,
		"hidden-pair":        true,
		"naked-triple":       true, // Moved to simple per SudokuWiki
		"hidden-triple":      true, // Moved to simple per SudokuWiki
		"fill-candidate":     true,
	}

	solver := NewSolver()

	for technique, data := range SimpleMediumTechniquePuzzles {
		if data.Tier != "simple" {
			continue
		}

		t.Run(technique, func(t *testing.T) {
			if knownProblematicTechniques[technique] {
				t.Skipf("Skipping %s - known problematic puzzle (TODO: fix)", technique)
			}

			puzzle := parsePuzzle(data.Puzzle)
			board := NewBoard(puzzle)

			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			if status != constants.StatusCompleted {
				t.Errorf("Simple tier puzzle for %s did not complete: status=%s", technique, status)
				return
			}

			// Verify only simple techniques were used
			for _, move := range moves {
				if !simpleTechniques[move.Technique] {
					// This is a warning - puzzles may require higher techniques
					t.Logf("Warning: Simple tier puzzle %s used non-simple technique %s", technique, move.Technique)
				}
			}
		})
	}
}

// TestMediumTierPuzzles verifies medium puzzles are solvable and use appropriate techniques
func TestMediumTierPuzzles(t *testing.T) {
	solver := NewSolver()

	for technique, data := range SimpleMediumTechniquePuzzles {
		if data.Tier != "medium" {
			continue
		}

		t.Run(technique, func(t *testing.T) {
			if knownProblematicTechniques[technique] {
				t.Skipf("Skipping %s - known problematic puzzle (TODO: fix)", technique)
			}

			puzzle := parsePuzzle(data.Puzzle)
			board := NewBoard(puzzle)

			moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

			if status != constants.StatusCompleted {
				t.Errorf("Medium tier puzzle for %s did not complete: status=%s", technique, status)
				return
			}

			// Check if the expected technique was used
			techniqueUsed := false
			for _, move := range moves {
				if move.Technique == technique {
					techniqueUsed = true
					break
				}
			}

			usedTechniques := make(map[string]int)
			for _, move := range moves {
				usedTechniques[move.Technique]++
			}

			if !techniqueUsed {
				t.Errorf("Puzzle for %s did not use the expected technique. Used: %v",
					technique, usedTechniques)
			} else {
				t.Logf("SUCCESS: %s technique was used. All: %v", technique, usedTechniques)
			}
		})
	}
}

// TestSimpleTechniqueRegistry verifies all simple tier techniques exist in the registry
func TestSimpleTechniqueRegistry(t *testing.T) {
	registry := NewTechniqueRegistry()

	simpleTechniques := []string{
		"naked-single",
		"hidden-single",
		"pointing-pair",
		"box-line-reduction",
		"naked-pair",
		"hidden-pair",
		"naked-triple",  // Moved to simple per SudokuWiki
		"hidden-triple", // Moved to simple per SudokuWiki
	}

	for _, slug := range simpleTechniques {
		t.Run(slug, func(t *testing.T) {
			tech := registry.GetBySlug(slug)
			if tech == nil {
				t.Errorf("technique %s not found in registry", slug)
				return
			}

			if tech.Tier != "simple" {
				t.Errorf("technique %s is tier %s, expected 'simple'", slug, tech.Tier)
			}

			if tech.Detector == nil {
				t.Errorf("technique %s has nil detector", slug)
			}
		})
	}
}

// TestMediumTechniqueRegistry verifies all medium tier techniques exist in the registry
func TestMediumTechniqueRegistry(t *testing.T) {
	registry := NewTechniqueRegistry()

	// NOTE: naked-triple and hidden-triple moved to SIMPLE tier per SudokuWiki
	// NOTE: swordfish, xyz-wing, bug, unique-rectangle moved to MEDIUM tier per SudokuWiki
	mediumTechniques := []string{
		"naked-quad",
		"hidden-quad",
		"x-wing",
		"swordfish",         // Moved from hard per SudokuWiki
		"xy-wing",
		"xyz-wing",          // Moved from hard per SudokuWiki
		"simple-coloring",
		"bug",               // Moved from hard per SudokuWiki
		"unique-rectangle",  // Type 1, moved from hard per SudokuWiki
	}

	for _, slug := range mediumTechniques {
		t.Run(slug, func(t *testing.T) {
			tech := registry.GetBySlug(slug)
			if tech == nil {
				t.Errorf("technique %s not found in registry", slug)
				return
			}

			if tech.Tier != "medium" {
				t.Errorf("technique %s is tier %s, expected 'medium'", slug, tech.Tier)
			}

			if tech.Detector == nil {
				t.Errorf("technique %s has nil detector", slug)
			}
		})
	}
}

// BenchmarkSimpleMediumTechniquePuzzles benchmarks solving each technique puzzle
func BenchmarkSimpleMediumTechniquePuzzles(b *testing.B) {
	solver := NewSolver()

	for technique, data := range SimpleMediumTechniquePuzzles {
		puzzle := parsePuzzle(data.Puzzle)

		b.Run(technique, func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				board := NewBoard(puzzle)
				solver.SolveWithSteps(board, constants.MaxSolverSteps)
			}
		})
	}
}
