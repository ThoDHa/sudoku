package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"sudoku-api/internal/sudoku/dp"
)

// CompactPuzzle stores a puzzle in minimal format
// Solution: 81-char string of digits
// Givens: map of difficulty -> indices to reveal
type CompactPuzzle struct {
	S string         `json:"s"` // solution as 81-char string
	G map[string][]int `json:"g"` // givens: difficulty -> cell indices to show
}

// PuzzleFile is the top-level structure for the JSON file
type PuzzleFile struct {
	Version  int             `json:"version"`
	Count    int             `json:"count"`
	Puzzles  []CompactPuzzle `json:"puzzles"`
}

func main() {
	count := flag.Int("n", 10000, "Number of puzzles to generate")
	output := flag.String("o", "puzzles.json", "Output file path")
	workers := flag.Int("w", 0, "Number of worker goroutines (default: num CPUs)")
	startSeed := flag.Int64("seed", 1, "Starting seed value")
	flag.Parse()

	if *workers <= 0 {
		*workers = runtime.NumCPU()
	}

	fmt.Printf("Generating %d puzzles with %d workers...\n", *count, *workers)
	start := time.Now()

	puzzles := make([]CompactPuzzle, *count)
	var generated int64

	// Create work channel
	work := make(chan int, *count)
	for i := 0; i < *count; i++ {
		work <- i
	}
	close(work)

	// Progress reporter
	done := make(chan bool)
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				g := atomic.LoadInt64(&generated)
				elapsed := time.Since(start)
				rate := float64(g) / elapsed.Seconds()
				remaining := float64(*count-int(g)) / rate
				fmt.Printf("  Progress: %d/%d (%.1f/sec, ~%.0fs remaining)\n", g, *count, rate, remaining)
			case <-done:
				return
			}
		}
	}()

	// Worker pool
	var wg sync.WaitGroup
	for w := 0; w < *workers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for idx := range work {
				seed := *startSeed + int64(idx)
				puzzle := generatePuzzle(seed)
				puzzles[idx] = puzzle
				atomic.AddInt64(&generated, 1)
			}
		}(w)
	}

	wg.Wait()
	done <- true

	elapsed := time.Since(start)
	fmt.Printf("Generated %d puzzles in %v (%.1f puzzles/sec)\n", *count, elapsed, float64(*count)/elapsed.Seconds())

	// Write to file
	fmt.Printf("Writing to %s...\n", *output)
	
	file := PuzzleFile{
		Version: 1,
		Count:   *count,
		Puzzles: puzzles,
	}

	data, err := json.Marshal(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling JSON: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(*output, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing file: %v\n", err)
		os.Exit(1)
	}

	// Calculate file size
	info, _ := os.Stat(*output)
	sizeMB := float64(info.Size()) / 1024 / 1024
	fmt.Printf("Done! File size: %.2f MB\n", sizeMB)
}

func generatePuzzle(seed int64) CompactPuzzle {
	// Generate complete grid
	fullGrid := dp.GenerateFullGrid(seed)

	// Convert solution to string
	solStr := make([]byte, 81)
	for i, v := range fullGrid {
		solStr[i] = byte('0' + v)
	}

	// Generate puzzles for all difficulties with subset property
	allPuzzles := dp.CarveGivensWithSubset(fullGrid, seed)

	// Extract indices for each difficulty
	givens := make(map[string][]int)
	diffKeys := map[string]string{
		"easy":       "e",
		"medium":     "m",
		"hard":       "h",
		"extreme":    "x",
		"impossible": "i",
	}

	for diff, puzzle := range allPuzzles {
		var indices []int
		for i, v := range puzzle {
			if v != 0 {
				indices = append(indices, i)
			}
		}
		givens[diffKeys[diff]] = indices
	}

	return CompactPuzzle{
		S: string(solStr),
		G: givens,
	}
}
