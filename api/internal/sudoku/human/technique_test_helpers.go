package human

import (
	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// TechniqueIsolationStrategy defines how to isolate a technique for testing
type TechniqueIsolationStrategy int

const (
	// DisableHigherTiers disables all techniques in tiers above the target's tier.
	// Techniques in the same tier or lower will still run.
	// Best for: Testing that a puzzle eventually uses the target technique.
	DisableHigherTiers TechniqueIsolationStrategy = iota

	// DisableSameAndHigherOrder disables techniques with Order >= target's Order.
	// This allows only techniques that come BEFORE the target in execution order.
	// Best for: Most realistic testing - simpler techniques run first.
	DisableSameAndHigherOrder

	// DisableAllExceptTarget disables ALL techniques except the target.
	// Best for: Unit testing a specific technique detector in isolation.
	// Risk: Board state may be unrealistic without prior eliminations.
	DisableAllExceptTarget

	// DisableAllExceptTargetAndBasics disables all except target + naked/hidden singles.
	// Best for: Focused testing with minimal candidate filling.
	DisableAllExceptTargetAndBasics
)

// TechniqueTestResult holds the result of a technique detection test
type TechniqueTestResult struct {
	Detected       bool           // Whether the target technique was detected
	Move           *core.Move     // The move that was returned (nil if not detected)
	TechniquesUsed map[string]int // Count of each technique used during solving
	Status         string         // Solve status (completed, stalled, etc.)
	TotalMoves     int            // Total moves taken
}

// TechniqueTestConfig holds configuration for technique testing
type TechniqueTestConfig struct {
	MaxSteps       int    // Maximum solve steps (default 200)
	PrefilledBoard *Board // Optional pre-configured board
	Strategy       TechniqueIsolationStrategy
}

// DefaultTechniqueTestConfig returns a default configuration
func DefaultTechniqueTestConfig() TechniqueTestConfig {
	return TechniqueTestConfig{
		MaxSteps: 200,
		Strategy: DisableSameAndHigherOrder,
	}
}

// TestTechniqueDetection tests whether a specific technique is detected for a puzzle.
// It creates a solver with techniques disabled based on the strategy, then solves
// the puzzle and checks if the target technique was used.
func TestTechniqueDetection(puzzle string, targetSlug string, config TechniqueTestConfig) TechniqueTestResult {
	result := TechniqueTestResult{
		TechniquesUsed: make(map[string]int),
	}

	// Create a fresh registry and apply isolation strategy
	registry := NewTechniqueRegistry()
	targetTech := registry.GetBySlug(targetSlug)
	if targetTech == nil {
		result.Status = "technique_not_found"
		return result
	}

	applyIsolationStrategy(registry, targetSlug, targetTech, config.Strategy)

	// Create solver with modified registry
	solver := NewSolverWithRegistry(registry)

	// Create board
	var board *Board
	if config.PrefilledBoard != nil {
		board = config.PrefilledBoard
	} else {
		cells := parsePuzzleString(puzzle)
		board = NewBoard(cells)
	}

	// Set max steps
	maxSteps := config.MaxSteps
	if maxSteps == 0 {
		maxSteps = 200
	}

	// Solve and track techniques used
	moves, status := solver.SolveWithSteps(board, maxSteps)
	result.Status = status
	result.TotalMoves = len(moves)

	for _, move := range moves {
		result.TechniquesUsed[move.Technique]++
		if move.Technique == targetSlug {
			result.Detected = true
			if result.Move == nil {
				// Store the first occurrence
				moveCopy := move
				result.Move = &moveCopy
			}
		}
	}

	return result
}

// TestTechniqueDetectionDirect tests the technique detector directly on a board state.
// This bypasses the full solver and calls the detector function directly.
func TestTechniqueDetectionDirect(board *Board, targetSlug string) *core.Move {
	registry := NewTechniqueRegistry()
	tech := registry.GetBySlug(targetSlug)
	if tech == nil || tech.Detector == nil {
		return nil
	}
	return tech.Detector(board)
}

// applyIsolationStrategy configures the registry based on the isolation strategy
func applyIsolationStrategy(registry *TechniqueRegistry, targetSlug string, targetTech *TechniqueDescriptor, strategy TechniqueIsolationStrategy) {
	tierOrder := map[string]int{
		constants.TierSimple:  0,
		constants.TierMedium:  1,
		constants.TierHard:    2,
		constants.TierExtreme: 3,
	}
	targetTierOrder := tierOrder[targetTech.Tier]

	allTechniques := registry.GetAll()

	switch strategy {
	case DisableHigherTiers:
		// Disable techniques in tiers strictly above target's tier
		for _, tech := range allTechniques {
			techTierOrder := tierOrder[tech.Tier]
			if techTierOrder > targetTierOrder {
				registry.SetEnabled(tech.Slug, false)
			}
		}

	case DisableSameAndHigherOrder:
		// Disable techniques with Order >= target's Order (except target itself)
		for _, tech := range allTechniques {
			if tech.Order >= targetTech.Order && tech.Slug != targetSlug {
				registry.SetEnabled(tech.Slug, false)
			}
		}

	case DisableAllExceptTarget:
		// Disable everything except target
		for _, tech := range allTechniques {
			if tech.Slug != targetSlug {
				registry.SetEnabled(tech.Slug, false)
			}
		}

	case DisableAllExceptTargetAndBasics:
		// Disable all except target, naked-single, hidden-single
		basicSlugs := map[string]bool{
			"naked-single":  true,
			"hidden-single": true,
		}
		for _, tech := range allTechniques {
			if tech.Slug != targetSlug && !basicSlugs[tech.Slug] {
				registry.SetEnabled(tech.Slug, false)
			}
		}
	}
}

// parsePuzzleString converts an 81-character puzzle string to a cell array
func parsePuzzleString(puzzle string) []int {
	cells := make([]int, 81)
	for i, c := range puzzle {
		if i >= 81 {
			break
		}
		if c >= '0' && c <= '9' {
			cells[i] = int(c - '0')
		}
	}
	return cells
}

// CreateSolverWithDisabledTechniques creates a solver with specific techniques disabled.
// This is useful for testing when you want fine-grained control.
func CreateSolverWithDisabledTechniques(disabledSlugs []string) *Solver {
	registry := NewTechniqueRegistry()
	for _, slug := range disabledSlugs {
		registry.SetEnabled(slug, false)
	}
	return NewSolverWithRegistry(registry)
}

// CreateSolverForTechnique creates a solver optimized for testing a specific technique.
// It disables all techniques that would be tried before the target.
func CreateSolverForTechnique(targetSlug string) *Solver {
	registry := NewTechniqueRegistry()
	targetTech := registry.GetBySlug(targetSlug)
	if targetTech == nil {
		return NewSolver() // fallback to default solver
	}

	// Disable techniques with Order >= target's Order (except target)
	for _, tech := range registry.GetAll() {
		if tech.Order >= targetTech.Order && tech.Slug != targetSlug {
			registry.SetEnabled(tech.Slug, false)
		}
	}

	return NewSolverWithRegistry(registry)
}

// =============================================================================
// CONVENIENCE HELPER FUNCTIONS
// =============================================================================

// CreateSolverWithOnlyTechniques creates a solver with ONLY the specified techniques enabled.
// All other techniques are disabled. Useful for testing specific technique combinations.
//
// Example:
//
//	solver := CreateSolverWithOnlyTechniques("naked-single", "hidden-single", "x-wing")
//	moves, status := solver.SolveWithSteps(board, 200)
func CreateSolverWithOnlyTechniques(slugs ...string) *Solver {
	registry := NewTechniqueRegistry()

	// Build a set of enabled slugs for O(1) lookup
	enabledSet := make(map[string]bool)
	for _, slug := range slugs {
		enabledSet[slug] = true
	}

	// Disable all techniques not in the set
	for _, tech := range registry.GetAll() {
		if !enabledSet[tech.Slug] {
			registry.SetEnabled(tech.Slug, false)
		}
	}

	return NewSolverWithRegistry(registry)
}

// CreateSolverWithTierOnly creates a solver that only uses techniques from the specified tier.
// Useful for testing difficulty-appropriate solving.
//
// Example:
//
//	solver := CreateSolverWithTierOnly("simple")
//	moves, status := solver.SolveWithSteps(board, 200)
func CreateSolverWithTierOnly(tier string) *Solver {
	registry := NewTechniqueRegistry()

	for _, tech := range registry.GetAll() {
		if tech.Tier != tier {
			registry.SetEnabled(tech.Slug, false)
		}
	}

	return NewSolverWithRegistry(registry)
}

// CreateSolverUpToTier creates a solver that uses techniques up to and including the specified tier.
// Techniques in higher tiers are disabled.
//
// Example:
//
//	solver := CreateSolverUpToTier("medium") // simple + medium techniques only
//	moves, status := solver.SolveWithSteps(board, 200)
func CreateSolverUpToTier(maxTier string) *Solver {
	registry := NewTechniqueRegistry()

	tierOrder := map[string]int{
		constants.TierSimple:  0,
		constants.TierMedium:  1,
		constants.TierHard:    2,
		constants.TierExtreme: 3,
	}

	maxTierOrder, ok := tierOrder[maxTier]
	if !ok {
		return NewSolver() // fallback if invalid tier
	}

	for _, tech := range registry.GetAll() {
		techTierOrder := tierOrder[tech.Tier]
		if techTierOrder > maxTierOrder {
			registry.SetEnabled(tech.Slug, false)
		}
	}

	return NewSolverWithRegistry(registry)
}

// CreateSolverWithoutTechniques creates a solver with specific techniques disabled.
// All other techniques remain enabled. Useful for testing what happens when
// certain techniques are unavailable.
//
// Example:
//
//	solver := CreateSolverWithoutTechniques("als-xz", "xy-chain", "forcing-chain")
//	moves, status := solver.SolveWithSteps(board, 200)
func CreateSolverWithoutTechniques(slugs ...string) *Solver {
	registry := NewTechniqueRegistry()

	for _, slug := range slugs {
		registry.SetEnabled(slug, false)
	}

	return NewSolverWithRegistry(registry)
}

// CreateSolverForDifficulty creates a solver appropriate for a given difficulty level.
// Uses the DifficultyAllowedTiers mapping to determine which techniques to enable.
//
// Example:
//
//	solver := CreateSolverForDifficulty(core.DifficultyMedium)
//	moves, status := solver.SolveWithSteps(board, 200)
func CreateSolverForDifficulty(difficulty core.Difficulty) *Solver {
	allowedTiers, ok := DifficultyAllowedTiers[difficulty]
	if !ok {
		return NewSolver() // fallback if unknown difficulty
	}

	registry := NewTechniqueRegistry()

	// Build set of allowed tiers
	allowedTierSet := make(map[string]bool)
	for _, tier := range allowedTiers {
		allowedTierSet[tier] = true
	}

	// Disable techniques not in allowed tiers
	for _, tech := range registry.GetAll() {
		if !allowedTierSet[tech.Tier] {
			registry.SetEnabled(tech.Slug, false)
		}
	}

	return NewSolverWithRegistry(registry)
}

// GetAllTechniqueSlugs returns all registered technique slugs.
// Useful for iterating over techniques or building UI lists.
func GetAllTechniqueSlugs() []string {
	registry := NewTechniqueRegistry()
	all := registry.GetAll()
	slugs := make([]string, len(all))
	for i, tech := range all {
		slugs[i] = tech.Slug
	}
	return slugs
}

// GetTechniqueSlugsForTier returns all technique slugs for a given tier.
func GetTechniqueSlugsForTier(tier string) []string {
	registry := NewTechniqueRegistry()
	techniques := registry.GetByTier(tier)
	slugs := make([]string, len(techniques))
	for i, tech := range techniques {
		slugs[i] = tech.Slug
	}
	return slugs
}
