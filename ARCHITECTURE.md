# Architecture

This document describes the runtime architecture of the Sudoku app: how the
code is organized, how work flows from the UI to the solver and back, and how
the development and production deployments differ.

## High-Level Summary

The application is a single-page React PWA. After the first load it runs
entirely in the browser with no backend: the Sudoku solver is a Go library
compiled to WebAssembly and executed in a dedicated Web Worker. A Go HTTP
server exists in the repository but is a development convenience only and is
not shipped to production.

Two solver implementations are shared between the two build targets:

| Package | Purpose | Algorithm |
|---|---|---|
| `api/internal/sudoku/human` | Hints, step-by-step solve, technique analysis | Human-like constraint propagation across 39+ named techniques |
| `api/internal/sudoku/dp` | Verification and uniqueness checks | Backtracking with bitmask candidates (not Dancing Links) |

The `human` solver produces the educational explanations users see; the `dp`
solver is the fast path used to check validity, count solutions, and detect
conflicts. The comment at the top of `api/internal/sudoku/dp/solver.go` states
this explicitly.

## Build Targets

The same Go packages compile to two distinct entry points.

### Production: WASM solver

- Entry point: `api/cmd/wasm/main.go`.
- Built with TinyGo 0.40.1 to `frontend/public/sudoku.wasm` (approximately
  600KB). The build is invoked via `make wasm` at the repo root (or
  `make wasm-all` inside `api/`), which also copies the matching
  `wasm_exec.js` glue from the TinyGo installation.
- The module registers a global `window.SudokuWasm` object whose properties
  (`solveAll`, `findNextMove`, `solve`, `hasUniqueSolution`, `isValid`,
  `findConflicts`, `analyzePuzzle`, `validateBoard`, `validateCustomPuzzle`,
  `getPuzzleForSeed`, `getVersion`, and others) wrap the solver packages and
  translate Go values to JavaScript values.
- On load the module dispatches a `wasmReady` event that the frontend uses to
  gate solver calls until the runtime is ready.

### Development: Go HTTP server

- Entry point: `api/cmd/server/main.go`.
- Built with standard Go (`go build ./cmd/server`). Run via `cd api && make
  run`, with the `JWT_SECRET` environment variable set to a value of at least
  32 characters.
- Listens on port 8080 by default (`DefaultPort` in
  `api/pkg/constants/constants.go`).
- Exposes the same solver packages over 13 gin routes registered in
  `api/internal/transport/http/routes.go`. See
  [docs/dev-api-reference.md](docs/dev-api-reference.md) for the per-route
  contract.
- This server is not wired into `make dev`. `make dev` runs the frontend dev
  server only (see [Contributing](CONTRIBUTING.md)). The Go server is an
  optional aid for backend-focused development and E2E test fixtures.

### Relationship to the ARCH-2 review

Whether the development Go server should be quarantined or retired is tracked
as a separate decision (ARCH-2). Until that decision is made, the server and
its API reference remain in the repository but are clearly flagged as
development-only.

## Frontend Runtime Data Flow

The solver pipeline has three layers, each isolated in its own module under
`frontend/src/lib/`.

```
React component
     │  calls
     ▼
solver-service.ts   ── public solver facade (loadWasm, worker fallback)
     │  posts message
     ▼
worker-client.ts    ── request/response correlation, idle cleanup
     │  postMessage
     ▼
wasm.worker.ts      ── Web Worker: loads sudoku.wasm, calls window.SudokuWasm.*
     │  syscalljs / wasm_exec
     ▼
sudoku.wasm         ── Go human + dp solver packages
```

### Layer responsibilities

- **`solver-service.ts`** is the only module the rest of the app imports. It
  exposes high-level operations (hint, autosolve, validate, get puzzle) and
  decides where they run. Static puzzle lookups go through
  `puzzles-data.ts`; solving and validation go through the worker.
- **`worker-client.ts`** manages the Web Worker lifecycle. It correlates
  requests to responses by id, enforces per-request timeouts, and terminates
  the worker after an idle period (`IDLE_TIMEOUT_MS`) to release the WASM
  runtime's memory. When Web Workers are unavailable it falls back to loading
  WASM on the main thread.
- **`wasm.worker.ts`** is the worker entry point. It loads `sudoku.wasm`
  using the `wasm_exec.js` glue, waits for the `wasmReady` event, and forwards
  `init` / `findNextMove` / `solveAll` / `terminate` messages to the
  appropriate `SudokuWasm` functions, posting results back as structured
  `WorkerResponse` messages.

### Why a worker

Solving is CPU-intensive. Running it on the main thread would freeze the UI.
The dedicated worker keeps React rendering and the Sudoku engine on separate
threads, and the idle-cleanup keeps the WASM runtime from holding memory
while the user is idle.

## Static Data and Offline Support

- **Puzzles**: 1000+ pre-generated puzzles ship as static JSON
  (`frontend/src/lib/puzzles-data.ts`) so a fresh load can render a board
  without the WASM module. The WASM solver is only needed for solving,
  hints, and custom-puzzle validation.
- **Daily puzzle**: deterministic from the UTC date. The daily seed is the
  literal `D` prefix concatenated with the UTC date (`constants.go`:
  `DailyPuzzlePrefix`). Every client worldwide therefore gets the same puzzle
  on the same date without a server round trip.
- **PWA / Service Worker**: assets are precached so the app is fully
  functional offline after the first visit. The service worker and the Web
  Worker are separate constructs: the service worker caches network
  resources; the Web Worker runs the solver.

## Code Organization

```
api/                          Go solver and optional dev server
├── cmd/
│   ├── server/               gin HTTP server (development only)
│   ├── wasm/                 TinyGo WASM export entry point
│   └── generate_practice/    offline practice-puzzle generator
├── internal/
│   ├── core/                 shared domain types (Move, CellRef, Difficulty)
│   ├── puzzles/              pre-generated puzzle loader
│   ├── sudoku/
│   │   ├── dp/               backtracking solver (verification, uniqueness)
│   │   └── human/            human-like solver and technique registry
│   └── transport/http/       gin routes, handlers, session tokens
└── pkg/
    ├── config/               JWT_SECRET and port loading
    └── constants/            grid, difficulty, and route constants

frontend/                     React + Vite + TypeScript + Tailwind PWA
├── public/sudoku.wasm        TinyGo build output (gitignored, regenerated)
├── e2e/                      Playwright E2E tests
└── src/
    ├── components/           UI components (code-split)
    ├── hooks/                React hooks (game-logic chunk)
    ├── lib/                  solver pipeline (see "Frontend Runtime Data Flow")
    │   ├── solver-service.ts public solver facade
    │   ├── worker-client.ts  worker lifecycle and request correlation
    │   ├── wasm.worker.ts    worker entry point that loads sudoku.wasm
    │   └── puzzles-data.ts   static puzzle data
    └── pages/                route pages (lazy-loaded)

tools/                        development utilities
```

## Configuration Constants

Board geometry is centralized so the architecture can in principle support
sizes other than 9x9.

| Location | Constants |
|---|---|
| `api/pkg/constants/constants.go` | `GridSize = 9`, `BoxSize = 3`, `TotalCells = 81`, `MinGivens = 17` |
| `frontend/src/lib/constants.ts` | `BOARD_SIZE = 9`, `SUBGRID_SIZE = 3`, `MAX_DIGIT = 9` |

Both sets of values are generated from a single source by
`api/scripts/generate-ts-constants.go` (invoked via `make generate-constants`
inside `api/`), so a board-size change requires editing the Go constants and
regenerating the TypeScript mirror rather than editing two files by hand.
