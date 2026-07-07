package techniques

import (
	"strings"
	"testing"
)

// forcingChainContradictionBoard is the curated forcing-chain fixture (partial
// solve state from puzzle 415). Driving detectUnitForcingChain directly on it
// hits the chain-found branch of tryUnitForcingChain: for digit 1 in column 2,
// exactly two cells hold 1 as a candidate and propagation from one position
// contradicts while the other survives, so the detector returns an assign move
// naming the surviving position.
const forcingChainContradictionBoard = "006510030104007000000046000000020900620900050079050000060103000500060310000405069"

// TestDetectUnitForcingChainReturnsAssignOnContradiction drives the
// tryUnitForcingChain chain-found branch (validCount==1, len>=2) by calling
// detectUnitForcingChain directly on the curated forcing-chain board. The
// detector tries several (digit, unit) pairs before finding one where exactly
// one position survives propagation, exercising both the nil-return and
// non-nil-return paths of tryUnitForcingChain.
func TestDetectUnitForcingChainReturnsAssignOnContradiction(t *testing.T) {
	b := boardFromPuzzleString(forcingChainContradictionBoard)
	move := detectUnitForcingChain(b)
	if move == nil {
		t.Fatal("expected non-nil unit forcing chain move")
	}
	if move.Action != "assign" {
		t.Errorf("expected assign action, got %q", move.Action)
	}
	if !strings.Contains(move.Explanation, "Unit Forcing Chain") {
		t.Errorf("expected 'Unit Forcing Chain' in explanation, got %q", move.Explanation)
	}
	if len(move.Targets) != 1 {
		t.Errorf("expected exactly one target, got %d", len(move.Targets))
	}
	if move.Digit < 1 || move.Digit > 9 {
		t.Errorf("expected digit 1-9, got %d", move.Digit)
	}
}

// TestDetectUnitForcingChainReturnsNilWhenNoChainResolves exercises the
// no-chain path: on a board with no candidates anywhere, no unit has 2-3
// positions for any digit, so detectUnitForcingChain returns nil without
// entering tryUnitForcingChain.
func TestDetectUnitForcingChainReturnsNilWhenNoChainResolves(t *testing.T) {
	b := emptyCandidateBoard()
	if move := detectUnitForcingChain(b); move != nil {
		t.Errorf("expected nil on empty-candidate board, got %+v", move)
	}
}
