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

// puzzleSummary aggregates per-puzzle results into the counts and seed lists
// reported at the end of the run.
type puzzleSummary struct {
	passing               int
	stalled               int
	contradictions        int
	stalledSeeds          []int64
	contradictionSeeds    []int64
	globalTechUsage       map[string]int
	contradictionLastTech map[string]int
}

func summarizeResults(allResults []PuzzleResult) puzzleSummary {
	s := puzzleSummary{
		globalTechUsage:       make(map[string]int),
		contradictionLastTech: make(map[string]int),
	}
	for _, r := range allResults {
		for tech, count := range r.TechniqueUsage {
			s.globalTechUsage[tech] += count
		}
		switch {
		case r.Contradiction:
			s.contradictions++
			s.contradictionSeeds = append(s.contradictionSeeds, r.Seed)
			for _, t := range r.LastTechniques {
				s.contradictionLastTech[t]++
			}
		case r.Status == constants.StatusCompleted:
			s.passing++
		default:
			s.stalled++
			s.stalledSeeds = append(s.stalledSeeds, r.Seed)
		}
	}
	return s
}

// runStressTest fans puzzle seeds out to a worker pool, returning the per-puzzle
// results along with the total wall-clock elapsed.
func runStressTest(numPuzzles, numWorkers int, startSeed int64) ([]PuzzleResult, time.Duration) {
	start := time.Now()

	jobs := make(chan int64, numPuzzles)
	results := make(chan PuzzleResult, numPuzzles)

	var completed int64

	var wg sync.WaitGroup
	for w := 0; w < numWorkers; w++ {
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

	go func() {
		for i := 0; i < numPuzzles; i++ {
			jobs <- startSeed + int64(i)
		}
		close(jobs)
	}()

	// Progress reporter
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			c := atomic.LoadInt64(&completed)
			if c >= int64(numPuzzles) {
				return
			}
			elapsed := time.Since(start)
			rate := float64(c) / elapsed.Seconds()
			remaining := float64(int64(numPuzzles)-c) / rate
			fmt.Printf("Progress: %d/%d (%.1f/sec, ~%.0fs remaining)\n",
				c, numPuzzles, rate, remaining)
		}
	}()

	go func() {
		wg.Wait()
		close(results)
	}()

	var allResults []PuzzleResult
	for r := range results {
		allResults = append(allResults, r)
	}
	return allResults, time.Since(start)
}

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

func printReport(s puzzleSummary, numPuzzles int, elapsed time.Duration) {
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("RESULTS")
	fmt.Println("========================================")
	fmt.Printf("Time: %v (%.1f puzzles/sec)\n", elapsed, float64(numPuzzles)/elapsed.Seconds())
	fmt.Println()
	fmt.Printf("Passing:        %d/%d (%.1f%%)\n", s.passing, numPuzzles, 100*float64(s.passing)/float64(numPuzzles))
	fmt.Printf("Contradictions: %d/%d (%.1f%%)\n", s.contradictions, numPuzzles, 100*float64(s.contradictions)/float64(numPuzzles))
	fmt.Printf("True stalls:    %d/%d (%.1f%%)\n", s.stalled, numPuzzles, 100*float64(s.stalled)/float64(numPuzzles))

	if s.contradictions > 0 {
		fmt.Println()
		fmt.Println("Techniques appearing before contradictions:")
		fmt.Println("(Higher count = more suspicious)")
		topContradictionTech := sortedTechCounts(s.contradictionLastTech)
		for _, tc := range topContradictionTech[:min(15, len(topContradictionTech))] {
			fmt.Printf("  %-25s %d\n", tc.name, tc.count)
		}

		fmt.Println()
		fmt.Printf("First 20 contradiction seeds: %v\n", s.contradictionSeeds[:min(20, len(s.contradictionSeeds))])
	}

	if s.stalled > 0 && len(s.stalledSeeds) > 0 {
		fmt.Println()
		fmt.Printf("First 20 stalled seeds: %v\n", s.stalledSeeds[:min(20, len(s.stalledSeeds))])
	}

	fmt.Println()
	fmt.Println("Global technique usage:")
	fmt.Println("----------------------------------------")
	for _, tc := range sortedTechCounts(s.globalTechUsage) {
		if tc.count > 0 {
			fmt.Printf("  %-25s %d\n", tc.name, tc.count)
		}
	}
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

	allResults, elapsed := runStressTest(*numPuzzles, *numWorkers, *startSeed)

	summary := summarizeResults(allResults)
	printReport(summary, *numPuzzles, elapsed)

	fmt.Println()
	fmt.Println("========================================")
	switch {
	case summary.passing == *numPuzzles:
		fmt.Println("SUCCESS: All puzzles solved correctly!")
		os.Exit(0)
	case summary.contradictions > 0:
		fmt.Printf("FAILED: %d puzzles hit contradictions (buggy techniques)\n", summary.contradictions)
		os.Exit(1)
	default:
		fmt.Printf("WARNING: %d puzzles stalled (may need more techniques)\n", summary.stalled)
		os.Exit(0)
	}
}
