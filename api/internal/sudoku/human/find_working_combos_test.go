package human

import (
	"fmt"
	"testing"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/pkg/constants"
)

// TestFindWorkingCombinations tries different technique disable strategies
// to find combinations where the target technique fires.
// Run with: go test -v -run TestFindWorkingCombinations ./internal/sudoku/human/
func TestFindWorkingCombinations(t *testing.T) {
	// Techniques that need valid puzzles and their current puzzle
	problematicTechniques := map[string]string{
		"hidden-pair":   SimpleMediumTechniquePuzzles["hidden-pair"].Puzzle,
		"w-wing":        HardTechniquePuzzles["w-wing"].Puzzle,
		"finned-x-wing": ExtremeTechniquePuzzles["finned-x-wing"],
		"finned-swordfish": ExtremeTechniquePuzzles["finned-swordfish"],
		"forcing-chain": ExtremeTechniquePuzzles["forcing-chain"],
		"sue-de-coq":    ExtremeTechniquePuzzles["sue-de-coq"],
	}

	// Techniques that might compete with our targets
	competingTechniques := []string{
		"als-xz", "als-xy-wing", "als-xy-chain",
		"xy-chain", "x-chain",
		"simple-coloring", "medusa-3d",
		"digit-forcing-chain",
		"grouped-x-cycles",
	}

	for targetSlug, puzzle := range problematicTechniques {
		t.Run(targetSlug, func(t *testing.T) {
			// First verify puzzle is valid
			cells := parsePuzzleString(puzzle)
			if dp.Solve(cells) == nil {
				t.Logf("❌ INVALID puzzle for %s - skipping", targetSlug)
				return
			}
			if !dp.HasUniqueSolution(cells) {
				t.Logf("❌ NOT UNIQUE puzzle for %s - skipping", targetSlug)
				return
			}

			t.Logf("✓ Valid puzzle for %s, trying technique combinations...", targetSlug)

			// Try different strategies
			strategies := []struct {
				Name     string
				Strategy TechniqueIsolationStrategy
			}{
				{"DisableHigherTiers", DisableHigherTiers},
				{"DisableSameAndHigherOrder", DisableSameAndHigherOrder},
				{"DisableAllExceptTargetAndBasics", DisableAllExceptTargetAndBasics},
			}

			for _, strat := range strategies {
				config := TechniqueTestConfig{
					MaxSteps: 300,
					Strategy: strat.Strategy,
				}
				result := TestTechniqueDetection(puzzle, targetSlug, config)
				
				if result.Detected {
					t.Logf("  ✅ %s: DETECTED! Status=%s, Techniques=%v", 
						strat.Name, result.Status, result.TechniquesUsed)
				} else {
					t.Logf("  ⚠️  %s: not detected. Status=%s, Used=%v",
						strat.Name, result.Status, result.TechniquesUsed)
				}
			}

			// Try disabling specific competing techniques one at a time
			t.Logf("  Trying specific technique disabling...")
			for _, disableSlug := range competingTechniques {
				registry := NewTechniqueRegistry()
				registry.SetEnabled(disableSlug, false)
				solver := NewSolverWithRegistry(registry)
				
				board := NewBoard(cells)
				moves, status := solver.SolveWithSteps(board, 300)
				
				found := false
				techCounts := make(map[string]int)
				for _, m := range moves {
					techCounts[m.Technique]++
					if m.Technique == targetSlug {
						found = true
					}
				}
				
				if found && status == constants.StatusCompleted {
					t.Logf("    ✅ Disabling %s: %s was DETECTED!", disableSlug, targetSlug)
				}
			}

			// Try disabling ALL competing techniques at once
			registry := NewTechniqueRegistry()
			for _, slug := range competingTechniques {
				registry.SetEnabled(slug, false)
			}
			solver := NewSolverWithRegistry(registry)
			board := NewBoard(cells)
			moves, status := solver.SolveWithSteps(board, 300)
			
			found := false
			techCounts := make(map[string]int)
			for _, m := range moves {
				techCounts[m.Technique]++
				if m.Technique == targetSlug {
					found = true
				}
			}
			
			if found {
				t.Logf("  ✅✅ Disabling ALL competing: %s DETECTED! Status=%s", targetSlug, status)
				t.Logf("      Techniques used: %v", techCounts)
			} else {
				t.Logf("  ❌ Even with all competing disabled: %s not detected. Status=%s, Used=%v",
					targetSlug, status, techCounts)
			}
		})
	}
}

// TestHiddenPairWithDisabling specifically tests hidden-pair with strategic disabling
func TestHiddenPairWithDisabling(t *testing.T) {
	puzzle := SimpleMediumTechniquePuzzles["hidden-pair"].Puzzle
	cells := parsePuzzleString(puzzle)
	
	if dp.Solve(cells) == nil {
		t.Fatal("Invalid puzzle")
	}
	
	// What happens with just singles enabled?
	registry := NewTechniqueRegistry()
	for _, tech := range registry.GetAll() {
		if tech.Slug != "hidden-pair" && 
		   tech.Slug != "naked-single" && 
		   tech.Slug != "hidden-single" {
			registry.SetEnabled(tech.Slug, false)
		}
	}
	
	solver := NewSolverWithRegistry(registry)
	board := NewBoard(cells)
	moves, status := solver.SolveWithSteps(board, 300)
	
	techCounts := make(map[string]int)
	for _, m := range moves {
		techCounts[m.Technique]++
	}
	
	t.Logf("With only singles + hidden-pair: Status=%s, Techniques=%v", status, techCounts)
	
	if techCounts["hidden-pair"] > 0 {
		t.Logf("✅ hidden-pair WAS USED!")
	} else {
		t.Logf("❌ hidden-pair was NOT used - puzzle may be too easy")
		t.Logf("   This puzzle can be solved with just: %v", techCounts)
		t.Logf("   We need a harder puzzle that REQUIRES hidden-pair")
	}
}

// TestSearchPuzzleBankForTechnique searches our puzzle definitions for working puzzles
func TestSearchPuzzleBankForTechnique(t *testing.T) {
	// All puzzles from all test files
	allPuzzles := make(map[string]string)
	
	for slug, data := range SimpleMediumTechniquePuzzles {
		allPuzzles[fmt.Sprintf("SM_%s", slug)] = data.Puzzle
	}
	for slug, data := range HardTechniquePuzzles {
		allPuzzles[fmt.Sprintf("H_%s", slug)] = data.Puzzle
	}
	for slug, puzzle := range ExtremeTechniquePuzzles {
		allPuzzles[fmt.Sprintf("E_%s", slug)] = puzzle
	}
	
	// For each missing technique, try ALL puzzles
	missingTechniques := []string{"hidden-pair"}
	
	for _, targetSlug := range missingTechniques {
		t.Run(targetSlug, func(t *testing.T) {
			t.Logf("Searching all puzzles for one that uses %s...", targetSlug)
			
			found := false
			for puzzleName, puzzle := range allPuzzles {
				cells := parsePuzzleString(puzzle)
				if dp.Solve(cells) == nil || !dp.HasUniqueSolution(cells) {
					continue
				}
				
				// Try with DisableHigherTiers based on technique tier
				config := TechniqueTestConfig{
					MaxSteps: 300,
					Strategy: DisableHigherTiers,
				}
				result := TestTechniqueDetection(puzzle, targetSlug, config)
				
				if result.Detected && result.Status == constants.StatusCompleted {
					t.Logf("  ✅ Found! Puzzle '%s' uses %s", puzzleName, targetSlug)
					t.Logf("     Puzzle: %s", puzzle)
					found = true
				}
			}
			
			if !found {
				t.Logf("  ❌ No puzzle in our bank uses %s", targetSlug)
			}
		})
	}
}

// TestSearchAllPuzzlesForMissing searches all puzzles for techniques that need valid puzzles
func TestSearchAllPuzzlesForMissing(t *testing.T) {
	// All puzzles from all test files
	allPuzzles := make(map[string]string)
	
	for slug, data := range SimpleMediumTechniquePuzzles {
		allPuzzles["SM_"+slug] = data.Puzzle
	}
	for slug, data := range HardTechniquePuzzles {
		allPuzzles["H_"+slug] = data.Puzzle
	}
	for slug, puzzle := range ExtremeTechniquePuzzles {
		allPuzzles["E_"+slug] = puzzle
	}
	
	// Techniques we need to find puzzles for
	missingTechniques := []string{
		"w-wing",
		"jellyfish", "swordfish",
		"bug", "empty-rectangle", "unique-rectangle",
		"wxyz-wing", "x-chain", "xy-chain", "xyz-wing",
	}
	
	for _, targetSlug := range missingTechniques {
		t.Run(targetSlug, func(t *testing.T) {
			t.Logf("Searching all puzzles for one that uses %s...", targetSlug)
			
			foundValid := []string{}
			for puzzleName, puzzle := range allPuzzles {
				cells := parsePuzzleString(puzzle)
				if dp.Solve(cells) == nil || !dp.HasUniqueSolution(cells) {
					continue
				}
				
				// Try full solver first
				solver := NewSolver()
				board := NewBoard(cells)
				moves, status := solver.SolveWithSteps(board, 300)
				
				if status != constants.StatusCompleted {
					continue
				}
				
				for _, m := range moves {
					if m.Technique == targetSlug {
						foundValid = append(foundValid, puzzleName)
						t.Logf("  ✅ Found! '%s' uses %s", puzzleName, targetSlug)
						t.Logf("     Puzzle: %s", puzzle)
						break
					}
				}
			}
			
			if len(foundValid) == 0 {
				t.Logf("  ❌ No puzzle in our bank uses %s", targetSlug)
			} else {
				t.Logf("  Found %d puzzles using %s", len(foundValid), targetSlug)
			}
		})
	}
}
