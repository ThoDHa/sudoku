package human

import (
	"sudoku-api/pkg/constants"
)

// Solver-construction helpers. These are general-purpose utilities over the
// technique registry and solver; they are not test fixtures. They live here
// (not in a _test.go file) because the diagnostic command under cmd/test_techniques
// builds restricted-technique solvers via CreateSolverWithOnlyTechniques.

// CreateSolverWithOnlyTechniques creates a solver with ONLY the specified techniques enabled.
func CreateSolverWithOnlyTechniques(slugs ...string) *Solver {
	registry := NewTechniqueRegistry()
	enabledSet := make(map[string]bool)
	for _, slug := range slugs {
		enabledSet[slug] = true
	}
	for _, tech := range registry.GetAll() {
		if !enabledSet[tech.Slug] {
			registry.SetEnabled(tech.Slug, false)
		}
	}
	return NewSolverWithRegistry(registry)
}

// CreateSolverWithTierOnly creates a solver that only uses techniques from the specified tier.
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
func CreateSolverUpToTier(maxTier string) *Solver {
	registry := NewTechniqueRegistry()
	tierOrder := map[string]int{
		// tierOrder is only used for `>` comparisons and every tier maps to a
		// distinct integer, so shifting Simple from 0 to -1 preserves the ordering.
		// mutator-disable-next-line numbers/decrementer
		constants.TierSimple: 0,
		constants.TierMedium: 1,
		constants.TierHard:   2,
		// Same reasoning: shifting Extreme from 3 to 4 preserves all comparisons.
		// mutator-disable-next-line numbers/incrementer
		constants.TierExtreme: 3,
	}
	maxTierOrder, ok := tierOrder[maxTier]
	if !ok {
		return NewSolver()
	}
	for _, tech := range registry.GetAll() {
		// An unrecognized tier is outside the known difficulty ladder; disable
		// it rather than silently keeping it. Without this guard the map
		// zero-value (0) would treat the unknown tier as the simplest tier.
		techTierOrder, known := tierOrder[tech.Tier]
		if !known || techTierOrder > maxTierOrder {
			registry.SetEnabled(tech.Slug, false)
		}
	}
	return NewSolverWithRegistry(registry)
}

// CreateSolverWithoutTechniques creates a solver with specific techniques disabled.
func CreateSolverWithoutTechniques(slugs ...string) *Solver {
	registry := NewTechniqueRegistry()
	for _, slug := range slugs {
		registry.SetEnabled(slug, false)
	}
	return NewSolverWithRegistry(registry)
}

// GetAllTechniqueSlugs returns all registered technique slugs.
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
