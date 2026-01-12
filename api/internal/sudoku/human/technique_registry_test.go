package human

import (
	"testing"
)

func TestTechniqueRegistry_Basic(t *testing.T) {
	registry := NewTechniqueRegistry()

	// Test that registry is not empty
	all := registry.GetAll()
	if len(all) == 0 {
		t.Error("Registry should not be empty")
	}

	// Test that we have techniques in each tier
	simple := registry.GetByTier("simple")
	medium := registry.GetByTier("medium")
	hard := registry.GetByTier("hard")
	extreme := registry.GetByTier("extreme")

	if len(simple) == 0 {
		t.Error("Should have simple techniques")
	}
	if len(medium) == 0 {
		t.Error("Should have medium techniques")
	}
	if len(hard) == 0 {
		t.Error("Should have hard techniques")
	}
	if len(extreme) == 0 {
		t.Error("Should have extreme techniques")
	}
}

func TestTechniqueRegistry_GetBySlug(t *testing.T) {
	registry := NewTechniqueRegistry()

	// Test getting a known technique
	nakedSingle := registry.GetBySlug("naked-single")
	if nakedSingle == nil {
		t.Error("Should find naked-single technique")
		return
	}
	if nakedSingle.Name != "Naked Single" {
		t.Errorf("Expected name 'Naked Single', got %s", nakedSingle.Name)
	}
	if nakedSingle.Tier != "simple" {
		t.Errorf("Expected tier 'simple', got %s", nakedSingle.Tier)
	}

	// Test getting non-existent technique
	unknown := registry.GetBySlug("non-existent")
	if unknown != nil {
		t.Error("Should not find non-existent technique")
	}
}

func TestTechniqueRegistry_EnableDisable(t *testing.T) {
	registry := NewTechniqueRegistry()

	// All techniques should be enabled by default
	all := registry.GetAll()
	for _, tech := range all {
		if !tech.Enabled {
			t.Errorf("Technique %s should be enabled by default", tech.Slug)
		}
	}

	// Test disabling a technique
	success := registry.SetEnabled("naked-single", false)
	if !success {
		t.Error("Should be able to disable naked-single")
	}

	nakedSingle := registry.GetBySlug("naked-single")
	if nakedSingle.Enabled {
		t.Error("naked-single should be disabled")
	}

	// Test enabling it back
	success = registry.SetEnabled("naked-single", true)
	if !success {
		t.Error("Should be able to enable naked-single")
	}

	nakedSingle = registry.GetBySlug("naked-single")
	if !nakedSingle.Enabled {
		t.Error("naked-single should be enabled")
	}

	// Test enabling non-existent technique
	success = registry.SetEnabled("non-existent", true)
	if success {
		t.Error("Should not be able to enable non-existent technique")
	}
}

func TestTechniqueRegistry_GetEnabledTechniques(t *testing.T) {
	registry := NewTechniqueRegistry()

	// Get enabled techniques by tier
	enabled := registry.GetEnabledTechniques()

	if len(enabled["simple"]) == 0 {
		t.Error("Should have enabled simple techniques")
	}

	originalSimpleCount := len(enabled["simple"])

	// Disable all simple techniques except the first one
	simpleTechs := registry.GetByTier("simple")
	for i, tech := range simpleTechs {
		if i > 0 { // Keep first one enabled
			registry.SetEnabled(tech.Slug, false)
		}
	}

	// Check that only one simple technique is enabled
	enabled = registry.GetEnabledTechniques()
	if len(enabled["simple"]) != 1 {
		t.Errorf("Expected 1 enabled simple technique, got %d (originally had %d)", len(enabled["simple"]), originalSimpleCount)
		// Debug: show which ones are still enabled
		for _, tech := range enabled["simple"] {
			t.Logf("Still enabled: %s", tech.Slug)
		}
		// Debug: let's check the registry state directly
		for _, tech := range registry.GetAll() {
			if tech.Tier == "simple" {
				t.Logf("Registry state - %s: enabled=%v", tech.Slug, tech.Enabled)
			}
		}
	}
}

func TestSolver_WithRegistry(t *testing.T) {
	solver := NewSolver()

	// Test that solver has registry
	registry := solver.GetRegistry()
	if registry == nil {
		t.Error("Solver should have a registry")
	}

	// Test getting technique tier
	tier := solver.GetTechniqueTier("naked-single")
	if tier != "simple" {
		t.Errorf("Expected 'simple', got %s", tier)
	}

	tier = solver.GetTechniqueTier("non-existent")
	if tier != "" {
		t.Errorf("Expected empty string for non-existent technique, got %s", tier)
	}

	// Test setting technique enabled/disabled
	success := solver.SetTechniqueEnabled("naked-single", false)
	if !success {
		t.Error("Should be able to disable technique")
	}

	success = solver.SetTechniqueEnabled("non-existent", false)
	if success {
		t.Error("Should not be able to disable non-existent technique")
	}
}

// =============================================================================
// Tests for Convenience Helper Functions
// =============================================================================

func TestCreateSolverWithOnlyTechniques(t *testing.T) {
	solver := CreateSolverWithOnlyTechniques("naked-single", "hidden-single", "x-wing")
	registry := solver.GetRegistry()

	// Check that only the specified techniques are enabled
	nakedSingle := registry.GetBySlug("naked-single")
	hiddenSingle := registry.GetBySlug("hidden-single")
	xWing := registry.GetBySlug("x-wing")
	nakedPair := registry.GetBySlug("naked-pair")

	if !nakedSingle.Enabled {
		t.Error("naked-single should be enabled")
	}
	if !hiddenSingle.Enabled {
		t.Error("hidden-single should be enabled")
	}
	if !xWing.Enabled {
		t.Error("x-wing should be enabled")
	}
	if nakedPair.Enabled {
		t.Error("naked-pair should be disabled")
	}
}

func TestCreateSolverWithTierOnly(t *testing.T) {
	solver := CreateSolverWithTierOnly("simple")
	registry := solver.GetRegistry()

	// Simple techniques should be enabled
	for _, tech := range registry.GetByTier("simple") {
		if !tech.Enabled {
			t.Errorf("Simple technique %s should be enabled", tech.Slug)
		}
	}

	// Medium and higher should be disabled
	xWing := registry.GetBySlug("x-wing")
	if xWing.Enabled {
		t.Error("x-wing (medium tier) should be disabled")
	}
}

func TestCreateSolverUpToTier(t *testing.T) {
	solver := CreateSolverUpToTier("medium")
	registry := solver.GetRegistry()

	// Simple techniques should be enabled
	nakedSingle := registry.GetBySlug("naked-single")
	if !nakedSingle.Enabled {
		t.Error("naked-single should be enabled")
	}

	// Medium techniques should be enabled
	xWing := registry.GetBySlug("x-wing")
	if !xWing.Enabled {
		t.Error("x-wing should be enabled")
	}

	// Hard and extreme should be disabled
	xyChain := registry.GetBySlug("xy-chain")
	if xyChain.Enabled {
		t.Error("xy-chain (hard tier) should be disabled")
	}

	aic := registry.GetBySlug("aic")
	if aic.Enabled {
		t.Error("aic (extreme tier) should be disabled")
	}
}

func TestCreateSolverWithoutTechniques(t *testing.T) {
	solver := CreateSolverWithoutTechniques("x-wing", "swordfish")
	registry := solver.GetRegistry()

	// Specified techniques should be disabled
	xWing := registry.GetBySlug("x-wing")
	swordfish := registry.GetBySlug("swordfish")
	if xWing.Enabled {
		t.Error("x-wing should be disabled")
	}
	if swordfish.Enabled {
		t.Error("swordfish should be disabled")
	}

	// Other techniques should still be enabled
	nakedSingle := registry.GetBySlug("naked-single")
	if !nakedSingle.Enabled {
		t.Error("naked-single should still be enabled")
	}
}

func TestGetAllTechniqueSlugs(t *testing.T) {
	slugs := GetAllTechniqueSlugs()

	if len(slugs) == 0 {
		t.Error("Should return at least one slug")
	}

	// Check for some known techniques
	found := make(map[string]bool)
	for _, slug := range slugs {
		found[slug] = true
	}

	if !found["naked-single"] {
		t.Error("Should include naked-single")
	}
	if !found["x-wing"] {
		t.Error("Should include x-wing")
	}
}

func TestGetTechniqueSlugsForTier(t *testing.T) {
	simpleSlugs := GetTechniqueSlugsForTier("simple")

	if len(simpleSlugs) == 0 {
		t.Error("Should return simple tier slugs")
	}

	// All returned slugs should be simple tier
	registry := NewTechniqueRegistry()
	for _, slug := range simpleSlugs {
		tech := registry.GetBySlug(slug)
		if tech == nil {
			t.Errorf("Slug %s should exist in registry", slug)
			continue
		}
		if tech.Tier != "simple" {
			t.Errorf("Technique %s should be simple tier, got %s", slug, tech.Tier)
		}
	}
}
