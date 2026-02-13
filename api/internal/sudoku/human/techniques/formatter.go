package techniques

import (
	"fmt"
	"strings"

	"sudoku-api/internal/core"
)

// ============================================================================
// Formatting Utilities
// ============================================================================

// FormatCell formats a cell index as "R{row}C{col}" (1-indexed for display)
func FormatCell(cell int) string {
	return fmt.Sprintf("R%dC%d", RowOf(cell)+1, ColOf(cell)+1)
}

// FormatCells formats multiple cells as comma-separated "R{row}C{col}"
func FormatCells(cells []int) string {
	if len(cells) == 0 {
		return ""
	}
	parts := make([]string, len(cells))
	for i, cell := range cells {
		parts[i] = FormatCell(cell)
	}
	return strings.Join(parts, ", ")
}

// FormatRef formats a CellRef as "R{row}C{col}" (1-indexed for display)
func FormatRef(ref core.CellRef) string {
	return fmt.Sprintf("R%dC%d", ref.Row+1, ref.Col+1)
}

// FormatRefs formats multiple CellRefs as comma-separated
func FormatRefs(refs []core.CellRef) string {
	if len(refs) == 0 {
		return ""
	}
	parts := make([]string, len(refs))
	for i, ref := range refs {
		parts[i] = FormatRef(ref)
	}
	return strings.Join(parts, ", ")
}

// FormatDigit formats a digit
func FormatDigit(digit int) string {
	return fmt.Sprintf("%d", digit)
}

// FormatDigits formats digits as comma-separated
func FormatDigits(digits []int) string {
	if len(digits) == 0 {
		return ""
	}
	parts := make([]string, len(digits))
	for i, d := range digits {
		parts[i] = fmt.Sprintf("%d", d)
	}
	return strings.Join(parts, ", ")
}

// FormatDigitsCompact formats digits without separators (e.g., "123")
func FormatDigitsCompact(digits []int) string {
	var sb strings.Builder
	for _, d := range digits {
		sb.WriteByte('0' + byte(d))
	}
	return sb.String()
}
