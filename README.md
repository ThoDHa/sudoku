# Sudoku

An educational Sudoku web application that teaches solving techniques through human-like hints.

**[Play Now](https://thodha.github.io/sudoku/)** - Fully offline-capable PWA

## Features

- **5 Difficulty Levels**: Easy, Medium, Hard, Extreme, Impossible
- **Educational Hints**: Learn 30+ solving techniques from Naked Singles to Forcing Chains
- **Human-like Auto-solve**: Watch the solver work through puzzles step-by-step
- **Practice Mode**: Practice specific techniques with curated puzzles
- **Daily Puzzles**: New puzzle every day, same for all players
- **Custom Puzzles**: Enter and validate your own puzzles
- **Offline Support**: Works completely offline after first load (PWA + WASM)
- **Themes**: Light/dark mode
- **Responsive**: Works on desktop and mobile

## How It Works

The entire solver runs locally in your browser via WebAssembly. No server required!

- **WASM Solver**: Go-based solver compiled to WebAssembly (~3.5MB)
- **Static Puzzles**: 1000 pre-generated puzzles embedded in the app
- **Practice Puzzles**: Pre-analyzed puzzles for each technique
- **Daily Seed**: Deterministic daily puzzle based on UTC date

## Hints vs Auto-Solve

The app tracks hints and auto-solve separately:

- **Hints (💡)**: Get one logical step at a time. Each hint teaches you a real solving technique.
- **Auto-Solve (🤖)**: Watch the solver complete the entire puzzle step-by-step.

## Quick Start

### GitHub Pages (Live)

Visit **https://thodha.github.io/sudoku/**

### Docker

```bash
docker compose up -d
# Open http://localhost
```

### Local Development

```bash
# Frontend only (uses WASM solver)
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
│       └── sudoku/human/   # Human-like solver with 30+ techniques
├── frontend/               # React + Vite + TypeScript + Tailwind
│   ├── public/
│   │   └── sudoku.wasm     # Compiled WASM solver
│   └── src/
│       ├── components/     # UI components
│       ├── hooks/          # React hooks
│       ├── lib/
│       │   ├── wasm.ts     # WASM loader
│       │   ├── solver-service.ts  # Solver interface
│       │   └── puzzles-data.ts    # Static puzzle data
│       └── pages/          # Route pages
├── puzzles.json            # Pre-generated puzzle database
└── practice_puzzles.json   # Technique -> puzzle mappings
```

## Solving Techniques

The solver implements techniques across 4 tiers:

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

- Node.js 20+
- Go 1.23+ (only for rebuilding WASM)

### Rebuild WASM Solver

```bash
cd api
make wasm
# Outputs to frontend/public/sudoku.wasm
```

### Regenerate Practice Puzzles

```bash
docker run --rm -v "$(pwd):/app" -w /app/api golang:1.23-alpine \
  go run ./cmd/generate_practice \
    -puzzles /app/puzzles.json \
    -o /app/practice_puzzles.json \
    -max 5
```

### Run Tests

```bash
# Go tests
cd api && go test ./...

# Frontend unit tests
cd frontend && npm run test:unit

# E2E tests
cd frontend && npm run test
```

## Deployment

### GitHub Pages (Automatic)

Push to `main` branch - GitHub Actions will build and deploy automatically.

### Docker

```bash
docker compose up -d
```

### Static Hosting

Build and deploy the `dist` folder to any static host:

```bash
cd frontend
npm run build
# Deploy dist/ to S3, Cloudflare Pages, Netlify, etc.
```

## License

MIT
