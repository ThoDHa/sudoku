package human

import "sudoku-api/internal/core"

// UnitType represents row, column, or box
type UnitType int

const (
	UnitRow UnitType = iota
	UnitCol
	UnitBox
)

func (u UnitType) String() string {
	switch u {
	case UnitRow:
		return "row"
	case UnitCol:
		return "column"
	case UnitBox:
		return "box"
	}
	return ""
}

// Unit represents a single row, column, or box
type Unit struct {
	Type  UnitType
	Index int   // 0-8, which row/col/box
	Cells []int // The 9 cell indices
}

// AllUnits returns all 27 units (9 rows + 9 cols + 9 boxes)
func AllUnits() []Unit {
	units := make([]Unit, 0, 27)
	for i := 0; i < 9; i++ {
		units = append(units, Unit{Type: UnitRow, Index: i, Cells: getRowIndices(i)})
		units = append(units, Unit{Type: UnitCol, Index: i, Cells: getColIndices(i)})
		units = append(units, Unit{Type: UnitBox, Index: i, Cells: getBoxIndices(i)})
	}
	return units
}

// RowUnits returns just the 9 row units
func RowUnits() []Unit {
	units := make([]Unit, 9)
	for i := 0; i < 9; i++ {
		units[i] = Unit{Type: UnitRow, Index: i, Cells: getRowIndices(i)}
	}
	return units
}

// ColUnits returns just the 9 column units
func ColUnits() []Unit {
	units := make([]Unit, 9)
	for i := 0; i < 9; i++ {
		units[i] = Unit{Type: UnitCol, Index: i, Cells: getColIndices(i)}
	}
	return units
}

// BoxUnits returns just the 9 box units
func BoxUnits() []Unit {
	units := make([]Unit, 9)
	for i := 0; i < 9; i++ {
		units[i] = Unit{Type: UnitBox, Index: i, Cells: getBoxIndices(i)}
	}
	return units
}

// GetUnitCells returns the cells for a unit as CellRefs (for highlights)
func (u Unit) GetCellRefs() []core.CellRef {
	refs := make([]core.CellRef, len(u.Cells))
	for i, idx := range u.Cells {
		refs[i] = core.CellRef{Row: idx / 9, Col: idx % 9}
	}
	return refs
}

// RowColUnits returns just rows and columns (used for line-based techniques)
func RowColUnits() []Unit {
	units := make([]Unit, 0, 18)
	for i := 0; i < 9; i++ {
		units = append(units, Unit{Type: UnitRow, Index: i, Cells: getRowIndices(i)})
		units = append(units, Unit{Type: UnitCol, Index: i, Cells: getColIndices(i)})
	}
	return units
}

// LineIndexFromPos returns the row or col index from a CellRef based on line type
func (u UnitType) LineIndexFromPos(pos core.CellRef) int {
	if u == UnitRow {
		return pos.Row
	}
	return pos.Col
}

// BoxIndexFromPos returns which box segment (0, 1, or 2) a position belongs to
// For rows: which column-band (0-2, 3-5, 6-8 -> 0, 1, 2)
// For cols: which row-band
func (u UnitType) BoxIndexFromPos(pos core.CellRef) int {
	if u == UnitRow {
		return pos.Col / 3
	}
	return pos.Row / 3
}

// MakeLineUnit creates a row or column unit for a given index
func MakeLineUnit(lineType UnitType, idx int) Unit {
	if lineType == UnitRow {
		return Unit{Type: UnitRow, Index: idx, Cells: getRowIndices(idx)}
	}
	return Unit{Type: UnitCol, Index: idx, Cells: getColIndices(idx)}
}

// AllInSameLine checks if all positions are in the same row or column
func AllInSameLine(lineType UnitType, positions []core.CellRef) (bool, int) {
	if len(positions) == 0 {
		return false, -1
	}
	lineIdx := lineType.LineIndexFromPos(positions[0])
	for _, p := range positions[1:] {
		if lineType.LineIndexFromPos(p) != lineIdx {
			return false, -1
		}
	}
	return true, lineIdx
}

// AllInSameBoxSegment checks if all positions are in the same box segment
func AllInSameBoxSegment(lineType UnitType, positions []core.CellRef) (bool, int) {
	if len(positions) == 0 {
		return false, -1
	}
	boxIdx := lineType.BoxIndexFromPos(positions[0])
	for _, p := range positions[1:] {
		if lineType.BoxIndexFromPos(p) != boxIdx {
			return false, -1
		}
	}
	return true, boxIdx
}
