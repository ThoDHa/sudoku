package techniques

import (
	"fmt"

	"sudoku-api/internal/core"
)

// ============================================================================
// Skyscraper Detection
// ============================================================================
//
// A Skyscraper is a pattern involving two rows (or columns) where a digit
// appears exactly twice in each. One end of each pair shares a column (or row),
// forming the "base" of the skyscraper. The other ends (the "tops") are in
// different boxes. Any cell that sees both tops can have the digit eliminated.

// DetectSkyscraper finds Skyscraper pattern: two conjugate pairs sharing one end
func DetectSkyscraper(b BoardInterface) *core.Move {
	for digit := 1; digit <= 9; digit++ {
		// Find rows with exactly 2 candidates for this digit
		var rowPairs []struct {
			row  int
			cols [2]int
		}

		for row := 0; row < 9; row++ {
			var cols []int
			for col := 0; col < 9; col++ {
				if b.GetCandidatesAt(row*9 + col).Has(digit) {
					cols = append(cols, col)
				}
			}
			if len(cols) == 2 {
				rowPairs = append(rowPairs, struct {
					row  int
					cols [2]int
				}{row, [2]int{cols[0], cols[1]}})
			}
		}

		// Look for skyscraper patterns
		for i := 0; i < len(rowPairs); i++ {
			for j := i + 1; j < len(rowPairs); j++ {
				r1 := rowPairs[i]
				r2 := rowPairs[j]

				// Check if they share exactly one column
				shared := -1
				unshared1, unshared2 := -1, -1

				if r1.cols[0] == r2.cols[0] {
					shared = r1.cols[0]
					unshared1, unshared2 = r1.cols[1], r2.cols[1]
				} else if r1.cols[0] == r2.cols[1] {
					shared = r1.cols[0]
					unshared1, unshared2 = r1.cols[1], r2.cols[0]
				} else if r1.cols[1] == r2.cols[0] {
					shared = r1.cols[1]
					unshared1, unshared2 = r1.cols[0], r2.cols[1]
				} else if r1.cols[1] == r2.cols[1] {
					shared = r1.cols[1]
					unshared1, unshared2 = r1.cols[0], r2.cols[0]
				}

				if shared == -1 || unshared1 == unshared2 {
					continue
				}

				// The unshared ends must be in different boxes for a proper skyscraper
				box1 := (r1.row/3)*3 + unshared1/3
				box2 := (r2.row/3)*3 + unshared2/3
				if box1 == box2 {
					continue
				}

				// Find eliminations: cells that see both unshared ends
				var eliminations []core.Candidate
				for idx := 0; idx < 81; idx++ {
					if !b.GetCandidatesAt(idx).Has(digit) {
						continue
					}
					row, col := idx/9, idx%9
					if (row == r1.row && col == unshared1) || (row == r2.row && col == unshared2) {
						continue
					}

					// Check if sees both unshared ends
					seesEnd1 := ArePeers(idx, r1.row*9+unshared1)
					seesEnd2 := ArePeers(idx, r2.row*9+unshared2)

					if seesEnd1 && seesEnd2 {
						eliminations = append(eliminations, core.Candidate{
							Row: row, Col: col, Digit: digit,
						})
					}
				}

				if len(eliminations) > 0 {
					return &core.Move{
						Action: "eliminate",
						Digit:  digit,
						Targets: []core.CellRef{
							{Row: r1.row, Col: r1.cols[0]},
							{Row: r1.row, Col: r1.cols[1]},
							{Row: r2.row, Col: r2.cols[0]},
							{Row: r2.row, Col: r2.cols[1]},
						},
						Eliminations: eliminations,
						Explanation:  fmt.Sprintf("Skyscraper: %d with base in column %d", digit, shared+1),
						Highlights: core.Highlights{
							Primary: []core.CellRef{
								{Row: r1.row, Col: r1.cols[0]},
								{Row: r1.row, Col: r1.cols[1]},
								{Row: r2.row, Col: r2.cols[0]},
								{Row: r2.row, Col: r2.cols[1]},
							},
						},
					}
				}
			}
		}
	}

	return nil
}
