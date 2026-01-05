package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
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
var urFloorRoofPairs = [][2][2]int{
	{{0, 1}, {2, 3}}, // floor = row 1, roof = row 2
	{{2, 3}, {0, 1}}, // floor = row 2, roof = row 1
	{{0, 2}, {1, 3}}, // floor = col 1, roof = col 2
	{{1, 3}, {0, 2}}, // floor = col 2, roof = col 1
}

// findURRectangles finds all valid Unique Rectangle configurations for digits d1, d2.
// A UR rectangle has 4 cells forming a rectangle across exactly 2 boxes.
func findURRectangles(b BoardInterface, d1, d2 int) []urRectangle {
	// Find all cells that have both d1 and d2 as candidates
	var cells []int
	for i := 0; i < 81; i++ {
		if b.GetCandidatesAt(i).Has(d1) && b.GetCandidatesAt(i).Has(d2) {
			cells = append(cells, i)
		}
	}

	if len(cells) < 4 {
		return nil
	}

	var rectangles []urRectangle

	// Try all combinations of 4 cells that form a rectangle spanning exactly 2 boxes
	for i := 0; i < len(cells); i++ {
		for j := i + 1; j < len(cells); j++ {
			r1, c1 := cells[i]/9, cells[i]%9
			r2, c2 := cells[j]/9, cells[j]%9

			// Must be in same row
			if r1 != r2 {
				continue
			}
			// Columns must be different
			if c1 == c2 {
				continue
			}

			// Look for matching cells in a different row
			for k := j + 1; k < len(cells); k++ {
				for l := k + 1; l < len(cells); l++ {
					r3, c3 := cells[k]/9, cells[k]%9
					r4, c4 := cells[l]/9, cells[l]%9

					// These two must be in the same row
					if r3 != r4 {
						continue
					}
					// Different row than r1
					if r3 == r1 {
						continue
					}
					// Columns must match c1 and c2
					if (c3 != c1 || c4 != c2) && (c3 != c2 || c4 != c1) {
						continue
					}

					// Check that the rectangle spans exactly 2 boxes
					box1 := (r1/3)*3 + c1/3
					box2 := (r1/3)*3 + c2/3
					box3 := (r3/3)*3 + c3/3
					box4 := (r3/3)*3 + c4/3
					boxes := make(map[int]bool)
					boxes[box1] = true
					boxes[box2] = true
					boxes[box3] = true
					boxes[box4] = true
					if len(boxes) != 2 {
						continue
					}

					// Order corners: [0]=(r1,c1), [1]=(r1,c2), [2]=(r3,c1), [3]=(r3,c2)
					var corners [4]int
					corners[0] = cells[i] // (r1, c1)
					corners[1] = cells[j] // (r1, c2)
					if c3 == c1 {
						corners[2] = cells[k] // (r3, c1)
						corners[3] = cells[l] // (r3, c2)
					} else {
						corners[2] = cells[l] // (r3, c1)
						corners[3] = cells[k] // (r3, c2)
					}

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
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
			for _, rect := range findURRectangles(b, d1, d2) {
				// Count how many corners are bivalue (exactly d1 and d2)
				bivalueCount := 0
				nonBivalueIdx := -1
				for _, corner := range rect.corners {
					if b.GetCandidatesAt(corner).Count() == 2 {
						bivalueCount++
					} else if b.GetCandidatesAt(corner).Count() > 2 {
						nonBivalueIdx = corner
					}
				}

				// Type 1 UR: exactly 3 bivalue corners, 1 with extra candidates
				if bivalueCount == 3 && nonBivalueIdx != -1 {
					row, col := nonBivalueIdx/9, nonBivalueIdx%9
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
	}

	return nil
}

// DetectUniqueRectangleType2 finds UR Type 2 patterns
// 4 cells forming a rectangle across 2 boxes
// 2 diagonal corners are bivalue with {A,B}
// Other 2 corners have {A,B} plus one extra candidate X (same extra in both)
// Eliminate X from cells that see BOTH corners with extra candidates
func DetectUniqueRectangleType2(b BoardInterface) *core.Move {
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
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

					// Check if roof corners have extras
					cands0 := b.GetCandidatesAt(corners[roofPair[0]])
					cands1 := b.GetCandidatesAt(corners[roofPair[1]])

					if cands0.Count() <= 2 || cands1.Count() <= 2 {
						continue
					}

					// Find extras (candidates beyond d1 and d2)
					var extras0, extras1 []int
					for _, d := range cands0.ToSlice() {
						if d != d1 && d != d2 {
							extras0 = append(extras0, d)
						}
					}
					for _, d := range cands1.ToSlice() {
						if d != d1 && d != d2 {
							extras1 = append(extras1, d)
						}
					}

					// Type 2: both roof cells have exactly one extra, and it's the same digit
					if len(extras0) != 1 || len(extras1) != 1 || extras0[0] != extras1[0] {
						continue
					}

					extraDigit := extras0[0]
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
								d1, d2, extraDigit, extraDigit, roofCorner0/9+1, roofCorner0%9+1, roofCorner1/9+1, roofCorner1%9+1),
							Highlights: core.Highlights{
								Primary:   CellRefsFromIndices(corners[floorPair[0]], corners[floorPair[1]]),
								Secondary: CellRefsFromIndices(roofCorner0, roofCorner1),
							},
						}
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
func DetectUniqueRectangleType3(b BoardInterface) *core.Move {
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
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

					if b.GetCandidatesAt(roofCorner0).Count() <= 2 && b.GetCandidatesAt(roofCorner1).Count() <= 2 {
						continue
					}

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
					row0, col0 := roofCorner0/9, roofCorner0%9
					row1, col1 := roofCorner1/9, roofCorner1%9
					box0 := (row0/3)*3 + col0/3
					box1 := (row1/3)*3 + col1/3

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
													Row: elimIdx / 9, Col: elimIdx % 9, Digit: d,
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
												d1, d2, extraSlice, idx/9+1, idx%9+1, unit.unitType),
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
								// Cell must have only candidates from extraSlice (subset)
								cellCands := b.GetCandidatesAt(idx)
								if cellCands.Count() < 2 || cellCands.Count() > 3 {
									continue
								}
								isSubset := true
								for _, d := range cellCands.ToSlice() {
									if !combinedExtras.Has(d) {
										isSubset = false
										break
									}
								}
								if isSubset {
									candidateCells = append(candidateCells, idx)
								}
							}

							// For naked triple, we need exactly 2 more cells (pseudo-cell counts as 1)
							if len(extraSlice) == 3 && len(candidateCells) >= 2 {
								// Try pairs of candidate cells
								for ci := 0; ci < len(candidateCells); ci++ {
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
														Row: elimIdx / 9, Col: elimIdx % 9, Digit: d,
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
													d1, d2, idx1/9+1, idx1%9+1, idx2/9+1, idx2%9+1, unit.unitType),
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
	}

	return nil
}

// DetectUniqueRectangleType4 finds UR Type 4 patterns
// Two corners with just {A,B}, two corners with {A,B,+extras}
// If one of A or B is confined to the UR cells within a row/column,
// the other can be eliminated from the extra corners
func DetectUniqueRectangleType4(b BoardInterface) *core.Move {
	for d1 := 1; d1 <= 8; d1++ {
		for d2 := d1 + 1; d2 <= 9; d2++ {
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
						continue
					}

					// The extra corners must share a row or column
					exRow0, exCol0 := ex0/9, ex0%9
					exRow1, exCol1 := ex1/9, ex1%9

					// Check if d1 or d2 is confined to UR cells in the shared row/column
					// For the row containing extra corners
					if exRow0 == exRow1 {
						row := exRow0
						// Check if d1 appears only in UR cells in this row
						d1OnlyInUR := true
						d2OnlyInUR := true
						for c := 0; c < 9; c++ {
							idx := row*9 + c
							if idx == ex0 || idx == ex1 {
								continue
							}
							if b.GetCandidatesAt(idx).Has(d1) {
								d1OnlyInUR = false
							}
							if b.GetCandidatesAt(idx).Has(d2) {
								d2OnlyInUR = false
							}
						}

						if d1OnlyInUR && !d2OnlyInUR {
							// d1 confined to UR, eliminate d2 from extra corners
							var eliminations []core.Candidate
							if b.GetCandidatesAt(ex0).Has(d2) {
								eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d2})
							}
							if b.GetCandidatesAt(ex1).Has(d2) {
								eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d2})
							}

							if len(eliminations) > 0 {
								targets := CellRefsFromIndices(corners[:]...)

								return &core.Move{
									Action:       "eliminate",
									Digit:        d2,
									Targets:      targets,
									Eliminations: eliminations,
									Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d: %d confined to UR in row %d: eliminate %d.",
										d1, d2, d1, row+1, d2),
									Highlights: core.Highlights{
										Primary:   CellRefsFromIndices(bv0, bv1),
										Secondary: CellRefsFromIndices(ex0, ex1),
									},
								}
							}
						}

						if d2OnlyInUR && !d1OnlyInUR {
							// d2 confined to UR, eliminate d1 from extra corners
							var eliminations []core.Candidate
							if b.GetCandidatesAt(ex0).Has(d1) {
								eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d1})
							}
							if b.GetCandidatesAt(ex1).Has(d1) {
								eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d1})
							}

							if len(eliminations) > 0 {
								targets := CellRefsFromIndices(corners[:]...)

								return &core.Move{
									Action:       "eliminate",
									Digit:        d1,
									Targets:      targets,
									Eliminations: eliminations,
									Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d: %d confined to UR in row %d: eliminate %d.",
										d1, d2, d2, row+1, d1),
									Highlights: core.Highlights{
										Primary:   CellRefsFromIndices(bv0, bv1),
										Secondary: CellRefsFromIndices(ex0, ex1),
									},
								}
							}
						}
					}

					// For the column containing extra corners
					if exCol0 == exCol1 {
						col := exCol0
						// Check if d1 appears only in UR cells in this column
						d1OnlyInUR := true
						d2OnlyInUR := true
						for r := 0; r < 9; r++ {
							idx := r*9 + col
							if idx == ex0 || idx == ex1 {
								continue
							}
							if b.GetCandidatesAt(idx).Has(d1) {
								d1OnlyInUR = false
							}
							if b.GetCandidatesAt(idx).Has(d2) {
								d2OnlyInUR = false
							}
						}

						if d1OnlyInUR && !d2OnlyInUR {
							// d1 confined to UR, eliminate d2 from extra corners
							var eliminations []core.Candidate
							if b.GetCandidatesAt(ex0).Has(d2) {
								eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d2})
							}
							if b.GetCandidatesAt(ex1).Has(d2) {
								eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d2})
							}

							if len(eliminations) > 0 {
								targets := CellRefsFromIndices(corners[:]...)

								return &core.Move{
									Action:       "eliminate",
									Digit:        d2,
									Targets:      targets,
									Eliminations: eliminations,
									Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d: %d confined to UR in column %d: eliminate %d.",
										d1, d2, d1, col+1, d2),
									Highlights: core.Highlights{
										Primary:   CellRefsFromIndices(bv0, bv1),
										Secondary: CellRefsFromIndices(ex0, ex1),
									},
								}
							}
						}

						if d2OnlyInUR && !d1OnlyInUR {
							// d2 confined to UR, eliminate d1 from extra corners
							var eliminations []core.Candidate
							if b.GetCandidatesAt(ex0).Has(d1) {
								eliminations = append(eliminations, core.Candidate{Row: exRow0, Col: exCol0, Digit: d1})
							}
							if b.GetCandidatesAt(ex1).Has(d1) {
								eliminations = append(eliminations, core.Candidate{Row: exRow1, Col: exCol1, Digit: d1})
							}

							if len(eliminations) > 0 {
								targets := CellRefsFromIndices(corners[:]...)

								return &core.Move{
									Action:       "eliminate",
									Digit:        d1,
									Targets:      targets,
									Eliminations: eliminations,
									Explanation: fmt.Sprintf("Unique Rectangle Type 4: %d/%d: %d confined to UR in column %d: eliminate %d.",
										d1, d2, d2, col+1, d1),
									Highlights: core.Highlights{
										Primary:   CellRefsFromIndices(bv0, bv1),
										Secondary: CellRefsFromIndices(ex0, ex1),
									},
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
