package human

import "sudoku-api/internal/core"

// TechniqueDescriptor holds metadata about a solving technique
type TechniqueDescriptor struct {
	Name        string                     // Display name
	Slug        string                     // URL-friendly identifier
	Tier        string                     // Difficulty tier (constants.TierSimple, etc.)
	Description string                     // Brief description
	Detector    func(b *Board) *core.Move  // Detection function
	Enabled     bool                       // Whether technique is enabled
	Order       int                        // Execution order within tier
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
func (r *TechniqueRegistry) registerTechniques() {
	// Simple tier techniques - basic eliminations and assignments
	r.register(TechniqueDescriptor{
		Name:        "Pointing Pair",
		Slug:        "pointing-pair",
		Tier:        "simple",
		Description: "If a digit in a box can only be in one row/column, eliminate it from the rest of that row/column",
		Detector:    detectPointingPair,
		Enabled:     true,
		Order:       1,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Box-Line Reduction",
		Slug:        "box-line-reduction", 
		Tier:        "simple",
		Description: "If a digit in a row/column can only be in one box, eliminate it from the rest of that box",
		Detector:    detectBoxLineReduction,
		Enabled:     true,
		Order:       2,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Naked Pair",
		Slug:        "naked-pair",
		Tier:        "simple",
		Description: "Two cells with the same two candidates eliminate those digits from their peers",
		Detector:    detectNakedPair,
		Enabled:     true,
		Order:       3,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Hidden Pair",
		Slug:        "hidden-pair",
		Tier:        "simple", 
		Description: "Two digits that can only be in two cells eliminate other candidates from those cells",
		Detector:    detectHiddenPair,
		Enabled:     true,
		Order:       4,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Naked Single",
		Slug:        "naked-single",
		Tier:        "simple",
		Description: "A cell with only one possible candidate",
		Detector:    detectNakedSingle,
		Enabled:     true,
		Order:       5,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Hidden Single",
		Slug:        "hidden-single", 
		Tier:        "simple",
		Description: "A digit that can only go in one cell in a row, column, or box",
		Detector:    detectHiddenSingle,
		Enabled:     true,
		Order:       6,
	})

	// Medium tier techniques
	r.register(TechniqueDescriptor{
		Name:        "Naked Triple",
		Slug:        "naked-triple",
		Tier:        "medium",
		Description: "Three cells with the same three candidates eliminate those digits from their peers",
		Detector:    detectNakedTriple,
		Enabled:     true,
		Order:       10,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Hidden Triple",
		Slug:        "hidden-triple",
		Tier:        "medium",
		Description: "Three digits that can only be in three cells eliminate other candidates from those cells",
		Detector:    detectHiddenTriple,
		Enabled:     true,
		Order:       11,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Naked Quad",
		Slug:        "naked-quad",
		Tier:        "medium",
		Description: "Four cells with the same four candidates eliminate those digits from their peers",
		Detector:    detectNakedQuad,
		Enabled:     true,
		Order:       12,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Hidden Quad",
		Slug:        "hidden-quad",
		Tier:        "medium",
		Description: "Four digits that can only be in four cells eliminate other candidates from those cells",
		Detector:    detectHiddenQuad,
		Enabled:     true,
		Order:       13,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "X-Wing",
		Slug:        "x-wing",
		Tier:        "medium",
		Description: "A digit forming a rectangle pattern allows eliminations",
		Detector:    detectXWing,
		Enabled:     true,
		Order:       14,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "XY-Wing",
		Slug:        "xy-wing",
		Tier:        "medium", 
		Description: "A hinge cell and two pincers eliminate candidates",
		Detector:    detectXYWing,
		Enabled:     true,
		Order:       15,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Simple Coloring",
		Slug:        "simple-coloring",
		Tier:        "medium",
		Description: "Color chains of strong links to find eliminations",
		Detector:    detectSimpleColoring,
		Enabled:     true,
		Order:       16,
	})

	// Hard tier techniques - expert level
	r.register(TechniqueDescriptor{
		Name:        "Swordfish",
		Slug:        "swordfish",
		Tier:        "hard",
		Description: "A 3x3 fish pattern for eliminations",
		Detector:    detectSwordfish,
		Enabled:     true,
		Order:       20,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Skyscraper",
		Slug:        "skyscraper",
		Tier:        "hard",
		Description: "A turbot fish variant for eliminations",
		Detector:    detectSkyscraper,
		Enabled:     true,
		Order:       21,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Finned X-Wing",
		Slug:        "finned-x-wing",
		Tier:        "hard",
		Description: "An X-Wing with extra candidates (fins)",
		Detector:    detectFinnedXWing,
		Enabled:     true,
		Order:       22,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Finned Swordfish",
		Slug:        "finned-swordfish",
		Tier:        "hard",
		Description: "A Swordfish with extra candidates (fins)",
		Detector:    detectFinnedSwordfish,
		Enabled:     true,
		Order:       23,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle",
		Slug:        "unique-rectangle",
		Tier:        "hard",
		Description: "Avoid deadly rectangles that would make puzzle have multiple solutions",
		Detector:    detectUniqueRectangle,
		Enabled:     true,
		Order:       24,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "BUG",
		Slug:        "bug",
		Tier:        "hard",
		Description: "Bivalue Universal Grave - avoid patterns with multiple solutions",
		Detector:    detectBUG,
		Enabled:     true,
		Order:       25,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Jellyfish",
		Slug:        "jellyfish",
		Tier:        "hard",
		Description: "A 4x4 fish pattern for eliminations",
		Detector:    detectJellyfish,
		Enabled:     true,
		Order:       26,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "X-Chain",
		Slug:        "x-chain",
		Tier:        "hard",
		Description: "Chain of alternating strong/weak links for a single digit",
		Detector:    detectXChain,
		Enabled:     true,
		Order:       27,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "XY-Chain",
		Slug:        "xy-chain",
		Tier:        "hard",
		Description: "Chain through bivalue cells",
		Detector:    detectXYChain,
		Enabled:     true,
		Order:       28,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "W-Wing",
		Slug:        "w-wing",
		Tier:        "hard",
		Description: "Two bivalue cells connected by strong link",
		Detector:    detectWWing,
		Enabled:     true,
		Order:       29,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Empty Rectangle",
		Slug:        "empty-rectangle",
		Tier:        "hard",
		Description: "Use empty rectangles to create eliminations",
		Detector:    detectEmptyRectangle,
		Enabled:     true,
		Order:       30,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "XYZ-Wing",
		Slug:        "xyz-wing",
		Tier:        "hard",
		Description: "A trivalue hinge with bivalue pincers",
		Detector:    detectXYZWing,
		Enabled:     true,
		Order:       31,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "WXYZ-Wing",
		Slug:        "wxyz-wing",
		Tier:        "hard",
		Description: "A four-candidate wing pattern",
		Detector:    detectWXYZWing,
		Enabled:     true,
		Order:       32,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "ALS-XZ",
		Slug:        "als-xz",
		Tier:        "hard",
		Description: "Almost Locked Set with XZ rule",
		Detector:    detectALSXZ,
		Enabled:     true,
		Order:       33,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Remote Pairs",
		Slug:        "remote-pairs",
		Tier:        "hard",
		Description: "Chain of bivalue cells with same candidates",
		Detector:    detectRemotePairs,
		Enabled:     true,
		Order:       34,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle Type 2",
		Slug:        "unique-rectangle-type-2",
		Tier:        "hard",
		Description: "Unique rectangle with extra candidates in one corner",
		Detector:    detectUniqueRectangleType2,
		Enabled:     true,
		Order:       35,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle Type 3",
		Slug:        "unique-rectangle-type-3",
		Tier:        "hard",
		Description: "Unique rectangle with naked pair/triple",
		Detector:    detectUniqueRectangleType3,
		Enabled:     true,
		Order:       36,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Unique Rectangle Type 4",
		Slug:        "unique-rectangle-type-4",
		Tier:        "hard",
		Description: "Unique rectangle with hidden pair",
		Detector:    detectUniqueRectangleType4,
		Enabled:     true,
		Order:       37,
	})

	// Extreme tier techniques - for "impossible" difficulty puzzles
	r.register(TechniqueDescriptor{
		Name:        "Sue de Coq",
		Slug:        "sue-de-coq",
		Tier:        "extreme",
		Description: "Two intersecting almost locked sets",
		Detector:    detectSueDeCoq,
		Enabled:     true,
		Order:       40,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "3D Medusa",
		Slug:        "medusa-3d",
		Tier:        "extreme",
		Description: "Multi-digit coloring with strong/weak link chains",
		Detector:    detectMedusa3D,
		Enabled:     true,
		Order:       41,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Grouped X-Cycles",
		Slug:        "grouped-x-cycles",
		Tier:        "extreme",
		Description: "X-Cycles using group strong links",
		Detector:    detectGroupedXCycles,
		Enabled:     true,
		Order:       42,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "AIC",
		Slug:        "aic",
		Tier:        "extreme",
		Description: "Alternating Inference Chains",
		Detector:    detectAIC,
		Enabled:     true,
		Order:       43,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "ALS-XY-Wing",
		Slug:        "als-xy-wing",
		Tier:        "extreme",
		Description: "Almost Locked Set XY-Wing pattern",
		Detector:    detectALSXYWing,
		Enabled:     true,
		Order:       44,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "ALS-XY-Chain",
		Slug:        "als-xy-chain",
		Tier:        "extreme",
		Description: "Chain of Almost Locked Sets",
		Detector:    detectALSXYChain,
		Enabled:     true,
		Order:       45,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Forcing Chain",
		Slug:        "forcing-chain",
		Tier:        "extreme",
		Description: "Chain of implications from candidate assumptions",
		Detector:    detectForcingChain,
		Enabled:     true,
		Order:       46,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Digit Forcing Chain",
		Slug:        "digit-forcing-chain",
		Tier:        "extreme",
		Description: "Forcing chain focused on single digit",
		Detector:    detectDigitForcingChain,
		Enabled:     true,
		Order:       47,
	})
	
	r.register(TechniqueDescriptor{
		Name:        "Death Blossom",
		Slug:        "death-blossom",
		Tier:        "extreme",
		Description: "Advanced ALS pattern with stem and petals",
		Detector:    detectDeathBlossom,
		Enabled:     true,
		Order:       48,
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