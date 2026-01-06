package puzzles

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"os"
	"sync"
	"time"

	"sudoku-api/pkg/constants"
)

// CompactPuzzle stores a puzzle in minimal format
type CompactPuzzle struct {
	S string           `json:"s"` // solution as TotalCells-char string
	G map[string][]int `json:"g"` // givens: difficulty key -> cell indices
}

// PuzzleFile is the top-level structure for the JSON file
type PuzzleFile struct {
	Version int             `json:"version"`
	Count   int             `json:"count"`
	Puzzles []CompactPuzzle `json:"puzzles"`
}

// Loader manages pre-generated puzzles
type Loader struct {
	puzzles []CompactPuzzle
	mu      sync.RWMutex
}

// DifficultyKey maps full difficulty names to compact keys
var DifficultyKey = map[string]string{
	"easy":       "e",
	"medium":     "m",
	"hard":       "h",
	"extreme":    "x",
	"impossible": "i",
}

// KeyToDifficulty maps compact keys to full difficulty names
var KeyToDifficulty = map[string]string{
	"e": "easy",
	"m": "medium",
	"h": "hard",
	"x": "extreme",
	"i": "impossible",
}

var (
	globalLoader *Loader
	loadOnce     sync.Once
	loadErr      error
)

// Load reads puzzles from the JSON file
func Load(path string) (*Loader, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read puzzle file: %w", err)
	}

	var file PuzzleFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("failed to parse puzzle file: %w", err)
	}

	return &Loader{puzzles: file.Puzzles}, nil
}

// LoadGlobal loads puzzles into the global loader (singleton)
func LoadGlobal(path string) error {
	loadOnce.Do(func() {
		globalLoader, loadErr = Load(path)
	})
	return loadErr
}

// Global returns the global loader instance
func Global() *Loader {
	return globalLoader
}

// SetGlobal sets the global loader instance (for testing)
func SetGlobal(l *Loader) {
	globalLoader = l
}

// NewLoaderFromPuzzles creates a loader from puzzle data (for testing)
func NewLoaderFromPuzzles(puzzles []CompactPuzzle) *Loader {
	return &Loader{puzzles: puzzles}
}

// Count returns the number of puzzles
func (l *Loader) Count() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.puzzles)
}

// GetPuzzle returns a puzzle by index
func (l *Loader) GetPuzzle(index int, difficulty string) (givens []int, solution []int, err error) {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if index < 0 || index >= len(l.puzzles) {
		return nil, nil, fmt.Errorf("puzzle index %d out of range (0-%d)", index, len(l.puzzles)-1)
	}

	puzzle := l.puzzles[index]

	// Parse solution
	solution = make([]int, constants.TotalCells)
	for i, c := range puzzle.S {
		solution[i] = int(c - '0')
	}

	// Get difficulty key
	key, ok := DifficultyKey[difficulty]
	if !ok {
		return nil, nil, fmt.Errorf("unknown difficulty: %s", difficulty)
	}

	// Get indices for this difficulty
	indices, ok := puzzle.G[key]
	if !ok {
		return nil, nil, fmt.Errorf("difficulty %s not found in puzzle", difficulty)
	}

	// Build givens array (0 for empty cells)
	givens = make([]int, constants.TotalCells)
	for _, idx := range indices {
		givens[idx] = solution[idx]
	}

	return givens, solution, nil
}

// GetPuzzleBySeed returns a puzzle for a given seed string
// Uses FNV hash to deterministically map seed to puzzle index
func (l *Loader) GetPuzzleBySeed(seed string, difficulty string) (givens []int, solution []int, puzzleIndex int, err error) {
	l.mu.RLock()
	count := len(l.puzzles)
	l.mu.RUnlock()

	if count == 0 {
		return nil, nil, 0, fmt.Errorf("no puzzles loaded")
	}

	// Hash seed to get puzzle index
	h := fnv.New64a()
	h.Write([]byte(seed))
	puzzleIndex = int(h.Sum64() % uint64(count)) //nolint:gosec // count is bounded by slice length

	givens, solution, err = l.GetPuzzle(puzzleIndex, difficulty)
	return
}

// GetDailyPuzzle returns the puzzle for a given UTC date
func (l *Loader) GetDailyPuzzle(date time.Time, difficulty string) (givens []int, solution []int, puzzleIndex int, err error) {
	// Use UTC date string as seed
	dateStr := date.UTC().Format("2006-01-02")
	seed := "daily:" + dateStr
	return l.GetPuzzleBySeed(seed, difficulty)
}

// GetTodayPuzzle returns the puzzle for today (UTC)
func (l *Loader) GetTodayPuzzle(difficulty string) (givens []int, solution []int, puzzleIndex int, err error) {
	return l.GetDailyPuzzle(time.Now(), difficulty)
}
