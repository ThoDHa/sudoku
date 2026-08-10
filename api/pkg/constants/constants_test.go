package constants

import (
	"testing"
	"time"
)

// The constants in this package are consumed everywhere and defined nowhere
// else, so nothing but this file can notice a wrong value: go-mutesting runs
// only a package's own suite, and every other package's suite compiles against
// whatever number is written here rather than against an expectation of it.
// Without these assertions a mutation of GridSize to 8 dies in no suite at all.
//
// Two kinds of assertion appear below. Structural ones state a relationship
// that must hold for the geometry to be coherent. Pinned ones state an exact
// value, deliberately, for constants whose only constraint is a bound: an
// off-by-one in a solver limit is invisible to every relationship that can be
// written about it, and pinning is what turns an accidental edit into a failing
// test rather than a silent behavior change.

func TestGridGeometryIsInternallyConsistent(t *testing.T) {
	if GridSize != BoxSize*BoxSize {
		t.Errorf("a grid row must hold exactly one box-row per box: GridSize=%d, BoxSize=%d (want GridSize == BoxSize*BoxSize)",
			GridSize, BoxSize)
	}
	if TotalCells != GridSize*GridSize {
		t.Errorf("TotalCells must cover the whole square grid: TotalCells=%d, GridSize=%d (want TotalCells == GridSize*GridSize)",
			TotalCells, GridSize)
	}
	if MinGivens >= TotalCells {
		t.Errorf("MinGivens=%d must leave cells to solve on a %d-cell grid", MinGivens, TotalCells)
	}
}

func TestMinGivensIsTheProvenLowerBoundForAUniqueSolution(t *testing.T) {
	// 17 is not a tuning knob: McGuire, Tugemann and Civario (2012) proved by
	// exhaustive search that no 16-clue 9x9 Sudoku has a unique solution, and
	// that 17-clue puzzles with a unique solution exist. Accepting 16 would let
	// the generator emit ambiguous puzzles; demanding 18 would reject valid ones.
	const provenBound = 17
	if MinGivens != provenBound {
		t.Errorf("MinGivens=%d, want %d (the proven minimum clue count for a uniquely solvable 9x9 grid)",
			MinGivens, provenBound)
	}
}

func TestSolutionCountLimitStopsAsSoonAsUniquenessIsDecided(t *testing.T) {
	// The uniqueness check counts solutions and aborts at this limit. Finding a
	// second solution already decides the question, so 2 is the smallest limit
	// that can distinguish "unique" from "ambiguous"; anything larger only makes
	// the search do work whose answer it already has, and 1 cannot tell the two
	// cases apart at all.
	if SolutionCountLimit != 2 {
		t.Errorf("SolutionCountLimit=%d, want 2 (one solution plus the one that disproves uniqueness)",
			SolutionCountLimit)
	}
}

func TestSolverBoundsHoldTheirPinnedValues(t *testing.T) {
	// Termination bounds for the solver. No relationship pins them, so they are
	// pinned outright: changing one changes when the solver gives up, and that
	// should be a reviewed edit here rather than a number that drifted.
	bounds := []struct {
		name string
		got  int
		want int
	}{
		{"MaxSolverSteps", MaxSolverSteps, 5000},
		{"MaxSolverNodes", MaxSolverNodes, 10000000},
	}
	for _, b := range bounds {
		if b.got != b.want {
			t.Errorf("%s=%d, want %d", b.name, b.got, b.want)
		}
	}
	if MaxSolverSteps <= TotalCells {
		t.Errorf("MaxSolverSteps=%d must exceed the %d cells a solver has to fill before any backtracking",
			MaxSolverSteps, TotalCells)
	}
	if MaxSolverNodes <= MaxSolverSteps {
		t.Errorf("MaxSolverNodes=%d must exceed MaxSolverSteps=%d: a node budget bounds the whole search tree, a step budget one path through it",
			MaxSolverNodes, MaxSolverSteps)
	}
}

func TestSessionTokenExpiryIsOneDay(t *testing.T) {
	// Written as a duration rather than a count of hours so that both the 24 and
	// the multiplication are pinned: dividing by time.Hour instead of
	// multiplying yields a zero-length expiry, which would expire every token at
	// issue.
	if SessionTokenExpiry != 24*time.Hour {
		t.Errorf("SessionTokenExpiry=%v, want %v", SessionTokenExpiry, 24*time.Hour)
	}
	if SessionTokenExpiry <= 0 {
		t.Errorf("SessionTokenExpiry=%v must be positive or every token is born expired", SessionTokenExpiry)
	}
}

func TestDifficultyKeysCoverEveryDifficultyExactlyOnce(t *testing.T) {
	// The compact keys are the on-disk puzzle file format. A missing difficulty
	// makes its puzzles unreachable; a duplicated key silently serves one
	// difficulty's puzzles for another.
	difficulties := []string{
		DifficultyEasy, DifficultyMedium, DifficultyHard,
		DifficultyExtreme, DifficultyImpossible,
	}
	if len(DifficultyKeys) != len(difficulties) {
		t.Errorf("DifficultyKeys has %d entries, want one per difficulty (%d)",
			len(DifficultyKeys), len(difficulties))
	}
	seen := make(map[string]string, len(difficulties))
	for _, d := range difficulties {
		key, ok := DifficultyKeys[d]
		if !ok {
			t.Errorf("difficulty %q has no compact key", d)
			continue
		}
		if prev, dup := seen[key]; dup {
			t.Errorf("difficulties %q and %q share the compact key %q", prev, d, key)
		}
		seen[key] = d
	}
}
