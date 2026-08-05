package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// ============================================================================
// Unique Rectangle Detection
// ============================================================================
//
// Unique Rectangles (URs) exploit the fact that valid Sudoku puzzles have
// exactly one solution. A "deadly pattern" would create multiple solutions,
// so we can eliminate candidates that would complete such a pattern.
//
// All UR types share the same rectangle-finding logic: 4 cells forming a
// rectangle across exactly 2 boxes, where all 4 cells contain candidates
// for the same 2 digits.

// urRectangle represents a potential Unique Rectangle configuration
type urRectangle struct {
	d1, d2  int    // The two digits forming the UR
	corners [4]int // Cell indices: [0]=(r1,c1), [1]=(r1,c2), [2]=(r3,c1), [3]=(r3,c2)
	// Corners are ordered so that:
	// : [0] and [3] are diagonal (different row and column)
	// : [1] and [2] are diagonal (different row and column)
	// : [0] and [1] share a row
	// : [2] and [3] share a row
	// : [0] and [2] share a column
	// : [1] and [3] share a column
}

// urFloorRoofPairs defines row/column pair configurations for UR floor/roof detection:
// - Row pairs: {0,1} and {2,3} (cells sharing a row)
// - Column pairs: {0,2} and {1,3} (cells sharing a column)
// A wider array dimension leaves the extra element zero-valued and never
// indexed, so it cannot change which corners are paired.
// mutator-disable-next-line numbers/incrementer
var urFloorRoofPairs = [][2][2]int{
	{{0, 1}, {2, 3}}, // floor = row 1, roof = row 2
	{{2, 3}, {0, 1}}, // floor = row 2, roof = row 1
	{{0, 2}, {1, 3}}, // floor = col 1, roof = col 2
	{{1, 3}, {0, 2}}, // floor = col 2, roof = col 1
}

// urDigitPairs yields every unordered pair of distinct digits exactly once, with
// d1 < d2, in ascending order. All four UR detectors scan the same pair space,
// so the enumeration lives here rather than being repeated in each of them.
func urDigitPairs(yield func(d1, d2 int) bool) {
	// Raising this bound only adds outer values for which the inner range is
	// already empty, so no additional pair is yielded.
	// mutator-disable-next-line arithmetic/base,numbers/decrementer
	const urMaxFirstDigit = constants.GridSize - 1
	for d1 := 1; d1 <= urMaxFirstDigit; d1++ {
		for d2 := d1 + 1; d2 <= constants.GridSize; d2++ {
			if !yield(d1, d2) {
				return
			}
		}
	}
}

// findURRectangles finds all valid Unique Rectangle configurations for digits d1, d2.
// A UR rectangle has 4 cells forming a rectangle across exactly 2 boxes.
//
//nolint:gocyclo // UR rectangle enumeration tries every (cell-a, cell-b, cell-c, cell-d) 4-tuple across shared-candidate cells with three structural checks (same rows, same cols, exactly two boxes); each check consumes the per-pair coordinates computed in earlier iterations.
func findURRectangles(b BoardInterface, d1, d2 int) []urRectangle {
	// Find all cells that have both d1 and d2 as candidates
	var cells []int
	for i := range constants.TotalCells {
		if b.GetCandidatesAt(i).Has(d1) && b.GetCandidatesAt(i).Has(d2) {
			cells = append(cells, i)
		}
	}

	// Lowering this bound, or dropping the early return, cannot change the
	// result: fewer than four cells leave the four-index loop below with no
	// iteration to run, so the function returns a nil slice either way.
	// mutator-disable-next-line numbers/decrementer
	if len(cells) < 4 {
		// mutator-disable-next-line branch/if
		return nil
	}

	var rectangles []urRectangle

	// Try all combinations of 4 cells that form a rectangle spanning exactly 2 boxes
	for i := range cells {
		// Starting at i pairs a cell with itself, which shares its own column
		// and is rejected by the column check below.
		// mutator-disable-next-line numbers/decrementer
		for j := i + 1; j < len(cells); j++ {
			r1, c1 := cells[i]/constants.GridSize, cells[i]%constants.GridSize
			r2, c2 := cells[j]/constants.GridSize, cells[j]%constants.GridSize

			// Must be in same row. cells is ascending, so within that row
			// c1 < c2 and the pair cannot be the same column.
			if r1 != r2 {
				// cells is ascending, so rows do not decrease as j advances:
				// once this row differs it differs for every later j, and
				// leaving the loop is the same as skipping the rest of it.
				// mutator-disable-next-line loop/break
				continue
			}

			// Look for matching cells in a different row
			// Reaching k == len(cells) leaves the inner range empty, and starting
			// k at j puts cells[k] in the first pair's row, which the column
			// check rejects.
			// mutator-disable-next-line expression/comparison,numbers/decrementer
			for k := j + 1; k < len(cells); k++ {
				// Starting l at or below k gives a second pair whose columns are
				// equal or descending, and c1 < c2 means such a pair can never
				// line up with the first.
				// mutator-disable-next-line arithmetic/base,numbers/decrementer
				for l := k + 1; l < len(cells); l++ {
					r3, c3 := cells[k]/constants.GridSize, cells[k]%constants.GridSize
					r4, c4 := cells[l]/constants.GridSize, cells[l]%constants.GridSize

					// These two must be in the same row
					if r3 != r4 {
						// Rows do not decrease as l advances, so once this row
						// differs it differs for every later l.
						// mutator-disable-next-line loop/break
						continue
					}
					// Columns must match c1 and c2. Both pairs are ascending
					// (c1 < c2 and c3 < c4), so the columns line up one way
					// only, and a match also forces r3 into a different row
					// than r1: matching columns in the same row would mean
					// cells[k] equals cells[i], which the index order forbids.
					if c3 != c1 || c4 != c2 {
						continue
					}

					// Check that the rectangle spans exactly 2 boxes
					box1 := (r1/constants.BoxSize)*constants.BoxSize + c1/constants.BoxSize
					box2 := (r1/constants.BoxSize)*constants.BoxSize + c2/constants.BoxSize
					box3 := (r3/constants.BoxSize)*constants.BoxSize + c3/constants.BoxSize
					box4 := (r3/constants.BoxSize)*constants.BoxSize + c4/constants.BoxSize
					boxes := map[int]bool{box1: true, box2: true, box3: true, box4: true}
					if len(boxes) != 2 {
						// The column check above pins cells[l] to one cell for
						// this k, so no later l can reach here and leaving the
						// loop is the same as skipping the rest of it.
						// mutator-disable-next-line loop/break
						continue
					}

					// Order corners: [0]=(r1,c1), [1]=(r1,c2), [2]=(r3,c1), [3]=(r3,c2)
					corners := [4]int{cells[i], cells[j], cells[k], cells[l]}

					rectangles = append(rectangles, urRectangle{
						d1:      d1,
						d2:      d2,
						corners: corners,
					})
				}
			}
		}
	}

	return rectangles
}

// DetectUniqueRectangle finds Unique Rectangle Type 1 patterns
// A UR occurs when 4 cells form a rectangle across EXACTLY 2 boxes, and 3 corners
// are bivalue with the same 2 digits. The 4th corner must have extra candidates
// to avoid a deadly pattern (multiple solutions).
func DetectUniqueRectangle(b BoardInterface) *core.Move {
	for d1, d2 := range urDigitPairs {
		for _, rect := range findURRectangles(b, d1, d2) {
			// Count how many corners are bivalue (exactly d1 and d2). Every
			// corner of a rectangle holds both digits, so a corner that is not
			// bivalue necessarily carries extras.
			bivalueCount := 0
			var nonBivalueIdx int
			for _, corner := range rect.corners {
				if b.GetCandidatesAt(corner).Count() == 2 {
					bivalueCount++
				} else {
					nonBivalueIdx = corner
				}
			}

			// Type 1 UR: exactly 3 bivalue corners, so exactly one carries extras
			if bivalueCount == 3 {
				row, col := nonBivalueIdx/constants.GridSize, nonBivalueIdx%constants.GridSize
				eliminations := []core.Candidate{
					{Row: row, Col: col, Digit: d1},
					{Row: row, Col: col, Digit: d2},
				}

				targets := CellRefsFromIndices(rect.corners[:]...)

				return &core.Move{
					Action:       "eliminate",
					Digit:        0,
					Targets:      targets,
					Eliminations: eliminations,
					Explanation:  fmt.Sprintf("Unique Rectangle Type 1: %d/%d would form deadly pattern: eliminate from R%dC%d.", d1, d2, row+1, col+1),
					Highlights: core.Highlights{
						Primary:   targets[:3], // The 3 bivalue corners
						Secondary: []core.CellRef{{Row: row, Col: col}},
					},
				}
			}
		}
	}

	return nil
}

// DetectUniqueRectangleType2 finds UR Type 2 patterns
// 4 cells forming a rectangle across 2 boxes
// 2 diagonal corners are bivalue with {A,B}
// Other 2 corners have {A,B} plus one extra candidate X (same extra in both)
// Eliminate X from cells that see BOTH corners with extra candidates
func DetectUniqueRectangleType2(b BoardInterface) *core.Move {
	for d1, d2 := range urDigitPairs {
		for _, rect := range findURRectangles(b, d1, d2) {
			corners := rect.corners

			// Check Type 2: 2 corners in same row/col are bivalue (floor), other 2 have same extra (roof)
			for _, pair := range urFloorRoofPairs {
				floorPair, roofPair := pair[0], pair[1]

				// Check if floor corners are bivalue with exactly {d1, d2}
				if b.GetCandidatesAt(corners[floorPair[0]]).Count() != 2 ||
					b.GetCandidatesAt(corners[floorPair[1]]).Count() != 2 {
					continue
				}

				// Type 2 needs both roof cells to carry the UR digits plus one
				// extra, and that extra to be the same digit in both. A bivalue
				// roof has no extra and fails the same check, so the candidate
				// counts need no separate guard.
				urDigits := NewCandidates([]int{d1, d2})
				extras0 := b.GetCandidatesAt(corners[roofPair[0]]).Subtract(urDigits)
				extras1 := b.GetCandidatesAt(corners[roofPair[1]]).Subtract(urDigits)

				if extras0.Count() != 1 || extras0 != extras1 {
					continue
				}

				extraDigit := extras0.ToSlice()[0]
				roofCorner0 := corners[roofPair[0]]
				roofCorner1 := corners[roofPair[1]]

				// Eliminate extraDigit from cells that see BOTH roof corners
				eliminations := FindEliminationsSeeing(b, extraDigit,
					[]int{roofCorner0, roofCorner1}, roofCorner0, roofCorner1)

				if len(eliminations) > 0 {
					targets := CellRefsFromIndices(corners[:]...)

					return &core.Move{
						Action:       "eliminate",
						Digit:        extraDigit,
						Targets:      targets,
						Eliminations: eliminations,
						Explanation: fmt.Sprintf("Unique Rectangle Type 2: %d/%d with extra %d: eliminate %d from cells seeing both R%dC%d and R%dC%d.",
							d1, d2, extraDigit, extraDigit, roofCorner0/constants.GridSize+1, roofCorner0%constants.GridSize+1, roofCorner1/constants.GridSize+1, roofCorner1%constants.GridSize+1),
						Highlights: core.Highlights{
							Primary:   CellRefsFromIndices(corners[floorPair[0]], corners[floorPair[1]]),
							Secondary: CellRefsFromIndices(roofCorner0, roofCorner1),
						},
					}
				}
			}
		}
	}

	return nil
}

// DetectUniqueRectangleType3 finds UR Type 3 patterns
// Similar setup to Type 2 but the two corners with extras form a "pseudo-cell"
// If their combined extras would form a naked pair/triple with other cells in the unit, make that elimination
//
//nolint:gocyclo // Type 3 UR detection couples four interdependent phases (floor/roof pairing, extra-digit extraction, hidden-subset search across two cell groups, and elimination assembly) that share ~10 intermediate variables across phases; extracting any phase requires passing that state through helper signatures, which obscures the technique's logic flow.
func DetectUniqueRectangleType3(b BoardInterface) *core.Move {
	for d1, d2 := range urDigitPairs {
		for _, rect := range findURRectangles(b, d1, d2) {
			corners := rect.corners

			// Check Type 3: 2 corners in same row/col are bivalue (floor), other 2 have extras (roof)
			for _, pair := range urFloorRoofPairs {
				floorPair, roofPair := pair[0], pair[1]

				// Check if floor corners are bivalue
				if b.GetCandidatesAt(corners[floorPair[0]]).Count() != 2 ||
					b.GetCandidatesAt(corners[floorPair[1]]).Count() != 2 {
					continue
				}

				// Get extras from the roof corners (they share a row/col and can form pseudo-cell)
				roofCorner0 := corners[roofPair[0]]
				roofCorner1 := corners[roofPair[1]]

				// A rectangle whose roof corners are both bivalue has no extras
				// at all, and the combined-extras bounds below reject it, so the
				// candidate counts need no separate guard.

				// Combine extras from both corners (excluding d1, d2)
				urDigits := NewCandidates([]int{d1, d2})
				combinedExtras := b.GetCandidatesAt(roofCorner0).Subtract(urDigits).Union(
					b.GetCandidatesAt(roofCorner1).Subtract(urDigits))

				if combinedExtras.Count() == 0 || combinedExtras.Count() > 3 {
					continue
				}

				extraSlice := combinedExtras.ToSlice()

				// The two roof corners must share a unit (row, col, or box) to form a pseudo-cell
				// Check which units they share
				row0, col0 := roofCorner0/constants.GridSize, roofCorner0%constants.GridSize
				row1, col1 := roofCorner1/constants.GridSize, roofCorner1%constants.GridSize
				box0 := (row0/constants.BoxSize)*constants.BoxSize + col0/constants.BoxSize
				box1 := (row1/constants.BoxSize)*constants.BoxSize + col1/constants.BoxSize

				type unitInfo struct {
					unitType string
					indices  []int
				}
				var sharedUnits []unitInfo

				if row0 == row1 {
					sharedUnits = append(sharedUnits, unitInfo{"row", RowIndices[row0]})
				}
				if col0 == col1 {
					sharedUnits = append(sharedUnits, unitInfo{"column", ColIndices[col0]})
				}
				if box0 == box1 {
					sharedUnits = append(sharedUnits, unitInfo{"box", BoxIndices[box0]})
				}

				// For each shared unit, look for naked subset with the pseudo-cell
				for _, unit := range sharedUnits {
					// Naked pair: combined extras have 2 digits, find 1 other cell with subset of these
					// Naked triple: combined extras have 3 digits, find 2 other cells

					if len(extraSlice) == 2 {
						// Look for naked pair: one other cell with exactly these 2 candidates
						for _, idx := range unit.indices {
							if idx == roofCorner0 || idx == roofCorner1 {
								continue
							}
							if b.GetCell(idx) != 0 {
								continue
							}

							cellCands := b.GetCandidatesAt(idx).ToSlice()
							if len(cellCands) != 2 {
								continue
							}
							if cellCands[0] == extraSlice[0] && cellCands[1] == extraSlice[1] {
								// Found naked pair with pseudo-cell
								// Eliminate these digits from other cells in the unit
								var eliminations []core.Candidate
								for _, elimIdx := range unit.indices {
									if elimIdx == roofCorner0 || elimIdx == roofCorner1 || elimIdx == idx {
										continue
									}
									if b.GetCell(elimIdx) != 0 {
										continue
									}
									for _, d := range extraSlice {
										if b.GetCandidatesAt(elimIdx).Has(d) {
											eliminations = append(eliminations, core.Candidate{
												Row: elimIdx / constants.GridSize, Col: elimIdx % constants.GridSize, Digit: d,
											})
										}
									}
								}

								if len(eliminations) > 0 {
									targets := CellRefsFromIndices(corners[:]...)

									return &core.Move{
										Action:       "eliminate",
										Digit:        0,
										Targets:      targets,
										Eliminations: eliminations,
										Explanation: fmt.Sprintf("Unique Rectangle Type 3: %d/%d: pseudo-cell with %v forms naked pair with R%dC%d in %s.",
											d1, d2, extraSlice, idx/constants.GridSize+1, idx%constants.GridSize+1, unit.unitType),
										Highlights: core.Highlights{
											Primary:   CellRefsFromIndices(corners[floorPair[0]], corners[floorPair[1]]),
											Secondary: CellRefsFromIndices(roofCorner0, roofCorner1, idx),
										},
									}
								}
							}
						}
					}

					if len(extraSlice) >= 2 && len(extraSlice) <= 3 {
						// Look for naked triple: find cells that together with pseudo-cell form a triple
						var candidateCells []int
						for _, idx := range unit.indices {
							if idx == roofCorner0 || idx == roofCorner1 {
								continue
							}
							if b.GetCell(idx) != 0 {
								continue
							}
							// A cell outside the pseudo-cell's digits widens the
							// combined set past three digits, which the triple
							// check below rejects, so only the cell size is
							// screened here.
							cellCands := b.GetCandidatesAt(idx)
							if cellCands.Count() < 2 || cellCands.Count() > 3 {
								continue
							}
							candidateCells = append(candidateCells, idx)
						}

						// For naked triple, we need exactly 2 more cells (pseudo-cell counts as 1)
						if len(extraSlice) == 3 && len(candidateCells) >= 2 {
							// Try pairs of candidate cells
							for ci := range candidateCells {
								for cj := ci + 1; cj < len(candidateCells); cj++ {
									idx1, idx2 := candidateCells[ci], candidateCells[cj]

									// Combined candidates of pseudo-cell + these 2 cells must be exactly 3 digits
									allCands := combinedExtras.Union(b.GetCandidatesAt(idx1)).Union(b.GetCandidatesAt(idx2))

									if allCands.Count() != 3 {
										continue
									}

									tripleDigits := allCands.ToSlice()

									// Eliminate these 3 digits from other cells in unit
									var eliminations []core.Candidate
									for _, elimIdx := range unit.indices {
										if elimIdx == roofCorner0 || elimIdx == roofCorner1 || elimIdx == idx1 || elimIdx == idx2 {
											continue
										}
										if b.GetCell(elimIdx) != 0 {
											continue
										}
										for _, d := range tripleDigits {
											if b.GetCandidatesAt(elimIdx).Has(d) {
												eliminations = append(eliminations, core.Candidate{
													Row: elimIdx / constants.GridSize, Col: elimIdx % constants.GridSize, Digit: d,
												})
											}
										}
									}

									if len(eliminations) > 0 {
										targets := CellRefsFromIndices(corners[:]...)

										return &core.Move{
											Action:       "eliminate",
											Digit:        0,
											Targets:      targets,
											Eliminations: eliminations,
											Explanation: fmt.Sprintf("Unique Rectangle Type 3: %d/%d: pseudo-cell forms naked triple with R%dC%d and R%dC%d in %s.",
												d1, d2, idx1/constants.GridSize+1, idx1%constants.GridSize+1, idx2/constants.GridSize+1, idx2%constants.GridSize+1, unit.unitType),
											Highlights: core.Highlights{
												Primary:   CellRefsFromIndices(corners[floorPair[0]], corners[floorPair[1]]),
												Secondary: CellRefsFromIndices(roofCorner0, roofCorner1, idx1, idx2),
											},
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	return nil
}

// DetectUniqueRectangleType4 finds UR Type 4 patterns
// Two corners with just {A,B}, two corners with {A,B,+extras}
// If one of A or B is confined to the UR cells within a row/column,
// the other can be eliminated from the extra corners
//
//nolint:gocyclo // Type 4 UR detection threads rectangle enumeration, floor/roof pairing, bivalue-corner validation, and the line-confined-digit elimination search through one body; the floor/roof state propagates through every downstream check.
func DetectUniqueRectangleType4(b BoardInterface) *core.Move {
	for d1, d2 := range urDigitPairs {
		for _, rect := range findURRectangles(b, d1, d2) {
			corners := rect.corners

			// Type 4: 2 corners (in same row or col) are bivalue with {d1,d2}
			// The other 2 have extras
			for _, pair := range urFloorRoofPairs {
				floorPair, roofPair := pair[0], pair[1]
				bv0, bv1 := corners[floorPair[0]], corners[floorPair[1]]
				ex0, ex1 := corners[roofPair[0]], corners[roofPair[1]]

				// Check bivalue corners have exactly {d1, d2}
				if b.GetCandidatesAt(bv0).Count() != 2 || b.GetCandidatesAt(bv1).Count() != 2 {
					continue
				}

				// Check extra corners have more than {d1, d2}
				if b.GetCandidatesAt(ex0).Count() <= 2 || b.GetCandidatesAt(ex1).Count() <= 2 {
					// A pairing rejected here has a bivalue roof corner, and
					// that corner is a floor corner of every later pairing, so
					// each of those fails its own floor check: leaving the loop
					// is the same as skipping the rest of it.
					// mutator-disable-next-line loop/break
					continue
				}

				// The extra corners must share a row or column
				exRow0, exCol0 := ex0/constants.GridSize, ex0%constants.GridSize
				exRow1, exCol1 := ex1/constants.GridSize, ex1%constants.GridSize

				// Check if d1 or d2 is confined to UR cells in the shared row/column
				if exRow0 == exRow1 {
					if m := tryURType4LineElimination(b, d1, d2, ex0, ex1, corners, bv0, bv1, exRow0, "row", true); m != nil {
						return m
					}
				}
				if exCol0 == exCol1 {
					if m := tryURType4LineElimination(b, d1, d2, ex0, ex1, corners, bv0, bv1, exCol0, "column", false); m != nil {
						return m
					}
				}
			}
		}
	}

	return nil
}

// tryURType4LineElimination handles the row-shared and column-shared cases of
// Unique Rectangle Type 4. It checks whether d1 or d2 is confined to the UR
// cells within the line at lineIdx (a row when byRow=true, a column otherwise),
// and if exactly one is confined, eliminates the other from the extra corners.
func tryURType4LineElimination(b BoardInterface, d1, d2, ex0, ex1 int, corners [4]int, bv0, bv1, lineIdx int, desc string, byRow bool) *core.Move {
	d1Confined := digitConfinedToCells(b, d1, lineIdx, ex0, ex1, byRow)
	d2Confined := digitConfinedToCells(b, d2, lineIdx, ex0, ex1, byRow)
	if d1Confined && !d2Confined {
		return buildURType4Move(b, d1, d2, d2, ex0, ex1, corners, bv0, bv1, lineIdx, desc)
	}
	if d2Confined && !d1Confined {
		return buildURType4Move(b, d1, d2, d1, ex0, ex1, corners, bv0, bv1, lineIdx, desc)
	}
	return nil
}

// digitConfinedToCells reports whether digit appears only at ex0 or ex1 within
// the line at lineIdx (a row when byRow=true, a column otherwise).
func digitConfinedToCells(b BoardInterface, digit, lineIdx, ex0, ex1 int, byRow bool) bool {
	for k := range constants.GridSize {
		var idx int
		if byRow {
			idx = lineIdx*constants.GridSize + k
		} else {
			idx = k*constants.GridSize + lineIdx
		}
		if idx == ex0 || idx == ex1 {
			continue
		}
		if b.GetCandidatesAt(idx).Has(digit) {
			return false
		}
	}
	return true
}

// buildURType4Move eliminates eliminateDigit from ex0 and ex1 if they hold it,
// returning the move. confinedDigit is the digit confined to UR cells; desc is
// "row" or "column"; lineIdx is the line index used in the explanation.
// Both extra corners hold d1 and d2 by construction, so both always yield an
// elimination and the move is never empty.
func buildURType4Move(b BoardInterface, d1, d2, eliminateDigit, ex0, ex1 int, corners [4]int, bv0, bv1, lineIdx int, desc string) *core.Move {
	var eliminations []core.Candidate
	er0, ec0 := ex0/constants.GridSize, ex0%constants.GridSize
	er1, ec1 := ex1/constants.GridSize, ex1%constants.GridSize
	if b.GetCandidatesAt(ex0).Has(eliminateDigit) {
		eliminations = append(eliminations, core.Candidate{Row: er0, Col: ec0, Digit: eliminateDigit})
	}
	if b.GetCandidatesAt(ex1).Has(eliminateDigit) {
		eliminations = append(eliminations, core.Candidate{Row: er1, Col: ec1, Digit: eliminateDigit})
	}
	confinedDigit := d1
	if eliminateDigit == d1 {
		confinedDigit = d2
	}
	targets := CellRefsFromIndices(corners[:]...)
	return &core.Move{
		Action:       "eliminate",
		Digit:        eliminateDigit,
		Targets:      targets,
		Eliminations: eliminations,
		Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d: %d confined to UR in %s %d: eliminate %d.",
			d1, d2, confinedDigit, desc, lineIdx+1, eliminateDigit),
		Highlights: core.Highlights{
			Primary:   CellRefsFromIndices(bv0, bv1),
			Secondary: CellRefsFromIndices(ex0, ex1),
		},
	}
}
