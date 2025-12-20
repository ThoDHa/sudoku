package human

// TechniquePuzzleData holds test puzzle information for a technique
type TechniquePuzzleData struct {
	// Slug is the technique identifier (e.g., "naked-single", "x-wing")
	Slug string

	// Tier is the difficulty tier (simple, medium, hard, extreme)
	Tier string

	// PuzzleIndex is the index in puzzles.json (if >= 0)
	// Set to -1 if using PuzzleString instead
	PuzzleIndex int

	// Difficulty is the difficulty level to use when loading from puzzles.json
	// One of: "easy", "medium", "hard", "extreme", "impossible"
	Difficulty string

	// PuzzleString is the 81-character puzzle string (used when PuzzleIndex < 0)
	PuzzleString string

	// Description explains the test case
	Description string
}

// TechniquePuzzles contains test puzzles for all 39 techniques.
// Puzzles are either:
//   - Indexed from puzzles.json (PuzzleIndex >= 0, use with Difficulty)
//   - Direct puzzle strings (PuzzleIndex < 0, use PuzzleString)
//
// Data sources:
//   - practice_puzzles.json: Maps technique slugs to puzzle indices
//   - SudokuWiki: Technique examples and exemplar puzzles
//   - Hodoku: Technique demonstrations
//
// The 39 techniques by tier:
//   - Simple (8): hidden-single, naked-single, naked-pair, hidden-pair,
//     pointing-pair, box-line-reduction, naked-triple, hidden-triple
//   - Medium (9): bug, x-wing, unique-rectangle, xy-wing, simple-coloring,
//     naked-quad, hidden-quad, swordfish, xyz-wing
//   - Hard (11): skyscraper, x-chain, xy-chain, medusa-3d, jellyfish,
//     unique-rectangle-type-2, unique-rectangle-type-3, unique-rectangle-type-4,
//     wxyz-wing, w-wing, empty-rectangle
//   - Extreme (11): grouped-x-cycles, finned-x-wing, finned-swordfish, aic,
//     als-xz, als-xy-wing, als-xy-chain, sue-de-coq, digit-forcing-chain,
//     forcing-chain, death-blossom
var TechniquePuzzles = []TechniquePuzzleData{
	// ==========================================================================
	// SIMPLE TIER (8 techniques)
	// ==========================================================================
	{
		Slug:        "hidden-single",
		Tier:        "simple",
		PuzzleIndex: 0,
		Difficulty:  "impossible",
		Description: "A digit that can only go in one cell in a row, column, or box",
	},
	{
		Slug:        "naked-single",
		Tier:        "simple",
		PuzzleIndex: 0,
		Difficulty:  "impossible",
		Description: "A cell with only one possible candidate",
	},
	{
		Slug:        "naked-pair",
		Tier:        "simple",
		PuzzleIndex: 0,
		Difficulty:  "impossible",
		Description: "Two cells with the same two candidates eliminate those digits from their peers",
	},
	{
		Slug:        "hidden-pair",
		Tier:        "simple",
		PuzzleIndex: 0,
		Difficulty:  "impossible",
		Description: "Two digits that can only be in two cells eliminate other candidates from those cells",
	},
	{
		Slug:        "pointing-pair",
		Tier:        "simple",
		PuzzleIndex: 0,
		Difficulty:  "impossible",
		Description: "If a digit in a box can only be in one row/column, eliminate it from the rest of that row/column",
	},
	{
		Slug:        "box-line-reduction",
		Tier:        "simple",
		PuzzleIndex: 13,
		Difficulty:  "impossible",
		Description: "If a digit in a row/column can only be in one box, eliminate it from the rest of that box",
	},
	{
		Slug:        "naked-triple",
		Tier:        "simple",
		PuzzleIndex: 10,
		Difficulty:  "impossible",
		Description: "Three cells with the same three candidates eliminate those digits from their peers",
	},
	{
		Slug:        "hidden-triple",
		Tier:        "simple",
		PuzzleIndex: 77,
		Difficulty:  "impossible",
		Description: "Three digits that can only be in three cells eliminate other candidates from those cells",
	},

	// ==========================================================================
	// MEDIUM TIER (9 techniques)
	// ==========================================================================
	{
		Slug:        "bug",
		Tier:        "medium",
		PuzzleIndex: 17,
		Difficulty:  "impossible",
		Description: "Bivalue Universal Grave - avoid patterns with multiple solutions",
	},
	{
		Slug:        "x-wing",
		Tier:        "medium",
		PuzzleIndex: 0,
		Difficulty:  "impossible",
		Description: "A digit forming a rectangle pattern allows eliminations",
	},
	{
		Slug:        "unique-rectangle",
		Tier:        "medium",
		PuzzleIndex: 15,
		Difficulty:  "impossible",
		Description: "Avoid deadly rectangles that would make puzzle have multiple solutions",
	},
	{
		Slug:        "xy-wing",
		Tier:        "medium",
		PuzzleIndex: 0,
		Difficulty:  "impossible",
		Description: "A hinge cell and two pincers eliminate candidates",
	},
	{
		Slug:        "simple-coloring",
		Tier:        "medium",
		PuzzleIndex: 10,
		Difficulty:  "impossible",
		Description: "Color chains of strong links to find eliminations",
	},
	{
		Slug:        "naked-quad",
		Tier:        "medium",
		PuzzleIndex: 993,
		Difficulty:  "impossible",
		Description: "Four cells with the same four candidates eliminate those digits from their peers",
	},
	{
		Slug:         "hidden-quad",
		Tier:         "medium",
		PuzzleIndex:  -1,
		PuzzleString: "000500000425090001800010020500000000019000460000000002090040003200060807000001600",
		Description:  "Four digits that can only be in four cells eliminate other candidates - Klaus Brenner example",
	},
	{
		Slug:        "swordfish",
		Tier:        "medium",
		PuzzleIndex: 931,
		Difficulty:  "impossible",
		Description: "A 3x3 fish pattern for eliminations",
	},
	{
		Slug:        "xyz-wing",
		Tier:        "medium",
		PuzzleIndex: 37,
		Difficulty:  "hard",
		Description: "A trivalue hinge with bivalue pincers",
	},

	// ==========================================================================
	// HARD TIER (11 techniques)
	// ==========================================================================
	{
		Slug:        "skyscraper",
		Tier:        "hard",
		PuzzleIndex: 44,
		Difficulty:  "impossible",
		Description: "A turbot fish variant for eliminations",
	},
	{
		Slug:        "x-chain",
		Tier:        "hard",
		PuzzleIndex: 77,
		Difficulty:  "impossible",
		Description: "Chain of alternating strong/weak links for a single digit",
	},
	{
		Slug:         "xy-chain",
		Tier:         "hard",
		PuzzleIndex:  -1,
		PuzzleString: "370010046080006050560004100005090060007060504000450300000030427753249681000001935",
		Description:  "Chain through bivalue cells - partial solve state from puzzle 6",
	},
	{
		Slug:        "medusa-3d",
		Tier:        "hard",
		PuzzleIndex: 110,
		Difficulty:  "impossible",
		Description: "Multi-digit coloring with strong/weak link chains",
	},
	{
		Slug:         "jellyfish",
		Tier:         "hard",
		PuzzleIndex:  -1,
		PuzzleString: "501030460036500198080006000350060009008203654620000000043620000005380046060400703",
		Description:  "A 4x4 fish pattern - partial solve state from puzzle 778",
	},
	{
		Slug:         "unique-rectangle-type-2",
		Tier:         "hard",
		PuzzleIndex:  -1,
		PuzzleString: "607800030020030070800007002060200010001000500070003040200100006010050020050008103",
		Description:  "Unique rectangle with extra candidates in roof cells - SudokuWiki example",
	},
	{
		Slug:         "unique-rectangle-type-3",
		Tier:         "hard",
		PuzzleIndex:  -1,
		PuzzleString: "809200000600080000200900050080070030000000000030010020040003007000060008000008605",
		Description:  "Unique rectangle with naked pair/triple - SudokuWiki example",
	},
	{
		Slug:        "unique-rectangle-type-4",
		Tier:        "hard",
		PuzzleIndex: 57,
		Difficulty:  "impossible",
		Description: "Unique rectangle with hidden pair - found in puzzle database",
	},
	{
		Slug:         "wxyz-wing",
		Tier:         "hard",
		PuzzleIndex:  -1,
		PuzzleString: "073000900060000000080100004010040203700008000009610008001090026600201030207356800",
		Description:  "A four-candidate bent wing pattern - partial solve state from puzzle 10",
	},
	{
		Slug:        "w-wing",
		Tier:        "hard",
		PuzzleIndex: 10,
		Difficulty:  "impossible",
		Description: "Two bivalue cells connected by strong link",
	},
	{
		Slug:        "empty-rectangle",
		Tier:        "hard",
		PuzzleIndex: 23,
		Difficulty:  "impossible",
		Description: "Use empty rectangles to create eliminations",
	},

	// ==========================================================================
	// EXTREME TIER (11 techniques)
	// ==========================================================================
	{
		Slug:         "grouped-x-cycles",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "247100900008070521150208740500002100000706050800510000790000312600307894080001675",
		Description:  "X-Cycles using group strong links - partial solve state from puzzle 139",
	},
	{
		Slug:         "finned-x-wing",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "600000000703010008900700040106000200270100000300000081869231574421567839537489002",
		Description:  "An X-Wing with extra candidates (fins) - partial solve state from puzzle 37",
	},
	{
		Slug:         "finned-swordfish",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "007490002084002000602100500315604920709000000408000010873500290006000003201003750",
		Description:  "A Swordfish with extra candidates (fins) - partial solve state from puzzle 66",
	},
	{
		Slug:        "aic",
		Tier:        "extreme",
		PuzzleIndex: 23,
		Difficulty:  "impossible",
		Description: "Alternating Inference Chains - found in puzzle database",
	},
	{
		Slug:         "als-xz",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "400000030650037400030402005000000306010070094064050000040708003500360042090000701",
		Description:  "Almost Locked Set with XZ rule - partial solve state from puzzle 23",
	},
	{
		Slug:         "als-xy-wing",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "400000030650037400030402005000000306010070094064050000040708003500360042090000701",
		Description:  "Almost Locked Set XY-Wing pattern - partial solve state from puzzle 23",
	},
	{
		Slug:         "als-xy-chain",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "400000030650037400030402005000000306010070094064050000040708003500360042090000701",
		Description:  "Chain of Almost Locked Sets - partial solve state from puzzle 23",
	},
	{
		Slug:        "sue-de-coq",
		Tier:        "extreme",
		PuzzleIndex: 716,
		Difficulty:  "impossible",
		Description: "Two intersecting almost locked sets",
	},
	{
		Slug:         "digit-forcing-chain",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "247100900008070521150208740500002100000706050800510000790000312600307894080901675",
		Description:  "Forcing chain focused on single digit - partial solve state from puzzle 139",
	},
	{
		Slug:         "forcing-chain",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "010650080000300000030001900002000790001900004400002005120093070908016002050240019",
		Description:  "Chain of implications from candidate assumptions - partial solve state from puzzle 255",
	},
	{
		Slug:         "death-blossom",
		Tier:         "extreme",
		PuzzleIndex:  -1,
		PuzzleString: "090002000001405200003090000900050000000801000000040009000010600008506400000200070",
		Description:  "Advanced ALS pattern with stem and petals - SudokuWiki example",
	},
}

// TechniquePuzzlesBySlug provides O(1) lookup by technique slug
var TechniquePuzzlesBySlug = func() map[string]TechniquePuzzleData {
	m := make(map[string]TechniquePuzzleData)
	for _, data := range TechniquePuzzles {
		m[data.Slug] = data
	}
	return m
}()

// GetTechniquePuzzle returns the puzzle data for a given technique slug
func GetTechniquePuzzle(slug string) (TechniquePuzzleData, bool) {
	data, ok := TechniquePuzzlesBySlug[slug]
	return data, ok
}

// GetAllTechniqueSlugsFromData returns all technique slugs from the puzzle data
func GetAllTechniqueSlugsFromData() []string {
	slugs := make([]string, len(TechniquePuzzles))
	for i, data := range TechniquePuzzles {
		slugs[i] = data.Slug
	}
	return slugs
}

// GetTechniquesByTier returns all techniques for a given tier
func GetTechniquesByTier(tier string) []TechniquePuzzleData {
	var result []TechniquePuzzleData
	for _, data := range TechniquePuzzles {
		if data.Tier == tier {
			result = append(result, data)
		}
	}
	return result
}
