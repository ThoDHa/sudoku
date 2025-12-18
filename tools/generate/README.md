# Sudoku Puzzle Generator

Pre-generates thousands of Sudoku puzzles with solutions for offline use.

## Overview

This tool generates puzzles deterministically from seed values, creating all 5 difficulty levels (easy, medium, hard, expert, impossible) for each puzzle. The puzzles maintain the **subset property**: harder puzzles reveal fewer cells, but those cells are always a subset of the easier difficulty's revealed cells.

## Output Format

The generator outputs a JSON file with this structure:

```json
{
  "version": 1,
  "count": 10000,
  "puzzles": [
    {
      "s": "534678912672195348198342567...",  // 81-char solution string
      "g": {
        "e": [0,1,2,5,6,8,10,...],  // easy: indices to reveal (35-40 cells)
        "m": [0,1,5,8,10,...],       // medium: 30-35 cells
        "h": [0,5,10,...],           // hard: 25-30 cells
        "x": [0,10,...],             // expert: 22-27 cells
        "i": [0,...]                 // impossible: 17-22 cells
      }
    }
  ]
}
```

### Compact Format

- **Solution (`s`)**: 81-character string where each character is a digit 1-9
- **Givens (`g`)**: Map of difficulty keys to arrays of cell indices (0-80) to reveal
  - `e` = easy
  - `m` = medium
  - `h` = hard
  - `x` = expert
  - `i` = impossible

To reconstruct a puzzle at a given difficulty:
1. Start with an empty 81-cell grid (all zeros)
2. For each index in the givens array, copy the value from the solution

## Prerequisites

- Docker (recommended) OR
- Go 1.22+ installed locally

## Usage

### Using Docker (Recommended)

```bash
# Generate 10,000 puzzles (default)
./generate.sh

# Generate custom number of puzzles
./generate.sh -n 5000

# Specify output file
./generate.sh -n 10000 -o ../puzzles.json

# Custom starting seed
./generate.sh -n 10000 -seed 42
```

### Using Go Directly

```bash
# From the api directory
cd ../../api
go run ./cmd/generate -n 10000 -o ../puzzles.json
```

### Command-Line Options

| Flag | Default | Description |
|------|---------|-------------|
| `-n` | 10000 | Number of puzzles to generate |
| `-o` | puzzles.json | Output file path |
| `-w` | (num CPUs) | Number of worker goroutines |
| `-seed` | 1 | Starting seed value |

## Performance

On a typical machine with 8+ cores:
- ~35 puzzles/second
- 10,000 puzzles in ~5 minutes
- Output file size: ~5-6 MB

## Integration

After generating puzzles:

1. Copy `puzzles.json` to the project root:
   ```bash
   cp puzzles.json ../../puzzles.json
   ```

2. The Docker build will include this file in the container at `/data/puzzles.json`

3. The API will load puzzles on startup and serve them instead of generating on-the-fly

## Daily Puzzle Selection

The app uses a deterministic hash of the UTC date to select the daily puzzle:

```
puzzle_index = FNV64("daily:YYYY-MM-DD") % total_puzzles
```

With 10,000 puzzles, this provides ~27 years of unique daily puzzles.
