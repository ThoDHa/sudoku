package constants

import "time"

// Grid constants - configurable for different Sudoku sizes
const (
	GridSize   = 9  // Board size: 9x9
	BoxSize    = 3  // Subgrid size: 3x3
	TotalCells = 81 // Total cells: 9*9 = 81
	MinGivens  = 17 // Minimum givens for valid 9x9 puzzle
)

// Solver limits
const (
	MaxSolverSteps     = 5000
	SolutionCountLimit = 2
)

// Session
const (
	SessionTokenExpiry = 24 * time.Hour
)

// Difficulties
const (
	DifficultyEasy       = "easy"
	DifficultyMedium     = "medium"
	DifficultyHard       = "hard"
	DifficultyExtreme    = "extreme"
	DifficultyImpossible = "impossible"
)

// Difficulty compact keys (for puzzle file format)
var DifficultyKeys = map[string]string{
	DifficultyEasy:       "e",
	DifficultyMedium:     "m",
	DifficultyHard:       "h",
	DifficultyExtreme:    "x",
	DifficultyImpossible: "i",
}

// Target givens by difficulty (for 9x9 puzzles)
var TargetGivens = map[string]int{
	DifficultyEasy:       35,
	DifficultyMedium:     30,
	DifficultyHard:       25,
	DifficultyExtreme:    22,
	DifficultyImpossible: 17,
}

// Technique tiers
const (
	TierSimple  = "simple"
	TierMedium  = "medium"
	TierHard    = "hard"
	TierExtreme = "extreme"
)

// Move actions
const (
	ActionAssign        = "assign"
	ActionEliminate     = "eliminate"
	ActionContradiction = "contradiction"
)

// Solver status
const (
	StatusCompleted       = "completed"
	StatusStalled         = "stalled"
	StatusMaxStepsReached = "max_steps_reached"
)

// API version
const APIVersion = "0.1.2"

// Solver version - increment this when solver logic changes
// This is used to check if the WASM module needs to be updated
const SolverVersion = "0.1.2"

// Default ports
const DefaultPort = "8080"

// Date format
const DateFormat = "2006-01-02"
