package techniques

import (
	"testing"

	"sudoku-api/pkg/constants"
)

// The Candidates tests in techniques_test.go all assert through the type's own
// accessors, which is why they cannot see a widened range guard: Has rejects
// out-of-range digits itself, and Count, Only and ToSlice all start their sweep
// at digit 1. A guard that stops rejecting is therefore observable only against
// the raw bitmask, so the tests below compare raw values and deliberately
// construct Candidates carrying bits the public API can never set.
//
// outOfRangeDigit is the smallest digit above the grid whose bit still fits in
// the uint16 backing Candidates. GridSize+1 shifts to a bit inside the word,
// whereas a far larger digit like 100 shifts clean off the end and yields zero,
// which is why an out-of-range Set with such a digit looks like a no-op whether
// or not the guard is present.
const outOfRangeDigit = constants.GridSize + 1

// TestCandidatesSetRejectsOutOfRangeDigitsInTheRawBitmask pins Set's range guard
// against the raw value. Both ends matter: digit 0 maps to the unused bit 0, and
// GridSize+1 maps to a real bit inside the word.
func TestCandidatesSetRejectsOutOfRangeDigitsInTheRawBitmask(t *testing.T) {
	var empty Candidates
	if got := empty.Set(0); got != empty {
		t.Errorf("Set(0) must not touch the bitmask, got raw %d", uint16(got))
	}
	if got := empty.Set(outOfRangeDigit); got != empty {
		t.Errorf("Set(%d) must not touch the bitmask, got raw %d", outOfRangeDigit, uint16(got))
	}
	if got := empty.Set(-1); got != empty {
		t.Errorf("Set(-1) must not touch the bitmask, got raw %d", uint16(got))
	}
}

// TestCandidatesClearRejectsOutOfRangeDigitsInTheRawBitmask pins Clear's range
// guard against values that actually carry the out-of-range bits, which is the
// only way a widened guard becomes visible.
func TestCandidatesClearRejectsOutOfRangeDigitsInTheRawBitmask(t *testing.T) {
	strayBitZero := Candidates(1)
	if got := strayBitZero.Clear(0); got != strayBitZero {
		t.Errorf("Clear(0) must not touch bit 0, got raw %d", uint16(got))
	}

	strayHighBit := Candidates(1 << outOfRangeDigit)
	if got := strayHighBit.Clear(outOfRangeDigit); got != strayHighBit {
		t.Errorf("Clear(%d) must not touch bit %d, got raw %d", outOfRangeDigit, outOfRangeDigit, uint16(got))
	}
}

// TestCandidatesHasRejectsOutOfRangeDigitsEvenWhenTheBitIsSet pins Has's range
// guard. The existing coverage asks Has about out-of-range digits on values that
// never carry those bits, so it passes whether the guard runs or not.
func TestCandidatesHasRejectsOutOfRangeDigitsEvenWhenTheBitIsSet(t *testing.T) {
	if Candidates(1).Has(0) {
		t.Error("Has(0) must be false even when the unused bit 0 is set")
	}
	if Candidates(1 << outOfRangeDigit).Has(outOfRangeDigit) {
		t.Errorf("Has(%d) must be false even when that bit is set", outOfRangeDigit)
	}
}

// TestCandidatesIgnoreTheUnusedBitZero pins the documented contract that bit 0 is
// not a digit. Count, ToSlice and Only must each skip it, so a sweep that starts
// at 0 reports a digit that does not exist.
func TestCandidatesIgnoreTheUnusedBitZero(t *testing.T) {
	strayBitZero := Candidates(1)
	if got := strayBitZero.Count(); got != 0 {
		t.Errorf("Count must ignore the unused bit 0, got %d", got)
	}
	if got := strayBitZero.ToSlice(); len(got) != 0 {
		t.Errorf("ToSlice must ignore the unused bit 0, got %v", got)
	}

	withRealDigit := Candidates(1).Set(5)
	if got := withRealDigit.Count(); got != 1 {
		t.Errorf("Count must see exactly the one real digit, got %d", got)
	}
	if got := withRealDigit.ToSlice(); len(got) != 1 || got[0] != 5 {
		t.Errorf("ToSlice must list only the real digit, got %v", got)
	}
	digit, ok := withRealDigit.Only()
	if !ok || digit != 5 {
		t.Errorf("Only must report the real digit, got (%d,%v)", digit, ok)
	}
}

// TestCandidatesOnlyReturnsZeroDigitWhenNotSingle pins the digit returned
// alongside a false result. Callers that read the digit before checking ok would
// otherwise see an arbitrary value.
func TestCandidatesOnlyReturnsZeroDigitWhenNotSingle(t *testing.T) {
	var empty Candidates
	if digit, ok := empty.Only(); ok || digit != 0 {
		t.Errorf("empty Only must be (0,false), got (%d,%v)", digit, ok)
	}
	if digit, ok := NewCandidates([]int{2, 7}).Only(); ok || digit != 0 {
		t.Errorf("two-candidate Only must be (0,false), got (%d,%v)", digit, ok)
	}
}
