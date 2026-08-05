package compileprobe

import "testing"

func TestFirstReturnsTheLeadingCell(t *testing.T) {
	if got := First(Row{7, 8, 9}); got != 7 {
		t.Fatalf("First(Row{7, 8, 9}) = %d, want 7", got)
	}
}
