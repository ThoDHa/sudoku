package main

import (
	"flag"
	"fmt"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"
)

type PuzzleResult struct {
	Seed           int64
	Status         string
	Moves          int
	EmptyCells     int
	Contradiction  bool
	TechniqueUsage map[string]int
	LastTechniques []string
}

func solvePuzzle(seed int64) PuzzleResult {
	// Generate puzzle
	fullGrid := dp.GenerateFullGrid(seed)
	givens := dp.CarveGivens(fullGrid, 20, seed) // 20 givens = impossible difficulty

	solver := human.NewSolver()
	board := human.NewBoard(givens)
	moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

	result := PuzzleResult{
		Seed:           seed,
		Status:         status,
		Moves:          len(moves),
		TechniqueUsage: make(map[string]int),
	}

	// Count empty cells
	for i := 0; i < 81; i++ {
		if board.Cells[i] == 0 {
			result.EmptyCells++
		}
	}

	// Track techniques
	var recentTechniques []string
	for _, m := range moves {
		if m.Technique == "contradiction" {
			result.Contradiction = true
		}
		if m.Technique != "" && m.Technique != "fill-candidate" {
			result.TechniqueUsage[m.Technique]++
			if m.Technique != "naked-single" && m.Technique != "hidden-single" {
				recentTechniques = append(recentTechniques, m.Technique)
			}
		}
	}

	// Get last 5 non-trivial techniques
	start := len(recentTechniques) - 5
	if start < 0 {
		start = 0
	}
	result.LastTechniques = recentTechniques[start:]

	return result
}

func main() {
	numPuzzles := flag.Int("n", 10000, "Number of puzzles to generate and test")
	numWorkers := flag.Int("workers", 8, "Number of parallel workers")
	startSeed := flag.Int64("seed", 1, "Starting seed")
	flag.Parse()

	fmt.Println("========================================")
	fmt.Println("Sudoku Solver Stress Test")
	fmt.Println("========================================")
	fmt.Printf("Puzzles: %d\n", *numPuzzles)
	fmt.Printf("Workers: %d\n", *numWorkers)
	fmt.Printf("Starting seed: %d\n", *startSeed)
	fmt.Println()

	start := time.Now()

	// Channels for work distribution
	jobs := make(chan int64, *numPuzzles)
	results := make(chan PuzzleResult, *numPuzzles)

	// Progress tracking
	var completed int64

	// Start workers
	var wg sync.WaitGroup
	for w := 0; w < *numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for seed := range jobs {
				result := solvePuzzle(seed)
				results <- result
				atomic.AddInt64(&completed, 1)
			}
		}()
	}

	// Send jobs
	go func() {
		for i := 0; i < *numPuzzles; i++ {
			jobs <- *startSeed + int64(i)
		}
		close(jobs)
	}()

	// Progress reporter
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			c := atomic.LoadInt64(&completed)
			if c >= int64(*numPuzzles) {
				return
			}
			elapsed := time.Since(start)
			rate := float64(c) / elapsed.Seconds()
			remaining := float64(int64(*numPuzzles)-c) / rate
			fmt.Printf("Progress: %d/%d (%.1f/sec, ~%.0fs remaining)\n",
				c, *numPuzzles, rate, remaining)
		}
	}()

	// Wait for workers and close results
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	var allResults []PuzzleResult
	for r := range results {
		allResults = append(allResults, r)
	}

	elapsed := time.Since(start)

	// Analyze results
	var passing, stalled, contradictions int
	var stalledSeeds, contradictionSeeds []int64
	globalTechUsage := make(map[string]int)
	contradictionLastTech := make(map[string]int)

	for _, r := range allResults {
		for tech, count := range r.TechniqueUsage {
			globalTechUsage[tech] += count
		}

		if r.Contradiction {
			contradictions++
			contradictionSeeds = append(contradictionSeeds, r.Seed)
			// Track last technique before contradiction
			if len(r.LastTechniques) > 0 {
				for _, t := range r.LastTechniques {
					contradictionLastTech[t]++
				}
			}
		} else if r.Status == constants.StatusCompleted {
			passing++
		} else {
			stalled++
			stalledSeeds = append(stalledSeeds, r.Seed)
		}
	}

	// Print results
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("RESULTS")
	fmt.Println("========================================")
	fmt.Printf("Time: %v (%.1f puzzles/sec)\n", elapsed, float64(*numPuzzles)/elapsed.Seconds())
	fmt.Println()
	fmt.Printf("Passing:        %d/%d (%.1f%%)\n", passing, *numPuzzles, 100*float64(passing)/float64(*numPuzzles))
	fmt.Printf("Contradictions: %d/%d (%.1f%%)\n", contradictions, *numPuzzles, 100*float64(contradictions)/float64(*numPuzzles))
	fmt.Printf("True stalls:    %d/%d (%.1f%%)\n", stalled, *numPuzzles, 100*float64(stalled)/float64(*numPuzzles))

	if contradictions > 0 {
		fmt.Println()
		fmt.Println("Techniques appearing before contradictions:")
		fmt.Println("(Higher count = more suspicious)")

		type techCount struct {
			name  string
			count int
		}
		var sorted []techCount
		for name, count := range contradictionLastTech {
			sorted = append(sorted, techCount{name, count})
		}
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].count > sorted[j].count
		})
		for _, tc := range sorted[:min(15, len(sorted))] {
			fmt.Printf("  %-25s %d\n", tc.name, tc.count)
		}

		fmt.Println()
		fmt.Printf("First 20 contradiction seeds: %v\n", contradictionSeeds[:min(20, len(contradictionSeeds))])
	}

	if stalled > 0 && len(stalledSeeds) > 0 {
		fmt.Println()
		fmt.Printf("First 20 stalled seeds: %v\n", stalledSeeds[:min(20, len(stalledSeeds))])
	}

	// Print technique usage
	fmt.Println()
	fmt.Println("Global technique usage:")
	fmt.Println("----------------------------------------")

	type techCount struct {
		name  string
		count int
	}
	var sorted []techCount
	for name, count := range globalTechUsage {
		sorted = append(sorted, techCount{name, count})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})
	for _, tc := range sorted {
		if tc.count > 0 {
			fmt.Printf("  %-25s %d\n", tc.name, tc.count)
		}
	}

	// Exit status
	fmt.Println()
	fmt.Println("========================================")
	if passing == *numPuzzles {
		fmt.Println("SUCCESS: All puzzles solved correctly!")
		os.Exit(0)
	}
	if contradictions > 0 {
		fmt.Printf("FAILED: %d puzzles hit contradictions (buggy techniques)\n", contradictions)
		os.Exit(1)
	}
	fmt.Printf("WARNING: %d puzzles stalled (may need more techniques)\n", stalled)
	os.Exit(0)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
