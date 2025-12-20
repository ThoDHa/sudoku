package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/human"
)

// PracticePuzzle represents a single practice puzzle entry
type PracticePuzzle struct {
	Index      int    `json:"i"` // puzzle index in puzzles.json
	Difficulty string `json:"d"` // difficulty key (e, m, h, x, i)
}

// PracticeFile is the output structure
type PracticeFile struct {
	Version    int                         `json:"version"`
	Generated  string                      `json:"generated"`
	Techniques map[string][]PracticePuzzle `json:"techniques"`
}

func main() {
	puzzlePath := flag.String("puzzles", "puzzles.json", "Path to puzzles.json")
	output := flag.String("o", "practice_puzzles.json", "Output file path")
	workers := flag.Int("w", 0, "Number of worker goroutines (default: num CPUs)")
	maxPerTechnique := flag.Int("max", 10, "Max puzzles per technique")
	flag.Parse()

	if *workers <= 0 {
		*workers = runtime.NumCPU()
	}

	// Load puzzles
	fmt.Printf("Loading puzzles from %s...\n", *puzzlePath)
	loader, err := puzzles.Load(*puzzlePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading puzzles: %v\n", err)
		os.Exit(1)
	}

	puzzleCount := loader.Count()
	fmt.Printf("Loaded %d puzzles\n", puzzleCount)
	fmt.Printf("Analyzing with %d workers...\n", *workers)

	start := time.Now()

	// Result collection
	type Result struct {
		Index      int
		Difficulty string
		Techniques map[string]int
	}

	results := make(chan Result, puzzleCount*5)
	var analyzed int64

	// Progress reporter
	done := make(chan bool)
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				a := atomic.LoadInt64(&analyzed)
				elapsed := time.Since(start)
				rate := float64(a) / elapsed.Seconds()
				remaining := float64(puzzleCount*5-int(a)) / rate
				fmt.Printf("  Progress: %d/%d puzzle-difficulty combos (%.1f/sec, ~%.0fs remaining)\n",
					a, puzzleCount*5, rate, remaining)
			case <-done:
				return
			}
		}
	}()

	// Work items: (puzzle index, difficulty)
	type WorkItem struct {
		Index      int
		Difficulty string
		DiffKey    string
	}

	work := make(chan WorkItem, puzzleCount*5)
	difficulties := []struct {
		name string
		key  string
	}{
		{"easy", "e"},
		{"medium", "m"},
		{"hard", "h"},
		{"extreme", "x"},
		{"impossible", "i"},
	}

	for i := 0; i < puzzleCount; i++ {
		for _, d := range difficulties {
			work <- WorkItem{Index: i, Difficulty: d.name, DiffKey: d.key}
		}
	}
	close(work)

	// Worker pool
	var wg sync.WaitGroup
	for w := 0; w < *workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			solver := human.NewSolver()

			for item := range work {
				givens, _, err := loader.GetPuzzle(item.Index, item.Difficulty)
				if err != nil {
					atomic.AddInt64(&analyzed, 1)
					continue
				}

				// Analyze the puzzle
				_, techniqueCounts, status := solver.AnalyzePuzzleDifficulty(givens)
				if status != "completed" {
					atomic.AddInt64(&analyzed, 1)
					continue
				}

				results <- Result{
					Index:      item.Index,
					Difficulty: item.DiffKey,
					Techniques: techniqueCounts,
				}
				atomic.AddInt64(&analyzed, 1)
			}
		}()
	}

	// Close results when workers are done
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	techniqueMap := make(map[string][]PracticePuzzle)
	for r := range results {
		for technique, count := range r.Techniques {
			if count > 0 {
				techniqueMap[technique] = append(techniqueMap[technique], PracticePuzzle{
					Index:      r.Index,
					Difficulty: r.Difficulty,
				})
			}
		}
	}

	done <- true
	elapsed := time.Since(start)
	fmt.Printf("Analyzed %d puzzle-difficulty combinations in %v\n", puzzleCount*5, elapsed)

	// Trim to max per technique and sort by index for determinism
	for technique, list := range techniqueMap {
		// Sort by index then difficulty for determinism
		sort.Slice(list, func(i, j int) bool {
			if list[i].Index != list[j].Index {
				return list[i].Index < list[j].Index
			}
			return list[i].Difficulty < list[j].Difficulty
		})

		// Trim to max
		if len(list) > *maxPerTechnique {
			list = list[:*maxPerTechnique]
		}
		techniqueMap[technique] = list
	}

	// Print summary
	fmt.Printf("\nTechniques found:\n")
	techniques := make([]string, 0, len(techniqueMap))
	for t := range techniqueMap {
		techniques = append(techniques, t)
	}
	sort.Strings(techniques)
	for _, t := range techniques {
		fmt.Printf("  %s: %d puzzles\n", t, len(techniqueMap[t]))
	}

	// Write output
	fmt.Printf("\nWriting to %s...\n", *output)
	file := PracticeFile{
		Version:    1,
		Generated:  time.Now().UTC().Format(time.RFC3339),
		Techniques: techniqueMap,
	}

	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling JSON: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(*output, data, 0600); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing file: %v\n", err)
		os.Exit(1)
	}

	info, _ := os.Stat(*output)
	fmt.Printf("Done! File size: %d bytes\n", info.Size())
}
