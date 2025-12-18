#!/bin/bash
# Generate Sudoku puzzles using Docker
# Usage: ./generate.sh [-n COUNT] [-o OUTPUT] [-seed SEED]

set -e

# Default values
COUNT=10000
OUTPUT="puzzles.json"
SEED=1
EXTRA_ARGS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n)
            COUNT="$2"
            shift 2
            ;;
        -o)
            OUTPUT="$2"
            shift 2
            ;;
        -seed)
            SEED="$2"
            shift 2
            ;;
        -w)
            EXTRA_ARGS="$EXTRA_ARGS -w $2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./generate.sh [-n COUNT] [-o OUTPUT] [-seed SEED] [-w WORKERS]"
            exit 1
            ;;
    esac
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_DIR="$PROJECT_ROOT/api"

# Resolve output path
if [[ "$OUTPUT" != /* ]]; then
    OUTPUT="$PROJECT_ROOT/$OUTPUT"
fi
OUTPUT_DIR="$(dirname "$OUTPUT")"
OUTPUT_FILE="$(basename "$OUTPUT")"

echo "==================================="
echo "Sudoku Puzzle Generator"
echo "==================================="
echo "Count:  $COUNT puzzles"
echo "Output: $OUTPUT"
echo "Seed:   $SEED"
echo ""

# Run generator in Docker
docker run --rm \
    -v "$API_DIR:/app" \
    -v "$OUTPUT_DIR:/output" \
    -w /app \
    golang:1.22-alpine \
    go run ./cmd/generate \
        -n "$COUNT" \
        -o "/output/$OUTPUT_FILE" \
        -seed "$SEED" \
        $EXTRA_ARGS

echo ""
echo "==================================="
echo "Generation complete!"
echo "Output: $OUTPUT"
echo "==================================="
