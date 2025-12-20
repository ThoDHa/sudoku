package human

// Candidates represents a bitmask of possible digits (1-9) for a Sudoku cell.
// Bit positions 1-9 correspond to digits 1-9. Bit 0 is unused.
type Candidates uint16

// NewCandidates creates a Candidates bitmask from a slice of digits
func NewCandidates(digits []int) Candidates {
	var c Candidates
	for _, d := range digits {
		if d >= 1 && d <= 9 {
			c = c.Set(d)
		}
	}
	return c
}

// AllCandidates returns a Candidates with all digits 1-9 set
func AllCandidates() Candidates {
	return Candidates(0b1111111110) // bits 1-9 set
}

// Has returns true if the digit is a candidate
func (c Candidates) Has(digit int) bool {
	if digit < 1 || digit > 9 {
		return false
	}
	return c&(1<<digit) != 0
}

// Set adds a digit as a candidate and returns the new bitmask
func (c Candidates) Set(digit int) Candidates {
	if digit < 1 || digit > 9 {
		return c
	}
	return c | (1 << digit)
}

// Clear removes a digit from candidates and returns the new bitmask
func (c Candidates) Clear(digit int) Candidates {
	if digit < 1 || digit > 9 {
		return c
	}
	return c &^ (1 << digit)
}

// Count returns the number of candidate digits
func (c Candidates) Count() int {
	count := 0
	for i := 1; i <= 9; i++ {
		if c&(1<<i) != 0 {
			count++
		}
	}
	return count
}

// Only returns the single digit if there's exactly one candidate,
// otherwise returns (0, false)
func (c Candidates) Only() (int, bool) {
	if c.Count() != 1 {
		return 0, false
	}
	for i := 1; i <= 9; i++ {
		if c&(1<<i) != 0 {
			return i, true
		}
	}
	return 0, false
}

// ToSlice returns the candidate digits as a sorted slice
func (c Candidates) ToSlice() []int {
	var result []int
	for i := 1; i <= 9; i++ {
		if c&(1<<i) != 0 {
			result = append(result, i)
		}
	}
	return result
}

// IsEmpty returns true if there are no candidates
func (c Candidates) IsEmpty() bool {
	return c == 0
}

// Intersect returns candidates that are present in both bitmasks
func (c Candidates) Intersect(other Candidates) Candidates {
	return c & other
}

// Union returns candidates that are present in either bitmask
func (c Candidates) Union(other Candidates) Candidates {
	return c | other
}

// Subtract returns candidates that are in c but not in other
func (c Candidates) Subtract(other Candidates) Candidates {
	return c &^ other
}

// Equals returns true if the two candidate sets are identical
func (c Candidates) Equals(other Candidates) bool {
	return c == other
}

// String returns a string representation for debugging
func (c Candidates) String() string {
	if c == 0 {
		return "{}"
	}

	digits := c.ToSlice()
	result := "{"
	for i, d := range digits {
		if i > 0 {
			result += ","
		}
		result += string('0' + rune(d))
	}
	result += "}"
	return result
}

// candidatesFromMap converts the old map[int]bool format to Candidates bitmask
func candidatesFromMap(m map[int]bool) Candidates {
	var c Candidates
	for digit, present := range m {
		if present && digit >= 1 && digit <= 9 {
			c = c.Set(digit)
		}
	}
	return c
}

// candidatesToMap converts Candidates bitmask to the old map[int]bool format
func candidatesToMap(c Candidates) map[int]bool {
	m := make(map[int]bool)
	for i := 1; i <= 9; i++ {
		if c.Has(i) {
			m[i] = true
		}
	}
	return m
}
