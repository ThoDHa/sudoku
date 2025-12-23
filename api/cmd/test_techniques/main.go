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

// Techniques to test - everything except "simple" tier basics
var advancedTechniques = []string{
	// Medium tier
	"naked-quad",
	"hidden-quad",
	"x-wing",
	"swordfish",
	"xy-wing",
	"xyz-wing",
	"simple-coloring",
	"bug",
	"unique-rectangle",
	// Hard tier
	"jellyfish",
	"skyscraper",
	"x-chain",
	"xy-chain",
	"w-wing",
	"wxyz-wing",
	"empty-rectangle",
	"medusa-3d",
	"unique-rectangle-type-2",
	"unique-rectangle-type-3",
	"unique-rectangle-type-4",
	// Extreme tier
	"finned-x-wing",
	"finned-swordfish",
	"grouped-x-cycles",
	"aic",
	"als-xz",
	"als-xy-wing",
	"als-xy-chain",
	"sue-de-coq",
	"death-blossom",
	"digit-forcing-chain",
	"forcing-chain",
}

// Simple techniques that are always enabled as baseline
var simpleTechniques = []string{
	"naked-single",
	"hidden-single",
	"naked-pair",
	"hidden-pair",
	"pointing-pair",
	"box-line-reduction",
	"naked-triple",
	"hidden-triple",
}

type TechniqueTestResult struct {
	Slug           string
	Contradictions int
	Stalls         int
	Solved         int
	TotalUsage     int
	Duration       time.Duration
}

func testTechnique(slug string, numPuzzles int, numWorkers int, startSeed int64) TechniqueTestResult {
	result := TechniqueTestResult{Slug: slug}
	start := time.Now()

	var solved, contradictions, stalls int64
	var totalUsage int64

	jobs := make(chan int64, numPuzzles)
	var wg sync.WaitGroup

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for seed := range jobs {
				// Generate puzzle
				fullGrid := dp.GenerateFullGrid(seed)
				givens := dp.CarveGivens(fullGrid, 20, seed)

				// Create solver with only simple techniques + this one technique
				solver := human.CreateSolverWithOnlyTechniques(append(simpleTechniques, slug)...)
				board := human.NewBoard(givens)
				moves, status := solver.SolveWithSteps(board, constants.MaxSolverSteps)

				// Check for contradiction
				hasContradiction := false
				usage := 0
				for _, m := range moves {
					if m.Technique == "contradiction" {
						hasContradiction = true
					}
					if m.Technique == slug {
						usage++
					}
				}

				if hasContradiction {
					atomic.AddInt64(&contradictions, 1)
				} else if status == constants.StatusCompleted {
					atomic.AddInt64(&solved, 1)
				} else {
					atomic.AddInt64(&stalls, 1)
				}
				atomic.AddInt64(&totalUsage, int64(usage))
			}
		}()
	}

	// Send jobs
	for i := 0; i < numPuzzles; i++ {
		jobs <- startSeed + int64(i)
	}
	close(jobs)
	wg.Wait()

	result.Contradictions = int(contradictions)
	result.Stalls = int(stalls)
	result.Solved = int(solved)
	result.TotalUsage = int(totalUsage)
	result.Duration = time.Since(start)

	return result
}

func main() {
	numPuzzles := flag.Int("n", 1000, "Number of puzzles to test per technique")
	numWorkers := flag.Int("workers", 8, "Number of parallel workers")
	startSeed := flag.Int64("seed", 1, "Starting seed")
	singleTechnique := flag.String("technique", "", "Test only this single technique (optional)")
	flag.Parse()

	fmt.Println("========================================")
	fmt.Println("Individual Technique Stress Test")
	fmt.Println("========================================")
	fmt.Printf("Puzzles per technique: %d\n", *numPuzzles)
	fmt.Printf("Workers: %d\n", *numWorkers)
	fmt.Printf("Starting seed: %d\n", *startSeed)
	fmt.Printf("Baseline: Simple techniques only\n")
	fmt.Println()

	techniquesToTest := advancedTechniques
	if *singleTechnique != "" {
		techniquesToTest = []string{*singleTechnique}
	}

	var results []TechniqueTestResult
	var buggyTechniques []string

	for i, slug := range techniquesToTest {
		fmt.Printf("[%d/%d] Testing: %s ... ", i+1, len(techniquesToTest), slug)

		result := testTechnique(slug, *numPuzzles, *numWorkers, *startSeed)
		results = append(results, result)

		status := "OK"
		if result.Contradictions > 0 {
			status = fmt.Sprintf("BUGGY (%d contradictions!)", result.Contradictions)
			buggyTechniques = append(buggyTechniques, slug)
		} else if result.Solved == 0 {
			status = fmt.Sprintf("UNUSED (0/%d solved, %d stalled)", *numPuzzles, result.Stalls)
		}

		fmt.Printf("%s (used %d times, %.1fs)\n", status, result.TotalUsage, result.Duration.Seconds())
	}

	// Summary
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("SUMMARY")
	fmt.Println("========================================")

	// Sort by contradictions (worst first)
	sort.Slice(results, func(i, j int) bool {
		return results[i].Contradictions > results[j].Contradictions
	})

	fmt.Println()
	fmt.Println("Results by technique:")
	fmt.Println("--------------------------------------------------------------------------------")
	fmt.Printf("%-25s %10s %10s %10s %10s\n", "Technique", "Solved", "Stalls", "Contrad.", "Usage")
	fmt.Println("--------------------------------------------------------------------------------")
	for _, r := range results {
		marker := ""
		if r.Contradictions > 0 {
			marker = " <-- BUGGY!"
		}
		fmt.Printf("%-25s %10d %10d %10d %10d%s\n",
			r.Slug, r.Solved, r.Stalls, r.Contradictions, r.TotalUsage, marker)
	}
	fmt.Println("--------------------------------------------------------------------------------")

	fmt.Println()
	if len(buggyTechniques) > 0 {
		fmt.Printf("FAILED: %d techniques with contradictions:\n", len(buggyTechniques))
		for _, t := range buggyTechniques {
			fmt.Printf("  - %s\n", t)
		}
		os.Exit(1)
	} else {
		fmt.Println("SUCCESS: All techniques passed (no contradictions)")
		os.Exit(0)
	}
}
