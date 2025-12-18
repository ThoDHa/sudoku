#!/bin/bash
# Quick test: generate 10 puzzles and verify the output
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_OUTPUT="/tmp/test_puzzles.json"

echo "Testing puzzle generator..."
"$SCRIPT_DIR/generate.sh" -n 10 -o "$TEST_OUTPUT"

# Verify output
if [ -f "$TEST_OUTPUT" ]; then
    COUNT=$(python3 -c "import json; print(json.load(open('$TEST_OUTPUT'))['count'])" 2>/dev/null || echo "0")
    if [ "$COUNT" = "10" ]; then
        echo "✓ Test passed: Generated $COUNT puzzles"
        
        # Show sample puzzle
        echo ""
        echo "Sample puzzle (first one):"
        python3 -c "
import json
data = json.load(open('$TEST_OUTPUT'))
p = data['puzzles'][0]
print(f\"  Solution: {p['s'][:20]}...\")
print(f\"  Easy cells: {len(p['g']['e'])} revealed\")
print(f\"  Medium cells: {len(p['g']['m'])} revealed\")
print(f\"  Hard cells: {len(p['g']['h'])} revealed\")
print(f\"  Expert cells: {len(p['g']['x'])} revealed\")
print(f\"  Impossible cells: {len(p['g']['i'])} revealed\")
" 2>/dev/null || echo "  (python3 not available for details)"
        
        rm -f "$TEST_OUTPUT"
        exit 0
    fi
fi

echo "✗ Test failed"
exit 1
