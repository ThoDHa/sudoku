package main

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
)

func main() {
	difficulties := []string{"easy", "medium", "hard", "extreme"}
	puzzlesPerDifficulty := 100

	// Track technique usage across all puzzles
	techniqueUsage := make(map[string]int)
	techniqueByDifficulty := make(map[string]map[string]int)

	// Track results
	results := make(map[string]struct {
		completed int
		stalled   int
		failed    int
	})

	allTechniques := []string{
		"naked-single", "hidden-single", "pointing-pair", "box-line-reduction",
		"naked-pair", "hidden-pair", "naked-triple", "hidden-triple",
		"naked-quad", "hidden-quad", "x-wing", "xy-wing", "simple-coloring",
		"swordfish", "skyscraper", "finned-x-wing", "unique-rectangle",
		"bug", "jellyfish", "x-chain", "xy-chain", "w-wing", "empty-rectangle",
	}

	// Initialize technique counts
	for _, t := range allTechniques {
		techniqueUsage[t] = 0
	}

	fmt.Println("========================================")
	fmt.Println("Sudoku Puzzle Solver Test Suite")
	fmt.Println("========================================")
	fmt.Printf("Testing %d puzzles per difficulty\n", puzzlesPerDifficulty)
	fmt.Println()

	totalStart := time.Now()

	// Target givens per difficulty
	targetGivens := map[string]int{
		"easy":   40,
		"medium": 34,
		"hard":   28,
		"extreme": 24,
	}

	for _, difficulty := range difficulties {
		fmt.Printf("\nTesting %s puzzles...\n", strings.ToUpper(difficulty))
		fmt.Println(strings.Repeat("-", 40))

		techniqueByDifficulty[difficulty] = make(map[string]int)
		completed := 0
		stalled := 0
		failed := 0

		for i := 1; i <= puzzlesPerDifficulty; i++ {
			seed := int64(time.Now().UnixNano()) + int64(i)*1000

			// Generate puzzle using dp package
			fullGrid := dp.GenerateFullGrid(seed)
			givens := dp.CarveGivens(fullGrid, targetGivens[difficulty], seed)

			// Create solver and board
			solver := human.NewSolver()
			board := human.NewBoard(givens)

			// Solve puzzle
			moves, status := solver.SolveWithSteps(board, 500)

			switch status {
			case "completed":
				fmt.Printf(".")
				completed++

				// Count techniques
				for _, move := range moves {
					techniqueUsage[move.Technique]++
					techniqueByDifficulty[difficulty][move.Technique]++
				}

			case "stalled":
				fmt.Printf("S")
				stalled++

				// For stalled puzzles, verify with DP solver that it's solvable
				if solution := dp.Solve(givens); solution != nil {
					// Puzzle is solvable but human solver can't solve it
					// This means we need more advanced techniques
				}

			default:
				fmt.Printf("?")
				failed++
			}

			// Progress indicator every 10 puzzles
			if i%10 == 0 {
				fmt.Printf(" [%d/%d]\n", i, puzzlesPerDifficulty)
			}
		}

		if puzzlesPerDifficulty%10 != 0 {
			fmt.Println()
		}

		results[difficulty] = struct {
			completed int
			stalled   int
			failed    int
		}{completed, stalled, failed}

		fmt.Printf("Results: %d completed, %d stalled, %d failed\n",
			completed, stalled, failed)
	}

	elapsed := time.Since(totalStart)

	// Print summary
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("SUMMARY")
	fmt.Println("========================================")
	fmt.Printf("Total time: %v\n", elapsed)
	fmt.Println()

	// Results by difficulty
	fmt.Println("Results by difficulty:")
	totalCompleted := 0
	totalStalled := 0
	totalFailed := 0
	for _, d := range difficulties {
		r := results[d]
		fmt.Printf("  %s: %d/%d completed", d, r.completed, puzzlesPerDifficulty)
		if r.stalled > 0 {
			fmt.Printf(", %d stalled", r.stalled)
		}
		if r.failed > 0 {
			fmt.Printf(", %d failed", r.failed)
		}
		fmt.Println()
		totalCompleted += r.completed
		totalStalled += r.stalled
		totalFailed += r.failed
	}

	fmt.Println()
	fmt.Printf("Total: %d/%d completed, %d stalled, %d failed\n",
		totalCompleted, puzzlesPerDifficulty*len(difficulties),
		totalStalled, totalFailed)

	// Technique usage
	fmt.Println()
	fmt.Println("Technique usage (sorted by count):")
	fmt.Println(strings.Repeat("-", 50))

	// Sort by count
	type techCount struct {
		name  string
		count int
	}
	var sorted []techCount
	for name, count := range techniqueUsage {
		sorted = append(sorted, techCount{name, count})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})

	usedTechniques := 0
	unusedTechniques := []string{}
	for _, tc := range sorted {
		if tc.count > 0 {
			fmt.Printf("  + %-25s %d\n", tc.name, tc.count)
			usedTechniques++
		} else {
			unusedTechniques = append(unusedTechniques, tc.name)
		}
	}

	fmt.Println()
	if len(unusedTechniques) > 0 {
		fmt.Println("Techniques NOT used:")
		for _, t := range unusedTechniques {
			fmt.Printf("  - %s\n", t)
		}
	} else {
		fmt.Println("All techniques were used!")
	}

	// Technique usage by difficulty
	fmt.Println()
	fmt.Println("Technique usage by difficulty:")
	fmt.Println(strings.Repeat("-", 70))
	fmt.Printf("%-25s %8s %8s %8s %8s\n", "Technique", "Easy", "Medium", "Hard", "Extreme")
	fmt.Println(strings.Repeat("-", 70))

	for _, tc := range sorted {
		if tc.count > 0 {
			fmt.Printf("%-25s", tc.name)
			for _, d := range difficulties {
				count := techniqueByDifficulty[d][tc.name]
				if count > 0 {
					fmt.Printf(" %8d", count)
				} else {
					fmt.Printf(" %8s", "-")
				}
			}
			fmt.Println()
		}
	}

	// Final status
	fmt.Println()
	fmt.Println("========================================")
	if totalStalled == 0 && totalFailed == 0 {
		fmt.Println("SUCCESS: All puzzles were solved!")
	} else if totalFailed == 0 {
		fmt.Printf("WARNING: %d puzzles stalled (need more advanced techniques)\n", totalStalled)
	} else {
		fmt.Printf("FAILED: %d puzzles failed, %d stalled\n", totalFailed, totalStalled)
	}
	fmt.Println("========================================")
}
