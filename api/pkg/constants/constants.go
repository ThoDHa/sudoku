package constants

import "time"

// Grid constants
const (
	GridSize   = 9
	BoxSize    = 3
	TotalCells = 81
	MinGivens  = 17
)

// Solver limits
const (
	MaxSolverSteps     = 500
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

// Target givens by difficulty
var TargetGivens = map[string]int{
	DifficultyEasy:       40,
	DifficultyMedium:     34,
	DifficultyHard:       28,
	DifficultyExtreme:    24,
	DifficultyImpossible: 20,
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
	ActionAssign    = "assign"
	ActionEliminate = "eliminate"
)

// Solver status
const (
	StatusCompleted       = "completed"
	StatusStalled         = "stalled"
	StatusMaxStepsReached = "max_steps_reached"
)

// API version
const APIVersion = "0.1.0"

// Default ports
const DefaultPort = "8080"

// Date format
const DateFormat = "2006-01-02"
