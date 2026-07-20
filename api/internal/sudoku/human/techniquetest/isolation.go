package techniquetest

// TechniqueIsolationConfig maps a technique slug to the list of competing
// techniques that must be disabled for the target technique to fire on its
// curated fixture.
//
// Rare or advanced techniques can be preempted by more common ones during a
// natural full-strength solve: the solver finds a path that bypasses the
// target. Disabling the techniques listed here forces the solver down the
// path where the target technique is necessary, which is what both the
// isolated technique tests and the practice-puzzle generator need.
//
// This map is the seam contract between the test suite (which verifies each
// technique fires on its fixture) and the practice-puzzle generator (which
// must select puzzles where the technique is genuinely necessary, not just
// detectable). Both consume the same source of truth here so they cannot
// drift.
var TechniqueIsolationConfig = map[string][]string{
	"bug":       {"xy-wing"},
	"jellyfish": {"medusa-3d"},
	"x-chain":   {"skyscraper"},
	"unique-rectangle-type-2": {
		"aic", "medusa-3d", "x-chain", "xy-chain", "grouped-x-cycles", "simple-coloring",
		"w-wing", "wxyz-wing", "skyscraper", "empty-rectangle",
	},
	"unique-rectangle-type-3": {
		"aic", "medusa-3d", "x-chain", "xy-chain", "grouped-x-cycles", "simple-coloring",
		"skyscraper", "empty-rectangle", "w-wing", "wxyz-wing", "finned-x-wing", "finned-swordfish",
		"jellyfish",
	},
	"unique-rectangle-type-4": {"medusa-3d"},
	"als-xz":                  {"aic"},
	"als-xy-wing":             {"aic"},
	"als-xy-chain":            {"aic", "medusa-3d"},
	"sue-de-coq":              {"aic", "als-xz", "als-xy-wing", "als-xy-chain", "digit-forcing-chain", "forcing-chain"},
	"digit-forcing-chain":     {"aic", "als-xz", "als-xy-wing", "als-xy-chain", "sue-de-coq", "death-blossom"},
	"forcing-chain":           {"aic", "als-xz", "als-xy-wing", "als-xy-chain", "sue-de-coq", "death-blossom", "digit-forcing-chain"},
	"death-blossom":           {"aic", "als-xz", "als-xy-wing", "als-xy-chain", "digit-forcing-chain", "forcing-chain", "medusa-3d"},
}
