// Package techniquetest holds curated test fixtures for the human-technique
// Sudoku solver. It exists as a shared, non-cyclic dependency that both the
// `human` package and the `techniques` package can import from their tests.
//
// The `human` package cannot be imported by `techniques` (human imports
// techniques, so the reverse would cycle). Relocating the curated puzzle data
// here breaks that cycle: each detector's known-valid puzzle is reachable from
// in-package `techniques` tests, so coverage attributes to `techniques` rather
// than only to `human`.
//
// This package holds pure data only (no solver or board types). It is imported
// exclusively by _test.go files, so it is never linked into production
// binaries even though its files do not carry the _test.go suffix (Go forbids
// cross-package import of _test.go symbols, so a regular file is required for
// the cross-package fixture share to work).
package techniquetest

// PuzzleData holds a curated test puzzle for a single technique.
//
// A puzzle is sourced one of two ways:
//   - Indexed from puzzles.json: PuzzleIndex >= 0, used with Difficulty.
//   - Inline partial solve state: PuzzleIndex < 0, used via PuzzleString. These
//     inline strings encode a mid-game board whose candidate geometry makes the
//     technique fire on the first detector call.
type PuzzleData struct {
	// Slug is the technique identifier (e.g., "naked-single", "x-wing").
	Slug string

	// Tier is the difficulty tier: simple, medium, hard, or extreme.
	Tier string

	// PuzzleIndex is the index in puzzles.json (when >= 0).
	// Set to -1 when the inline PuzzleString is used instead.
	PuzzleIndex int

	// Difficulty is the difficulty level to use when loading from puzzles.json.
	// One of: "easy", "medium", "hard", "extreme", "impossible".
	Difficulty string

	// PuzzleString is the 81-character puzzle string (used when PuzzleIndex < 0).
	PuzzleString string

	// Description explains the test case.
	Description string
}

// Puzzles contains curated test puzzles for all 39 techniques.
//
// Data sources:
//   - practice_puzzles.json: maps technique slugs to puzzle indices.
//   - SudokuWiki / Hodoku: technique exemplars.
//
// The 39 techniques by tier:
//   - Simple (8): hidden-single, naked-single, naked-pair, hidden-pair,
//     pointing-pair, box-line-reduction, naked-triple, hidden-triple.
//   - Medium (9): bug, x-wing, unique-rectangle, xy-wing, simple-coloring,
//     naked-quad, hidden-quad, swordfish, xyz-wing.
//   - Hard (11): skyscraper, x-chain, xy-chain, medusa-3d, jellyfish,
//     unique-rectangle-type-2, unique-rectangle-type-3, unique-rectangle-type-4,
//     wxyz-wing, w-wing, empty-rectangle.
//   - Extreme (11): grouped-x-cycles, finned-x-wing, finned-swordfish, aic,
//     als-xz, als-xy-wing, als-xy-chain, sue-de-coq, digit-forcing-chain,
//     forcing-chain, death-blossom.
var Puzzles = []PuzzleData{
	// Simple tier (8).
	{Slug: "hidden-single", Tier: "simple", PuzzleIndex: 0, Difficulty: "impossible", Description: "A digit that can only go in one cell in a row, column, or box"},
	{Slug: "naked-single", Tier: "simple", PuzzleIndex: 0, Difficulty: "impossible", Description: "A cell with only one possible candidate"},
	{Slug: "naked-pair", Tier: "simple", PuzzleIndex: 0, Difficulty: "impossible", Description: "Two cells with the same two candidates eliminate those digits from their peers"},
	{Slug: "hidden-pair", Tier: "simple", PuzzleIndex: 0, Difficulty: "impossible", Description: "Two digits that can only be in two cells eliminate other candidates from those cells"},
	{Slug: "pointing-pair", Tier: "simple", PuzzleIndex: 0, Difficulty: "impossible", Description: "If a digit in a box can only be in one row/column, eliminate it from the rest of that row/column"},
	{Slug: "box-line-reduction", Tier: "simple", PuzzleIndex: 13, Difficulty: "impossible", Description: "If a digit in a row/column can only be in one box, eliminate it from the rest of that box"},
	{Slug: "naked-triple", Tier: "simple", PuzzleIndex: 10, Difficulty: "impossible", Description: "Three cells with the same three candidates eliminate those digits from their peers"},
	{Slug: "hidden-triple", Tier: "simple", PuzzleIndex: 77, Difficulty: "impossible", Description: "Three digits that can only be in three cells eliminate other candidates from those cells"},

	// Medium tier (9).
	{Slug: "bug", Tier: "medium", PuzzleIndex: 62, Difficulty: "impossible", Description: "Bivalue Universal Grave - avoid patterns with multiple solutions"},
	{Slug: "x-wing", Tier: "medium", PuzzleIndex: 0, Difficulty: "impossible", Description: "A digit forming a rectangle pattern allows eliminations"},
	{Slug: "unique-rectangle", Tier: "medium", PuzzleIndex: 15, Difficulty: "impossible", Description: "Avoid deadly rectangles that would make puzzle have multiple solutions"},
	{Slug: "xy-wing", Tier: "medium", PuzzleIndex: 0, Difficulty: "impossible", Description: "A hinge cell and two pincers eliminate candidates"},
	{Slug: "simple-coloring", Tier: "medium", PuzzleIndex: 10, Difficulty: "impossible", Description: "Color chains of strong links to find eliminations"},
	{Slug: "naked-quad", Tier: "medium", PuzzleIndex: 993, Difficulty: "impossible", Description: "Four cells with the same four candidates eliminate those digits from their peers"},
	{Slug: "hidden-quad", Tier: "medium", PuzzleIndex: -1, PuzzleString: "000500000425090001800010020500000000019000460000000002090040003200060807000001600", Description: "Four digits that can only be in four cells eliminate other candidates from those cells - Klaus Brenner example"},
	{Slug: "swordfish", Tier: "medium", PuzzleIndex: 23, Difficulty: "hard", Description: "A 3x3 fish pattern for eliminations"},
	{Slug: "xyz-wing", Tier: "medium", PuzzleIndex: 25, Difficulty: "impossible", Description: "A trivalue hinge with bivalue pincers"},

	// Hard tier (11).
	{Slug: "skyscraper", Tier: "hard", PuzzleIndex: 44, Difficulty: "impossible", Description: "A turbot fish variant for eliminations"},
	{Slug: "x-chain", Tier: "hard", PuzzleIndex: 167, Difficulty: "impossible", Description: "Chain of alternating strong/weak links for a single digit"},
	{Slug: "xy-chain", Tier: "hard", PuzzleIndex: -1, PuzzleString: "370010046080006050560004100005090060007060504000450300000030427753249681000001935", Description: "Chain through bivalue cells - partial solve state from puzzle 6"},
	{Slug: "medusa-3d", Tier: "hard", PuzzleIndex: 57, Difficulty: "impossible", Description: "Multi-digit coloring with strong/weak link chains"},
	{Slug: "jellyfish", Tier: "hard", PuzzleIndex: -1, PuzzleString: "501030460036500198080006000350060009008203654620000000043620000005380046060400703", Description: "A 4x4 fish pattern - partial solve state from puzzle 778"},
	{Slug: "unique-rectangle-type-2", Tier: "hard", PuzzleIndex: 256, Difficulty: "impossible", PuzzleString: "000000030004000100080003006060300700005008400000001000020600070340092500098030020", Description: "Unique rectangle with extra candidates in roof cells - found in puzzle database"},
	{Slug: "unique-rectangle-type-3", Tier: "hard", PuzzleIndex: -1, PuzzleString: "701020308690318704308000010170293840409180037830400091017030480964852173083741000", Description: "Unique rectangle with naked pair/triple - partial solve state from puzzle 360 (fires immediately)"},
	{Slug: "unique-rectangle-type-4", Tier: "hard", PuzzleIndex: 59, Difficulty: "impossible", Description: "Unique rectangle with hidden pair - found in puzzle database"},
	{Slug: "wxyz-wing", Tier: "hard", PuzzleIndex: 23, Difficulty: "impossible", PuzzleString: "000000030650000400000402000000000306010070090004050000040708000500360002090000701", Description: "A four-candidate bent wing pattern - found in puzzle database"},
	{Slug: "w-wing", Tier: "hard", PuzzleIndex: 10, Difficulty: "impossible", Description: "Two bivalue cells connected by strong link"},
	{Slug: "empty-rectangle", Tier: "hard", PuzzleIndex: 23, Difficulty: "impossible", Description: "Use empty rectangles to create eliminations"},

	// Extreme tier (11).
	{Slug: "grouped-x-cycles", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "247100900008070521150208740500002100000706050800510000790000312600307894080001675", Description: "X-Cycles using group strong links - partial solve state from puzzle 139"},
	{Slug: "finned-x-wing", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "600000000703010008900700040106000200270100000300000081869231574421567839537489002", Description: "An X-Wing with extra candidates (fins) - partial solve state from puzzle 37"},
	{Slug: "finned-swordfish", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "007490002084002000602100500315604920709000000408000010873500290006000003201003750", Description: "A Swordfish with extra candidates (fins) - partial solve state from puzzle 66"},
	{Slug: "aic", Tier: "extreme", PuzzleIndex: 23, Difficulty: "impossible", Description: "Alternating Inference Chains - found in puzzle database"},
	{Slug: "als-xz", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "400605030650037400030402605000040306010076094064053000040708003500360042090520701", Description: "Almost Locked Set with XZ rule - partial solve state (fires immediately)"},
	{Slug: "als-xy-wing", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "400000030650037400030402005000000306010070094064050000040708003500360042090000701", Description: "Almost Locked Set XY-Wing pattern - partial solve state from puzzle 23"},
	{Slug: "als-xy-chain", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "247158963095003002030009000024080136050030000083600507062000308018306000379800640", Description: "Chain of Almost Locked Sets - partial solve state from puzzle 27 (optimized for speed)"},
	{Slug: "sue-de-coq", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "010908002006047010500000000007060030600000005040090200000000004090510700300204050", Description: "Two intersecting almost locked sets - SudokuWiki example"},
	{Slug: "digit-forcing-chain", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "056000028074100050000050700560003000390580001400700530709005062025000400040090005", Description: "Forcing chain focused on single digit - partial solve state from puzzle 264 (optimized for speed)"},
	{Slug: "forcing-chain", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "006510030104007000000046000000020900620900050079050000060103000500060310000405069", Description: "Chain of implications from candidate assumptions - partial solve state from puzzle 415 (optimized for speed)"},
	{Slug: "death-blossom", Tier: "extreme", PuzzleIndex: -1, PuzzleString: "800409000200070000050200300042801030030000090080903210006007040000020001000604003", Description: "Advanced ALS pattern with stem and petals - SudokuWiki example"},
}

// puzzlesBySlug provides O(1) lookup by technique slug.
var puzzlesBySlug = func() map[string]PuzzleData {
	m := make(map[string]PuzzleData, len(Puzzles))
	for _, data := range Puzzles {
		m[data.Slug] = data
	}
	return m
}()

// Get returns the puzzle data for a given technique slug.
func Get(slug string) (PuzzleData, bool) {
	data, ok := puzzlesBySlug[slug]
	return data, ok
}

// AllSlugs returns the technique slugs for every curated puzzle, in declaration order.
func AllSlugs() []string {
	slugs := make([]string, len(Puzzles))
	for i, data := range Puzzles {
		slugs[i] = data.Slug
	}
	return slugs
}

// ByTier returns all curated puzzles whose technique tier matches.
func ByTier(tier string) []PuzzleData {
	var result []PuzzleData
	for _, data := range Puzzles {
		if data.Tier == tier {
			result = append(result, data)
		}
	}
	return result
}
