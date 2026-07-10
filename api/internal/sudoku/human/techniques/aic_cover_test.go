package techniques

import (
	"strings"
	"testing"
)

// TestCheckChainConclusionAssignsOnDiscontinuousNiceLoop drives the Type 1
// discontinuous nice loop branch of checkChainConclusion: when a chain returns
// to its own start candidate with the same "ON" polarity at both ends, that
// candidate is proven true and must be assigned.
func TestCheckChainConclusionAssignsOnDiscontinuousNiceLoop(t *testing.T) {
	b := &testBoard{}
	b.candidates[0] = b.candidates[0].Set(5)
	b.candidates[1] = b.candidates[1].Set(5)

	start := candidateNode{cell: idxOf(0, 0), digit: 5}
	// A chain that loops back to the start node; length >= 3 as the caller
	// requires. The intermediate node is only there to give the chain body.
	chain := []chainLink{
		{node: start, strong: true},
		{node: candidateNode{cell: idxOf(0, 1), digit: 5}, strong: false},
		{node: start, strong: true},
	}

	move := checkChainConclusion(b, chain, start, true, start, true)
	if move == nil {
		t.Fatal("expected an assignment when the chain loops back ON->ON to the start")
	}
	if move.Action != "assign" {
		t.Errorf("expected action 'assign', got %q", move.Action)
	}
	if move.Digit != 5 {
		t.Errorf("expected digit 5, got %d", move.Digit)
	}
	if len(move.Targets) != 1 || move.Targets[0].Row != 0 || move.Targets[0].Col != 0 {
		t.Errorf("expected assignment target R1C1, got %+v", move.Targets)
	}
	if !strings.Contains(move.Explanation, "must be") {
		t.Errorf("expected explanation to state the cell must be the digit, got %q", move.Explanation)
	}
}
