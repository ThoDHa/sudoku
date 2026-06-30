package main

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
)

type techCount struct {
	name  string
	count int
}

func sortedTechCounts(counts map[string]int) []techCount {
	sorted := make([]techCount, 0, len(counts))
	for name, count := range counts {
		sorted = append(sorted, techCount{name, count})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})
	return sorted
}

type difficultyResult struct {
	completed int
	stalled   int
	failed    int
}

// solveOneDifficulty generates and solves puzzlesPerDifficulty puzzles at the
// given target given-count, updating the per-difficulty and global technique
// tallies and returning the outcome counts.
func solveOneDifficulty(difficulty string, puzzlesPerDifficulty, targetGiven int,
	techniqueUsage, techniqueByDifficulty map[string]int) difficultyResult {
	fmt.Printf("\nTesting %s puzzles...\n", strings.ToUpper(difficulty))
	fmt.Println(strings.Repeat("-", 40))

	r := difficultyResult{}
	for i := 1; i <= puzzlesPerDifficulty; i++ {
		seed := time.Now().UnixNano() + int64(i)*1000

		fullGrid := dp.GenerateFullGrid(seed)
		givens := dp.CarveGivens(fullGrid, targetGiven, seed)

		solver := human.NewSolver()
		board := human.NewBoard(givens)

		moves, status := solver.SolveWithSteps(board, 500)

		switch status {
		case "completed":
			fmt.Printf(".")
			r.completed++
			for _, move := range moves {
				techniqueUsage[move.Technique]++
				techniqueByDifficulty[move.Technique]++
			}
		case "stalled":
			fmt.Printf("S")
			r.stalled++
			// Stalled puzzles are DP-solvable, so the human solver is just
			// missing techniques; this call exists to exercise the DP path.
			_ = dp.Solve(givens)
		default:
			fmt.Printf("?")
			r.failed++
		}

		if i%10 == 0 {
			fmt.Printf(" [%d/%d]\n", i, puzzlesPerDifficulty)
		}
	}
	if puzzlesPerDifficulty%10 != 0 {
		fmt.Println()
	}
	fmt.Printf("Results: %d completed, %d stalled, %d failed\n", r.completed, r.stalled, r.failed)
	return r
}

func printDifficultyResults(difficulties []string, results map[string]difficultyResult, puzzlesPerDifficulty int) (totalCompleted, totalStalled, totalFailed int) {
	fmt.Println("Results by difficulty:")
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
	return totalCompleted, totalStalled, totalFailed
}

// printTechniqueTables prints the global technique-usage list (marking which
// techniques went unused) followed by the per-difficulty breakdown table.
func printTechniqueTables(difficulties []string, techniqueUsage map[string]int, techniqueByDifficulty map[string]map[string]int) {
	sorted := sortedTechCounts(techniqueUsage)

	fmt.Println()
	fmt.Println("Technique usage (sorted by count):")
	fmt.Println(strings.Repeat("-", 50))

	var unusedTechniques []string
	for _, tc := range sorted {
		if tc.count > 0 {
			fmt.Printf("  + %-25s %d\n", tc.name, tc.count)
		} else {
			unusedTechniques = append(unusedTechniques, tc.name)
		}
	}

	fmt.Println()
	switch {
	case len(unusedTechniques) > 0:
		fmt.Println("Techniques NOT used:")
		for _, t := range unusedTechniques {
			fmt.Printf("  - %s\n", t)
		}
	default:
		fmt.Println("All techniques were used!")
	}

	fmt.Println()
	fmt.Println("Technique usage by difficulty:")
	fmt.Println(strings.Repeat("-", 70))
	fmt.Printf("%-25s %8s %8s %8s %8s\n", "Technique", "Easy", "Medium", "Hard", "Extreme")
	fmt.Println(strings.Repeat("-", 70))
	for _, tc := range sorted {
		if tc.count <= 0 {
			continue
		}
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

func printSummary(difficulties []string, results map[string]difficultyResult,
	techniqueUsage map[string]int, techniqueByDifficulty map[string]map[string]int, puzzlesPerDifficulty int, elapsed time.Duration) {
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("SUMMARY")
	fmt.Println("========================================")
	fmt.Printf("Total time: %v\n", elapsed)
	fmt.Println()

	totalCompleted, totalStalled, totalFailed := printDifficultyResults(difficulties, results, puzzlesPerDifficulty)

	fmt.Println()
	fmt.Printf("Total: %d/%d completed, %d stalled, %d failed\n",
		totalCompleted, puzzlesPerDifficulty*len(difficulties),
		totalStalled, totalFailed)

	printTechniqueTables(difficulties, techniqueUsage, techniqueByDifficulty)

	fmt.Println()
	fmt.Println("========================================")
	switch {
	case totalStalled == 0 && totalFailed == 0:
		fmt.Println("SUCCESS: All puzzles were solved!")
	case totalFailed == 0:
		fmt.Printf("WARNING: %d puzzles stalled (need more advanced techniques)\n", totalStalled)
	default:
		fmt.Printf("FAILED: %d puzzles failed, %d stalled\n", totalFailed, totalStalled)
	}
	fmt.Println("========================================")
}

func main() {
	difficulties := []string{"easy", "medium", "hard", "extreme"}
	puzzlesPerDifficulty := 100

	techniqueUsage := make(map[string]int)
	techniqueByDifficulty := make(map[string]map[string]int)
	results := make(map[string]difficultyResult)

	allTechniques := []string{
		"naked-single", "hidden-single", "pointing-pair", "box-line-reduction",
		"naked-pair", "hidden-pair", "naked-triple", "hidden-triple",
		"naked-quad", "hidden-quad", "x-wing", "xy-wing", "simple-coloring",
		"swordfish", "skyscraper", "finned-x-wing", "unique-rectangle",
		"bug", "jellyfish", "x-chain", "xy-chain", "w-wing", "empty-rectangle",
	}
	for _, t := range allTechniques {
		techniqueUsage[t] = 0
	}

	fmt.Println("========================================")
	fmt.Println("Sudoku Puzzle Solver Test Suite")
	fmt.Println("========================================")
	fmt.Printf("Testing %d puzzles per difficulty\n", puzzlesPerDifficulty)
	fmt.Println()

	totalStart := time.Now()

	targetGivens := map[string]int{
		"easy":    40,
		"medium":  34,
		"hard":    28,
		"extreme": 24,
	}

	for _, difficulty := range difficulties {
		techniqueByDifficulty[difficulty] = make(map[string]int)
		results[difficulty] = solveOneDifficulty(
			difficulty, puzzlesPerDifficulty, targetGivens[difficulty],
			techniqueUsage, techniqueByDifficulty[difficulty])
	}

	printSummary(difficulties, results, techniqueUsage, techniqueByDifficulty,
		puzzlesPerDifficulty, time.Since(totalStart))
}
