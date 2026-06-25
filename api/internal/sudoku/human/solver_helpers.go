package human

import (
	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// Solver-construction helpers. These are general-purpose utilities over the
// technique registry and solver; they are not test fixtures. They live here
// (not in a _test.go file) because the diagnostic command under cmd/test_techniques
// builds restricted-technique solvers via CreateSolverWithOnlyTechniques.

// CreateSolverWithDisabledTechniques creates a solver with specific techniques disabled.
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
		return NewSolver()
	}
	for _, tech := range registry.GetAll() {
		if tech.Order >= targetTech.Order && tech.Slug != targetSlug {
			registry.SetEnabled(tech.Slug, false)
		}
	}
	return NewSolverWithRegistry(registry)
}

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
		constants.TierSimple:  0,
		constants.TierMedium:  1,
		constants.TierHard:    2,
		constants.TierExtreme: 3,
	}
	maxTierOrder, ok := tierOrder[maxTier]
	if !ok {
		return NewSolver()
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
func CreateSolverWithoutTechniques(slugs ...string) *Solver {
	registry := NewTechniqueRegistry()
	for _, slug := range slugs {
		registry.SetEnabled(slug, false)
	}
	return NewSolverWithRegistry(registry)
}

// CreateSolverForDifficulty creates a solver appropriate for a given difficulty level.
func CreateSolverForDifficulty(difficulty core.Difficulty) *Solver {
	allowedTiers, ok := DifficultyAllowedTiers[difficulty]
	if !ok {
		return NewSolver()
	}
	registry := NewTechniqueRegistry()
	allowedTierSet := make(map[string]bool)
	for _, tier := range allowedTiers {
		allowedTierSet[tier] = true
	}
	for _, tech := range registry.GetAll() {
		if !allowedTierSet[tech.Tier] {
			registry.SetEnabled(tech.Slug, false)
		}
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
