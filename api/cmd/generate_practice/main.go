package main

import (
	"context"
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
	"sudoku-api/internal/sudoku/human/techniquetest"
	"sudoku-api/pkg/constants"
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

// analyzeResult carries the techniques one (puzzle, difficulty) combination
// requires, keyed by difficulty for the final technique map.
type analyzeResult struct {
	Index      int
	Difficulty string
	Techniques map[string]int
}

// workItem is one (puzzle index, difficulty) pair scheduled for analysis.
type workItem struct {
	Index      int
	Difficulty string
	DiffKey    string
}

// startProgressReporter launches a goroutine that prints analysis throughput
// every 5 seconds. The returned channel stops the reporter when closed or
// signaled.
func startProgressReporter(total int, analyzed *int64) chan<- bool {
	done := make(chan bool)
	go func() {
		start := time.Now()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				a := atomic.LoadInt64(analyzed)
				elapsed := time.Since(start)
				rate := float64(a) / elapsed.Seconds()
				remaining := float64(total-int(a)) / rate
				fmt.Printf("  Progress: %d/%d puzzle-difficulty combos (%.1f/sec, ~%.0fs remaining)\n",
					a, total, rate, remaining)
			case <-done:
				return
			}
		}
	}()
	return done
}

// analyzeWorker consumes work items, analyzes each puzzle, and emits completed
// results. Puzzles that fail to load or do not fully solve are counted as
// analyzed but emit no result.
func analyzeWorker(loader *puzzles.Loader, work <-chan workItem, results chan<- analyzeResult, analyzed *int64) {
	solver := human.NewSolver()
	for item := range work {
		givens, _, err := loader.GetPuzzle(item.Index, item.Difficulty)
		if err != nil {
			atomic.AddInt64(analyzed, 1)
			continue
		}
		_, techniqueCounts, status := solver.AnalyzePuzzleDifficulty(context.Background(), givens)
		if status != "completed" {
			atomic.AddInt64(analyzed, 1)
			continue
		}
		results <- analyzeResult{
			Index:      item.Index,
			Difficulty: item.DiffKey,
			Techniques: techniqueCounts,
		}
		atomic.AddInt64(analyzed, 1)
	}
}

// collectTechniqueMap drains the results channel and builds the
// technique -> puzzle list. Order follows result arrival (non-deterministic);
// trimTechniqueMap sorts afterward.
func collectTechniqueMap(results <-chan analyzeResult) map[string][]PracticePuzzle {
	techniqueMap := make(map[string][]PracticePuzzle)
	for r := range results {
		for technique, count := range r.Techniques {
			if count <= 0 {
				continue
			}
			techniqueMap[technique] = append(techniqueMap[technique], PracticePuzzle{
				Index:      r.Index,
				Difficulty: r.Difficulty,
			})
		}
	}
	return techniqueMap
}

// filterByNecessity drops practice-puzzle entries whose technique is not
// genuinely required to solve the puzzle. The detect pass emits a technique
// whenever it fires during a natural full-strength solve. Rare or advanced
// techniques are often preempted by more common ones along that natural path,
// so a puzzle can register as detected even though another solve path never
// needs the target technique.
//
// For slugs listed in techniquetest.TechniqueIsolationConfig the filter
// re-solves each candidate with the competing techniques disabled (the same
// isolation semantics runEarlyStopWithDisabledTechniques uses in the test
// suite) and keeps the entry only when the target technique still fires.
// Slugs outside the isolation map are returned untouched: the test suite
// verifies those by natural detection, so the detect pass already agrees.
func filterByNecessity(loader *puzzles.Loader, techniqueMap map[string][]PracticePuzzle) {
	isolated := 0
	dropped := 0
	for slug, entries := range techniqueMap {
		disabled, needsIsolation := techniquetest.TechniqueIsolationConfig[slug]
		if !needsIsolation {
			continue
		}
		isolated++
		kept := make([]PracticePuzzle, 0, len(entries))
		for _, entry := range entries {
			if techniqueNecessary(loader, entry, slug, disabled) {
				kept = append(kept, entry)
			}
		}
		dropped += len(entries) - len(kept)
		techniqueMap[slug] = kept
	}
	fmt.Printf("Necessity filter: re-checked %d isolated techniques, dropped %d entries\n",
		isolated, dropped)
}

// techniqueNecessary reports whether slug fires when solving the puzzle at
// entry.Index/entry.Difficulty with the competing techniques disabled. It
// mirrors runEarlyStopWithDisabledTechniques in technique_isolated_test.go:
// fresh board, solver with competitors disabled, early-stop the moment the
// target fires. The entry counts as necessary only if the target fires
// before the solver stalls or hits the step cap.
func techniqueNecessary(loader *puzzles.Loader, entry PracticePuzzle, slug string, disabled []string) bool {
	diffName, ok := difficultyNameByKey(entry.Difficulty)
	if !ok {
		return false
	}
	givens, _, err := loader.GetPuzzle(entry.Index, diffName)
	if err != nil {
		return false
	}
	board := human.NewBoard(givens)
	solver := human.CreateSolverWithoutTechniques(disabled...)
	ctx := context.Background()
	for range constants.MaxSolverSteps {
		move := solver.FindNextMove(ctx, board)
		if move == nil {
			return false
		}
		solver.ApplyMove(board, move)
		if move.Technique == slug {
			return true
		}
	}
	return false
}

// trimTechniqueMap sorts each technique's puzzle list deterministically (by
// index then difficulty) and caps it at maxPerTechnique so repeated runs
// produce stable output.
func trimTechniqueMap(techniqueMap map[string][]PracticePuzzle, maxPerTechnique int) {
	for technique, list := range techniqueMap {
		sort.Slice(list, func(i, j int) bool {
			if list[i].Index != list[j].Index {
				return list[i].Index < list[j].Index
			}
			return list[i].Difficulty < list[j].Difficulty
		})
		if len(list) > maxPerTechnique {
			list = list[:maxPerTechnique]
		}
		techniqueMap[technique] = list
	}
}

// practiceDifficulties is the full set of (loader name, JSON key) pairs the
// generator scans. analyzePuzzles enumerates every puzzle at every tier for
// the detect pass; difficultyNameByKey maps a stored entry key back to the
// name loader.GetPuzzle expects during the necessity filter.
var practiceDifficulties = []struct {
	name string
	key  string
}{
	{"easy", "e"},
	{"medium", "m"},
	{"hard", "h"},
	{"extreme", "x"},
	{"impossible", "i"},
}

func difficultyNameByKey(key string) (string, bool) {
	for _, d := range practiceDifficulties {
		if d.key == key {
			return d.name, true
		}
	}
	return "", false
}

// analyzePuzzles runs the worker pool that scans every (puzzle, difficulty)
// combination with the human solver, collects the techniques each puzzle
// requires, and returns the trimmed technique -> puzzle list.
func analyzePuzzles(loader *puzzles.Loader, workers, maxPerTechnique int) map[string][]PracticePuzzle {
	puzzleCount := loader.Count()
	start := time.Now()

	results := make(chan analyzeResult, puzzleCount*5)
	var analyzed int64
	done := startProgressReporter(puzzleCount*5, &analyzed)

	work := make(chan workItem, puzzleCount*5)
	for i := range puzzleCount {
		for _, d := range practiceDifficulties {
			work <- workItem{Index: i, Difficulty: d.name, DiffKey: d.key}
		}
	}
	close(work)

	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			analyzeWorker(loader, work, results, &analyzed)
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	techniqueMap := collectTechniqueMap(results)

	done <- true
	fmt.Printf("Analyzed %d puzzle-difficulty combinations in %v\n", puzzleCount*5, time.Since(start))

	filterByNecessity(loader, techniqueMap)
	trimTechniqueMap(techniqueMap, maxPerTechnique)
	return techniqueMap
}

func writePracticeFile(output string, techniqueMap map[string][]PracticePuzzle) error {
	file := PracticeFile{
		Version:    2,
		Generated:  time.Now().UTC().Format(time.RFC3339),
		Techniques: techniqueMap,
	}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(output, data, 0600)
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

	fmt.Printf("Loading puzzles from %s...\n", *puzzlePath)
	loader, err := puzzles.Load(*puzzlePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading puzzles: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Loaded %d puzzles\n", loader.Count())
	fmt.Printf("Analyzing with %d workers...\n", *workers)

	techniqueMap := analyzePuzzles(loader, *workers, *maxPerTechnique)

	fmt.Printf("\nTechniques found:\n")
	techniques := make([]string, 0, len(techniqueMap))
	for t := range techniqueMap {
		techniques = append(techniques, t)
	}
	sort.Strings(techniques)
	for _, t := range techniques {
		fmt.Printf("  %s: %d puzzles\n", t, len(techniqueMap[t]))
	}

	fmt.Printf("\nWriting to %s...\n", *output)
	if err := writePracticeFile(*output, techniqueMap); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing file: %v\n", err)
		os.Exit(1)
	}

	info, _ := os.Stat(*output)
	fmt.Printf("Done! File size: %d bytes\n", info.Size())
}
