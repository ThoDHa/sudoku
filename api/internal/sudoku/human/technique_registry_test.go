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