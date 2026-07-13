# Dev API Reference (Development Only)

> **Status: development-only.** These endpoints are served by the optional Go
> HTTP server at `api/cmd/server/main.go`. The production application does not
> call them: it runs the same Go solver packages compiled to WebAssembly
> directly in the browser (see [../ARCHITECTURE.md](../ARCHITECTURE.md)).
>
> Whether this server should be quarantined or retired is under review as
> ARCH-2. Treat the routes below as a development and E2E-test aid, not a
> stable public API.

## Running the Server

```bash
cd api
JWT_SECRET="$(openssl rand -hex 32)" make run
# Listens on :8080 by default (PORT env var overrides)
```

`JWT_SECRET` is required and must be at least 32 characters
(`api/pkg/config/config.go` rejects `changeme` and shorter values). Puzzle
data is loaded from `PUZZLES_FILE` (default `/data/puzzles.json`); if the file
is missing the server logs a warning and falls back to on-demand generation.

## Conventions

- **Base path**: read-only routes that fetch puzzle metadata are under
  `/api`; the bare `/health` route sits at the root. The full route table is
  defined in `api/pkg/constants/constants.go` and registered in
  `api/internal/transport/http/routes.go`.
- **Board encoding**: a board is a flat JSON array of 81 integers, `0` to
  `9`, in row-major order. `0` denotes an empty cell. Boards of any other
  length are rejected with HTTP 400 (`{"error":"board must have 81 cells"}`);
  any cell outside `0` to `9` is rejected with HTTP 400.
- **Difficulties**: `easy`, `medium`, `hard`, `extreme`, `impossible`. An
  unknown value is rejected with HTTP 400.
- **Session tokens**: any route that operates on an in-progress game
  (`/solve/*`, `/validate`) requires a JWT issued by `POST /api/session/start`.
  Tokens expire after 24 hours (`SessionTokenExpiry`).
- **Error shape**: all error responses are `{"error": "<message>"}` with the
  appropriate HTTP status.

## Health and Version

### `GET /health`

Liveness probe. No auth.

**Response 200**

```json
{ "status": "ok", "version": "0.1.2" }
```

### `GET /api/version`

Returns the API and solver version constants. No auth.

**Response 200**

```json
{ "api_version": "0.1.2", "solver_version": "0.1.2" }
```

The frontend compares `solver_version` against the loaded WASM module's
`getVersion()` to decide whether the cached solver is stale.

## Puzzle Retrieval

### `GET /api/daily`

Returns today's daily puzzle seed. The seed is deterministic from the UTC
date so every client worldwide resolves the same puzzle. No auth.

**Response 200**

```json
{
  "date_utc": "2026-07-12",
  "seed": "D2026-07-12",
  "puzzle_index": 42
}
```

`puzzle_index` is `-1` when no pre-generated puzzle file is loaded.

### `GET /api/puzzle/:seed`

Returns the givens for a specific seed. No auth.

**Query parameters**

| Name | Default | Notes |
|---|---|---|
| `d` | `medium` | One of `easy`, `medium`, `hard`, `extreme`, `impossible` |

**Response 200**

```json
{
  "puzzle_id": "D2026-07-12-medium",
  "seed": "D2026-07-12",
  "difficulty": "medium",
  "givens": [0, 5, 0, /* 81 ints */],
  "puzzle_index": 42
}
```

Givens come from the pre-generated puzzle file when available; otherwise the
server generates them on demand from an FNV-1a hash of the seed
(`dp.GenerateFullGrid` + `dp.CarveGivensWithSubset`). `puzzle_index` is `-1`
for on-demand puzzles.

### `GET /api/puzzle/:seed/analyze`

Runs the human solver in analysis mode and reports the techniques required to
solve the puzzle. No auth.

**Query parameters**: same `d` as `GET /api/puzzle/:seed`.

**Response 200**

```json
{
  "seed": "D2026-07-12",
  "difficulty": "medium",
  "givens_count": 35,
  "required_difficulty": "medium",
  "status": "completed",
  "techniques": { "naked-single": 12, "hidden-single": 8 }
}
```

`status` is one of `completed`, `stalled`, `max_steps_reached`.
`techniques` maps technique slug to the number of times it was applied.

### `GET /api/practice/:technique`

Finds a puzzle that requires the named technique, for practice. No auth.

**Path parameter**

| Name | Notes |
|---|---|
| `technique` | Slug such as `x-wing`, `xy-wing`, `swordfish`, `naked-single`. Unknown slugs fall back to a default difficulty scan and typically return 404. |

**Response 200**

```json
{
  "seed": "practice-x-wing-217",
  "difficulty": "hard",
  "givens": [/* 81 ints */],
  "technique": "x-wing",
  "puzzle_index": 217,
  "cached": false
}
```

The handler samples up to 50 puzzles across the technique's difficulty tiers
and analyzes each until a match is found; hits are cached per technique.
`cached` is `true` when the result came from that cache.

**Response 404** when no sampled puzzle uses the technique:

```json
{
  "error": "no puzzle found",
  "technique": "x-wing",
  "message": "Could not find a puzzle requiring this technique. Try a different technique or check back later."
}
```

## Sessions

### `POST /api/session/start`

Mints a session token for an in-progress game. The token is required by all
`/api/solve/*` and `/api/validate` routes.

**Request body**

```json
{ "seed": "D2026-07-12", "difficulty": "medium", "device_id": "<opaque>" }
```

All three fields are required (`binding:"required"`).

**Response 200**

```json
{ "token": "<jwt>", "puzzle_id": "D2026-07-12-medium", "started_at": "2026-07-12T10:30:00Z" }
```

## Solving and Hints

All `/api/solve/*` routes require a valid session `token` and an 81-cell
`board`.

### `POST /api/solve/next`

Computes the single next human-like move, applying error correction first.

**Request body**

```json
{
  "token": "<jwt>",
  "board": [/* 81 ints */],
  "candidates": [[1,2],[],/* 81 arrays */],
  "givens": [/* 81 ints */]
}
```

`candidates` and `givens` are optional. `givens`, when supplied as 81 cells,
identifies user-entered cells for error detection; otherwise the server
resolves givens from the session seed.

**Response 200** (normal move)

```json
{
  "board": [/* 81 ints, after the move */],
  "candidates": [[/* 81 arrays */]],
  "move": {
    "step_index": 3,
    "technique": "naked-single",
    "action": "assign",
    "digit": 7,
    "targets": [{"row": 0, "col": 2}],
    "eliminations": [{"row": 0, "col": 2, "digit": 7}],
    "explanation": "R1C3 can only be 7.",
    "refs": {"title": "Naked Single", "slug": "naked-single", "url": ""},
    "highlights": {"primary": [{"row": 0, "col": 2}]}
  }
}
```

The `move.action` field is one of `assign`, `eliminate`, `contradiction`.
Special techniques emitted by the error-correction path include `fix-conflict`
(direct duplicate), `fix-error` (pinpointed bad user entry), and
`unpinpointable-error` (error present but not locatable; carries an extra
`userEntryCount` field).

**Response 200** when no move is available:

```json
{ "move": null }
```

### `POST /api/solve/all`

Runs the human solver in a loop until the puzzle is solved, the solver
stalls, or the per-run fix budget (5 user-error corrections) is exhausted.
Direct conflicts are fixed before the loop begins.

**Request body**: same shape as `/api/solve/next` (`token`, `board`,
`candidates`, `givens`).

**Response 200**

```json
{
  "moves": [
    { "board": [/* 81 ints */], "candidates": [[/* 81 */]], "move": { /* Move */ } }
  ],
  "solved": true,
  "finalBoard": [/* 81 ints */]
}
```

Each entry in `moves` is one solver step plus its resulting board snapshot.
The terminal move may be a `stalled` or `error` move describing why the loop
stopped.

### `POST /api/solve/full`

Solves the board and returns either the bare solution (fast mode) or the
full step-by-step walk (human mode, the default).

**Query parameters**

| Name | Default | Notes |
|---|---|---|
| `mode` | `human` | `fast` uses the DP backtracking solver; `human` uses the human-like solver |

**Request body** (`mode=fast` omits candidates; `mode=human` ignores them)

```json
{ "token": "<jwt>", "board": [/* 81 ints */] }
```

**Response 200** (`mode=fast`)

```json
{ "final_board": [/* 81 ints */] }
```

**Response 200** (`mode=human`)

```json
{
  "moves": [ /* Move[] */ ],
  "final_board": [/* 81 ints */],
  "stopped_reason": "completed"
}
```

`stopped_reason` is the `status` returned by `human.SolveWithSteps`:
`completed`, `stalled`, or `max_steps_reached` (cap `MaxSolverSteps = 5000`).

## Validation

### `POST /api/validate`

Validates an in-progress board state against Sudoku rules and solvability.

**Request body**

```json
{ "token": "<jwt>", "board": [/* 81 ints */] }
```

**Response 200** (valid and still solvable)

```json
{ "valid": true, "message": "All entries are correct so far!" }
```

**Response 200** (direct conflicts present; `conflictCells` is the sorted list
of involved cell indices)

```json
{
  "valid": false,
  "reason": "conflicts",
  "message": "There are conflicting numbers in the puzzle",
  "conflicts": [{"cell1": 0, "cell2": 5, "value": 7, "type": "row"}],
  "conflictCells": [0, 5]
}
```

**Response 200** (no conflicts but the board is unsolvable from the current
state, i.e. a user entry is wrong)

```json
{
  "valid": false,
  "reason": "unsolvable",
  "message": "The puzzle cannot be solved from this state - a digit you entered is incorrect"
}
```

### `POST /api/custom/validate`

Validates a user-entered custom puzzle for solvability and uniqueness. Does
not require a session token.

**Request body**

```json
{ "givens": [/* 81 ints */], "device_id": "<opaque>" }
```

**Response 200** (valid and unique; `puzzle_id` is derived from a SHA-256 of
the givens)

```json
{ "valid": true, "unique": true, "puzzle_id": "custom-9f2a1b3c7d8e0f12" }
```

**Response 200** (valid but multiple solutions)

```json
{ "valid": true, "unique": false, "reason": "puzzle has multiple solutions" }
```

**Response 200** (rejected; one of the reasons below)

| `reason` | Cause |
|---|---|
| `need at least 17 givens` | Fewer than `MinGivens` (17) non-zero cells |
| `puzzle contains conflicts` | Duplicate digits in a row, column, or box |
| `puzzle has no solution` | No solution exists (DP solver returned 0) |
