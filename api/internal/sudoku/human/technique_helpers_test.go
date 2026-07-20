package human

import (
	"context"
	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/human/techniquetest"
	"sudoku-api/pkg/constants"
)

// Test-only technique detection drivers and isolation config. These couple to
// test fixtures and board-stepping orchestration, so they compile only in the
// test build. General solver-construction helpers live in solver_helpers.go.

// TechniqueIsolationStrategy defines how to isolate a technique for testing
type TechniqueIsolationStrategy int

const (
	// DisableHigherTiers disables all techniques in tiers above the target's tier.
	DisableHigherTiers TechniqueIsolationStrategy = iota

	// DisableSameAndHigherOrder disables techniques with Order >= target's Order.
	DisableSameAndHigherOrder

	// DisableAllExceptTarget disables ALL techniques except the target.
	DisableAllExceptTarget

	// DisableAllExceptTargetAndBasics disables all except target + naked/hidden singles.
	DisableAllExceptTargetAndBasics
)

// TechniqueTestResult holds the result of a technique detection test
type TechniqueTestResult struct {
	Detected       bool
	Move           *core.Move
	TechniquesUsed map[string]int
	Status         string
	TotalMoves     int
}

// TechniqueTestConfig holds configuration for technique testing
type TechniqueTestConfig struct {
	MaxSteps       int
	PrefilledBoard *Board
	Strategy       TechniqueIsolationStrategy
}

// DefaultTechniqueTestConfig returns a default configuration
func DefaultTechniqueTestConfig() TechniqueTestConfig {
	return TechniqueTestConfig{
		MaxSteps: 200,
		Strategy: DisableSameAndHigherOrder,
	}
}

// RunTechniqueDetection solves a puzzle under the given isolation config and
// reports whether targetSlug fired. Named Run* (not Test*) because it is a
// helper, not a go test entry point.
func RunTechniqueDetection(puzzle string, targetSlug string, config TechniqueTestConfig) TechniqueTestResult {
	result := TechniqueTestResult{
		TechniquesUsed: make(map[string]int),
	}

	registry := NewTechniqueRegistry()
	targetTech := registry.GetBySlug(targetSlug)
	if targetTech == nil {
		result.Status = "technique_not_found"
		return result
	}

	applyIsolationStrategy(registry, targetSlug, targetTech, config.Strategy)

	solver := NewSolverWithRegistry(registry)

	var board *Board
	if config.PrefilledBoard != nil {
		board = config.PrefilledBoard
	} else {
		cells := parsePuzzleString(puzzle)
		board = NewBoard(cells)
	}

	maxSteps := config.MaxSteps
	if maxSteps == 0 {
		maxSteps = 200
	}

	moves, status := solver.SolveWithSteps(context.Background(), board, maxSteps)
	result.Status = status
	result.TotalMoves = len(moves)

	for _, move := range moves {
		result.TechniquesUsed[move.Technique]++
		if move.Technique == targetSlug {
			result.Detected = true
			if result.Move == nil {
				moveCopy := move
				result.Move = &moveCopy
			}
		}
	}

	return result
}

// DetectTechniqueDirect invokes the target technique's detector on a board state.
func DetectTechniqueDirect(board *Board, targetSlug string) *core.Move {
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
		for _, tech := range allTechniques {
			techTierOrder := tierOrder[tech.Tier]
			if techTierOrder > targetTierOrder {
				registry.SetEnabled(tech.Slug, false)
			}
		}

	case DisableSameAndHigherOrder:
		for _, tech := range allTechniques {
			if tech.Order >= targetTech.Order && tech.Slug != targetSlug {
				registry.SetEnabled(tech.Slug, false)
			}
		}

	case DisableAllExceptTarget:
		for _, tech := range allTechniques {
			if tech.Slug != targetSlug {
				registry.SetEnabled(tech.Slug, false)
			}
		}

	case DisableAllExceptTargetAndBasics:
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

	// Honor the per-technique isolation config on top of the strategy: some
	// same- or lower-tier techniques preempt the target on its curated board and
	// must be disabled regardless of the tier-based strategy above.
	for _, slug := range techniquetest.TechniqueIsolationConfig[targetSlug] {
		registry.SetEnabled(slug, false)
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
