package http

import (
	"bytes"
	"context"
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
// direct package-private helper calls (handleSolveNextContradiction,
// handleAutosolveContradiction, findPracticePuzzle) when the mutated branch is
// only reachable from a crafted solver state. The cell-zero blocker case for
// what was findBlockingUserCell is now pinned in the diagnosis package, which
// owns the shared helper.
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
	var resp map[string]any
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
	var resp map[string]any
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

	givens, _, _, ok := findPracticePuzzle(context.Background(), loader, solver, "hidden-single", diffs, loader.Count(), 50)

	if !ok {
		t.Fatalf("expected to find a hidden-single puzzle, got not-found; givens=%v", givens)
	}
	if len(givens) != constants.TotalCells {
		t.Errorf("returned givens must be %d cells, got %d", constants.TotalCells, len(givens))
	}
}

// callSolveNextContradiction runs handleSolveNextContradiction against a crafted
// contradiction move and returns the parsed inner move object (the value of the
// response's "move" key). handleSolveNextContradiction writes a top-level JSON
// object {"move":{...}, "board":..., "candidates":...}; callers want the inner
// move to inspect technique/targets/highlights.
func callSolveNextContradiction(t *testing.T, board *human.Board, targets []core.CellRef, reqBoard, givens []int) map[string]any {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)

	move := &core.Move{Action: "contradiction", Targets: targets}
	if !handleSolveNextContradiction(c, board, move, reqBoard, nil, givens) {
		t.Fatalf("expected handleSolveNextContradiction to handle the contradiction (return true)")
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response %q: %v", w.Body.String(), err)
	}
	inner, ok := resp["move"].(map[string]any)
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
	targets, _ := move["targets"].([]any)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]any)
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
	targets, _ := move["targets"].([]any)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]any)
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
	targets, _ := fix.Move.(map[string]any)["targets"].([]map[string]int)
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
	targets, _ := fix.Move.(map[string]any)["targets"].([]map[string]int)
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
		mv, ok := moves[i].Move.(map[string]any)
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
	givens := dp.CarveGivensWithSubset(context.Background(), solved, 4242)["easy"]
	// Add one correct user entry at a non-given cell so userEntryCount > 0 at solve.
	board := make([]int, 81)
	copy(board, givens)
	addedIdx := -1
	for i := range 81 {
		if givens[i] == 0 {
			board[i] = solved[i]
			addedIdx = i
			break
		}
	}
	if addedIdx < 0 {
		t.Skip("no non-given cell available to place a user entry")
	}

	_, resp := postSolveAll(t, router, map[string]any{
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
	givens := dp.CarveGivensWithSubset(context.Background(), solved, 4242)["easy"]
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
		for c := range constants.GridSize {
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

	_, resp := postSolveAll(t, router, map[string]any{
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
	givens := dp.CarveGivensWithSubset(context.Background(), solved, 31337)["medium"]

	bodyBytes, _ := json.Marshal(map[string]any{
		"token": token, "board": givens, "givens": givens,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/solve/all", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	moves, ok := resp["moves"].([]any)
	if !ok || len(moves) == 0 {
		t.Fatalf("expected at least one move, got %v", resp["moves"])
	}
	first, _ := moves[0].(map[string]any)
	cands, _ := first["candidates"].([]any)
	populated := 0
	for _, c := range cands {
		if arr, ok := c.([]any); ok && len(arr) > 0 {
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
	firstMove, _ := first["move"].(map[string]any)
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

	_, resp := postSolveAll(t, router, map[string]any{
		"token": token, "board": board, "givens": givens,
	})
	moves, ok := resp["moves"].([]any)
	if !ok || len(moves) == 0 {
		t.Fatalf("expected moves, got %v", resp)
	}
	first, _ := moves[0].(map[string]any)
	mv, _ := first["move"].(map[string]any)
	technique, _ := mv["technique"].(string)
	if technique != "fix-conflict" {
		t.Fatalf("expected first move fix-conflict (skip-then-fix), got %q (sequence=%v)", technique, solveAllTechniques(resp))
	}
	targets, _ := mv["targets"].([]any)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	target, _ := targets[0].(map[string]any)
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

// TestMutation_DailyHandler_PuzzleIndexIsNonZeroFromLoader (below) kills the
// `puzzleIndex = ...` drop mutant deterministically. The earlier
// TestMutation_DailyHandler_ReflectsLoaderDailyIndex was removed because it
// compared the response against the live loader's GetDailyPuzzle(time.Now()),
// which only killed the mutant on days whose daily index is non-zero (it passed
// green on the mutant whenever today's index wrapped to 0, e.g. on the 1st of a
// month). The non-zero-loader variant replaces it hermetically.

// TestMutation_FindPracticePuzzle_FindsSingleOccurrenceTechnique kills the
// numbers/incrementer mutant that tightens `count > 0` to `count > 1` in
// findPracticePuzzle. In the test loader, "x-wing" appears exactly once (count
// == 1) in puzzle 0 extreme and is absent from every other puzzle/difficulty,
// so the original returns ok=true while the count>1 mutant finds no match and
// returns ok=false.
func TestMutation_FindPracticePuzzle_FindsSingleOccurrenceTechnique(t *testing.T) {
	loader := puzzles.Global()
	solver := human.NewSolver()
	_, _, _, ok := findPracticePuzzle(context.Background(), loader, solver, "x-wing", techniqueToDifficulties["x-wing"], loader.Count(), 50)
	if !ok {
		t.Errorf("expected findPracticePuzzle to find a technique that appears exactly once; mutant count>1 likely skipped it")
	}
}

// TestMutation_FindPracticePuzzle_IndexArithmeticReachesNonZeroPuzzle kills the
// arithmetic/base mutant that turns `idx := (startIdx + i) % puzzleCount` into
// `(startIdx + i) * puzzleCount` in findPracticePuzzle (routes.go). The swapped
// loader puts x-wing ONLY in puzzle index 1, so the original visits every index
// (maxSamples >= puzzleCount) and always finds it, while the `% -> *` mutant
// produces only index 0 (startIdx==0, i==0) or out-of-range indices and returns
// not-found. A single call is hermetic: the kill does not depend on the
// wall-clock startIdx seeded by time.Now().UnixNano().
//
// The `(startIdx + i) -> (startIdx - i)` mutant is intentionally NOT claimed
// here. Go's `%` preserves the dividend sign, so that mutant's visited index set
// is {startIdx, startIdx-1, ..., 0} and it only misses index 1 when startIdx==0.
// No fixture can kill it deterministically while startIdx is wall-clock-seeded
// (startIdx==1 lets the mutant reach index 1 and coincidentally pass). The
// previous 30-iteration loop was a probabilistic workaround for this; it was
// flaky under CI load and has been replaced by the hermetic single-call kill of
// the mutant that is genuinely catchable.
func TestMutation_FindPracticePuzzle_IndexArithmeticReachesNonZeroPuzzle(t *testing.T) {
	original := puzzles.Global()
	// testPuzzles[1] carries only hidden-single; testPuzzles[0] carries x-wing.
	// Putting testPuzzles[1] first means x-wing lives only in puzzle index 1.
	swapped := puzzles.NewLoaderFromPuzzles([]puzzles.CompactPuzzle{
		testPuzzles[1], testPuzzles[0],
	})
	puzzles.SetGlobal(swapped)
	defer puzzles.SetGlobal(original)

	loader := puzzles.Global()
	solver := human.NewSolver()
	_, _, _, ok := findPracticePuzzle(context.Background(), loader, solver, "x-wing", techniqueToDifficulties["x-wing"], loader.Count(), 50)
	if !ok {
		t.Fatalf("expected findPracticePuzzle to reach puzzle index 1 and find x-wing; the `%% -> *` index-arithmetic mutant only ever scanned index 0")
	}
}

// TestMutation_CustomValidate_RejectsOverNineGivens kills the L1373 branch/if
// mutant that drops `return` after requireBoardValues writes its 400. With the
// return intact the response body is exactly the validation error; without it,
// the handler keeps running and either overwrites the body or panics into a 500.
func TestMutation_CustomValidate_RejectsOverNineGivens(t *testing.T) {
	router := setupRouter()
	givens := make([]int, 81)
	givens[0] = 50 // out of legal range 0-9

	body, _ := json.Marshal(map[string]any{
		"givens": givens, "device_id": "dev-1",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/custom/validate", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for out-of-range given, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "out of range") {
		t.Errorf("expected body to contain 'out of range', got %q (the return-after-validation was likely dropped)", w.Body.String())
	}
}

// Kills the numbers/incrementer mutant on runAutosolveLoop's initial fixCount=0 -> 1
// (L1224): maxFixes=5 and 6 duplicate user entries in row 0 -> original performs 5 fixes
// (leaving 1 valid five); the mutant (effective cap 4) leaves 2 fives, a conflict.
func TestMutation_AutosolveFixCountCap_Incrementer(t *testing.T) {
	board := make([]int, constants.TotalCells)
	for c := range 6 {
		board[c] = 5 // row 0: six user-entered 5s (givens all zero, so all are fixable)
	}
	givens := make([]int, constants.TotalCells)
	b := human.NewBoard(board)
	origUser := make([]int, constants.TotalCells)
	copy(origUser, board)
	solver := human.NewSolver()
	_, finalBoard := runAutosolveLoop(context.Background(), solver, b, origUser, givens, nil, 0)
	cells := finalBoard.GetCells()
	count5 := 0
	for c := range constants.GridSize {
		if cells[c] == 5 {
			count5++
		}
	}
	if count5 != 1 {
		t.Fatalf("expected exactly 1 five remaining in row 0 after 5 fixes (maxFixes cap), got %d", count5)
	}
}

// Kills the numbers/decrementer mutant on runAutosolveLoop's initial fixCount=0 -> -1
// (L1224): maxFixes=5 and 7 duplicate user entries in row 0 -> original performs 5 fixes
// (leaving 2 fives, still conflicting); the mutant (effective cap 6) performs 6, leaving 1.
func TestMutation_AutosolveFixCountCap_Decrementer(t *testing.T) {
	board := make([]int, constants.TotalCells)
	for c := range 7 {
		board[c] = 5 // row 0: seven user-entered 5s
	}
	givens := make([]int, constants.TotalCells)
	b := human.NewBoard(board)
	origUser := make([]int, constants.TotalCells)
	copy(origUser, board)
	solver := human.NewSolver()
	_, finalBoard := runAutosolveLoop(context.Background(), solver, b, origUser, givens, nil, 0)
	cells := finalBoard.GetCells()
	count5 := 0
	for c := range constants.GridSize {
		if cells[c] == 5 {
			count5++
		}
	}
	if count5 != 2 {
		t.Fatalf("expected exactly 2 fives remaining in row 0 after hitting the maxFixes=5 cap, got %d", count5)
	}
}

// TestMutation_DailyHandler_PuzzleIndexIsNonZeroFromLoader kills the branch/if
// mutant that empties `puzzleIndex = loader.GetDailyPuzzle(...)` in dailyHandler,
// leaving puzzle_index stuck at 0. A loader is built whose puzzle count makes
// today's daily index deterministically non-zero, so the response must echo that
// exact non-zero index; the mutant would return 0.
func TestMutation_DailyHandler_PuzzleIndexIsNonZeroFromLoader(t *testing.T) {
	original := puzzles.Global()
	defer puzzles.SetGlobal(original)

	var loader *puzzles.Loader
	var expected int
	for n := 3; n <= 300; n++ {
		reps := make([]puzzles.CompactPuzzle, 0, n)
		for range n {
			reps = append(reps, testPuzzles[0])
		}
		cand := puzzles.NewLoaderFromPuzzles(reps)
		_, _, idx, err := cand.GetDailyPuzzle(time.Now(), "medium")
		if err == nil && idx != 0 {
			loader = cand
			expected = idx
			break
		}
	}
	if loader == nil {
		t.Fatal("could not build a loader whose daily index is non-zero for today")
	}
	puzzles.SetGlobal(loader)

	router := setupRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/daily", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	got, _ := resp["puzzle_index"].(float64)
	if int(got) != expected {
		t.Fatalf("expected puzzle_index=%d (non-zero, from loader), got %v; the puzzleIndex assignment was dropped", expected, int(got))
	}
}

// TestMutation_CustomValidate_StopsAfterOutOfRangeGiven kills the branch/if
// mutant that empties the `if !requireBoardValues { return }` guard in
// customValidateHandler. With the return intact the response body is exactly the
// out-of-range validation error. Without it, the handler keeps running and
// appends the downstream "need at least 17 givens" response, which this test
// asserts is absent.
func TestMutation_CustomValidate_StopsAfterOutOfRangeGiven(t *testing.T) {
	router := setupRouter()
	givens := make([]int, 81)
	givens[0] = 50 // out of legal range 0-9

	body, _ := json.Marshal(map[string]any{"givens": givens, "device_id": "dev-1"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/custom/validate", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for out-of-range given, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "out of range") {
		t.Fatalf("expected out-of-range error body, got %q", w.Body.String())
	}
	if strings.Contains(w.Body.String(), "need at least") {
		t.Fatalf("handler continued past requireBoardValues; the guard return was dropped: %q", w.Body.String())
	}
}

// TestMutation_FindPracticePuzzle_ContinuesPastLoaderError kills the loop/break
// mutant that turns the loader-error `continue` into `break`. The single puzzle
// has ONLY its extreme ("x") difficulty populated, so GetPuzzle for the earlier
// "medium" difficulty errors. The scanner must continue to the extreme
// difficulty (which exhibits x-wing); a break would abandon the index and, with
// one puzzle, never reach the match.
func TestMutation_FindPracticePuzzle_ContinuesPastLoaderError(t *testing.T) {
	loader := puzzles.NewLoaderFromPuzzles([]puzzles.CompactPuzzle{
		{S: testPuzzles[0].S, G: map[string][]int{"x": testPuzzles[0].G["x"]}},
	})
	solver := human.NewSolver()
	_, _, diff, ok := findPracticePuzzle(context.Background(), loader, solver, "x-wing", []string{"medium", "extreme"}, loader.Count(), 5)
	if !ok {
		t.Fatal("expected x-wing found at extreme after skipping the erroring medium difficulty; loader-error branch broke instead of continued")
	}
	if diff != "extreme" {
		t.Fatalf("expected match at extreme difficulty, got %q", diff)
	}
}

// TestMutation_FindPracticePuzzle_ContinuesPastUnsolvedDifficulty kills the
// loop/break mutant that turns the status!=completed `continue` into `break`.
// The single puzzle's "medium" difficulty carries only 2 givens (the human
// solver stalls, status != completed) while its extreme ("x") difficulty
// exhibits x-wing. The scanner must continue past the unsolved medium to the
// extreme match; a break would abandon the index before reaching it.
func TestMutation_FindPracticePuzzle_ContinuesPastUnsolvedDifficulty(t *testing.T) {
	loader := puzzles.NewLoaderFromPuzzles([]puzzles.CompactPuzzle{
		{S: testPuzzles[0].S, G: map[string][]int{
			"m": {0, 1},
			"x": testPuzzles[0].G["x"],
		}},
	})
	solver := human.NewSolver()
	_, _, diff, ok := findPracticePuzzle(context.Background(), loader, solver, "x-wing", []string{"medium", "extreme"}, loader.Count(), 5)
	if !ok {
		t.Fatal("expected x-wing found at extreme after skipping the unsolved medium difficulty; status!=completed branch broke instead of continued")
	}
	if diff != "extreme" {
		t.Fatalf("expected match at extreme difficulty, got %q", diff)
	}
}

// TestMutation_SolveAll_Step2FixCountStartsAtZero kills both numeric mutants on
// solveAllHandler's STEP 2 call `runAutosolveLoop(context.Background(), ..., nil, 0)`: the incrementer
// (0 -> 1) and the decrementer (0 -> -1). The board carries no direct conflicts
// (so STEP 2 is taken) but 10 attributable user errors, more than the maxFixes=5
// cap. Starting fixCount at 0, the loop emits exactly 5 fix-error moves before
// the cap; seeding it at 1 caps at 4, and at -1 caps at 6. Pinning the count to
// exactly 5 fails on either mutant.
func TestMutation_SolveAll_Step2FixCountStartsAtZero(t *testing.T) {
	router := setupRouter()
	token := getValidToken(router)

	board := []int{5, 0, 6, 0, 0, 2, 0, 0, 8, 0, 8, 0, 9, 0, 3, 4, 5, 6, 0, 7, 4, 5, 0, 0, 1, 2, 0, 0, 0, 0, 0, 9, 6, 0, 4, 2, 4, 5, 9, 2, 0, 1, 6, 0, 7, 8, 0, 3, 4, 7, 0, 9, 1, 0, 2, 0, 0, 0, 1, 8, 3, 7, 4, 9, 1, 8, 3, 6, 5, 0, 0, 0, 7, 4, 5, 0, 0, 0, 0, 6, 1}
	givens := []int{0, 0, 0, 0, 0, 2, 0, 0, 8, 0, 0, 0, 9, 0, 3, 4, 5, 6, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 9, 6, 0, 4, 0, 4, 5, 9, 2, 0, 1, 6, 0, 7, 8, 0, 0, 4, 7, 0, 9, 1, 0, 2, 0, 0, 0, 1, 8, 3, 0, 4, 9, 1, 8, 3, 6, 0, 0, 0, 0, 0, 4, 5, 0, 0, 0, 0, 6, 1}

	code, resp := postSolveAll(t, router, map[string]any{
		"token":  token,
		"board":  board,
		"givens": givens,
	})
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%v", code, resp)
	}

	techs := solveAllTechniques(resp)
	fixErrors := 0
	for _, tc := range techs {
		if tc == "fix-error" {
			fixErrors++
		}
	}
	if fixErrors != 5 {
		t.Fatalf("expected exactly 5 fix-error moves (maxFixes cap from fixCount=0), got %d; sequence=%v", fixErrors, techs)
	}
}

// TestMutation_CreateToken_ReturnsErrorOnUnmarshalableSession kills the branch/if
// mutant that empties createToken's `if err != nil { return "", err }` guard.
// json.Marshal fails when a time.Time year falls outside [0,9999], so a session
// whose ExpiresAt is year 10000 makes marshaling fail. createToken must surface
// the error and return an empty token; the mutant would fall through and return a
// bogus token with a nil error.
func TestMutation_CreateToken_ReturnsErrorOnUnmarshalableSession(t *testing.T) {
	session := SessionToken{
		DeviceID:  "dev-1",
		ExpiresAt: time.Date(10000, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	tok, err := createToken("secret", session)
	if err == nil {
		t.Fatalf("expected an error for an unmarshalable session time, got token=%q with nil error", tok)
	}
	if tok != "" {
		t.Fatalf("expected empty token on marshal error, got %q", tok)
	}
}
