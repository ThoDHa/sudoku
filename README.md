# Sudoku

**🎮 [Play Game](https://thodha.github.io/sudoku/) | 📊 [Test Reports](https://thodha.github.io/sudoku/reports/)**

[![CI/CD Pipeline](https://github.com/ThoDHa/sudoku/actions/workflows/deploy.yml/badge.svg)](https://github.com/ThoDHa/sudoku/actions/workflows/deploy.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

An advanced educational Sudoku web application that teaches solving techniques through human-like hints and intelligent assistance features.

## 🎯 What Makes This Different

This isn't just another Sudoku app. It's a comprehensive learning platform that:

- **Teaches Real Techniques**: Learn 39+ solving methods from basic Singles to advanced Forcing Chains
- **Thinks Like You Do**: Human-like solver explains each step with detailed reasoning
- **Fixes Your Mistakes**: Intelligent error detection and correction with clear explanations
- **Works Everywhere**: Installable PWA with opt-in offline mode that caches the full app, solver included
- **Optimized Performance**: Code-split architecture with battery-efficient background handling
- **Educational Focus**: Practice specific techniques with curated puzzle sets

## ✨ Key Features

### 🧩 **Game Modes**
- **5 Difficulty Levels**: Easy → Medium → Hard → Extreme → Impossible
- **Daily Puzzles**: Fresh puzzle every day, synchronized globally
- **Game Mode**: Play random puzzles at your chosen difficulty
- **Custom Puzzles**: Enter, validate, and solve your own creations
- **Share to a Friend**: Share either the bare puzzle or your exact current game (givens, your entries, and pencil notes) as a link. A friend opens a playable copy; if they already have progress on that puzzle, they choose whether to keep theirs or open the shared position.

### 🧠 **Intelligent Assistance**
- **Educational Hints (💡)**: Step-by-step guidance with technique explanations
- **Auto-Solve (🤖)**: Watch the solver work through puzzles with battery optimization
- **Auto-fill Candidates (📝)**: Smart candidate placement with visual feedback
- **Error Correction (🔧)**: Intelligent detection and fixing of user mistakes
- **Validation**: Real-time error detection and board state checking

### 🎨 **User Experience**
- **Responsive Design**: Seamless experience across desktop, tablet, and mobile
- **Dark/Light Themes**: Multiple color schemes with system preference detection
- **Intuitive Controls**: Click, keyboard, and touch-optimized interactions
- **Visual Highlighting**: Smart digit and cell highlighting with consistent behavior
- **Gesture Support**: Tap to place, long-press for notes, swipe navigation

### ⚡ **Performance & Reliability**
- **Fast Loading**: Initial bundle ~170KB (reduced from 770KB)
- **Battery Efficient**: Automatic pause when backgrounded, extended suspension after 15s
- **Offline Mode (Opt-In)**: After enabling it in the menu, the service worker precaches the app shell and WASM solver so the game works with no network
- **WASM Solver**: Go-based solver running in a dedicated Web Worker for non-blocking UI (~650KB cached)

## 🎮 How to Play

### Basic Controls
- **Place Numbers**: Click cell + click digit, or select cell + press 1-9
- **Notes Mode**: Toggle with 'N' key or notes button to add/remove candidate digits
- **Erase**: Select erase mode or press Delete/Backspace on selected cell
- **Navigation**: Arrow keys, Tab, or click to move between cells
- **Undo/Redo**: Ctrl+Z/Ctrl+Y or use toolbar buttons

### Getting Assistance
- **Hints (💡)**: Click hint button for step-by-step guidance with technique explanations
- **Auto-fill (📝)**: Fill all valid candidates automatically for a great starting point
- **Auto-solve (🤖)**: Watch the AI solve with educational explanations
- **Validation**: Check your progress with highlighted errors and incomplete regions

### Learning Features
- **Technique Practice**: Focus on specific solving methods with curated puzzles
- **Progressive Difficulty**: Start easy and work up to expert-level techniques
- **Detailed Explanations**: Every hint includes why the move works and what technique applies
- **Visual Aids**: Highlighting shows you exactly where techniques apply

## ⚙️ How It Works

The entire application runs locally in your browser; there is no backend server. With offline mode enabled, it needs no network after the first load.

### 🧱 **Architecture Overview**
- **WASM Solver**: Go-based constraint solver compiled with TinyGo to WebAssembly (~650KB, cached)
- **Web Worker Isolation**: Solver runs in a dedicated Web Worker thread for non-blocking UI
- **Static Puzzles**: 1000+ pre-generated puzzles embedded for instant access
- **Practice Database**: Pre-sorted puzzles categorized by required techniques
- **Daily Determinism**: UTC date-based seeding ensures same daily puzzle globally
- **Offline Mode (Opt-In)**: Service worker + PWA manifest; the menu toggle registers or fully removes the offline caches

### 🔧 **Technical Stack**
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, PWA
- **WASM Solver**: Go 1.26, TinyGo 0.41.1, WebAssembly, constraint propagation + backtracking
- **State Management**: React hooks, Context API, localStorage persistence
- **Performance**: Route-based code splitting, lazy loading, WASM in dedicated Web Worker
- **Testing**: Vitest unit tests, Playwright E2E, Go test suite (all via Docker)

### 🎯 **Extensibility**

The game architecture supports different board sizes through constant changes. Current implementation is 9x9; a 16x16 variant needs the constant updates below plus the follow-on work the considerations list names.

**Current 9x9 Implementation:**

Frontend constants (in `frontend/src/lib/constants.ts`):
- `BOARD_SIZE = 9`
- `SUBGRID_SIZE = 3`
- `TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE` (81)
- `MAX_DIGIT = BOARD_SIZE` (9)

Go constants (in `api/pkg/constants/constants.go`):
- `GridSize = 9`
- `BoxSize = 3`
- `TotalCells = 81`

**For 16x16 Sudoku:**

Update the following constants:

Frontend:
- `BOARD_SIZE = 16`
- `SUBGRID_SIZE = 4` (since √16 = 4)
- `MAX_DIGIT = 16` (sixteen symbols, displayed as 1-9 and A-G)

Go:
- `GridSize = 16`
- `BoxSize = 4`

**Additional Considerations for 16x16:**

- **Digit Notation**: 16x16 Sudoku uses sixteen symbols (typically 1-9 plus A-G), not the decimal 1-9. UI would need to support digit selection beyond 9.
- **Candidate Bitmasks**: Current bitmask implementation assumes 9 digits. For 16x16, `Uint16Array` would need to become `Uint32Array` (or larger) to accommodate 16 bits.
- **Solver Logic**: The Go-based solver's constraint propagation and backtracking algorithms already handle variable board sizes via constants.
- **UI Layout**: Cell grid spacing and digit display would need adjustment for 16x16 board.

The architecture is designed for extensibility: all production code uses centralized constants rather than hardcoded values, making board size variants straightforward to implement.

## 📊 Performance & Mobile Optimization

### ⚡ **Loading Performance**
- **Lightning Fast**: Initial bundle ~170KB (down from 770KB)
- **Tiny WASM**: Solver compiled with TinyGo (~650KB, down from 3.3MB)
- **Smart Chunking**: Route-based code splitting; the per-chunk sizes are listed in the build output table below
- **Opt-In Offline**: When enabled in the menu, the service worker precaches the shell and solver for instant, network-free loads
- **Progressive Loading**: The core game chunk loads first; technique pages, the leaderboard, and other routes arrive as their lazy chunks load

### 🔋 **Battery & Mobile Efficiency**
- **Background Pause**: All operations pause when the app loses focus
- **Extended Suspension**: Complete shutdown after 15s to prevent battery drain
- **Touch Optimization**: Gesture-friendly controls optimized for mobile devices
- **Memory Management**: Smart WASM lifecycle prevents memory leaks
- **Low Data Usage**: One static fetch of the app and solver; with offline mode off, nothing is cached and no requests repeat needlessly

### 📱 **Responsive Design**
- **Mobile-First**: Optimized touch interactions and gesture support
- **Adaptive Layout**: Scales seamlessly from phone to desktop
- **Accessibility**: Full keyboard navigation and screen reader support
- **PWA Features**: Install to home screen with app icons; offline caching is a menu toggle, and new deploys take over automatically on next launch

## 🤖 Assistance Features Explained

The app provides three distinct types of help, each serving different learning goals:

### 💡 **Hints: Learn Step by Step**
- **Purpose**: Educational guidance that teaches real solving techniques
- **How it Works**: Analyzes current board state and suggests the next logical move
- **What You Get**: Detailed explanation of why the move works and what technique applies
- **Learning Value**: High, builds your solving skills progressively
- **Usage**: Perfect for learning new techniques or when stuck on a specific step

### 🤖 **Auto-Solve: Watch and Learn**
- **Purpose**: Demonstration of complete solving process with educational value
- **How it Works**: AI solver completes puzzle step-by-step with real-time explanations
- **What You Get**: Full solution path with technique annotations and timing control
- **Learning Value**: Medium, great for seeing advanced techniques in action
- **Usage**: Study complex puzzles, verify your approach, or just enjoy the show

### 📝 **Auto-fill: Smart Starting Point**
- **Purpose**: Automatically fill in valid candidates to reduce manual work
- **How it Works**: Analyzes empty cells and fills all mathematically valid candidate digits
- **What You Get**: Complete candidate notation without the tedious manual entry
- **Learning Value**: Low, a convenience feature that saves time
- **Usage**: Start puzzles faster, recover from mistakes, or focus on logic over notation

### 📈 **Progress Tracking**
The app separately tracks usage of each assistance type, so you can:
- Challenge yourself to solve without hints
- Compare solving approaches across difficulty levels
- Build confidence by gradually reducing assistance dependency
- Track your learning progress over time

### 🔧 **Error Correction: Fix Your Mistakes**
Made errors while solving? The solver intelligently detects and fixes them:

- **Direct Conflicts**: Detects when you place the same digit twice in a row, column, or box. Explains exactly which cells conflict.
- **Blocking Cells**: Finds when your entry eliminates all possibilities for another cell. Traces the logical chain to identify the problem cell.
- **Complex Errors**: When errors can't be traced to a single cell, provides guidance based on the number of user entries.

Errors are corrected **one at a time** with clear explanations, so you learn from each mistake.

## Quick Start

### GitHub Pages (Live)

Visit **https://thodha.github.io/sudoku/**

### Docker

```bash
# Development (hot reload)
make dev
# or: docker compose up

# Production build
make prod
# or: docker compose -f docker-compose.prod.yml up --build

# Open http://localhost
```

### Local Development

```bash
# With Docker (recommended)
make dev
# Open http://localhost

# Without Docker
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Architecture

```
sudoku/
├── api/                    # Go backend (optional, for development)
│   ├── cmd/
│   │   ├── server/         # API server (not needed for production)
│   │   ├── wasm/           # WASM build target
│   │   └── generate_practice/  # Practice puzzle generator
│   └── internal/
│       ├── sudoku/
│       │   ├── dp/         # DP/backtracking solver for verification and uniqueness
│       │   └── human/      # Human-like solver with 39+ techniques
│       └── transport/http/ # API routes with error correction
├── frontend/               # React + Vite + TypeScript + Tailwind
│   ├── public/
│   │   └── sudoku.wasm     # Compiled WASM solver (~650KB with TinyGo)
│   ├── e2e/                # Playwright E2E tests
│   │   ├── integration/    # UI integration tests
│   │   ├── profiling/      # WASM CPU/memory profiling
│   │   ├── sdk/            # Type-safe test SDK
│   │   ├── slow/           # Long-running tests (@slow tag)
│   │   └── utils/          # E2E test utilities
│   └── src/
│       ├── components/     # UI components (code-split)
│       ├── hooks/          # React hooks (game-logic chunk)
│       ├── lib/
│       │   ├── wasm.worker.ts    # Web Worker for WASM isolation
│       │   ├── worker-client.ts  # Type-safe worker communication
│       │   ├── solver-service.ts # Solver interface (solver chunk)
│       │   └── puzzles-data.ts   # Static puzzle data
│       └── pages/          # Route pages (lazy-loaded)
└── tools/                  # Development utilities
```

**Build Output** (optimized chunks):
- `react-vendor` (230KB, gzip: 74KB): React, React DOM, React Router
- `solver-service` (572KB, gzip: 116KB): WASM solver loader and puzzle data
- `app-shared` (171KB, gzip: 38KB): Shared utilities and hooks
- `pages-other` (55KB, gzip: 13KB): Result, Technique, Custom, Leaderboard, About pages
- `page-game` (48KB, gzip: 14KB): Game page component
- `components-shared` (46KB, gzip: 11KB): Header, Menu, UI components
- `game-ui` (28KB, gzip: 8KB): Board, History, Controls, GameHeader
- `page-home` (10KB, gzip: 3KB): Homepage and difficulty grid
- `wasm-loader` (6KB, gzip: 2KB): WASM worker initialization
- `app` (4KB, gzip: 2KB): Application entry point
- `utils-vendor` (3KB, gzip: 1KB): Lodash, clsx, loglevel

## Solving Techniques

The solver implements 39+ techniques across 4 tiers:

**Simple (Easy puzzles)**
- Naked Single, Hidden Single
- Pointing Pair, Box-Line Reduction
- Naked/Hidden Pairs

**Medium (Medium puzzles)**
- Naked/Hidden Triples, Quads
- X-Wing, XY-Wing
- Simple Coloring

**Hard (Hard/Extreme puzzles)**
- Swordfish, Jellyfish
- W-Wing, Skyscraper
- X-Chains, XY-Chains
- Unique Rectangles (Types 1-4)
- ALS-XZ, Remote Pairs

**Extreme (Impossible puzzles)**
- 3D Medusa, Grouped X-Cycles
- ALS chains (XY-Wing, XY-Chain)
- Forcing Chains, Digit Forcing Chains
- Sue de Coq, Death Blossom

## Development

### Prerequisites

- Go 1.26+
- TinyGo 0.41.1 (for WASM builds only)
- Node.js 24+
- Docker (for E2E tests and CI/CD runs)

### Setup

```bash
# Install dependencies
cd frontend && npm install && cd ..
```

### Run Tests Locally

```bash
# Run all tests (Go + unit + E2E) with Allure output
make test

# Run Go tests only
make test-go

# Run Frontend unit tests only (Docker)
make test-unit

# Run E2E tests only (Docker)
make test-e2e

# Run integration tests only (Docker)
make test-integration

# Run all Frontend tests (unit + E2E)
make test-frontend
```

### Quality Gate

Before pushing, run the local quality gate: it mirrors what CI enforces.

```bash
make check-fast   # lint + typecheck + Go + frontend unit (+ WASM type-check); tight dev loop
make check        # adds Go/frontend coverage floors, the duplication gate, and govulncheck
make check-full   # adds E2E + integration (slow; true superset of check)
```

`check-wasm` type-checks `api/cmd/wasm` under its `//go:build js && wasm` constraint via a standard Go cross-compile (`GOOS=js GOARCH=wasm`, no TinyGo required). Host `go build ./...` skips those files, so `check-wasm` is what prevents a WASM-caller signature change from compiling locally and breaking only in CI's TinyGo build.

---

## Code Quality

### Pre-Commit Hook

The project uses a pre-commit git hook that lints exactly what you staged, so quality problems are caught before they reach the repository.

**What it does:**

- Runs automatically on every commit and lints only the staged files, split by type: ESLint for staged frontend `.ts`/`.tsx`/`.js`/`.jsx` files (excluding e2e and test files, which the ESLint config ignores), golangci-lint for staged Go packages (excluding `cmd/wasm`, which needs the WASM build environment)
- Regenerates `frontend/src/lib/constants-generated.ts` and stages it whenever `api/pkg/constants/constants.go` changed, so the machine-written TypeScript constants cannot drift from the Go source
- Runs a `gofmt` check over staged Go files as a fast pre-check alongside golangci-lint
- **Blocks the commit** if ESLint exceeds its warning budget or golangci-lint or gofmt report anything

**Lint warning budgets:**

- `npm run lint`, `make lint-frontend`, and CI enforce **zero** ESLint warnings (`--max-warnings 0`) across `src/`
- The hook runs ESLint only on staged files with a legacy budget of 13 warnings, so a commit can pass the hook yet fail CI: rely on `make check-fast`, not the hook, as your gate
- golangci-lint runs with a strict zero-warning configuration (`.golangci.yml`)

**Bypassing the hook:**

Do not use `--no-verify`. It skips the lint and format checks that keep the tree committable, and an automated bypass (scripts, CI, agents) is prohibited outright. If the hook blocks you, fix what it reported: `cd frontend && npm run lint:fix` resolves most ESLint findings, and `golangci-lint run --fix` resolves most Go findings.

---

### 🐳 Docker-Based E2E CI Pipeline (Playwright Sidecar)

**Why use containerized E2E?**

End-to-end (E2E) integration tests now run in a dedicated Playwright Docker sidecar, against the actual production image (served by nginx in a container). This ensures:
- Full isolation from host dependencies and permission issues
- Locally mirrors CI/CD pipeline with 100% parity
- Works identically on all platforms, even if Playwright or browsers fail to run locally

**How it works:**

1. **Build & Run Production App Container:**
   ```bash
   docker build -t sudoku-frontend -f frontend/Dockerfile .
   docker run --rm -p 8080:80 sudoku-frontend
   # App now accessible at http://localhost:8080
   ```
   You can use `make prod` or `docker compose up` for dev builds.

2. **Run Playwright E2E in Sidecar:**
   ```bash
   docker run --rm -it \
     --network host \
     -e PLAYWRIGHT_BASE_URL=http://localhost:8080 \
     -v "$PWD/frontend:/work" \
     -w /work \
     mcr.microsoft.com/playwright:v1.57.0-jammy \
     npx playwright test
   ```
   - It mounts your frontend test code into the sidecar.
   - It points Playwright at the running prod container.
   - It requires no local Playwright installation or browsers, so local and CI results match.

3. **CI Pipeline:**
   - GitHub Actions runs the same sidecar test step after Docker build/deploy.
   - If it fails in this setup, it fails in CI; the container is the shared source of truth for both.

**Troubleshooting/Notes:**
- If Playwright, Chromium, or webkit errors appear locally, always run E2E in Docker as above.
- If a test fails locally but passes in CI (or vice versa), check for race conditions or improper network base URLs.
- Sidecar logs will show all E2E and UI failures for direct debug.
- Extend Playwright E2E tests in `frontend/e2e/` and rerun sidecar as above to verify fixes.

---

### Test Reporting with Allure

Create beautiful HTML test reports locally:

```bash
# Run all tests with Allure output
make test

# Create combined report from all test results
make allure-report

# Serve report locally (opens in browser)
make allure-serve

# Clean all Allure artifacts
make allure-clean
```

**Artifact retention:** Allure result directories are reset automatically at the start of every
test run (vitest and Playwright global setups), so `allure-results/` always holds exactly one
run's output and never grows without bound. Aggregate targets (`make test`, `make check-full`)
clean once up front and set `ALLURE_SKIP_CLEAN=1` so their suites combine into a single report.
`make allure-clean` remains available as a full wipe; it is not a prerequisite for anything.

**Artifact ownership:** the Docker Compose test targets (`make test-e2e`,
`make test-integration`) run the Playwright container as your host user via `DOCKER_USER`, so
`frontend/test-results/`, `frontend/playwright-report/`, and `frontend/allure-results/` stay
user-owned. Invoking `docker compose -f docker-compose.test.yml` directly runs the container as
root (the CI shape); export `DOCKER_USER="$(id -u):$(id -g)"` first to keep artifacts
user-owned. If a checkout already contains root-owned artifacts from an old run (symptom:
`npx playwright test` fails with `EACCES` on `test-results/.last-run.json`), run
`make allure-clean`; it falls back to a dockerized `rm` that removes root-owned files without
sudo.

### CI/CD Pipeline

Tests run automatically on every push and PR via GitHub Actions:

- **Frontend Unit Tests**: Vitest with coverage floors at 100% for lines and functions and 99% for statements and branches (the residual gap is documented, provably-unreachable defensive branches), plus type-check of the production build
- **Go Tests**: Full test suite with golangci-lint at zero warnings
- **E2E Tests**: Playwright against the production Docker image, with a flakiness tolerance that never masks a systemic failure

**View Test Results**: Every deploy publishes a unified report portal that links
all quality reports in one place:
**[https://thodha.github.io/sudoku/reports/](https://thodha.github.io/sudoku/reports/)**

The portal links:
- **Allure** ([/test-report/](https://thodha.github.io/sudoku/test-report/)): one combined
  report across all test suites (unit, Go, E2E, and nightly profiling), with historical
  trends, failure analysis, and duration metrics
- **Mutation testing**: the frontend StrykerJS report and the Go go-mutesting reports
  (per package, plus the sharded techniques run)
- **Profiling**: the nightly Playwright report

Mutation and profiling reports are produced by the nightly workflows; the deploy fetches
the latest successful run of each and republishes them under the portal. A report that has
not run yet is simply omitted, never linked dead.

### Rebuild WASM Solver

The WASM solver is built with TinyGo for a smaller bundle size (~650KB vs 3.3MB with standard Go).

```bash
# Install TinyGo: https://tinygo.org/getting-started/install/

# Build WASM with TinyGo (default)
cd api && make wasm
# Outputs to frontend/public/sudoku.wasm

# Or build with standard Go (fallback, larger output)
cd api && make wasm-go
```

### Regenerate Practice Puzzles

```bash
cd api && go run ./cmd/generate_practice \
  -puzzles ../frontend/puzzles.json \
  -o ../frontend/practice_puzzles.json \
  -max 5
```

## Deployment

### GitHub Pages (Automatic)

Pushing to `main` triggers the full CI/CD pipeline in a
single **Test & Deploy** workflow (`deploy.yml`): it runs all tests (Go,
frontend unit, E2E), builds the app, and deploys it alongside the unified
report portal. Mutation and profiling run in separate nightly workflows
(`nightly-mutation.yml`, `nightly-profiling.yml`).

Both app and test report are deployed:
- **App**: [https://thodha.github.io/sudoku/](https://thodha.github.io/sudoku/)
- **Test Report**: [https://thodha.github.io/sudoku/test-report/](https://thodha.github.io/sudoku/test-report/)

### Manual Build

```bash
cd frontend
npm run build
# Deploy dist/ to any static host
```

### Docker

```bash
# Production build
make prod
# or: docker compose -f docker-compose.prod.yml up --build
```

### Static Hosting

Build and deploy the `dist` folder to any static host:

```bash
cd frontend
npm run build
# Deploy dist/ to S3, Cloudflare Pages, Netlify, etc.
```

### About Check & Fix

The game's "Check & Fix" button now strictly applies user-entry corrections only: it does **not** automatically resume the solver or auto-complete the puzzle when a fix has been made. This ensures users learn from each correction and prevents data loss due to previous autosolver behaviors.

## License

MIT. See [LICENSE](LICENSE) for the full text.
