package techniques

import (
	"strings"
	"testing"

	"sudoku-api/pkg/constants"
)

// medusaDigitOnlyBoard returns a board in which the given digit appears only in
// the listed cells (every other cell carries all other digits but not this one),
// so the 3D Medusa graph for that digit is exactly the supplied conjugate net
// with no interference from bivalue cells or stray conjugate pairs.
func medusaDigitOnlyBoard(digit int, cells []int) *testBoard {
	b := &testBoard{}
	var base []int
	for d := 1; d <= constants.GridSize; d++ {
		if d != digit {
			base = append(base, d)
		}
	}
	for i := 0; i < constants.TotalCells; i++ {
		b.candidates[i] = NewCandidates(base)
	}
	for _, idx := range cells {
		b.candidates[idx] = b.candidates[idx].Set(digit)
	}
	return b
}

// TestDetectMedusa3DFiresSameUnitContradiction builds a five-cell conjugate
// cycle for a single digit. Colouring the net leaves two same-coloured
// candidates of that digit as peers in the same unit, which is the 3D Medusa
// same-unit contradiction (Rule 2): the whole colour is false and every
// candidate of that colour is eliminated.
func TestDetectMedusa3DFiresSameUnitContradiction(t *testing.T) {
	// Conjugate pairs for digit 5 (each pair is the only two 5s in its unit):
	//   R1C1<->R1C5 (row 1), R1C5<->R4C5 (col 5), R4C5<->R4C2 (row 4),
	//   R4C2<->R2C2 (col 2), R2C2<->R1C1 (box 1). This odd cycle colours
	//   R4C5 and R4C2 with the same colour, and they share row 4.
	cells := []int{idxOf(0, 0), idxOf(0, 4), idxOf(3, 4), idxOf(3, 1), idxOf(1, 1)}
	b := medusaDigitOnlyBoard(5, cells)

	move := DetectMedusa3D(b)
	if move == nil {
		t.Fatal("expected 3D Medusa to fire a same-unit contradiction")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if len(move.Eliminations) == 0 {
		t.Fatal("expected at least one elimination")
	}
	for _, e := range move.Eliminations {
		if e.Digit != 5 {
			t.Errorf("expected only digit 5 eliminated, got %d", e.Digit)
		}
	}
	if !strings.Contains(move.Explanation, "same unit") {
		t.Errorf("expected a same-unit contradiction explanation, got %q", move.Explanation)
	}
}

// TestCheckSameUnitContradictionEliminatesColour drives checkSameUnitContradiction
// directly: two same-coloured candidates of the same digit that are peers form a
// contradiction, so every candidate of that colour is eliminated.
func TestCheckSameUnitContradictionEliminatesColour(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{5}) // R1C1
	b.candidates[idxOf(0, 1)] = NewCandidates([]int{5}) // R1C2, peer of R1C1 in row 1
	b.candidates[idxOf(0, 8)] = NewCandidates([]int{5}) // R1C9, the opposite colour

	colorToCheck := []candidatePair{{cell: idxOf(0, 0), digit: 5}, {cell: idxOf(0, 1), digit: 5}}
	otherColor := []candidatePair{{cell: idxOf(0, 8), digit: 5}}

	move := checkSameUnitContradiction(b, colorToCheck, otherColor, 1)
	if move == nil {
		t.Fatal("expected a same-unit contradiction move")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if len(move.Eliminations) != 2 {
		t.Errorf("expected both colour-1 candidates eliminated, got %+v", move.Eliminations)
	}
	if !strings.Contains(move.Explanation, "same unit") {
		t.Errorf("expected a same-unit explanation, got %q", move.Explanation)
	}
}

// TestCheckAllCandidatesSameColorEliminatesColour drives checkAllCandidatesSameColor
// (Rule 6): a cell whose every candidate carries the same colour would be empty
// if that colour were false, so the colour is false and all of it is eliminated.
func TestCheckAllCandidatesSameColorEliminatesColour(t *testing.T) {
	b := &testBoard{}
	b.candidates[idxOf(0, 0)] = NewCandidates([]int{3, 4}) // R1C1: both candidates colour 1

	colorToCheck := []candidatePair{
		{cell: idxOf(0, 0), digit: 3},
		{cell: idxOf(0, 0), digit: 4},
	}
	otherColor := []candidatePair{{cell: idxOf(0, 1), digit: 3}}

	move := checkAllCandidatesSameColor(b, colorToCheck, otherColor, nil, 1)
	if move == nil {
		t.Fatal("expected an all-candidates-same-colour move")
	}
	if move.Action != "eliminate" {
		t.Errorf("expected action 'eliminate', got %q", move.Action)
	}
	if len(move.Eliminations) != 2 {
		t.Errorf("expected both colour-1 candidates eliminated, got %+v", move.Eliminations)
	}
	for _, e := range move.Eliminations {
		if e.Digit != 3 && e.Digit != 4 {
			t.Errorf("unexpected eliminated digit %d", e.Digit)
		}
	}
	if !strings.Contains(move.Explanation, "all candidates in color") {
		t.Errorf("expected an all-candidates-in-colour explanation, got %q", move.Explanation)
	}
}
