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
	MaxSolverNodes     = 10000000
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

// Technique tiers
const (
	TierSimple  = "simple"
	TierMedium  = "medium"
	TierHard    = "hard"
	TierExtreme = "extreme"
)

// Move actions
const (
	ActionAssign            = "assign"
	ActionEliminate         = "eliminate"
	ActionContradiction     = "contradiction"
	ActionCandidate         = "candidate"
	ActionFixError          = "fix-error"
	ActionStalled           = "stalled"
	ActionError             = "error"
	ActionDiagnostic        = "diagnostic"
	ActionUnpinpointableErr = "unpinpointable-error"
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

// Puzzle constants
const (
	DailyPuzzlePrefix   = "D"
	PuzzleIDDl          = "-"
	DailyDateFormat     = "2006-01-02"
	PracticePuzzleIDFmt = "practice-%s-%d"
)

// HTTP route paths
const (
	RouteHealth         = "/health"
	RouteAPI            = "/api"
	RouteVersion        = "/version"
	RouteDaily          = "/daily"
	RoutePuzzle         = "/puzzle"
	RoutePuzzleID       = "/puzzle/:seed"
	RouteAnalyze        = "/puzzle/:seed/analyze"
	RoutePractice       = "/practice/:technique"
	RouteSessionStart   = "/session/start"
	RouteSolveNext      = "/solve/next"
	RouteSolveAll       = "/solve/all"
	RouteSolveFull      = "/solve/full"
	RouteValidate       = "/validate"
	RouteCustomValidate = "/custom/validate"
)
