package http

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"sudoku-api/internal/core"
	"sudoku-api/internal/puzzles"
	"sudoku-api/internal/sudoku/dp"
	"sudoku-api/internal/sudoku/human"
	"sudoku-api/pkg/constants"

	"github.com/gin-gonic/gin"
)

// =============================================================================
// Mutation kill tests for internal/transport/http.
//
// Each test here pins an observable value that a specific escaped mutant changes.
// Tests are driven through the public HTTP endpoints where possible, and via
// direct package-private helper calls (findBlockingUserCell,
// handleSolveNextContradiction, handleAutosolveContradiction, findPracticePuzzle)
// when the mutated branch is only reachable from a crafted solver state.
// =============================================================================

// brokenGLoader returns a non-nil loader whose single puzzle has no difficulty
// entries, so GetPuzzleBySeed always errors ("difficulty X not found"). This
// forces puzzleHandler/puzzleAnalyzeHandler onto their generate-on-demand
// fallback even though puzzles.Global() != nil.
func brokenGLoader() *puzzles.Loader {
	return puzzles.NewLoaderFromPuzzles([]puzzles.CompactPuzzle{
		{S: testPuzzles[0].S, G: map[string][]int{}},
	})
}

// TestMutation_PuzzleHandler_FallbackFiresWhenLoaderErrors covers the
// loader-error branch of puzzleHandler: a non-nil but erroring loader must drop
// to on-demand generation. The branch/if mutant that drops `loader = nil` leaves
// givens as null instead of a generated 81-cell board.
func TestMutation_PuzzleHandler_FallbackFiresWhenLoaderErrors(t *testing.T) {
	original := puzzles.Global()
	puzzles.SetGlobal(brokenGLoader())
	defer puzzles.SetGlobal(original)

	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/broken-loader-seed?d=medium", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	givens := ifaceToIntBoard(resp["givens"])
	if len(givens) != constants.TotalCells {
		t.Errorf("expected fallback to generate %d givens, got len=%d (null means loader=nil branch was skipped)", constants.TotalCells, len(givens))
	}
}

// TestMutation_PuzzleAnalyze_FallbackFiresWhenLoaderErrors covers the same
// loader-error branch in puzzleAnalyzeHandler. With the fallback intact the
// response reports a non-zero givens_count from the generated puzzle; the mutant
// that skips `loader = nil` leaves givens nil and givens_count at 0.
func TestMutation_PuzzleAnalyze_FallbackFiresWhenLoaderErrors(t *testing.T) {
	original := puzzles.Global()
	puzzles.SetGlobal(brokenGLoader())
	defer puzzles.SetGlobal(original)

	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/puzzle/broken-loader-seed/analyze?d=medium", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	got, _ := resp["givens_count"].(float64)
	if int(got) <= 0 {
		t.Errorf("expected fallback to produce givens_count > 0, got %v", got)
	}
}

// TestMutation_FindPracticePuzzle_FindsKnownTechnique kills the arithmetic/base
// mutant that turns the `(startIdx + i) % puzzleCount` indexing into
// `(startIdx + i) * puzzleCount`. That mutant makes every index out of range, so
// no puzzle is ever loadable and the function always returns not-found. The
// original must locate a real puzzle for a technique present in the test set.
func TestMutation_FindPracticePuzzle_FindsKnownTechnique(t *testing.T) {
	loader := puzzles.Global()
	solver := human.NewSolver()
	diffs := techniqueToDifficulties["hidden-single"]

	givens, _, _, ok := findPracticePuzzle(loader, solver, "hidden-single", diffs, loader.Count(), 50)

	if !ok {
		t.Fatalf("expected to find a hidden-single puzzle, got not-found; givens=%v", givens)
	}
	if len(givens) != constants.TotalCells {
		t.Errorf("returned givens must be %d cells, got %d", constants.TotalCells, len(givens))
	}
}

// TestMutation_FindBlockingUserCell_ReturnsCellZeroAsBlocker pins that cell 0 is
// a valid blocker result. It kills the counting-loop incrementer that starts the
// scan at idx=1 (skipping cell 0) and the `maxCell >= 0` comparison/incrementer
// mutants that drop a maxCell==0 result.
func TestMutation_FindBlockingUserCell_ReturnsCellZeroAsBlocker(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5 // user entry at cell 0; peer of cell 4 (same row)
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[0] = 5
	givens := make([]int, 81)

	idx, digit := findBlockingUserCell(board, 4, original, givens)
	if idx != 0 {
		t.Errorf("expected blocker cell 0, got %d", idx)
	}
	if digit != 5 {
		t.Errorf("expected digit 5 held at cell 0, got %d", digit)
	}
}

// callSolveNextContradiction runs handleSolveNextContradiction against a crafted
// contradiction move and returns the parsed inner move object (the value of the
// response's "move" key). handleSolveNextContradiction writes a top-level JSON
// object {"move":{...}, "board":..., "candidates":...}; callers want the inner
// move to inspect technique/targets/highlights.
func callSolveNextContradiction(t *testing.T, board *human.Board, targets []core.CellRef, reqBoard, givens []int) map[string]interface{} {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)

	move := &core.Move{Action: "contradiction", Targets: targets}
	if !handleSolveNextContradiction(c, board, move, reqBoard, nil, givens) {
		t.Fatalf("expected handleSolveNextContradiction to handle the contradiction (return true)")
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response %q: %v", w.Body.String(), err)
	}
	inner, ok := resp["move"].(map[string]interface{})
	if !ok {
		t.Fatalf("response missing inner move object: %v", resp)
	}
	return inner
}

// TestMutation_SolveNextContradiction_TargetsPathFixesCellZero drives the
// targets-blocker path with the blocking user entry at cell 0. The original
// emits a fix-error targeting (0,0); the `badCell >= 0` -> `> 0` / `>= 1`
// mutants skip cell 0 and fall through to the unpinpointable response.
func TestMutation_SolveNextContradiction_TargetsPathFixesCellZero(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	board := human.NewBoard(cells)
	reqBoard := make([]int, 81)
	reqBoard[0] = 5
	givens := make([]int, 81)

	move := callSolveNextContradiction(t, board, []core.CellRef{{Row: 0, Col: 4}}, reqBoard, givens)

	technique, _ := move["technique"].(string)
	if technique != "fix-error" {
		t.Fatalf("expected fix-error at cell 0, got technique=%q (full move=%v)", technique, move)
	}
	targets, _ := move["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]interface{})
	if int(target["row"].(float64)) != 0 || int(target["col"].(float64)) != 0 {
		t.Errorf("expected target (0,0) for badCell=0, got %v", target)
	}
}

// TestMutation_SolveNextContradiction_RefillPathFixesCellZero drives the
// candidate-refill diagnostic path with a zero-candidate cell (cell 1) whose
// first blocking user entry is cell 0. findBlockingUserCell returns -1 (the
// contradiction target has no user blocker), so the handler reaches
// findErrorByCandidateRefill, which returns badCell=0. The original emits a
// fix-error for cell 0; the `badCell >= 0` mutants skip it.
func TestMutation_SolveNextContradiction_RefillPathFixesCellZero(t *testing.T) {
	reqBoard := make([]int, 81)
	givens := make([]int, 81)
	// cell 0 is a user entry holding 5; the rest are givens placed so cell 1
	// (row 0, col 1, box 0) sees every digit 1-9 and ends up with no candidates.
	reqBoard[0], reqBoard[2], reqBoard[3] = 5, 1, 2
	givens[2], givens[3] = 1, 2
	reqBoard[9], reqBoard[10], reqBoard[11] = 3, 4, 6
	givens[9], givens[10], givens[11] = 3, 4, 6
	reqBoard[18], reqBoard[19], reqBoard[20] = 7, 8, 9
	givens[18], givens[19], givens[20] = 7, 8, 9
	board := human.NewBoard(reqBoard)

	// Contradiction target is cell 40 (row 4, col 4), whose peers hold no digits,
	// so findBlockingUserCell returns -1 and the refill diagnostic runs.
	move := callSolveNextContradiction(t, board, []core.CellRef{{Row: 4, Col: 4}}, reqBoard, givens)

	technique, _ := move["technique"].(string)
	if technique != "fix-error" {
		t.Fatalf("expected fix-error from refill path at cell 0, got technique=%q (full move=%v)", technique, move)
	}
	targets, _ := move["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]interface{})
	if int(target["row"].(float64)) != 0 || int(target["col"].(float64)) != 0 {
		t.Errorf("expected target (0,0) for badCell=0, got %v", target)
	}
}

// countPopulatedCandidates counts cells whose candidate slice is non-empty.
func countPopulatedCandidates(cands [][]int) int {
	n := 0
	for _, c := range cands {
		if len(c) > 0 {
			n++
		}
	}
	return n
}

// TestMutation_AutosolveContradiction_TargetsPathFixesCellZero drives the
// targets-blocker path of handleAutosolveContradiction with the blocker at
// cell 0. The original applies a fix (done=false) and rebuilds the board with
// InitCandidates, so the fix-error move carries populated candidates. The
// `badCell >= 0` mutants skip cell 0 (done=true), and the InitCandidates removal
// leaves the move's candidates empty.
func TestMutation_AutosolveContradiction_TargetsPathFixesCellZero(t *testing.T) {
	cells := make([]int, 81)
	cells[0] = 5
	board := human.NewBoard(cells)
	original := make([]int, 81)
	original[0] = 5
	givens := make([]int, 81)
	move := &core.Move{Action: "contradiction", Targets: []core.CellRef{{Row: 0, Col: 4}}}

	moves, _, _, done := handleAutosolveContradiction(nil, board, move, original, givens, 0, 5)

	if done {
		t.Errorf("expected done=false after applying a targets-path fix, got done=true")
	}
	fix := moveResultByTechnique(moves, "fix-error")
	if fix == nil {
		t.Fatalf("expected a fix-error move, got %d moves", len(moves))
	}
	// moveResult.Move is the in-memory map (not JSON-roundtripped), so targets
	// retains its concrete []map[string]int type from appendFixErrorMove.
	targets, _ := fix.Move.(map[string]interface{})["targets"].([]map[string]int)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0]["row"] != 0 || targets[0]["col"] != 0 {
		t.Errorf("expected target (0,0), got %v", targets[0])
	}
	if countPopulatedCandidates(fix.Candidates) == 0 {
		t.Errorf("expected fix-error move to carry populated candidates after InitCandidates")
	}
}

// TestMutation_AutosolveContradiction_RefillPathFixesCellZero drives the refill
// path of handleAutosolveContradiction with badCell=0. It pins four observables:
// done=false (badCell>=0 mutants skip cell 0), fixCount increments to 5 from 4
// (fixCount++ removal), originalUserBoard[0] is cleared to 0 (the =0 mutants),
// and a fix-error move targets (0,0).
func TestMutation_AutosolveContradiction_RefillPathFixesCellZero(t *testing.T) {
	reqBoard := make([]int, 81)
	givens := make([]int, 81)
	reqBoard[0], reqBoard[2], reqBoard[3] = 5, 1, 2
	givens[2], givens[3] = 1, 2
	reqBoard[9], reqBoard[10], reqBoard[11] = 3, 4, 6
	givens[9], givens[10], givens[11] = 3, 4, 6
	reqBoard[18], reqBoard[19], reqBoard[20] = 7, 8, 9
	givens[18], givens[19], givens[20] = 7, 8, 9
	board := human.NewBoard(reqBoard)
	original := make([]int, 81)
	copy(original, reqBoard)
	move := &core.Move{Action: "contradiction", Targets: []core.CellRef{{Row: 4, Col: 4}}}

	moves, _, fixCount, done := handleAutosolveContradiction(nil, board, move, original, givens, 4, 5)

	if done {
		t.Errorf("expected done=false after applying a refill-path fix, got done=true")
	}
	if fixCount != 5 {
		t.Errorf("expected fixCount to increment 4 -> 5 after the fix, got %d", fixCount)
	}
	if original[0] != 0 {
		t.Errorf("expected originalUserBoard[0] cleared to 0 after the fix, got %d", original[0])
	}
	fix := moveResultByTechnique(moves, "fix-error")
	if fix == nil {
		t.Fatalf("expected a fix-error move, got %d moves", len(moves))
	}
	// moveResult.Move is the in-memory map (not JSON-roundtripped), so targets
	// retains its concrete []map[string]int type from appendFixErrorMove.
	targets, _ := fix.Move.(map[string]interface{})["targets"].([]map[string]int)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0]["row"] != 0 || targets[0]["col"] != 0 {
		t.Errorf("expected target (0,0), got %v", targets[0])
	}
}

// moveResultByTechnique returns the first moveResult whose inner move carries
// the given technique, or nil when absent.
func moveResultByTechnique(moves []moveResult, want string) *moveResult {
	for i := range moves {
		mv, ok := moves[i].Move.(map[string]interface{})
		if !ok {
			continue
		}
		if tech, _ := mv["technique"].(string); tech == want {
			return &moves[i]
		}
	}
	return nil
}

// TestMutation_SolveAll_BreakOnSolvedNoStalledMove pins that a solvable board
// with a correct user entry terminates immediately when solved (break) and does
// not append a stalled move. The break-removal mutants fall through, re-query the
// solved board (FindNextMove returns nil), and append a stalled move because the
// user entry keeps userEntryCount > 0.
func TestMutation_SolveAll_BreakOnSolvedNoStalledMove(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(4242)
	givens := dp.CarveGivensWithSubset(solved, 4242)["easy"]
	// Add one correct user entry at a non-given cell so userEntryCount > 0 at solve.
	board := make([]int, 81)
	copy(board, givens)
	addedIdx := -1
	for i := 0; i < 81; i++ {
		if givens[i] == 0 {
			board[i] = solved[i]
			addedIdx = i
			break
		}
	}
	if addedIdx < 0 {
		t.Skip("no non-given cell available to place a user entry")
	}

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	if isSolved, _ := resp["solved"].(bool); !isSolved {
		t.Fatalf("expected solved=true, got %v (sequence=%v)", resp["solved"], solveAllTechniques(resp))
	}
	for _, tech := range solveAllTechniques(resp) {
		if tech == "stalled" {
			t.Errorf("expected no stalled move after break-on-solved, sequence=%v", solveAllTechniques(resp))
		}
	}
}

// TestMutation_SolveAll_ConflictFixMoveCarriesPopulatedCandidates pins that the
// conflict-fix branch of solveAll runs InitCandidates on the corrected board
// before entering the autosolve loop (serveSolveAllFromConflictFix). The mutant
// that drops `board.InitCandidates()` leaves the board's candidate grid empty,
// forcing the solver to lazily repopulate it and emit a flood of "fill-candidate"
// moves (97 in this fixture) that never appear when InitCandidates runs up
// front. Asserting no fill-candidate moves follow the fix-conflict kills the
// mutant cleanly.
func TestMutation_SolveAll_ConflictFixMoveCarriesPopulatedCandidates(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	// Use a real solvable puzzle so the autosolve loop has work to do after the
	// conflict is fixed; a near-empty board would stall regardless.
	solved := dp.GenerateFullGrid(4242)
	givens := dp.CarveGivensWithSubset(solved, 4242)["easy"]
	board := make([]int, 81)
	copy(board, givens)

	// Inject a row-conflicting user entry: take the first given, then place its
	// digit in a non-given cell of the same row so buildConflictFix can repair
	// it (the given is kept, the user entry is cleared).
	injected := false
	for i := 0; i < constants.TotalCells && !injected; i++ {
		if givens[i] == 0 {
			continue
		}
		row := i / constants.GridSize
		for c := 0; c < constants.GridSize; c++ {
			j := row*constants.GridSize + c
			if j != i && givens[j] == 0 {
				board[j] = board[i]
				injected = true
				break
			}
		}
	}
	if !injected {
		t.Skip("could not construct a fixable row conflict for this puzzle")
	}

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	seq := solveAllTechniques(resp)
	if len(seq) == 0 || seq[0] != "fix-conflict" {
		t.Fatalf("expected first move fix-conflict, got sequence=%v", seq)
	}

	// Under the original (InitCandidates ran), the solver finds real solving
	// moves directly. Under the mutant, it must lazily repopulate the candidate
	// grid, emitting many "fill-candidate" moves that never appear otherwise.
	fillCandidateMoves := 0
	for _, tech := range seq {
		if tech == "fill-candidate" {
			fillCandidateMoves++
		}
	}
	if fillCandidateMoves > 0 {
		t.Errorf("expected no fill-candidate moves after InitCandidates ran, got %d (sequence has %d total moves)", fillCandidateMoves, len(seq))
	}
}

// TestMutation_SolveAll_NoCandidatesRequestPopulatesFirstMove pins that a
// solve/all request without a candidates field still produces a first move whose
// candidate grid is populated. The `len(req.Candidates) == 0` mutants route the
// board through NewBoardWithCandidates(board, nil), which skips InitCandidates
// and leaves candidates empty.
func TestMutation_SolveAll_NoCandidatesRequestPopulatesFirstMove(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	solved := dp.GenerateFullGrid(31337)
	givens := dp.CarveGivensWithSubset(solved, 31337)["medium"]

	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"token": token, "board": givens, "givens": givens,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/all", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	moves, ok := resp["moves"].([]interface{})
	if !ok || len(moves) == 0 {
		t.Fatalf("expected at least one move, got %v", resp["moves"])
	}
	first, _ := moves[0].(map[string]interface{})
	cands, _ := first["candidates"].([]interface{})
	populated := 0
	for _, c := range cands {
		if arr, ok := c.([]interface{}); ok && len(arr) > 0 {
			populated++
		}
	}
	if populated == 0 {
		t.Errorf("expected first move candidates to be populated via NewBoard+InitCandidates, got %d/%d", populated, len(cands))
	}
	// The `len(req.Candidates) == 0` mutants route the board through
	// NewBoardWithCandidates(board, nil). The solver eventually self-populates
	// candidates and emits "fill-candidate" moves, so the populated-cells check
	// above is necessary but not sufficient. The original NewBoard path runs
	// InitCandidates up front, so the first move is a real solving technique
	// (hidden-single, naked-single, etc.), never "fill-candidate".
	firstMove, _ := first["move"].(map[string]interface{})
	if technique, _ := firstMove["technique"].(string); technique == "fill-candidate" {
		t.Errorf("expected first move to be a real solving technique (InitCandidates ran up front), got fill-candidate (mutant likely skipped NewBoard path)")
	}
}

// TestMutation_SolveAll_SkipsUnfixableConflictThenFixesNext pins the `continue`
// semantics of serveSolveAllFromConflictFix: a board whose first conflict is
// between two givens (unfixable) must be skipped so the second, user-fixable
// conflict is resolved. The `continue` -> `break` mutant aborts on the first
// unfixable conflict and falls through to the no-conflict autosolve path.
func TestMutation_SolveAll_SkipsUnfixableConflictThenFixesNext(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := make([]int, 81)
	givens := make([]int, 81)
	// First (lower-indexed) row-0 conflict: both cells are givens -> unfixable.
	board[0], givens[0] = 5, 5
	board[1], givens[1] = 5, 5
	// Second row-0 conflict: cell 4 is the given, cell 8 is the user entry.
	board[4], givens[4] = 7, 7
	board[8] = 7 // user entry, not a given

	_, resp := postSolveAll(t, router, map[string]interface{}{
		"token": token, "board": board, "givens": givens,
	})
	moves, ok := resp["moves"].([]interface{})
	if !ok || len(moves) == 0 {
		t.Fatalf("expected moves, got %v", resp)
	}
	first, _ := moves[0].(map[string]interface{})
	mv, _ := first["move"].(map[string]interface{})
	technique, _ := mv["technique"].(string)
	if technique != "fix-conflict" {
		t.Fatalf("expected first move fix-conflict (skip-then-fix), got %q (sequence=%v)", technique, solveAllTechniques(resp))
	}
	targets, _ := mv["targets"].([]interface{})
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]interface{})
	if int(target["row"].(float64)) != 0 || int(target["col"].(float64)) != 8 {
		t.Errorf("expected the user cell (0,8) to be fixed, got %v", target)
	}
}

// TestMutation_VerifyToken_InvalidBase64ReturnsDecodeError pins that a payload
// with a valid HMAC signature but invalid base64 is rejected with the base64
// decode error (not a later JSON/expiry error). The branch/if mutant that drops
// `return nil, err` lets execution fall through to json.Unmarshal, which returns
// a different ("unexpected end of JSON input") error.
func TestMutation_VerifyToken_InvalidBase64ReturnsDecodeError(t *testing.T) {
	encoded := "not_valid_base64!!"
	h := hmac.New(sha256.New, []byte("secret"))
	h.Write([]byte(encoded))
	sig := base64.URLEncoding.EncodeToString(h.Sum(nil))
	tok := encoded + "." + sig

	_, err := verifyToken("secret", tok)
	if err == nil {
		t.Fatalf("expected an error for invalid base64 payload, got nil")
	}
	if !strings.Contains(err.Error(), "base64") {
		t.Errorf("expected a base64 decode error, got %q (the return was likely skipped)", err.Error())
	}
}

// TestMutation_DailyHandler_ReflectsLoaderDailyIndex pins that the daily
// endpoint's puzzle_index mirrors what puzzles.Global().GetDailyPuzzle returns
// for today. The branch/if mutant that drops `puzzleIndex = ...` leaves the
// field stuck at its zero value. When today's daily index (FNV hash of the UTC
// date string modulo puzzleCount) is non-zero, the mutant observably diverges.
// The test asserts equality, so it passes on the original regardless of today's
// index and fails on the mutant whenever today's index is non-zero.
func TestMutation_DailyHandler_ReflectsLoaderDailyIndex(t *testing.T) {
	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/daily", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	loader := puzzles.Global()
	if loader == nil {
		t.Skip("no global loader configured; daily index is not meaningful")
	}
	_, _, expected, err := loader.GetDailyPuzzle(time.Now(), "medium")
	if err != nil {
		t.Skipf("loader cannot resolve today's daily puzzle: %v", err)
	}
	got, _ := resp["puzzle_index"].(float64)
	if int(got) != expected {
		t.Errorf("expected puzzle_index=%d (from loader.GetDailyPuzzle), got %v", expected, got)
	}
}

// TestMutation_FindPracticePuzzle_FindsSingleOccurrenceTechnique kills the
// numbers/incrementer mutant that tightens `count > 0` to `count > 1` in
// findPracticePuzzle. In the test loader, "x-wing" appears exactly once (count
// == 1) in puzzle 0 extreme and is absent from every other puzzle/difficulty,
// so the original returns ok=true while the count>1 mutant finds no match and
// returns ok=false.
func TestMutation_FindPracticePuzzle_FindsSingleOccurrenceTechnique(t *testing.T) {
	loader := puzzles.Global()
	solver := human.NewSolver()
	_, _, _, ok := findPracticePuzzle(loader, solver, "x-wing", techniqueToDifficulties["x-wing"], loader.Count(), 50)
	if !ok {
		t.Errorf("expected findPracticePuzzle to find a technique that appears exactly once; mutant count>1 likely skipped it")
	}
}

// TestMutation_FindPracticePuzzle_IndexArithmeticReachesNonZeroPuzzle kills the
// arithmetic/base mutants on `idx := (startIdx + i) % puzzleCount` (line 483).
// The `% -> *` mutant produces out-of-range indices for every i when
// startIdx != 0, and only ever visits index 0 when startIdx == 0; the
// `(startIdx + i) -> (startIdx - i)` mutant visits the same index set in a
// time-dependent order. By swapping the loader so the searched technique
// ("x-wing") lives ONLY in puzzle index 1 (never index 0), every original
// iteration finds the match while mutant iterations either always miss
// (`% -> *`) or miss on every startIdx == 0 tick (`+ -> -`). Looping 30x
// amortizes the time-based startIdx so at least one iteration hits the
// distinguishing case for the `+ -> -` mutant.
func TestMutation_FindPracticePuzzle_IndexArithmeticReachesNonZeroPuzzle(t *testing.T) {
	original := puzzles.Global()
	// testPuzzles[1] carries only hidden-single; testPuzzles[0] carries x-wing.
	// Putting testPuzzles[1] first means x-wing lives in puzzle index 1.
	swapped := puzzles.NewLoaderFromPuzzles([]puzzles.CompactPuzzle{
		testPuzzles[1], testPuzzles[0],
	})
	puzzles.SetGlobal(swapped)
	defer puzzles.SetGlobal(original)

	loader := puzzles.Global()
	solver := human.NewSolver()
	for i := 0; i < 30; i++ {
		_, _, _, ok := findPracticePuzzle(loader, solver, "x-wing", techniqueToDifficulties["x-wing"], loader.Count(), 50)
		if !ok {
			t.Errorf("iteration %d: expected findPracticePuzzle to reach puzzle 1 and find x-wing; index-arithmetic mutant likely only scanned puzzle 0", i)
			return
		}
	}
}
