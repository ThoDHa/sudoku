package techniques

import (
	"testing"

	"sudoku-api/internal/core"
	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/human/techniquetest"
	"sudoku-api/pkg/constants"
)

// detectorPriority is the pedagogical execution order mirrors by the human
// TechniqueRegistry (simple -> extreme). The stepping loop tries detectors in
// this order so a board evolves the same way the real solver would advance it,
// letting advanced patterns emerge and fire on their curated fixtures.
var detectorPriority = []string{
	"naked-single", "hidden-single",
	"naked-pair", "hidden-pair", "pointing-pair", "box-line-reduction",
	"naked-triple", "hidden-triple",
	"naked-quad", "hidden-quad",
	"x-wing", "swordfish", "xy-wing", "xyz-wing", "simple-coloring", "bug",
	"unique-rectangle", "jellyfish",
	"skyscraper", "x-chain", "xy-chain", "w-wing", "wxyz-wing", "empty-rectangle",
	"medusa-3d",
	"unique-rectangle-type-2", "unique-rectangle-type-3", "unique-rectangle-type-4",
	"finned-x-wing", "finned-swordfish", "grouped-x-cycles", "aic",
	"als-xz", "als-xy-wing", "als-xy-chain", "sue-de-coq", "death-blossom",
	"digit-forcing-chain", "forcing-chain",
}

// applyMove mutates b by the move's action, mirroring human.Solver.ApplyMove.
func applyMove(b *testBoard, move *core.Move) {
	switch move.Action {
	case constants.ActionAssign:
		for _, t := range move.Targets {
			b.SetCell(t.Row*constants.GridSize+t.Col, move.Digit)
		}
	case constants.ActionEliminate:
		for _, e := range move.Eliminations {
			b.RemoveCandidate(e.Row*constants.GridSize+e.Col, e.Digit)
		}
	}
}

// isSolved reports whether every cell is filled.
func isSolved(b *testBoard) bool {
	for i := 0; i < constants.TotalCells; i++ {
		if b.cells[i] == 0 {
			return false
		}
	}
	return true
}

// solveBoard steps the board by repeatedly running detectors in priority order
// (skipping any in disabled) until the board is solved or no detector fires.
// It returns the set of technique slugs that fired at least once, so callers
// can assert that solving drove the detectors without importing the human
// solver (which would create an import cycle).
func solveBoard(t *testing.T, b *testBoard, disabled map[string]bool) map[string]bool {
	t.Helper()
	fired := map[string]bool{}
	for step := 0; step < constants.MaxSolverSteps; step++ {
		if isSolved(b) {
			return fired
		}
		var move *core.Move
		var firedSlug string
		for _, slug := range detectorPriority {
			if disabled[slug] {
				continue
			}
			if m := detectorBySlug(t, slug)(b); m != nil {
				move, firedSlug = m, slug
				break
			}
		}
		if move == nil {
			return fired
		}
		fired[firedSlug] = true
		applyMove(b, move)
	}
	return fired
}

// loadPuzzleIndex loads a puzzles.json-indexed fixture into givens.
func loadPuzzleIndex(t *testing.T, data techniquetest.PuzzleData) []int {
	t.Helper()
	loader, err := puzzles.Load("../../../../../frontend/puzzles.json")
	if err != nil {
		t.Fatalf("load puzzles.json: %v", err)
	}
	givens, _, err := loader.GetPuzzle(data.PuzzleIndex, data.Difficulty)
	if err != nil {
		t.Fatalf("get puzzle %d (%s): %v", data.PuzzleIndex, data.Difficulty, err)
	}
	return givens
}

// boardForFixture builds the initial testBoard for a fixture, either from its
// inline puzzle string or by loading its puzzles.json entry.
func boardForFixture(t *testing.T, data techniquetest.PuzzleData) *testBoard {
	t.Helper()
	if data.PuzzleString != "" {
		return boardFromPuzzleString(data.PuzzleString)
	}
	return boardFromGivens(loadPuzzleIndex(t, data))
}

// boardFromGivens builds a testBoard from a full givens slice by seeding every
// empty cell with all candidates and placing each given (which propagates peer
// removals through SetCell).
func boardFromGivens(givens []int) *testBoard {
	b := &testBoard{}
	for i := 0; i < constants.TotalCells; i++ {
		b.candidates[i] = AllCandidates()
	}
	for i := 0; i < constants.TotalCells && i < len(givens); i++ {
		if givens[i] >= 1 && givens[i] <= constants.GridSize {
			b.SetCell(i, givens[i])
		}
	}
	return b
}

// boardFromPuzzleString builds a testBoard from an 81-char puzzle string by
// placing each given (which propagates peer candidate removal via SetCell) so
// the resulting candidate state matches what the solver would compute on the
// initial board. This lets curated mid-game fixtures drive in-package
// detector coverage without importing the human package (which would cycle).
func boardFromPuzzleString(s string) *testBoard {
	b := &testBoard{}
	for i := 0; i < constants.TotalCells; i++ {
		b.candidates[i] = AllCandidates()
	}
	for i, c := range s {
		if c >= '1' && c <= '9' {
			b.SetCell(i, int(c-'0'))
		}
	}
	return b
}

// detectorBySlug maps a technique slug to its in-package detector entry point.
type detectorFn func(BoardInterface) *core.Move

func detectorBySlug(t *testing.T, slug string) detectorFn {
	t.Helper()
	m := map[string]detectorFn{
		"naked-single":            DetectNakedSingle,
		"hidden-single":           DetectHiddenSingle,
		"naked-pair":              DetectNakedPair,
		"hidden-pair":             DetectHiddenPair,
		"naked-triple":            DetectNakedTriple,
		"hidden-triple":           DetectHiddenTriple,
		"naked-quad":              DetectNakedQuad,
		"hidden-quad":             DetectHiddenQuad,
		"pointing-pair":           DetectPointingPair,
		"box-line-reduction":      DetectBoxLineReduction,
		"x-wing":                  DetectXWing,
		"xy-wing":                 DetectXYWing,
		"simple-coloring":         DetectSimpleColoring,
		"swordfish":               DetectSwordfish,
		"xyz-wing":                DetectXYZWing,
		"bug":                     DetectBUG,
		"unique-rectangle":        DetectUniqueRectangle,
		"skyscraper":              DetectSkyscraper,
		"x-chain":                 DetectXChain,
		"xy-chain":                DetectXYChain,
		"medusa-3d":               DetectMedusa3D,
		"jellyfish":               DetectJellyfish,
		"unique-rectangle-type-2": DetectUniqueRectangleType2,
		"unique-rectangle-type-3": DetectUniqueRectangleType3,
		"unique-rectangle-type-4": DetectUniqueRectangleType4,
		"wxyz-wing":               DetectWXYZWing,
		"w-wing":                  DetectWWing,
		"empty-rectangle":         DetectEmptyRectangle,
		"grouped-x-cycles":        DetectGroupedXCycles,
		"finned-x-wing":           DetectFinnedXWing,
		"finned-swordfish":        DetectFinnedSwordfish,
		"aic":                     DetectAIC,
		"als-xz":                  DetectALSXZ,
		"als-xy-wing":             DetectALSXYWing,
		"als-xy-chain":            DetectALSXYChain,
		"sue-de-coq":              DetectSueDeCoq,
		"digit-forcing-chain":     DetectDigitForcingChain,
		"forcing-chain":           DetectForcingChain,
		"death-blossom":           DetectDeathBlossom,
	}
	fn, ok := m[slug]
	if !ok {
		t.Fatalf("no detector registered for slug %q", slug)
	}
	return fn
}

// TestCuratedFixturesSolveBoard drives each curated fixture through a full
// in-package solve (detectors run in priority order, moves applied until the
// board is solved or stalled). The assertion is progress: solving must advance
// the board via at least one technique, exercising the deep scan and firing
// paths of detectors that only emerge on an evolving mid-game state.
func TestCuratedFixturesSolveBoard(t *testing.T) {
	for _, data := range techniquetest.Puzzles {
		t.Run(data.Slug, func(t *testing.T) {
			b := boardForFixture(t, data)
			fired := solveBoard(t, b, nil)
			if len(fired) == 0 {
				t.Fatalf("%s: solver made no progress on its curated board", data.Slug)
			}
		})
	}
}

// targetIsolation mirrors the human package's proven isolation config: for
// preemption-prone advanced detectors it lists the techniques that would
// otherwise solve past the target before it can fire on its curated board.
// With those disabled, an isolated solve drives the board to the state where
// the target detector's own pattern emerges.
var targetIsolation = map[string]map[string]bool{
	"bug":       {"xy-wing": true},
	"jellyfish": {"medusa-3d": true},
	"unique-rectangle-type-2": {
		"aic": true, "medusa-3d": true, "x-chain": true, "xy-chain": true,
		"grouped-x-cycles": true, "simple-coloring": true, "w-wing": true,
		"wxyz-wing": true, "skyscraper": true, "empty-rectangle": true,
	},
	"unique-rectangle-type-3": {
		"aic": true, "medusa-3d": true, "x-chain": true, "xy-chain": true,
		"grouped-x-cycles": true, "simple-coloring": true, "skyscraper": true,
		"empty-rectangle": true, "w-wing": true, "wxyz-wing": true,
		"finned-x-wing": true, "finned-swordfish": true, "jellyfish": true,
	},
	"unique-rectangle-type-4": {"medusa-3d": true},
	"als-xz":                  {"aic": true},
	"als-xy-wing":             {"aic": true},
	"als-xy-chain":            {"aic": true, "medusa-3d": true},
	"sue-de-coq": {
		"aic": true, "als-xz": true, "als-xy-wing": true, "als-xy-chain": true,
		"digit-forcing-chain": true, "forcing-chain": true,
	},
	"digit-forcing-chain": {
		"aic": true, "als-xz": true, "als-xy-wing": true, "als-xy-chain": true,
		"sue-de-coq": true, "death-blossom": true,
	},
	"forcing-chain": {
		"aic": true, "als-xz": true, "als-xy-wing": true, "als-xy-chain": true,
		"sue-de-coq": true, "death-blossom": true, "digit-forcing-chain": true,
	},
	"death-blossom": {
		"aic": true, "als-xz": true, "als-xy-wing": true, "als-xy-chain": true,
		"digit-forcing-chain": true, "forcing-chain": true, "medusa-3d": true,
	},
}

// TestCuratedFixturesFireTargetTechnique runs each detector's own curated
// fixture through an isolated solve (preemption-prone neighbors disabled per
// targetIsolation) and asserts the detector's own slug fires. This is the
// per-detector regression guard: if a detector stops firing on its known-valid
// board, this test fails. Fixtures whose technique fires on the initial board
// are also covered directly by TestCuratedInlineFixturesDriveDetectors.
func TestCuratedFixturesFireTargetTechnique(t *testing.T) {
	for _, data := range techniquetest.Puzzles {
		t.Run(data.Slug, func(t *testing.T) {
			b := boardForFixture(t, data)
			fired := solveBoard(t, b, targetIsolation[data.Slug])
			if !fired[data.Slug] {
				t.Fatalf("%s: target technique did not fire on its curated board (fired: %v)",
					data.Slug, fired)
			}
		})
	}
}

// detectorsNeedStepping lists inline-string fixtures whose technique does not
// fire on the bare initial board and needs intermediate solver steps to reach
// its firing state. The inline-drive test therefore only asserts a no-panic
// scan for these; their firing path is covered by TestCuratedFixturesSolveBoard.
var detectorsNeedStepping = map[string]bool{
	"unique-rectangle-type-2": true,
	"wxyz-wing":               true,
	"finned-swordfish":        true,
	"sue-de-coq":              true,
}

// TestCuratedInlineFixturesDriveDetectors drives each curated fixture that
// carries an inline partial-solve puzzle string through its detector. For the
// fixtures documented to fire on the initial candidate state the test asserts
// an observable move (so a regression that stops the detector firing on its
// known-valid board fails here). For the few that need solver stepping to
// fire, the test asserts the detector runs without panicking, still covering
// its scan path.
func TestCuratedInlineFixturesDriveDetectors(t *testing.T) {
	for _, data := range techniquetest.Puzzles {
		if data.PuzzleString == "" {
			continue
		}
		t.Run(data.Slug, func(t *testing.T) {
			b := boardFromPuzzleString(data.PuzzleString)
			move := detectorBySlug(t, data.Slug)(b)
			if detectorsNeedStepping[data.Slug] {
				if move != nil && move.Action != "assign" && move.Action != "eliminate" {
					t.Fatalf("%s: unexpected move action %q", data.Slug, move.Action)
				}
				return
			}
			if move == nil {
				t.Fatalf("%s: detector did not fire on its curated board", data.Slug)
			}
			if move.Action != "assign" && move.Action != "eliminate" {
				t.Fatalf("%s: unexpected move action %q", data.Slug, move.Action)
			}
		})
	}
}
