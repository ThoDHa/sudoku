package human

import (
	"testing"

	"sudoku-api/internal/sudoku/human/techniquetest"
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

func TestTechniqueRegistry_GetByTierSortedByOrder(t *testing.T) {
	registry := NewTechniqueRegistry()

	for _, tier := range []string{"simple", "medium", "hard", "extreme"} {
		techs := registry.GetByTier(tier)
		if len(techs) < 2 {
			continue
		}
		for i := 1; i < len(techs); i++ {
			if techs[i].Order <= techs[i-1].Order {
				t.Errorf("%s tier: techniques not sorted by Order at index %d: %s(Order=%d) before %s(Order=%d)",
					tier, i, techs[i-1].Slug, techs[i-1].Order, techs[i].Slug, techs[i].Order)
			}
		}
	}

	simple := registry.GetByTier("simple")
	if len(simple) > 0 && simple[0].Slug != "naked-single" {
		t.Errorf("expected naked-single first in simple tier (Order=1), got %s (Order=%d)",
			simple[0].Slug, simple[0].Order)
	}
}

func TestTechniqueRegistry_GetAllSortedByOrder(t *testing.T) {
	registry := NewTechniqueRegistry()
	all := registry.GetAll()

	if len(all) < 2 {
		t.Fatal("expected at least 2 techniques")
	}
	for i := 1; i < len(all); i++ {
		if all[i].Order <= all[i-1].Order {
			t.Errorf("GetAll not sorted by Order at index %d: %s(Order=%d) before %s(Order=%d)",
				i, all[i-1].Slug, all[i-1].Order, all[i].Slug, all[i].Order)
		}
	}
	if all[0].Order != 1 {
		t.Errorf("expected first technique to have Order=1, got Order=%d (%s)", all[0].Order, all[0].Slug)
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

// TestRegistrySlugsMatchCuratedFixtures guards against drift between the
// production technique registry and the curated test fixtures: every registered
// technique must have a curated fixture, and vice versa. A detector added to the
// registry without a fixture (or a fixture with no registry entry) silently
// breaks coverage. This is the registry-side companion to the techniques
// package's TestSlugSourcesAgree, chaining registry -> fixtures -> detectors.
func TestRegistrySlugsMatchCuratedFixtures(t *testing.T) {
	registry := NewTechniqueRegistry()
	registrySlugs := map[string]bool{}
	for _, tech := range registry.GetAll() {
		registrySlugs[tech.Slug] = true
	}
	fixtureSlugs := map[string]bool{}
	for _, p := range techniquetest.Puzzles {
		fixtureSlugs[p.Slug] = true
	}

	for slug := range registrySlugs {
		if !fixtureSlugs[slug] {
			t.Errorf("registry has %q but no curated fixture covers it", slug)
		}
	}
	for slug := range fixtureSlugs {
		if !registrySlugs[slug] {
			t.Errorf("curated fixture %q has no registry entry", slug)
		}
	}
}

func TestGetBoxCellRefs_AllBoxesCorrect(t *testing.T) {
	expectedBoxes := map[int][]struct{ row, col int }{
		0: {{0, 0}, {0, 1}, {0, 2}, {1, 0}, {1, 1}, {1, 2}, {2, 0}, {2, 1}, {2, 2}},
		1: {{0, 3}, {0, 4}, {0, 5}, {1, 3}, {1, 4}, {1, 5}, {2, 3}, {2, 4}, {2, 5}},
		2: {{0, 6}, {0, 7}, {0, 8}, {1, 6}, {1, 7}, {1, 8}, {2, 6}, {2, 7}, {2, 8}},
		3: {{3, 0}, {3, 1}, {3, 2}, {4, 0}, {4, 1}, {4, 2}, {5, 0}, {5, 1}, {5, 2}},
		4: {{3, 3}, {3, 4}, {3, 5}, {4, 3}, {4, 4}, {4, 5}, {5, 3}, {5, 4}, {5, 5}},
		5: {{3, 6}, {3, 7}, {3, 8}, {4, 6}, {4, 7}, {4, 8}, {5, 6}, {5, 7}, {5, 8}},
		6: {{6, 0}, {6, 1}, {6, 2}, {7, 0}, {7, 1}, {7, 2}, {8, 0}, {8, 1}, {8, 2}},
		7: {{6, 3}, {6, 4}, {6, 5}, {7, 3}, {7, 4}, {7, 5}, {8, 3}, {8, 4}, {8, 5}},
		8: {{6, 6}, {6, 7}, {6, 8}, {7, 6}, {7, 7}, {7, 8}, {8, 6}, {8, 7}, {8, 8}},
	}
	for boxNum, expected := range expectedBoxes {
		refs := getBoxCellRefs(boxNum)
		if len(refs) != len(expected) {
			t.Errorf("box %d: expected %d cells, got %d", boxNum, len(expected), len(refs))
			continue
		}
		for i, exp := range expected {
			if refs[i].Row != exp.row || refs[i].Col != exp.col {
				t.Errorf("box %d cell %d: expected R%dC%d, got R%dC%d",
					boxNum, i, exp.row, exp.col, refs[i].Row, refs[i].Col)
			}
		}
	}
}
