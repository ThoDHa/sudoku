// Package human provides human-like Sudoku solving techniques with support
// for enabling/disabling individual techniques at runtime.
//
// # Technique Enable/Disable System
//
// The technique registry supports enabling and disabling techniques dynamically.
// This is useful for:
//   - Testing specific techniques in isolation
//   - Simulating different difficulty levels
//   - Debugging technique detection
//   - Finding which techniques are required to solve a puzzle
//
// # Basic Usage
//
// ## Disable specific techniques on an existing solver:
//
//	solver := NewSolver()
//	solver.SetTechniqueEnabled("x-wing", false)
//	solver.SetTechniqueEnabled("swordfish", false)
//	moves, status := solver.SolveWithSteps(board, 200)
//
// ## Create a solver with a custom registry:
//
//	registry := NewTechniqueRegistry()
//	registry.SetEnabled("als-xz", false)
//	registry.SetEnabled("forcing-chain", false)
//	solver := NewSolverWithRegistry(registry)
//	moves, status := solver.SolveWithSteps(board, 200)
//
// # Convenience Functions (in technique_test_helpers.go)
//
// For common patterns, use the convenience functions:
//
//	// Only enable specific techniques
//	solver := CreateSolverWithOnlyTechniques("naked-single", "hidden-single", "x-wing")
//
//	// Disable specific techniques
//	solver := CreateSolverWithoutTechniques("als-xz", "xy-chain")
//
//	// Enable techniques up to a tier
//	solver := CreateSolverUpToTier("medium") // simple + medium only
//
//	// Enable only one tier
//	solver := CreateSolverWithTierOnly("simple")
//
//	// Create solver for a difficulty level
//	solver := CreateSolverForDifficulty(core.DifficultyMedium)
//
// # Testing Specific Techniques
//
// To test that a specific technique fires on a puzzle:
//
//	config := TechniqueTestConfig{
//	    MaxSteps: 300,
//	    Strategy: DisableAllExceptTargetAndBasics,
//	}
//	result := TestTechniqueDetection(puzzleString, "x-wing", config)
//	if result.Detected {
//	    fmt.Println("X-Wing was used!")
//	}
//
// # Isolation Strategies
//
// When testing techniques, choose an appropriate isolation strategy:
//
//   - DisableHigherTiers: Keep all techniques in target's tier and below
//   - DisableSameAndHigherOrder: Keep only techniques that run before target
//   - DisableAllExceptTarget: Only the target technique (risky - unrealistic state)
//   - DisableAllExceptTargetAndBasics: Target + naked/hidden singles only
//
// # Example: Finding Required Techniques
//
//	// Try solving with progressively more techniques until it works
//	tiers := []string{"simple", "medium", "hard", "extreme"}
//	for _, tier := range tiers {
//	    solver := CreateSolverUpToTier(tier)
//	    board := NewBoard(puzzleCells)
//	    _, status := solver.SolveWithSteps(board, 300)
//	    if status == constants.StatusCompleted {
//	        fmt.Printf("Puzzle solvable with %s tier techniques\n", tier)
//	        break
//	    }
//	}
package human

import (
	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/human/techniques"
)

// TechniqueDescriptor holds metadata about a solving technique
type TechniqueDescriptor struct {
	Name        string                                       // Display name
	Slug        string                                       // URL-friendly identifier
	Tier        string                                       // Difficulty tier (constants.TierSimple, etc.)
	Description string                                       // Brief description
	Detector    func(b techniques.BoardInterface) *core.Move // Detection function
	Enabled     bool                                         // Whether technique is enabled
	Order       int                                          // Execution order within tier
}

// TechniqueRegistry holds all available techniques organized by tier
type TechniqueRegistry struct {
	techniques map[string]*TechniqueDescriptor // keyed by slug
	tierOrder  map[string][]string             // tier -> ordered list of slugs
}

// NewTechniqueRegistry creates and initializes the technique registry
func NewTechniqueRegistry() *TechniqueRegistry {
	registry := &TechniqueRegistry{
		techniques: make(map[string]*TechniqueDescriptor),
		tierOrder:  make(map[string][]string),
	}
	registry.registerTechniques()
	return registry
}

// registerTechniques defines all available techniques with metadata
// Order is based on PEDAGOGICAL LEARNING PROGRESSION - the natural order
// a student would learn techniques, from most intuitive to most advanced.
//
// This differs from efficiency ordering (which solves puzzles faster) by
// prioritizing conceptual building blocks:
// 1. Singles first (most intuitive)
// 2. Subset techniques grouped together (pairs → triples → quads)
// 3. Fish techniques grouped together (X-Wing → Swordfish → Jellyfish)
// 4. Wing techniques grouped together (XY → XYZ → WXYZ)
// 5. Coloring and uniqueness after pattern recognition is established
// 6. Chains and ALS techniques last (most abstract)
//
// Tier classification follows SudokuWiki's grading system:
// - Simple (Basic): Singles, Pairs, Intersection Removal, Triples
// - Medium (Tough): Quads, Fish, Wings, Coloring, BUG, UR Type 1
// - Hard (Diabolical): Advanced Fish, Chains, Medusa, Advanced URs
// - Extreme: Finned Fish, AICs, ALS techniques, Forcing Chains
func (r *TechniqueRegistry) registerTechniques() {
	// ==========================================================================
	// SIMPLE TIER (Basic) - Singles, Pairs, Intersection Removal, Triples
	// Learning progression: Start with the most intuitive techniques
	// ==========================================================================

	// Naked Single first - most intuitive: "only one number can go here!"
	r.register(TechniqueDescriptor{
		Name:        "Naked Single",
		Slug:        "naked-single",
		Tier:        "simple",
		Description: "A cell with only one possible candidate",
		Detector:    techniques.DetectNakedSingle,
		Enabled:     true,
		Order:       1,
	})

	// Hidden Single second - "only one place for this number!"
	r.register(TechniqueDescriptor{
		Name:        "Hidden Single",
		Slug:        "hidden-single",
		Tier:        "simple",
		Description: "A digit that can only go in one cell in a row, column, or box",
		Detector:    techniques.DetectHiddenSingle,
		Enabled:     true,
		Order:       2,
	})

	// Pairs - first subset technique, easy to visualize
	r.register(TechniqueDescriptor{
		Name:        "Naked Pair",
		Slug:        "naked-pair",
		Tier:        "simple",
		Description: "Two cells with the same two candidates eliminate those digits from their peers",
		Detector:    techniques.DetectNakedPair,
		Enabled:     true,
		Order:       3,
	})

	r.register(TechniqueDescriptor{
		Name:        "Hidden Pair",
		Slug:        "hidden-pair",
		Tier:        "simple",
		Description: "Two digits that can only be in two cells eliminate other candidates from those cells",
		Detector:    techniques.DetectHiddenPair,
		Enabled:     true,
		Order:       4,
	})

	// Intersection techniques - still visual, box/line relationships
	r.register(TechniqueDescriptor{
		Name:        "Pointing Pair",
		Slug:        "pointing-pair",
		Tier:        "simple",
		Description: "If a digit in a box can only be in one row/column, eliminate it from the rest of that row/column",
		Detector:    techniques.DetectPointingPair,
		Enabled:     true,
		Order:       5,
	})

	r.register(TechniqueDescriptor{
		Name:        "Box-Line Reduction",
		Slug:        "box-line-reduction",
		Tier:        "simple",
		Description: "If a digit in a row/column can only be in one box, eliminate it from the rest of that box",
		Detector:    techniques.DetectBoxLineReduction,
		Enabled:     true,
		Order:       6,
	})

	// Triples - natural extension of pairs
	r.register(TechniqueDescriptor{
		Name:        "Naked Triple",
		Slug:        "naked-triple",
		Tier:        "simple",
		Description: "Three cells with the same three candidates eliminate those digits from their peers",
		Detector:    techniques.DetectNakedTriple,
		Enabled:     true,
		Order:       7,
	})

	r.register(TechniqueDescriptor{
		Name:        "Hidden Triple",
		Slug:        "hidden-triple",
		Tier:        "simple",
		Description: "Three digits that can only be in three cells eliminate other candidates from those cells",
		Detector:    techniques.DetectHiddenTriple,
		Enabled:     true,
		Order:       8,
	})

	// ==========================================================================
	// MEDIUM TIER (Tough) - Quads, Fish, Wings, Coloring, BUG, UR Type 1
	// Learning progression: Complete subsets, then introduce fish and wings
	// ==========================================================================

	// Quads first - complete the subset progression (pairs → triples → quads)
	r.register(TechniqueDescriptor{
		Name:        "Naked Quad",
		Slug:        "naked-quad",
		Tier:        "medium",
		Description: "Four cells with the same four candidates eliminate those digits from their peers",
		Detector:    techniques.DetectNakedQuad,
		Enabled:     true,
		Order:       9,
	})

	r.register(TechniqueDescriptor{
		Name:        "Hidden Quad",
		Slug:        "hidden-quad",
		Tier:        "medium",
		Description: "Four digits that can only be in four cells eliminate other candidates from those cells",
		Detector:    techniques.DetectHiddenQuad,
		Enabled:     true,
		Order:       10,
	})

	// Fish techniques - visual pattern recognition
	r.register(TechniqueDescriptor{
		Name:        "X-Wing",
		Slug:        "x-wing",
		Tier:        "medium",
		Description: "A digit forming a rectangle pattern allows eliminations",
		Detector:    techniques.DetectXWing,
		Enabled:     true,
		Order:       11,
	})

	r.register(TechniqueDescriptor{
		Name:        "Swordfish",
		Slug:        "swordfish",
		Tier:        "medium",
		Description: "A 3x3 fish pattern for eliminations",
		Detector:    techniques.DetectSwordfish,
		Enabled:     true,
		Order:       12,
	})

	// Wing techniques - introduce chained logic
	r.register(TechniqueDescriptor{
		Name:        "XY-Wing",
		Slug:        "xy-wing",
		Tier:        "medium",
		Description: "A hinge cell and two pincers eliminate candidates",
		Detector:    techniques.DetectXYWing,
		Enabled:     true,
		Order:       13,
	})

	r.register(TechniqueDescriptor{
		Name:        "XYZ-Wing",
		Slug:        "xyz-wing",
		Tier:        "medium",
		Description: "A trivalue hinge with bivalue pincers",
		Detector:    techniques.DetectXYZWing,
		Enabled:     true,
		Order:       14,
	})

	// Simple Coloring - introduces color chain concepts
	r.register(TechniqueDescriptor{
		Name:        "Simple Coloring",
		Slug:        "simple-coloring",
		Tier:        "medium",
		Description: "Color chains of strong links to find eliminations",
		Detector:    techniques.DetectSimpleColoring,
		Enabled:     true,
		Order:       15,
	})

	// BUG and Unique Rectangle - require understanding of uniqueness
	r.register(TechniqueDescriptor{
		Name:        "BUG",
		Slug:        "bug",
		Tier:        "medium",
		Description: "Bivalue Universal Grave - avoid patterns with multiple solutions",
		Detector:    techniques.DetectBUG,
		Enabled:     true,
		Order:       16,
	})

	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle",
		Slug:        "unique-rectangle",
		Tier:        "medium",
		Description: "Avoid deadly rectangles that would make puzzle have multiple solutions",
		Detector:    techniques.DetectUniqueRectangle,
		Enabled:     true,
		Order:       17,
	})

	// ==========================================================================
	// HARD TIER (Diabolical) - Advanced Fish, Chains, Medusa, Advanced URs
	// Learning progression: Complete fish family, then chains, then advanced patterns
	// ==========================================================================

	// Jellyfish - complete the fish family (X-Wing → Swordfish → Jellyfish)
	r.register(TechniqueDescriptor{
		Name:        "Jellyfish",
		Slug:        "jellyfish",
		Tier:        "hard",
		Description: "A 4x4 fish pattern for eliminations",
		Detector:    techniques.DetectJellyfish,
		Enabled:     true,
		Order:       18,
	})

	// Skyscraper - simple single-digit chain, intro to chain concepts
	r.register(TechniqueDescriptor{
		Name:        "Skyscraper",
		Slug:        "skyscraper",
		Tier:        "hard",
		Description: "A turbot fish variant for eliminations",
		Detector:    techniques.DetectSkyscraper,
		Enabled:     true,
		Order:       19,
	})

	// X-Chain - general single-digit chains
	r.register(TechniqueDescriptor{
		Name:        "X-Chain",
		Slug:        "x-chain",
		Tier:        "hard",
		Description: "Chain of alternating strong/weak links for a single digit",
		Detector:    techniques.DetectXChain,
		Enabled:     true,
		Order:       20,
	})

	// XY-Chain - multi-digit chains through bivalue cells
	r.register(TechniqueDescriptor{
		Name:        "XY-Chain",
		Slug:        "xy-chain",
		Tier:        "hard",
		Description: "Chain through bivalue cells",
		Detector:    techniques.DetectXYChain,
		Enabled:     true,
		Order:       21,
	})

	// W-Wing - connected bivalue cells
	r.register(TechniqueDescriptor{
		Name:        "W-Wing",
		Slug:        "w-wing",
		Tier:        "hard",
		Description: "Two bivalue cells connected by strong link",
		Detector:    techniques.DetectWWing,
		Enabled:     true,
		Order:       22,
	})

	// WXYZ-Wing - complete the wing family
	r.register(TechniqueDescriptor{
		Name:        "WXYZ-Wing",
		Slug:        "wxyz-wing",
		Tier:        "hard",
		Description: "A four-candidate wing pattern",
		Detector:    techniques.DetectWXYZWing,
		Enabled:     true,
		Order:       23,
	})

	// Empty Rectangle - box-based chain technique
	r.register(TechniqueDescriptor{
		Name:        "Empty Rectangle",
		Slug:        "empty-rectangle",
		Tier:        "hard",
		Description: "Use empty rectangles to create eliminations",
		Detector:    techniques.DetectEmptyRectangle,
		Enabled:     true,
		Order:       24,
	})

	// 3D Medusa - advanced multi-digit coloring
	r.register(TechniqueDescriptor{
		Name:        "3D Medusa",
		Slug:        "medusa-3d",
		Tier:        "hard",
		Description: "Multi-digit coloring with strong/weak link chains",
		Detector:    techniques.DetectMedusa3D,
		Enabled:     true,
		Order:       25,
	})

	// Advanced Unique Rectangles - after basic UR is understood
	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle Type 2",
		Slug:        "unique-rectangle-type-2",
		Tier:        "hard",
		Description: "Unique rectangle with extra candidates in one corner",
		Detector:    techniques.DetectUniqueRectangleType2,
		Enabled:     true,
		Order:       26,
	})

	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle Type 3",
		Slug:        "unique-rectangle-type-3",
		Tier:        "hard",
		Description: "Unique rectangle with naked pair/triple",
		Detector:    techniques.DetectUniqueRectangleType3,
		Enabled:     true,
		Order:       27,
	})

	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle Type 4",
		Slug:        "unique-rectangle-type-4",
		Tier:        "hard",
		Description: "Unique rectangle with hidden pair",
		Detector:    techniques.DetectUniqueRectangleType4,
		Enabled:     true,
		Order:       28,
	})

	// ==========================================================================
	// EXTREME TIER - Finned Fish, AICs, ALS, Forcing Chains
	// Learning progression: Finned fish extend basic fish, then AICs, then ALS
	// ==========================================================================

	// Finned Fish - extensions of basic fish patterns
	r.register(TechniqueDescriptor{
		Name:        "Finned X-Wing",
		Slug:        "finned-x-wing",
		Tier:        "extreme",
		Description: "An X-Wing with extra candidates (fins)",
		Detector:    techniques.DetectFinnedXWing,
		Enabled:     true,
		Order:       29,
	})

	r.register(TechniqueDescriptor{
		Name:        "Finned Swordfish",
		Slug:        "finned-swordfish",
		Tier:        "extreme",
		Description: "A Swordfish with extra candidates (fins)",
		Detector:    techniques.DetectFinnedSwordfish,
		Enabled:     true,
		Order:       30,
	})

	// Grouped X-Cycles - advanced single-digit cycles
	r.register(TechniqueDescriptor{
		Name:        "Grouped X-Cycles",
		Slug:        "grouped-x-cycles",
		Tier:        "extreme",
		Description: "X-Cycles using group strong links",
		Detector:    techniques.DetectGroupedXCycles,
		Enabled:     true,
		Order:       31,
	})

	// AIC - general alternating inference chains
	r.register(TechniqueDescriptor{
		Name:        "AIC",
		Slug:        "aic",
		Tier:        "extreme",
		Description: "Alternating Inference Chains",
		Detector:    techniques.DetectAIC,
		Enabled:     true,
		Order:       32,
	})

	// ALS techniques - Almost Locked Sets family
	r.register(TechniqueDescriptor{
		Name:        "ALS-XZ",
		Slug:        "als-xz",
		Tier:        "extreme",
		Description: "Almost Locked Set with XZ rule",
		Detector:    techniques.DetectALSXZ,
		Enabled:     true,
		Order:       33,
	})

	r.register(TechniqueDescriptor{
		Name:        "ALS-XY-Wing",
		Slug:        "als-xy-wing",
		Tier:        "extreme",
		Description: "Almost Locked Set XY-Wing pattern",
		Detector:    techniques.DetectALSXYWing,
		Enabled:     true,
		Order:       34,
	})

	r.register(TechniqueDescriptor{
		Name:        "ALS-XY-Chain",
		Slug:        "als-xy-chain",
		Tier:        "extreme",
		Description: "Chain of Almost Locked Sets",
		Detector:    techniques.DetectALSXYChain,
		Enabled:     true,
		Order:       35,
	})

	// Sue de Coq - intersecting ALS
	r.register(TechniqueDescriptor{
		Name:        "Sue de Coq",
		Slug:        "sue-de-coq",
		Tier:        "extreme",
		Description: "Two intersecting almost locked sets",
		Detector:    techniques.DetectSueDeCoq,
		Enabled:     true,
		Order:       36,
	})

	// Death Blossom - advanced ALS pattern
	r.register(TechniqueDescriptor{
		Name:        "Death Blossom",
		Slug:        "death-blossom",
		Tier:        "extreme",
		Description: "Advanced ALS pattern with stem and petals",
		Detector:    techniques.DetectDeathBlossom,
		Enabled:     true,
		Order:       37,
	})

	// Forcing Chains - most general forcing techniques (last resort)
	r.register(TechniqueDescriptor{
		Name:        "Digit Forcing Chain",
		Slug:        "digit-forcing-chain",
		Tier:        "extreme",
		Description: "Forcing chain focused on single digit",
		Detector:    techniques.DetectDigitForcingChain,
		Enabled:     true,
		Order:       38,
	})

	r.register(TechniqueDescriptor{
		Name:        "Forcing Chain",
		Slug:        "forcing-chain",
		Tier:        "extreme",
		Description: "Chain of implications from candidate assumptions",
		Detector:    techniques.DetectForcingChain,
		Enabled:     true,
		Order:       39,
	})
}

// register adds a technique to the registry
func (r *TechniqueRegistry) register(desc TechniqueDescriptor) {
	// Store a copy of the descriptor in the map
	r.techniques[desc.Slug] = &desc

	// Add to tier ordering
	r.tierOrder[desc.Tier] = append(r.tierOrder[desc.Tier], desc.Slug)
}

// GetByTier returns all enabled techniques for a given tier, sorted by order
func (r *TechniqueRegistry) GetByTier(tier string) []TechniqueDescriptor {
	var result []TechniqueDescriptor
	for _, slug := range r.tierOrder[tier] {
		if tech := r.techniques[slug]; tech != nil && tech.Enabled {
			result = append(result, *tech)
		}
	}
	return result
}

// GetBySlug returns a technique by its slug
func (r *TechniqueRegistry) GetBySlug(slug string) *TechniqueDescriptor {
	return r.techniques[slug]
}

// GetAll returns all techniques
func (r *TechniqueRegistry) GetAll() []TechniqueDescriptor {
	var result []TechniqueDescriptor
	for _, tech := range r.techniques {
		result = append(result, *tech)
	}
	return result
}

// SetEnabled enables or disables a technique by slug
func (r *TechniqueRegistry) SetEnabled(slug string, enabled bool) bool {
	if tech := r.techniques[slug]; tech != nil {
		tech.Enabled = enabled
		return true
	}
	return false
}

// GetEnabledTechniques returns all enabled techniques organized by tier
func (r *TechniqueRegistry) GetEnabledTechniques() map[string][]TechniqueDescriptor {
	result := make(map[string][]TechniqueDescriptor)
	for tier, slugs := range r.tierOrder {
		for _, slug := range slugs {
			if tech := r.techniques[slug]; tech != nil && tech.Enabled {
				result[tier] = append(result[tier], *tech)
			}
		}
	}
	return result
}
