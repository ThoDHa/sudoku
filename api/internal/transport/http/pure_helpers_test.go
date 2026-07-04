package http

import (
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"sudoku-api/internal/core"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
)

var hexPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func TestHashSeedIsDeterministicAndVariesByInput(t *testing.T) {
	first := hashSeed("practice-seed-123")
	sameAgain := hashSeed("practice-seed-123")
	other := hashSeed("practice-seed-999")

	if first != sameAgain {
		t.Errorf("hashSeed must be deterministic: got %d then %d", first, sameAgain)
	}
	if first == other {
		t.Errorf("hashSeed should differ for different seeds, both gave %d", first)
	}
}

func TestHashSolutionProducesDeterministicSha256Hex(t *testing.T) {
	emptyBoard := make([]int, 81)
	mixedBoard := make([]int, 81)
	mixedBoard[0] = 5
	mixedBoard[40] = 9

	emptyHash := hashSolution(emptyBoard)

	if !hexPattern.MatchString(emptyHash) {
		t.Errorf("expected 64-char hex sha256, got %q", emptyHash)
	}
	if hashSolution(emptyBoard) != emptyHash {
		t.Error("hashSolution must be deterministic for the same board")
	}
	if hashSolution(mixedBoard) == emptyHash {
		t.Error("hashSolution should differ when board contents change")
	}
}

func TestFindErrorByCandidateRefillReturnsNoErrorOnCleanBoard(t *testing.T) {
	board := make([]int, 81)
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := findErrorByCandidateRefill(board, givens)

	if badCell != -1 || badDigit != 0 || zeroCell != -1 {
		t.Errorf("expected no error on empty board, got cell=%d digit=%d zero=%d", badCell, badDigit, zeroCell)
	}
}

func TestFindErrorByCandidateRefillLocatesUserEntryBlockingAllCandidates(t *testing.T) {
	// Build a board where cell 8 (row 0, col 8) has zero candidates:
	// row 0 holds digits 1-8 (user entries), and digit 9 sits in the same
	// column at cell 17, so every digit 1-9 blocks cell 8.
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d-1] = d
	}
	board[17] = 9
	givens := make([]int, 81) // all entries are user-entered, none are givens

	badCell, badDigit, zeroCell := findErrorByCandidateRefill(board, givens)

	if zeroCell != 8 {
		t.Errorf("expected zero-candidate cell 8, got %d", zeroCell)
	}
	if badCell < 0 || badDigit < 1 || badDigit > 9 {
		t.Errorf("expected a blocking user cell + digit, got cell=%d digit=%d", badCell, badDigit)
	}
	// The reported blocker must be one of the user-entered cells in cell 8's peers.
	peerCells := map[int]bool{0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 17: true}
	if !peerCells[badCell] {
		t.Errorf("reported blocker cell %d is not a peer of cell 8", badCell)
	}
	if board[badCell] != badDigit {
		t.Errorf("reported digit %d does not match cell %d contents %d", badDigit, badCell, board[badCell])
	}
}

// --- peerCellIndices exact cell indices ---
// TestMutation_PeerCellIndices_ExactIndices pins the exact cell indices returned
// by peerCellIndices for a mid-grid cell. This kills all arithmetic/base mutants
// on row*GridSize, i*GridSize, box origin computation, and box cell computation.
func TestMutation_PeerCellIndices_ExactIndices(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(4, 5)

	expectedRow := []int{36, 37, 38, 39, 40, 41, 42, 43, 44}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells: expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{5, 14, 23, 32, 41, 50, 59, 68, 77}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells: expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{30, 31, 32, 39, 40, 41, 48, 49, 50}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells: expected %v, got %v", expectedBox, boxCells)
	}
}

// TestMutation_PeerCellIndices_TopLeftCorner pins indices for cell (0,0) to
// kill mutants on box origin at the grid boundary (0/BoxSize*BoxSize = 0).
func TestMutation_PeerCellIndices_TopLeftCorner(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(0, 0)

	expectedRow := []int{0, 1, 2, 3, 4, 5, 6, 7, 8}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells (0,0): expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{0, 9, 18, 27, 36, 45, 54, 63, 72}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells (0,0): expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{0, 1, 2, 9, 10, 11, 18, 19, 20}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells (0,0): expected %v, got %v", expectedBox, boxCells)
	}
}

// TestMutation_PeerCellIndices_BottomRightCorner pins indices for cell (8,8)
// to kill mutants on box boundary computation at the grid edge.
func TestMutation_PeerCellIndices_BottomRightCorner(t *testing.T) {
	rowCells, colCells, boxCells := peerCellIndices(8, 8)

	expectedRow := []int{72, 73, 74, 75, 76, 77, 78, 79, 80}
	if !reflect.DeepEqual(rowCells, expectedRow) {
		t.Errorf("rowCells (8,8): expected %v, got %v", expectedRow, rowCells)
	}

	expectedCol := []int{8, 17, 26, 35, 44, 53, 62, 71, 80}
	if !reflect.DeepEqual(colCells, expectedCol) {
		t.Errorf("colCells (8,8): expected %v, got %v", expectedCol, colCells)
	}

	expectedBox := []int{60, 61, 62, 69, 70, 71, 78, 79, 80}
	if !reflect.DeepEqual(boxCells, expectedBox) {
		t.Errorf("boxCells (8,8): expected %v, got %v", expectedBox, boxCells)
	}
}

// TestMutation_ValidateDifficulty tests all valid difficulty levels plus an
// invalid one, killing branch/case mutants in the validation function.
func TestMutation_ValidateDifficulty(t *testing.T) {
	for _, d := range []string{"easy", "medium", "hard", "extreme", "impossible"} {
		if !validateDifficulty(core.Difficulty(d)) {
			t.Errorf("validateDifficulty(%q) = false, want true", d)
		}
	}
	if validateDifficulty(core.Difficulty("bogus")) {
		t.Error(`validateDifficulty("bogus") = true, want false`)
	}
}

func TestBuildFixedCandidates_ClearsBadCellAndCopiesOthers(t *testing.T) {
	req := make([][]int, 81)
	req[0] = []int{1, 2, 3}
	req[1] = nil
	req[5] = []int{7}

	fixed := buildFixedCandidates(req, 5)

	if len(fixed) != 81 {
		t.Fatalf("expected length 81, got %d", len(fixed))
	}
	if !reflect.DeepEqual(fixed[0], []int{1, 2, 3}) {
		t.Errorf("cell 0: expected [1 2 3] copied, got %v", fixed[0])
	}
	if fixed[1] != nil {
		t.Errorf("cell 1 was nil in req, expected nil, got %v", fixed[1])
	}
	if fixed[5] != nil {
		t.Errorf("badCell 5 must be cleared to nil, got %v", fixed[5])
	}
	if fixed[80] != nil {
		t.Errorf("cell 80 expected nil, got %v", fixed[80])
	}
	fixed[0][0] = 99
	if req[0][0] != 1 {
		t.Error("fixed[0] must be an independent copy, not an alias of req[0]")
	}
}

func TestBuildFixedCandidates_HandlesShortRequestAndNilInput(t *testing.T) {
	short := make([][]int, 10)
	short[3] = []int{4}
	fixed := buildFixedCandidates(short, 0)
	if len(fixed) != 81 {
		t.Fatalf("short req: expected length 81, got %d", len(fixed))
	}
	if fixed[0] != nil {
		t.Errorf("badCell 0 must be nil, got %v", fixed[0])
	}
	if !reflect.DeepEqual(fixed[3], []int{4}) {
		t.Errorf("cell 3: expected [4], got %v", fixed[3])
	}
	for i := 10; i < 81; i++ {
		if fixed[i] != nil {
			t.Errorf("cell %d beyond short req expected nil, got %v", i, fixed[i])
		}
	}

	empty := buildFixedCandidates(nil, 40)
	if len(empty) != 81 {
		t.Fatalf("nil req: expected length 81, got %d", len(empty))
	}
	for i := 0; i < 81; i++ {
		if empty[i] != nil {
			t.Errorf("nil req: cell %d expected nil, got %v", i, empty[i])
		}
	}
}

func TestCountUserEntries_ExcludesGivensAndZeros(t *testing.T) {
	board := make([]int, 81)
	board[0] = 5
	board[1] = 3
	board[2] = 7
	givens := make([]int, 81)
	givens[0] = 5

	if got := countUserEntries(board, givens); got != 2 {
		t.Errorf("expected 2 user entries (cells 1 and 2), got %d", got)
	}
}

func TestCountUserEntries_ZeroWhenAllCellsAreGivens(t *testing.T) {
	board := make([]int, 81)
	givens := make([]int, 81)
	for i := 0; i < 81; i++ {
		board[i] = (i % 9) + 1
		givens[i] = board[i]
	}
	if got := countUserEntries(board, givens); got != 0 {
		t.Errorf("expected 0 user entries when all cells are givens, got %d", got)
	}
}

func TestCountUserEntries_ZeroOnEmptyBoard(t *testing.T) {
	board := make([]int, 81)
	givens := make([]int, 81)
	if got := countUserEntries(board, givens); got != 0 {
		t.Errorf("expected 0 user entries on empty board, got %d", got)
	}
}

func TestFirstUserBlocker_ReturnsUserCellHoldingDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 5
	cells[2] = 7
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 5
	original[2] = 7
	givens := make([]int, 81)

	idx, ok := firstUserBlocker([]int{0, 1, 2}, board, 5, original, givens)
	if !ok || idx != 1 {
		t.Errorf("digit 5 at user cell 1: expected (1,true), got (%d,%v)", idx, ok)
	}
}

func TestFirstUserBlocker_BreaksOnGivenCellHoldingDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	cells[1] = 5
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[0] = 5
	original[1] = 5
	givens := make([]int, 81)
	givens[0] = 5

	idx, ok := firstUserBlocker([]int{0, 1}, board, 5, original, givens)
	if ok || idx != -1 {
		t.Errorf("given cell 0 holds digit: expected (-1,false) break, got (%d,%v)", idx, ok)
	}
}

func TestFirstUserBlocker_FalseWhenSolverPlacedCellHoldsDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 4
	board := human.NewBoard(cells)
	original := make([]int, 81)
	givens := make([]int, 81)

	idx, ok := firstUserBlocker([]int{0}, board, 4, original, givens)
	if ok || idx != -1 {
		t.Errorf("solver-placed cell: expected (-1,false), got (%d,%v)", idx, ok)
	}
}

func TestFirstUserBlocker_FalseWhenNoCellHoldsDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 1
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[0] = 1
	givens := make([]int, 81)

	idx, ok := firstUserBlocker([]int{0, 1, 2}, board, 9, original, givens)
	if ok || idx != -1 {
		t.Errorf("no cell holds digit 9: expected (-1,false), got (%d,%v)", idx, ok)
	}
}

func TestFindBlockingUserCell_ReturnsMostBlockingCellWithItsDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 3
	cells[27] = 8
	cells[36] = 9
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 3
	original[27] = 8
	original[36] = 9
	givens := make([]int, 81)

	idx, digit := findBlockingUserCell(board, 0, original, givens)
	if idx != 1 {
		t.Errorf("expected blocker cell 1 (count 2, lowest max), got %d", idx)
	}
	if digit != 3 {
		t.Errorf("expected digit 3 held at cell 1, got %d", digit)
	}
}

func TestFindBlockingUserCell_ReturnsMinusOneWhenNoUserBlockers(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 3
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 3
	givens := make([]int, 81)
	givens[1] = 3

	idx, digit := findBlockingUserCell(board, 0, original, givens)
	if idx != -1 || digit != 0 {
		t.Errorf("expected (-1,0) when no user blockers, got (%d,%d)", idx, digit)
	}
}

func TestFindErrorByCandidateRefill_ReturnsFirstBlockingUserEntry(t *testing.T) {
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := findErrorByCandidateRefill(board, givens)
	if zeroCell != 0 {
		t.Errorf("expected zero-candidate cell 0, got %d", zeroCell)
	}
	if badCell != 1 {
		t.Errorf("expected blocker cell 1 (holds digit 1, first in scan), got %d", badCell)
	}
	if badDigit != 1 {
		t.Errorf("expected digit 1, got %d", badDigit)
	}
}

func TestCreateTokenVerifyTokenRoundTripPreservesSession(t *testing.T) {
	now := time.Now().UTC().Round(time.Second)
	session := SessionToken{
		DeviceID:   "dev-1",
		PuzzleID:   "puz-1",
		Seed:       "seed-1",
		Difficulty: "medium",
		StartedAt:  now,
		ExpiresAt:  now.Add(time.Hour),
	}
	tok, err := createToken("secret", session)
	if err != nil {
		t.Fatalf("createToken error: %v", err)
	}
	parts := strings.Split(tok, ".")
	if len(parts) != 2 {
		t.Fatalf("token must have exactly 2 dot-separated parts, got %d: %q", len(parts), tok)
	}
	if parts[0] == "" || parts[1] == "" {
		t.Errorf("token parts must be non-empty, got %q", tok)
	}

	got, err := verifyToken("secret", tok)
	if err != nil {
		t.Fatalf("verifyToken error: %v", err)
	}
	if got.DeviceID != session.DeviceID || got.PuzzleID != session.PuzzleID ||
		got.Seed != session.Seed || got.Difficulty != session.Difficulty {
		t.Errorf("session fields not preserved: got %+v", got)
	}
	if !got.StartedAt.Equal(session.StartedAt) || !got.ExpiresAt.Equal(session.ExpiresAt) {
		t.Errorf("timestamps not preserved: started got=%v want=%v expires got=%v want=%v",
			got.StartedAt, session.StartedAt, got.ExpiresAt, session.ExpiresAt)
	}
}

func TestVerifyTokenRejectsMalformedFormat(t *testing.T) {
	for name, tok := range map[string]string{
		"empty":       "",
		"single-part": "abc",
		"three-parts": "a.b.c",
	} {
		_, err := verifyToken("secret", tok)
		if err == nil {
			t.Errorf("%s: expected error for malformed token, got nil", name)
			continue
		}
		if !strings.Contains(err.Error(), "invalid token format") {
			t.Errorf("%s: expected 'invalid token format', got %q", name, err.Error())
		}
	}

	// Two parts but an empty payload or sig field still has 2 dot-separated
	// parts, so it clears the format check and fails at signature verification.
	for name, tok := range map[string]string{
		"empty-sig":     "abc.",
		"empty-payload": ".def",
	} {
		_, err := verifyToken("secret", tok)
		if err == nil {
			t.Errorf("%s: expected error, got nil", name)
			continue
		}
		if !strings.Contains(err.Error(), "invalid signature") {
			t.Errorf("%s: expected 'invalid signature', got %q", name, err.Error())
		}
	}
}

func TestVerifyTokenRejectsBadSignature(t *testing.T) {
	tok, _ := createToken("secret", SessionToken{
		DeviceID: "d", ExpiresAt: time.Now().Add(time.Hour),
	})
	tampered := strings.Split(tok, ".")[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	_, err := verifyToken("secret", tampered)
	if err == nil {
		t.Fatal("expected signature error, got nil")
	}
	if !strings.Contains(err.Error(), "invalid signature") {
		t.Errorf("expected 'invalid signature', got %q", err.Error())
	}
}

func TestVerifyTokenRejectsWrongSecret(t *testing.T) {
	tok, _ := createToken("secret-a", SessionToken{
		DeviceID: "d", ExpiresAt: time.Now().Add(time.Hour),
	})
	if _, err := verifyToken("secret-b", tok); err == nil {
		t.Error("expected error verifying token signed with a different secret")
	}
}

func TestVerifyTokenRejectsExpiredToken(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	session := SessionToken{
		DeviceID:  "d",
		ExpiresAt: past,
		StartedAt: past.Add(-time.Hour),
	}
	tok, _ := createToken("secret", session)
	_, err := verifyToken("secret", tok)
	if err == nil {
		t.Fatal("expected expired error, got nil")
	}
	if !strings.Contains(err.Error(), "token expired") {
		t.Errorf("expected 'token expired', got %q", err.Error())
	}
}

// --- buildConflictFix direct tests ---
// Calling buildConflictFix with crafted dp.Conflict values gives total control
// over which cell is Cell1/Cell2 and thus badCell/otherCell, independent of
// dp.FindConflicts ordering. Exact-string explanation assertions kill every
// arithmetic/incrementer/decrementer mutant on the row/column/box format lines.

// TestBuildConflictFix_RowConflictExactOutput pins the full row-conflict
// response. badCell=Cell2 (cell1 is the given), otherCell=Cell1. Targets,
// highlights, exact explanation string, fixed board, and copied candidates are
// all asserted.
func TestBuildConflictFix_RowConflictExactOutput(t *testing.T) {
	board := make([]int, 81)
	board[4] = 7
	board[8] = 7
	givens := make([]int, 81)
	givens[4] = 7
	candidates := make([][]int, 81)
	candidates[4] = []int{1, 2}

	conflict := dp.Conflict{Type: "row", Cell1: 4, Cell2: 8, Value: 7}
	move, fixedBoard, fixedCands, ok := buildConflictFix(board, candidates, givens, conflict)

	if !ok {
		t.Fatal("expected ok=true for cell1-given row conflict")
	}
	if move["technique"] != "fix-conflict" || move["action"] != "fix-conflict" {
		t.Errorf("technique/action: got %v/%v", move["technique"], move["action"])
	}
	if move["digit"] != 7 {
		t.Errorf("digit: expected 7, got %v", move["digit"])
	}
	targets, ok := move["targets"].([]map[string]int)
	if !ok || len(targets) != 1 {
		t.Fatalf("targets: expected 1 []map[string]int, got %T %v", move["targets"], move["targets"])
	}
	if targets[0]["row"] != 0 || targets[0]["col"] != 8 {
		t.Errorf("target: expected (row=0,col=8) for badCell=8, got %v", targets[0])
	}
	highlights := move["highlights"].(map[string]interface{})
	primary := highlights["primary"].([]map[string]int)
	if primary[0]["row"] != 0 || primary[0]["col"] != 8 {
		t.Errorf("primary: expected (0,8), got %v", primary[0])
	}
	secondary := highlights["secondary"].([]map[string]int)
	if secondary[0]["row"] != 0 || secondary[0]["col"] != 4 {
		t.Errorf("secondary: expected (0,4) for otherCell=4, got %v", secondary[0])
	}
	explanation, _ := move["explanation"].(string)
	expected := "Conflict! R1C9 and R1C5 both have 7 in the same row. Removing the 7 from R1C9."
	if explanation != expected {
		t.Errorf("explanation:\n want %q\n got  %q", expected, explanation)
	}
	if len(fixedBoard) != 81 {
		t.Fatalf("fixedBoard length: expected 81, got %d", len(fixedBoard))
	}
	if fixedBoard[8] != 0 {
		t.Errorf("fixedBoard[8]: expected 0 (cleared badCell), got %d", fixedBoard[8])
	}
	if fixedBoard[4] != 7 {
		t.Errorf("fixedBoard[4]: expected 7 (kept given), got %d", fixedBoard[4])
	}
	if len(fixedCands) != 81 {
		t.Fatalf("fixedCandidates length: expected 81, got %d", len(fixedCands))
	}
	if fixedCands[8] != nil {
		t.Errorf("fixedCandidates[8]: expected nil (badCell cleared), got %v", fixedCands[8])
	}
	if !reflect.DeepEqual(fixedCands[4], []int{1, 2}) {
		t.Errorf("fixedCandidates[4]: expected [1 2] copied, got %v", fixedCands[4])
	}
}

// TestBuildConflictFix_ColumnConflictExactOutput pins the column-conflict
// response. cell2 is the given, so badCell=Cell1, otherCell=Cell2.
func TestBuildConflictFix_ColumnConflictExactOutput(t *testing.T) {
	board := make([]int, 81)
	board[8] = 3
	board[17] = 3
	givens := make([]int, 81)
	givens[8] = 3
	candidates := make([][]int, 81)
	candidates[8] = []int{9}

	conflict := dp.Conflict{Type: "column", Cell1: 17, Cell2: 8, Value: 3}
	move, fixedBoard, _, ok := buildConflictFix(board, candidates, givens, conflict)

	if !ok {
		t.Fatal("expected ok=true for cell2-given column conflict")
	}
	if move["digit"] != 3 {
		t.Errorf("digit: expected 3, got %v", move["digit"])
	}
	targets := move["targets"].([]map[string]int)
	if targets[0]["row"] != 1 || targets[0]["col"] != 8 {
		t.Errorf("target: expected (1,8) for badCell=Cell1=17, got %v", targets[0])
	}
	secondary := move["highlights"].(map[string]interface{})["secondary"].([]map[string]int)
	if secondary[0]["row"] != 0 || secondary[0]["col"] != 8 {
		t.Errorf("secondary: expected (0,8) for otherCell=Cell2=8, got %v", secondary[0])
	}
	explanation, _ := move["explanation"].(string)
	expected := "Conflict! R2C9 and R1C9 both have 3 in the same column. Removing the 3 from R2C9."
	if explanation != expected {
		t.Errorf("explanation:\n want %q\n got  %q", expected, explanation)
	}
	if fixedBoard[17] != 0 {
		t.Errorf("fixedBoard[17]: expected 0 (cleared badCell), got %d", fixedBoard[17])
	}
	if fixedBoard[8] != 3 {
		t.Errorf("fixedBoard[8]: expected 3 (kept given), got %d", fixedBoard[8])
	}
}

// TestBuildConflictFix_BoxConflictExactOutput pins the box-conflict response.
// Neither cell is a given, so the default branch runs: badCell=Cell2,
// otherCell=Cell1.
func TestBuildConflictFix_BoxConflictExactOutput(t *testing.T) {
	board := make([]int, 81)
	board[1] = 4
	board[9] = 4
	givens := make([]int, 81)

	conflict := dp.Conflict{Type: "box", Cell1: 1, Cell2: 9, Value: 4}
	move, fixedBoard, _, ok := buildConflictFix(board, nil, givens, conflict)

	if !ok {
		t.Fatal("expected ok=true for default-branch box conflict")
	}
	if move["digit"] != 4 {
		t.Errorf("digit: expected 4, got %v", move["digit"])
	}
	targets := move["targets"].([]map[string]int)
	if targets[0]["row"] != 1 || targets[0]["col"] != 0 {
		t.Errorf("target: expected (1,0) for badCell=Cell2=9, got %v", targets[0])
	}
	secondary := move["highlights"].(map[string]interface{})["secondary"].([]map[string]int)
	if secondary[0]["row"] != 0 || secondary[0]["col"] != 1 {
		t.Errorf("secondary: expected (0,1) for otherCell=Cell1=1, got %v", secondary[0])
	}
	explanation, _ := move["explanation"].(string)
	expected := "Conflict! R2C1 and R1C2 both have 4 in the same box. Removing the 4 from R2C1."
	if explanation != expected {
		t.Errorf("explanation:\n want %q\n got  %q", expected, explanation)
	}
	if fixedBoard[9] != 0 {
		t.Errorf("fixedBoard[9]: expected 0 (cleared badCell), got %d", fixedBoard[9])
	}
	if fixedBoard[1] != 4 {
		t.Errorf("fixedBoard[1]: expected 4 (kept), got %d", fixedBoard[1])
	}
}

// TestBuildConflictFix_BothGivensReturnsNotOk pins the both-givens branch,
// which must return ok=false so the caller skips the unfixable conflict.
func TestBuildConflictFix_BothGivensReturnsNotOk(t *testing.T) {
	board := make([]int, 81)
	board[0] = 5
	board[1] = 5
	givens := make([]int, 81)
	givens[0] = 5
	givens[1] = 5

	conflict := dp.Conflict{Type: "row", Cell1: 0, Cell2: 1, Value: 5}
	move, _, _, ok := buildConflictFix(board, nil, givens, conflict)
	if ok {
		t.Errorf("expected ok=false when both conflicting cells are givens, got move=%v", move)
	}
}

// --- findErrorByCandidateRefill exact-return tests ---

// TestFindErrorByCandidateRefill_ZeroCandidateCellAndNonZeroCoords pins the
// exact (badCell, badDigit, zeroCell) return. Cell 8 is the zero-candidate
// cell (non-zero row/col coordinates), and cell 1 is the first blocking user
// entry. This kills the arithmetic mutants on the idx/GridSize row/col
// computation and the branch/loop mutants on the candidate-non-empty continue.
func TestFindErrorByCandidateRefill_ZeroCandidateCellAndNonZeroCoords(t *testing.T) {
	board := make([]int, 81)
	for d := 1; d <= 7; d++ {
		board[d] = d
	}
	board[17] = 8
	board[26] = 9
	givens := make([]int, 81)

	badCell, badDigit, zeroCell := findErrorByCandidateRefill(board, givens)

	if zeroCell != 8 {
		t.Errorf("zeroCell: expected 8, got %d", zeroCell)
	}
	if badCell != 1 {
		t.Errorf("badCell: expected 1 (first row peer holding a user digit), got %d", badCell)
	}
	if badDigit != 1 {
		t.Errorf("badDigit: expected 1, got %d", badDigit)
	}
}

// TestFindErrorByCandidateRefill_BlockerIsDigitNine pins the case where the
// only user-entered blocker holds digit 9 (digits 1-8 are givens). This kills
// the comparison mutant that narrows the digit loop to 1..8.
func TestFindErrorByCandidateRefill_BlockerIsDigitNine(t *testing.T) {
	board := make([]int, 81)
	for d := 1; d <= 8; d++ {
		board[d] = d
	}
	board[9] = 9
	givens := make([]int, 81)
	for d := 1; d <= 8; d++ {
		givens[d] = d
	}

	badCell, badDigit, zeroCell := findErrorByCandidateRefill(board, givens)

	if zeroCell != 0 {
		t.Errorf("zeroCell: expected 0, got %d", zeroCell)
	}
	if badCell != 9 {
		t.Errorf("badCell: expected 9 (only non-given blocker), got %d", badCell)
	}
	if badDigit != 9 {
		t.Errorf("badDigit: expected 9, got %d", badDigit)
	}
}

// --- findBlockingUserCell exact-return tests ---

// TestFindBlockingUserCell_BlockerIsDigitNine pins a blocker whose digit is 9
// and which is the unique max, killing the digit-loop comparison mutant that
// would skip digit 9, and the len(userBlockers)==0 incrementer (a single
// blocker would make the mutant early-return).
func TestFindBlockingUserCell_BlockerIsDigitNine(t *testing.T) {
	cells := make([]int, 81)
	cells[1] = 9
	cells[9] = 9
	cells[3] = 5
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[1] = 9
	original[9] = 9
	original[3] = 5
	givens := make([]int, 81)

	idx, digit := findBlockingUserCell(board, 0, original, givens)
	if idx != 1 {
		t.Errorf("expected blocker cell 1 (count 2), got %d", idx)
	}
	if digit != 9 {
		t.Errorf("expected digit 9, got %d", digit)
	}
}

// TestFindBlockingUserCell_SingleBlockerReturnsCellAndDigit pins the
// single-blocker case. cell 27 (col0 only of cell 0's peers) holds the only
// blocking user entry, so userBlockers has length 1. The len==0 incrementer
// mutant (==1) would early-return (-1,0) for exactly one blocker.
func TestFindBlockingUserCell_SingleBlockerReturnsCellAndDigit(t *testing.T) {
	cells := make([]int, 81)
	cells[27] = 6
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[27] = 6
	givens := make([]int, 81)

	idx, digit := findBlockingUserCell(board, 0, original, givens)
	if idx != 27 {
		t.Errorf("expected single blocker cell 27, got %d", idx)
	}
	if digit != 6 {
		t.Errorf("expected digit 6, got %d", digit)
	}
}

// --- countUserEntries cell-0 test ---

// TestCountUserEntries_CountsEntryAtCellZero pins that a user entry at cell 0
// is counted, killing the incrementer that starts the loop at i=1.
func TestCountUserEntries_CountsEntryAtCellZero(t *testing.T) {
	board := make([]int, 81)
	board[0] = 5
	givens := make([]int, 81)
	if got := countUserEntries(board, givens); got != 1 {
		t.Errorf("expected 1 user entry at cell 0, got %d", got)
	}
}

// --- buildFixedCandidates over-length request test ---

// TestBuildFixedCandidates_OverLengthRequestStays81 pins that an input
// candidate grid longer than 81 cells does not grow the output. The comparison
// mutant (i < TotalCells -> i <= TotalCells) would index fixed[81] and panic.
func TestBuildFixedCandidates_OverLengthRequestStays81(t *testing.T) {
	req := make([][]int, 82)
	req[0] = []int{2}
	req[81] = []int{1}
	fixed := buildFixedCandidates(req, 0)
	if len(fixed) != 81 {
		t.Fatalf("expected length 81 even with over-length request, got %d", len(fixed))
	}
	if fixed[0] != nil {
		t.Errorf("badCell 0 must be nil, got %v", fixed[0])
	}
}

// --- appendStalledMove direct test ---

// TestAppendStalledMove_OmitsStalledWhenNoUserEntries pins that no stalled
// move is appended when there are zero user entries. This kills the
// userEntryCount == 0 comparison mutants and the early-return removal.
func TestAppendStalledMove_OmitsStalledWhenNoUserEntries(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	board := human.NewBoard(cells)
	original := make([]int, 81)
	copy(original, cells)
	givens := make([]int, 81)
	copy(givens, cells)

	out := appendStalledMove(nil, board, original, givens)
	if len(out) != 0 {
		t.Errorf("expected no stalled move when userEntryCount=0, got %d moves: %v", len(out), out)
	}
}
