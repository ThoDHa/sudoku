package techniques

import (
	"testing"

	"sudoku-api/internal/core"
)

// This file pins the collection formatters against mutation-testing escapees in
// formatter.go. techniques_test.go already covers nil and multi-element input,
// which left the one-element case unasserted: a mutant turning the empty-input
// guard into len(x) == 1 returned "" for a single element and survived. That
// guard has since been removed as redundant, so the empty contract now rests on
// strings.Join and is restated here in full, nil included. The single-element
// inputs use distinct row and column values so a transposition cannot hide.

func TestFormatCollectionsFormatASingleElementWithoutSeparator(t *testing.T) {
	if got := FormatCells([]int{5}); got != "R1C6" {
		t.Errorf("FormatCells([]int{5}) = %q, want R1C6", got)
	}
	if got := FormatRefs([]core.CellRef{{Row: 1, Col: 4}}); got != "R2C5" {
		t.Errorf("FormatRefs one ref = %q, want R2C5", got)
	}
	if got := FormatDigits([]int{7}); got != "7" {
		t.Errorf("FormatDigits([]int{7}) = %q, want 7", got)
	}
}

func TestFormatCollectionsReturnEmptyStringForNoElements(t *testing.T) {
	if got := FormatCells([]int{}); got != "" {
		t.Errorf("FormatCells(empty) = %q, want \"\"", got)
	}
	if got := FormatCells(nil); got != "" {
		t.Errorf("FormatCells(nil) = %q, want \"\"", got)
	}
	if got := FormatRefs([]core.CellRef{}); got != "" {
		t.Errorf("FormatRefs(empty) = %q, want \"\"", got)
	}
	if got := FormatRefs(nil); got != "" {
		t.Errorf("FormatRefs(nil) = %q, want \"\"", got)
	}
	if got := FormatDigits([]int{}); got != "" {
		t.Errorf("FormatDigits(empty) = %q, want \"\"", got)
	}
	if got := FormatDigits(nil); got != "" {
		t.Errorf("FormatDigits(nil) = %q, want \"\"", got)
	}
}
