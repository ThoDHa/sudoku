package human

import (
	"fmt"

	"sudoku-api/internal/core"
	"sudoku-api/pkg/constants"
)

// Board represents the Sudoku board state with candidates
type Board struct {
	Cells      [81]int          // 0 for empty, 1-9 for filled
	Candidates [81]map[int]bool // possible values for each cell
	Eliminated [81]map[int]bool // candidates that have been eliminated (don't re-add)
}

// NewBoard creates a board from givens and initializes candidates
func NewBoard(givens []int) *Board {
	b := &Board{}
	for i := 0; i < 81; i++ {
		b.Cells[i] = givens[i]
		b.Candidates[i] = make(map[int]bool)
		b.Eliminated[i] = make(map[int]bool)
	}
	b.InitCandidates()
	return b
}

// NewBoardWithCandidates creates a board with pre-set candidates (for persisting eliminations)
// Does NOT auto-fill candidates - let FindNextMove handle that one at a time
func NewBoardWithCandidates(cells []int, candidates [][]int) *Board {
	b := &Board{}
	for i := 0; i < 81; i++ {
		b.Cells[i] = cells[i]
		b.Candidates[i] = make(map[int]bool)
		b.Eliminated[i] = make(map[int]bool)
		if candidates != nil && i < len(candidates) && candidates[i] != nil {
			for _, d := range candidates[i] {
				b.Candidates[i][d] = true
			}
		}
		// Mark candidates that could be valid but aren't present as eliminated
		// This preserves eliminations from previous moves
		if cells[i] == 0 && candidates != nil && i < len(candidates) && candidates[i] != nil && len(candidates[i]) > 0 {
			for d := 1; d <= 9; d++ {
				if b.canPlace(i, d) && !b.Candidates[i][d] {
					b.Eliminated[i][d] = true
				}
			}
		}
	}
	return b
}

// InitCandidates populates candidates for empty cells
func (b *Board) InitCandidates() {
	for i := 0; i < 81; i++ {
		if b.Cells[i] == 0 {
			b.Candidates[i] = make(map[int]bool)
			for d := 1; d <= 9; d++ {
				if b.canPlace(i, d) {
					b.Candidates[i][d] = true
				}
			}
		} else {
			b.Candidates[i] = make(map[int]bool)
		}
	}
}

func (b *Board) canPlace(idx, digit int) bool {
	row, col := idx/9, idx%9

	// Check row
	for c := 0; c < 9; c++ {
		if b.Cells[row*9+c] == digit {
			return false
		}
	}

	// Check column
	for r := 0; r < 9; r++ {
		if b.Cells[r*9+col] == digit {
			return false
		}
	}

	// Check box
	boxRow, boxCol := (row/3)*3, (col/3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			if b.Cells[r*9+c] == digit {
				return false
			}
		}
	}

	return true
}

// SetCell places a digit and updates candidates
func (b *Board) SetCell(idx, digit int) {
	b.Cells[idx] = digit
	b.Candidates[idx] = make(map[int]bool)
	// Clear eliminated for this cell since it's now filled
	b.Eliminated[idx] = make(map[int]bool)

	row, col := idx/9, idx%9

	// Remove from row and mark as eliminated
	for c := 0; c < 9; c++ {
		peerIdx := row*9 + c
		if b.Candidates[peerIdx][digit] {
			delete(b.Candidates[peerIdx], digit)
			if b.Eliminated[peerIdx] == nil {
				b.Eliminated[peerIdx] = make(map[int]bool)
			}
			b.Eliminated[peerIdx][digit] = true
		}
	}

	// Remove from column and mark as eliminated
	for r := 0; r < 9; r++ {
		peerIdx := r*9 + col
		if b.Candidates[peerIdx][digit] {
			delete(b.Candidates[peerIdx], digit)
			if b.Eliminated[peerIdx] == nil {
				b.Eliminated[peerIdx] = make(map[int]bool)
			}
			b.Eliminated[peerIdx][digit] = true
		}
	}

	// Remove from box and mark as eliminated
	boxRow, boxCol := (row/3)*3, (col/3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			peerIdx := r*9 + c
			if b.Candidates[peerIdx][digit] {
				delete(b.Candidates[peerIdx], digit)
				if b.Eliminated[peerIdx] == nil {
					b.Eliminated[peerIdx] = make(map[int]bool)
				}
				b.Eliminated[peerIdx][digit] = true
			}
		}
	}
}

// RemoveCandidate removes a candidate from a cell and marks it as eliminated
func (b *Board) RemoveCandidate(idx, digit int) bool {
	if b.Candidates[idx][digit] {
		delete(b.Candidates[idx], digit)
		// Mark as eliminated so it won't be re-added
		if b.Eliminated[idx] == nil {
			b.Eliminated[idx] = make(map[int]bool)
		}
		b.Eliminated[idx][digit] = true
		return true
	}
	return false
}

// IsSolved returns true if all cells are filled
func (b *Board) IsSolved() bool {
	for i := 0; i < 81; i++ {
		if b.Cells[i] == 0 {
			return false
		}
	}
	return true
}

// Clone creates a deep copy of the board
func (b *Board) Clone() *Board {
	nb := &Board{}
	copy(nb.Cells[:], b.Cells[:])
	for i := 0; i < 81; i++ {
		nb.Candidates[i] = make(map[int]bool)
		for k, v := range b.Candidates[i] {
			nb.Candidates[i][k] = v
		}
		nb.Eliminated[i] = make(map[int]bool)
		for k, v := range b.Eliminated[i] {
			nb.Eliminated[i][k] = v
		}
	}
	return nb
}

// GetCells returns cells as a slice
func (b *Board) GetCells() []int {
	result := make([]int, 81)
	copy(result, b.Cells[:])
	return result
}

// ClearCell removes a digit from a cell and recalculates candidates for that cell
// This is used when fixing user errors - we want to keep solver progress but undo the bad placement
func (b *Board) ClearCell(idx int) {
	if idx < 0 || idx >= 81 {
		return
	}
	
	// Clear the cell value
	b.Cells[idx] = 0
	
	// Recalculate candidates for this cell based on current board state
	b.Candidates[idx] = make(map[int]bool)
	b.Eliminated[idx] = make(map[int]bool)
	for d := 1; d <= 9; d++ {
		if b.canPlace(idx, d) {
			b.Candidates[idx][d] = true
		}
	}
}

// GetCandidates returns candidates as a 2D slice
func (b *Board) GetCandidates() [][]int {
	result := make([][]int, 81)
	for i := 0; i < 81; i++ {
		for d := range b.Candidates[i] {
			result[i] = append(result[i], d)
		}
	}
	return result
}

// GetEliminated returns eliminated candidates as a 2D slice
func (b *Board) GetEliminated() [][]int {
	result := make([][]int, 81)
	for i := 0; i < 81; i++ {
		for d := range b.Eliminated[i] {
			result[i] = append(result[i], d)
		}
	}
	return result
}

// NewBoardWithCandidatesAndEliminated creates a board with pre-set candidates and eliminated
func NewBoardWithCandidatesAndEliminated(cells []int, candidates [][]int, eliminated [][]int) *Board {
	b := &Board{}
	for i := 0; i < 81; i++ {
		b.Cells[i] = cells[i]
		b.Candidates[i] = make(map[int]bool)
		b.Eliminated[i] = make(map[int]bool)
		if candidates != nil && i < len(candidates) && candidates[i] != nil {
			for _, d := range candidates[i] {
				b.Candidates[i][d] = true
			}
		}
		if eliminated != nil && i < len(eliminated) && eliminated[i] != nil {
			for _, d := range eliminated[i] {
				b.Eliminated[i][d] = true
			}
		}
	}
	return b
}

// Technique represents a solving technique
type Technique struct {
	Name     string
	Slug     string
	Tier     string // constants.TierSimple, TierMedium, TierHard, TierExtreme
	Detect   func(b *Board) *core.Move
}

// TechniqueDifficultyLevel maps technique tiers to puzzle difficulties
// A puzzle of a given difficulty can only use techniques up to and including its tier
var TechniqueTierToDifficulty = map[string]core.Difficulty{
	constants.TierSimple:  core.DifficultyEasy,
	constants.TierMedium:  core.DifficultyMedium,
	constants.TierHard:    core.DifficultyExtreme,
	constants.TierExtreme: core.DifficultyImpossible,
}

// DifficultyAllowedTiers maps puzzle difficulty to allowed technique tiers
var DifficultyAllowedTiers = map[core.Difficulty][]string{
	core.DifficultyEasy:       {constants.TierSimple},
	core.DifficultyMedium:     {constants.TierSimple, constants.TierMedium},
	core.DifficultyHard:       {constants.TierSimple, constants.TierMedium, constants.TierHard},
	core.DifficultyExtreme:    {constants.TierSimple, constants.TierMedium, constants.TierHard},
	core.DifficultyImpossible: {constants.TierSimple, constants.TierMedium, constants.TierHard, constants.TierExtreme},
}

// Solver holds the technique registry and orchestrates solving
type Solver struct {
	techniques []Technique
}

// NewSolver creates a solver with all techniques registered
func NewSolver() *Solver {
	s := &Solver{}
	s.registerTechniques()
	return s
}

func (s *Solver) registerTechniques() {
	// Simple tier - eliminations first, then assignments
	// This ensures users see WHY a cell has only one candidate before filling it
	s.techniques = append(s.techniques,
		Technique{"Pointing Pair", "pointing-pair", constants.TierSimple, detectPointingPair},
		Technique{"Box-Line Reduction", "box-line-reduction", constants.TierSimple, detectBoxLineReduction},
		Technique{"Naked Pair", "naked-pair", constants.TierSimple, detectNakedPair},
		Technique{"Hidden Pair", "hidden-pair", constants.TierSimple, detectHiddenPair},
		Technique{"Naked Single", "naked-single", constants.TierSimple, detectNakedSingle},
		Technique{"Hidden Single", "hidden-single", constants.TierSimple, detectHiddenSingle},
	)

	// Medium tier
	s.techniques = append(s.techniques,
		Technique{"Naked Triple", "naked-triple", constants.TierMedium, detectNakedTriple},
		Technique{"Hidden Triple", "hidden-triple", constants.TierMedium, detectHiddenTriple},
		Technique{"Naked Quad", "naked-quad", constants.TierMedium, detectNakedQuad},
		Technique{"Hidden Quad", "hidden-quad", constants.TierMedium, detectHiddenQuad},
		Technique{"X-Wing", "x-wing", constants.TierMedium, detectXWing},
		Technique{"XY-Wing", "xy-wing", constants.TierMedium, detectXYWing},
		Technique{"Simple Coloring", "simple-coloring", constants.TierMedium, detectSimpleColoring},
	)

	// Hard tier - advanced techniques for expert puzzles
	s.techniques = append(s.techniques,
		Technique{"Swordfish", "swordfish", constants.TierHard, detectSwordfish},
		Technique{"Skyscraper", "skyscraper", constants.TierHard, detectSkyscraper},
		Technique{"Finned X-Wing", "finned-x-wing", constants.TierHard, detectFinnedXWing},
		Technique{"Finned Swordfish", "finned-swordfish", constants.TierHard, detectFinnedSwordfish},
		Technique{"Unique Rectangle", "unique-rectangle", constants.TierHard, detectUniqueRectangle},
		Technique{"BUG", "bug", constants.TierHard, detectBUG},
		Technique{"Jellyfish", "jellyfish", constants.TierHard, detectJellyfish},
		Technique{"X-Chain", "x-chain", constants.TierHard, detectXChain},
		Technique{"XY-Chain", "xy-chain", constants.TierHard, detectXYChain},
		Technique{"W-Wing", "w-wing", constants.TierHard, detectWWing},
		Technique{"Empty Rectangle", "empty-rectangle", constants.TierHard, detectEmptyRectangle},
		Technique{"XYZ-Wing", "xyz-wing", constants.TierHard, detectXYZWing},
		Technique{"WXYZ-Wing", "wxyz-wing", constants.TierHard, detectWXYZWing},
		Technique{"ALS-XZ", "als-xz", constants.TierHard, detectALSXZ},
		Technique{"Remote Pairs", "remote-pairs", constants.TierHard, detectRemotePairs},
		Technique{"Unique Rectangle Type 2", "unique-rectangle-type-2", constants.TierHard, detectUniqueRectangleType2},
		Technique{"Unique Rectangle Type 3", "unique-rectangle-type-3", constants.TierHard, detectUniqueRectangleType3},
		Technique{"Unique Rectangle Type 4", "unique-rectangle-type-4", constants.TierHard, detectUniqueRectangleType4},
	)

	// Extreme tier - techniques only for "impossible" difficulty puzzles
	s.techniques = append(s.techniques,
		Technique{"Sue de Coq", "sue-de-coq", constants.TierExtreme, detectSueDeCoq},
		Technique{"3D Medusa", "medusa-3d", constants.TierExtreme, detectMedusa3D},
		Technique{"Grouped X-Cycles", "grouped-x-cycles", constants.TierExtreme, detectGroupedXCycles},
		Technique{"AIC", "aic", constants.TierExtreme, detectAIC},
		Technique{"ALS-XY-Wing", "als-xy-wing", constants.TierExtreme, detectALSXYWing},
		Technique{"ALS-XY-Chain", "als-xy-chain", constants.TierExtreme, detectALSXYChain},
		Technique{"Forcing Chain", "forcing-chain", constants.TierExtreme, detectForcingChain},
		Technique{"Digit Forcing Chain", "digit-forcing-chain", constants.TierExtreme, detectDigitForcingChain},
		Technique{"Death Blossom", "death-blossom", constants.TierExtreme, detectDeathBlossom},
	)
}

// FindNextMove finds the next applicable move using simple-first strategy
func (s *Solver) FindNextMove(b *Board) *core.Move {
	// First, check if any empty cell is missing a valid candidate
	// Add candidates one at a time, scanning by DIGIT first (human-like behavior)
	// A human thinks: "Where can 1 go? Where can 2 go?" etc.
	// But don't re-add candidates that were previously eliminated
	for d := 1; d <= 9; d++ {
		for i := 0; i < 81; i++ {
			if b.Cells[i] != 0 {
				continue
			}
			
			row, col := i/9, i%9
			
			// Only add if: can place AND not already a candidate AND not eliminated
			if b.canPlace(i, d) && !b.Candidates[i][d] && !b.Eliminated[i][d] {
				// Before returning a fill-candidate move, check if this cell should be assigned immediately
				
				// Check for naked single: count total valid candidates for this cell
				// (including ones we haven't added yet but excluding eliminated ones)
				validCount := 0
				var onlyValidDigit int
				for digit := 1; digit <= 9; digit++ {
					if b.canPlace(i, digit) && !b.Eliminated[i][digit] {
						validCount++
						onlyValidDigit = digit
					}
				}
				
				if validCount == 1 {
					// This cell can only have one digit - naked single!
					return &core.Move{
						Technique:   "naked-single",
						Action:      "assign",
						Digit:       onlyValidDigit,
						Targets:     []core.CellRef{{Row: row, Col: col}},
						Explanation: fmt.Sprintf("R%dC%d can only be %d (naked single)", row+1, col+1, onlyValidDigit),
						Highlights: core.Highlights{
							Primary: []core.CellRef{{Row: row, Col: col}},
						},
						Refs: core.TechniqueRef{
							Title: "Naked Single",
							Slug:  "naked-single",
							URL:   "/technique/naked-single",
						},
					}
				}
				
				// Check for hidden single: this digit can only go in one place in row/col/box
				if move := s.checkHiddenSingleForDigitImmediate(b, i, d); move != nil {
					return move
				}
				
				// No immediate assignment - return the fill-candidate move
				return &core.Move{
					Technique:   "fill-candidate",
					Action:      "candidate",
					Digit:       d,
					Targets:     []core.CellRef{{Row: row, Col: col}},
					Explanation: fmt.Sprintf("Added %d as a candidate to R%dC%d", d, row+1, col+1),
					Highlights: core.Highlights{
						Primary: []core.CellRef{{Row: row, Col: col}},
					},
					Refs: core.TechniqueRef{
						Title: "Fill Candidate",
						Slug:  "fill-candidate",
						URL:   "",
					},
				}
			}
		}
	}

	// Check for contradictions (cells with no candidates)
	for i := 0; i < 81; i++ {
		if b.Cells[i] == 0 && len(b.Candidates[i]) == 0 {
			row, col := i/9, i%9
			return &core.Move{
				Technique:   "contradiction",
				Action:      "contradiction",
				Digit:       0,
				Targets:     []core.CellRef{{Row: row, Col: col}},
				Explanation: fmt.Sprintf("Contradiction: R%dC%d has no valid candidates. A previous move was incorrect.", row+1, col+1),
				Highlights: core.Highlights{
					Primary: []core.CellRef{{Row: row, Col: col}},
				},
				Refs: core.TechniqueRef{
					Title: "Contradiction",
					Slug:  "contradiction",
					URL:   "",
				},
			}
		}
	}

	// Try simple techniques first
	for _, t := range s.techniques {
		if t.Tier == constants.TierSimple {
			if move := t.Detect(b); move != nil {
				move.Technique = t.Slug
				move.Refs = core.TechniqueRef{
					Title: t.Name,
					Slug:  t.Slug,
					URL:   fmt.Sprintf("/technique/%s", t.Slug),
				}
				return move
			}
		}
	}

	// Try medium techniques, then return to simple
	for _, t := range s.techniques {
		if t.Tier == constants.TierMedium {
			if move := t.Detect(b); move != nil {
				move.Technique = t.Slug
				move.Refs = core.TechniqueRef{
					Title: t.Name,
					Slug:  t.Slug,
					URL:   fmt.Sprintf("/technique/%s", t.Slug),
				}
				return move
			}
		}
	}

	// Try hard techniques
	for _, t := range s.techniques {
		if t.Tier == constants.TierHard {
			if move := t.Detect(b); move != nil {
				move.Technique = t.Slug
				move.Refs = core.TechniqueRef{
					Title: t.Name,
					Slug:  t.Slug,
					URL:   fmt.Sprintf("/technique/%s", t.Slug),
				}
				return move
			}
		}
	}

	// Try extreme techniques
	for _, t := range s.techniques {
		if t.Tier == constants.TierExtreme {
			if move := t.Detect(b); move != nil {
				move.Technique = t.Slug
				move.Refs = core.TechniqueRef{
					Title: t.Name,
					Slug:  t.Slug,
					URL:   fmt.Sprintf("/technique/%s", t.Slug),
				}
				return move
			}
		}
	}

	return nil
}

// checkHiddenSingleForDigitImmediate checks if digit d at cell idx is a hidden single
// by looking at all POTENTIAL placements (not just current candidates)
// This is used during candidate-filling to detect immediate assignments
func (s *Solver) checkHiddenSingleForDigitImmediate(b *Board, idx, d int) *core.Move {
	row, col := idx/9, idx%9
	
	// Helper to check if digit d can potentially go in a cell
	canPlaceDigit := func(cellIdx, digit int) bool {
		if b.Cells[cellIdx] != 0 {
			return false // Cell already filled
		}
		if b.Eliminated[cellIdx][digit] {
			return false // Previously eliminated
		}
		return b.canPlace(cellIdx, digit)
	}
	
	// Check row: is this the only place for digit d in this row?
	rowCount := 0
	for c := 0; c < 9; c++ {
		cellIdx := row*9 + c
		if b.Cells[cellIdx] == d {
			rowCount = 99 // Already placed
			break
		}
		if canPlaceDigit(cellIdx, d) {
			rowCount++
		}
	}
	if rowCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In row %d, %d can only go in R%dC%d (hidden single)", row+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getRowCellsInternal(row),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}
	
	// Check column: is this the only place for digit d in this column?
	colCount := 0
	for r := 0; r < 9; r++ {
		cellIdx := r*9 + col
		if b.Cells[cellIdx] == d {
			colCount = 99
			break
		}
		if canPlaceDigit(cellIdx, d) {
			colCount++
		}
	}
	if colCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In column %d, %d can only go in R%dC%d (hidden single)", col+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getColCellsInternal(col),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}
	
	// Check box: is this the only place for digit d in this box?
	boxRow, boxCol := (row/3)*3, (col/3)*3
	boxNum := (row/3)*3 + col/3
	boxCount := 0
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			cellIdx := r*9 + c
			if b.Cells[cellIdx] == d {
				boxCount = 99
				break
			}
			if canPlaceDigit(cellIdx, d) {
				boxCount++
			}
		}
		if boxCount == 99 {
			break
		}
	}
	if boxCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In box %d, %d can only go in R%dC%d (hidden single)", boxNum+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getBoxCellsInternal(boxNum),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}
	
	return nil
}

// checkHiddenSingleForDigit checks if digit d at cell idx is a hidden single
// (the only place for d in its row, column, or box)
func (s *Solver) checkHiddenSingleForDigit(b *Board, idx, d int) *core.Move {
	row, col := idx/9, idx%9
	
	// Check row: is this the only place for digit d in this row?
	rowCount := 0
	for c := 0; c < 9; c++ {
		cellIdx := row*9 + c
		if b.Cells[cellIdx] == d {
			rowCount = 99 // Already placed
			break
		}
		if b.Candidates[cellIdx][d] {
			rowCount++
		}
	}
	if rowCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In row %d, %d can only go in R%dC%d (hidden single)", row+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getRowCellsInternal(row),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}
	
	// Check column: is this the only place for digit d in this column?
	colCount := 0
	for r := 0; r < 9; r++ {
		cellIdx := r*9 + col
		if b.Cells[cellIdx] == d {
			colCount = 99
			break
		}
		if b.Candidates[cellIdx][d] {
			colCount++
		}
	}
	if colCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In column %d, %d can only go in R%dC%d (hidden single)", col+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getColCellsInternal(col),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}
	
	// Check box: is this the only place for digit d in this box?
	boxRow, boxCol := (row/3)*3, (col/3)*3
	boxNum := (row/3)*3 + col/3
	boxCount := 0
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			cellIdx := r*9 + c
			if b.Cells[cellIdx] == d {
				boxCount = 99
				break
			}
			if b.Candidates[cellIdx][d] {
				boxCount++
			}
		}
		if boxCount == 99 {
			break
		}
	}
	if boxCount == 1 {
		return &core.Move{
			Technique:   "hidden-single",
			Action:      "assign",
			Digit:       d,
			Targets:     []core.CellRef{{Row: row, Col: col}},
			Explanation: fmt.Sprintf("In box %d, %d can only go in R%dC%d (hidden single)", boxNum+1, d, row+1, col+1),
			Highlights: core.Highlights{
				Primary:   []core.CellRef{{Row: row, Col: col}},
				Secondary: getBoxCellsInternal(boxNum),
			},
			Refs: core.TechniqueRef{
				Title: "Hidden Single",
				Slug:  "hidden-single",
				URL:   "/technique/hidden-single",
			},
		}
	}
	
	return nil
}

// Helper functions for internal use (to avoid import cycle with techniques_simple.go)
func getRowCellsInternal(row int) []core.CellRef {
	cells := make([]core.CellRef, 9)
	for c := 0; c < 9; c++ {
		cells[c] = core.CellRef{Row: row, Col: c}
	}
	return cells
}

func getColCellsInternal(col int) []core.CellRef {
	cells := make([]core.CellRef, 9)
	for r := 0; r < 9; r++ {
		cells[r] = core.CellRef{Row: r, Col: col}
	}
	return cells
}

func getBoxCellsInternal(box int) []core.CellRef {
	cells := make([]core.CellRef, 0, 9)
	boxRow, boxCol := (box/3)*3, (box%3)*3
	for r := boxRow; r < boxRow+3; r++ {
		for c := boxCol; c < boxCol+3; c++ {
			cells = append(cells, core.CellRef{Row: r, Col: c})
		}
	}
	return cells
}

// ApplyMove applies a move to the board
func (s *Solver) ApplyMove(b *Board, move *core.Move) {
	if move.Action == constants.ActionAssign {
		for _, target := range move.Targets {
			b.SetCell(target.Row*9+target.Col, move.Digit)
		}
	} else if move.Action == constants.ActionEliminate {
		for _, elim := range move.Eliminations {
			b.RemoveCandidate(elim.Row*9+elim.Col, elim.Digit)
		}
	} else if move.Action == "candidate" {
		// Add a candidate to a cell
		for _, target := range move.Targets {
			idx := target.Row*9 + target.Col
			if b.Candidates[idx] == nil {
				b.Candidates[idx] = make(map[int]bool)
			}
			b.Candidates[idx][move.Digit] = true
		}
	}
	// "contradiction" action doesn't change the board - it signals the frontend to backtrack
}

// SolveWithSteps attempts to solve using human techniques, returning all moves
func (s *Solver) SolveWithSteps(b *Board, maxSteps int) ([]core.Move, string) {
	var moves []core.Move
	step := 0

	for step < maxSteps && !b.IsSolved() {
		move := s.FindNextMove(b)
		if move == nil {
			return moves, constants.StatusStalled
		}

		move.StepIndex = step
		s.ApplyMove(b, move)
		moves = append(moves, *move)
		step++
	}

	if b.IsSolved() {
		return moves, constants.StatusCompleted
	}
	return moves, constants.StatusMaxStepsReached
}

// GetTechniqueTier returns the tier of a technique by its slug
func (s *Solver) GetTechniqueTier(slug string) string {
	for _, t := range s.techniques {
		if t.Slug == slug {
			return t.Tier
		}
	}
	return ""
}

// AnalyzePuzzleDifficulty solves the puzzle and returns the required difficulty level
// based on the techniques used. Returns the minimum difficulty needed and technique counts.
func (s *Solver) AnalyzePuzzleDifficulty(givens []int) (core.Difficulty, map[string]int, string) {
	b := NewBoard(givens)
	moves, status := s.SolveWithSteps(b, constants.MaxSolverSteps)

	if status != constants.StatusCompleted {
		return "", nil, status
	}

	techniqueCounts := make(map[string]int)
	highestTier := constants.TierSimple

	tierOrder := map[string]int{
		constants.TierSimple:  0,
		constants.TierMedium:  1,
		constants.TierHard:    2,
		constants.TierExtreme: 3,
	}

	for _, move := range moves {
		techniqueCounts[move.Technique]++
		tier := s.GetTechniqueTier(move.Technique)
		if tierOrder[tier] > tierOrder[highestTier] {
			highestTier = tier
		}
	}

	// Map tier to difficulty
	var requiredDifficulty core.Difficulty
	switch highestTier {
	case constants.TierSimple:
		requiredDifficulty = core.DifficultyEasy
	case constants.TierMedium:
		requiredDifficulty = core.DifficultyMedium
	case constants.TierHard:
		requiredDifficulty = core.DifficultyExtreme
	case constants.TierExtreme:
		requiredDifficulty = core.DifficultyImpossible
	}

	return requiredDifficulty, techniqueCounts, constants.StatusCompleted
}

// RequiresExtremeTechniques checks if solving the puzzle requires extreme techniques
func (s *Solver) RequiresExtremeTechniques(givens []int) bool {
	difficulty, _, status := s.AnalyzePuzzleDifficulty(givens)
	return status == constants.StatusCompleted && difficulty == core.DifficultyImpossible
}

// CanSolveWithDifficulty checks if puzzle can be solved using only techniques
// allowed for the given difficulty level
func (s *Solver) CanSolveWithDifficulty(givens []int, targetDifficulty core.Difficulty) bool {
	difficulty, _, status := s.AnalyzePuzzleDifficulty(givens)
	if status != constants.StatusCompleted {
		return false
	}

	difficultyOrder := map[core.Difficulty]int{
		core.DifficultyEasy:       0,
		core.DifficultyMedium:     1,
		core.DifficultyHard:       2,
		core.DifficultyExtreme:    3,
		core.DifficultyImpossible: 4,
	}

	return difficultyOrder[difficulty] <= difficultyOrder[targetDifficulty]
}
