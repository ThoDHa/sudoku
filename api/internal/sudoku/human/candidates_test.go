package human

import (
	"testing"
)

func TestCandidates_Basic(t *testing.T) {
	// Test empty candidates
	var c Candidates
	if !c.IsEmpty() {
		t.Error("New Candidates should be empty")
	}
	if c.Count() != 0 {
		t.Error("Empty Candidates should have count 0")
	}

	// Test setting and checking candidates
	c = c.Set(1)
	if !c.Has(1) {
		t.Error("Should have digit 1 after setting")
	}
	if c.Count() != 1 {
		t.Error("Should have count 1")
	}

	// Test multiple digits
	c = c.Set(5).Set(9)
	if !c.Has(5) || !c.Has(9) {
		t.Error("Should have digits 5 and 9")
	}
	if c.Count() != 3 {
		t.Error("Should have count 3")
	}
}

func TestCandidates_Clear(t *testing.T) {
	c := AllCandidates()
	if c.Count() != 9 {
		t.Error("AllCandidates should have count 9")
	}

	c = c.Clear(5)
	if c.Has(5) {
		t.Error("Should not have digit 5 after clearing")
	}
	if c.Count() != 8 {
		t.Error("Should have count 8 after clearing one")
	}
}

func TestCandidates_Only(t *testing.T) {
	// Test empty
	var c Candidates
	if digit, ok := c.Only(); ok {
		t.Errorf("Empty candidates should not return Only, got %d", digit)
	}

	// Test single digit
	c = c.Set(7)
	if digit, ok := c.Only(); !ok || digit != 7 {
		t.Errorf("Expected Only() to return (7, true), got (%d, %v)", digit, ok)
	}

	// Test multiple digits
	c = c.Set(3)
	if digit, ok := c.Only(); ok {
		t.Errorf("Multiple candidates should not return Only, got %d", digit)
	}
}

func TestCandidates_ToSlice(t *testing.T) {
	c := NewCandidates([]int{1, 3, 7, 9})
	slice := c.ToSlice()
	expected := []int{1, 3, 7, 9}

	if len(slice) != len(expected) {
		t.Errorf("Expected slice length %d, got %d", len(expected), len(slice))
	}

	for i, v := range expected {
		if i >= len(slice) || slice[i] != v {
			t.Errorf("Expected slice[%d] = %d, got %v", i, v, slice)
			break
		}
	}
}

func TestCandidates_Operations(t *testing.T) {
	c1 := NewCandidates([]int{1, 3, 5})
	c2 := NewCandidates([]int{3, 5, 7})

	// Test intersect
	intersect := c1.Intersect(c2)
	expected := NewCandidates([]int{3, 5})
	if !intersect.Equals(expected) {
		t.Errorf("Intersect failed: expected %v, got %v", expected.ToSlice(), intersect.ToSlice())
	}

	// Test union
	union := c1.Union(c2)
	expected = NewCandidates([]int{1, 3, 5, 7})
	if !union.Equals(expected) {
		t.Errorf("Union failed: expected %v, got %v", expected.ToSlice(), union.ToSlice())
	}

	// Test subtract
	subtract := c1.Subtract(c2)
	expected = NewCandidates([]int{1})
	if !subtract.Equals(expected) {
		t.Errorf("Subtract failed: expected %v, got %v", expected.ToSlice(), subtract.ToSlice())
	}
}

func TestCandidates_MapConversion(t *testing.T) {
	// Test conversion from map
	m := map[int]bool{1: true, 3: true, 7: true}
	c := candidatesFromMap(m)
	if !c.Has(1) || !c.Has(3) || !c.Has(7) || c.Has(2) {
		t.Error("candidatesFromMap conversion failed")
	}

	// Test conversion to map
	c = NewCandidates([]int{2, 4, 6})
	m2 := candidatesToMap(c)
	if len(m2) != 3 || !m2[2] || !m2[4] || !m2[6] {
		t.Error("candidatesToMap conversion failed")
	}
}

func TestCandidates_BoundaryConditions(t *testing.T) {
	var c Candidates

	// Test invalid digits
	c = c.Set(0).Set(10).Set(-1)
	if c.Count() != 0 {
		t.Error("Invalid digits should not be set")
	}

	// Test Has with invalid digits
	if c.Has(0) || c.Has(10) || c.Has(-1) {
		t.Error("Invalid digits should not be present")
	}

	// Test Clear with invalid digits (should not panic)
	c = NewCandidates([]int{1, 2, 3})
	original := c
	c = c.Clear(0).Clear(10).Clear(-1)
	if !c.Equals(original) {
		t.Error("Clearing invalid digits should not change candidates")
	}
}

func TestNewCandidates(t *testing.T) {
	// Test with valid digits
	c := NewCandidates([]int{1, 5, 9})
	if !c.Has(1) || !c.Has(5) || !c.Has(9) || c.Count() != 3 {
		t.Error("NewCandidates with valid digits failed")
	}

	// Test with invalid digits (should be ignored)
	c = NewCandidates([]int{0, 1, 10, 5})
	if !c.Has(1) || !c.Has(5) || c.Has(0) || c.Has(10) || c.Count() != 2 {
		t.Error("NewCandidates should ignore invalid digits")
	}

	// Test with empty slice
	c = NewCandidates([]int{})
	if !c.IsEmpty() {
		t.Error("NewCandidates with empty slice should be empty")
	}
}
