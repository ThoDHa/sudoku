# Sudoku

An educational Sudoku web application that teaches solving techniques through human-like hints.

## Features

- **5 Difficulty Levels**: Easy, Medium, Hard, Extreme, Impossible
- **Educational Hints**: Learn 20+ solving techniques from Naked Singles to X-Chains
- **Human-like Auto-solve**: Watch the solver work through puzzles step-by-step
- **Smart Single Detection**: Cells are filled immediately when they have only one valid digit
- **Daily Puzzles**: New puzzle every day, same for all players
- **Custom Puzzles**: Enter and validate your own puzzles
- **Themes**: Light/dark mode with multiple color schemes
- **Responsive**: Works on desktop and mobile

## Hints vs Auto-Solve

The app tracks hints and auto-solve separately:

- **Hints (💡)**: Get one logical step at a time. Each hint counts toward your score, teaching you real solving techniques.
- **Auto-Solve (🤖)**: Watch the solver complete the entire puzzle step-by-step. Tracked separately so you can learn without affecting your hint count.

The leaderboard shows:
- `💡N` - Number of hints used
- `🤖` - Auto-solve was used
- `-` - No assists used

## Quick Start

### Using Docker (Recommended)

```bash
# Build and run
docker build -t sudoku .
docker run -d -p 80:80 -e JWT_SECRET="your-secret-key-here" sudoku

# Open http://localhost
```

### Using Docker Compose

```bash
docker-compose up -d
# Open http://localhost
```

## Architecture

```
sudoku/
├── api/                    # Go backend (Gin framework)
│   ├── cmd/server/         # Main entry point
│   └── internal/
│       ├── sudoku/human/   # Human-like solver with 20+ techniques
│       └── transport/http/ # API routes
├── frontend/               # React + Vite + TypeScript + Tailwind
│   └── src/
│       ├── components/     # UI components
│       ├── hooks/          # React hooks (game state, auto-solve)
│       └── pages/          # Route pages
├── puzzles.json            # Pre-generated puzzle database
└── Dockerfile              # Single-container build
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/daily` | GET | Get today's puzzle seed |
| `/api/puzzle/:seed` | GET | Get puzzle by seed |
| `/api/session/start` | POST | Start game session (returns JWT) |
| `/api/solve/next` | POST | Get next solving step |
| `/api/solve/all` | POST | Get all solving steps |
| `/api/validate` | POST | Validate current board state |
| `/api/custom/validate` | POST | Validate custom puzzle |

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

### Smart Single Detection

The solver automatically fills cells immediately when:
- **Naked Single**: A cell has only one valid digit based on row/column/box constraints
- **Hidden Single**: A digit can only go in one place within a row, column, or box

This makes solving feel more natural - cells are filled as soon as they're logically determinable, rather than requiring multiple candidate-filling steps first.

## Development

### Prerequisites

- Go 1.23+
- Node.js 20+
- Docker (optional)

### Run Locally

```bash
# Backend
cd api
go run ./cmd/server

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Run Tests

```bash
# Go tests
cd api
go test ./...

# Frontend e2e tests
cd frontend
npm run test:e2e
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret key for session tokens (32+ chars) |
| `PORT` | No | API port (default: 8080) |
| `PUZZLES_PATH` | No | Path to puzzles.json (default: /data/puzzles.json) |

## License

MIT
