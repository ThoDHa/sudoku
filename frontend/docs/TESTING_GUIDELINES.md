# Sudoku Project Testing Examples

This document contains project-specific examples illustrating the testing guidelines defined in `~/.config/opencode/rules/testing-guidelines.md`.

## Case Study: The Highlighting Bug

### The Bug

When a cell had multiple candidates and a hint identified only ONE as valid, ALL candidates were highlighted green instead of just the correct one.

**Root cause:**
```typescript
// BUGGY CODE
const isRelevantDigit = singleDigit ? d === singleDigit : isTarget
```

When `singleDigit` was null but `isTarget` was true, ALL candidates got highlighted.

### Why Existing Tests Didn't Catch It

| Gap | Problem |
|-----|---------|
| **Wrong target** | Tests checked `bg-cell-primary` (cell background), not `text-hint-text` (candidate styling) |
| **Mock blind spot** | Mocks always used `digit: 5`, never `digit: 0` (multi-digit techniques) |
| **State vs render** | Unit tests verified hook state, not the component's rendered output |

### The Fix

```typescript
// FIXED CODE
const isRelevantDigit = targetDigit !== undefined 
  ? d === targetDigit 
  : singleDigit 
    ? d === singleDigit 
    : false
```

### The Regression Tests

Added 7 tests in `Board.test.tsx` that verify candidate digit styling:

```typescript
it('highlights ONLY the target digit in green when cell has multiple candidates', () => {
  const highlight = {
    digit: 5,
    targets: [{ row: 0, col: 0 }],
    showAnswer: true,
    // ...
  }
  
  const candidates = createEmptyCandidates()
  candidates[0] = createCandidateMask([3, 5, 7])  // Multiple candidates
  
  const { container } = render(<Board {...defaultProps({ candidates, highlight })} />)
  
  const candidateDigits = container.querySelectorAll('.candidate-digit')
  
  // CRITICAL: Check the ACTUAL thing that was broken
  expect(candidateDigits[4]?.className).toContain('text-hint-text')  // digit 5
  expect(candidateDigits[2]?.className).not.toContain('text-hint-text')  // digit 3
  expect(candidateDigits[6]?.className).not.toContain('text-hint-text')  // digit 7
})
```

### Validation Performed

1. Ran tests with buggy code: **3 tests failed** ✓
2. Applied fix
3. Ran tests with fixed code: **74 tests passed** ✓
4. Re-broke code
5. Ran tests again: **3 tests failed** ✓

## Project-Specific Mock Variants

### Standard Mock

```typescript
// frontend/src/test-utils/gameHelpers.ts
export const createMockMoveHighlight = (overrides?: Partial<MoveHighlight>): MoveHighlight => ({
  digit: 5,
  targets: [{ row: 0, col: 2 }],
  // ...
  ...overrides,
})
```

### Edge Case Mocks to Add

```typescript
// Multi-digit technique (digit: 0)
export const createMultiDigitTechniqueHighlight = () => ({
  digit: 0,  // Naked Pair, Hidden Pair, etc.
  targets: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
  eliminations: [
    { row: 0, col: 2, digit: 3 },
    { row: 0, col: 2, digit: 5 },
  ],
  // ...
})

// Elimination-heavy scenario
export const createEliminationHighlight = () => ({
  digit: 0,
  targets: [{ row: 2, col: 2 }],
  eliminations: [
    { row: 2, col: 2, digit: 1 },
    { row: 2, col: 2, digit: 2 },
    { row: 2, col: 2, digit: 6 },
    // ... more eliminations
  ],
  // ...
})
```

## Lessons for This Codebase

1. **Board component tests**: Always verify CSS classes on specific candidate digits, not just cell backgrounds

2. **Highlight tests**: Must cover:
   - Single-digit techniques (`digit: 1-9`)
   - Multi-digit techniques (`digit: 0`)
   - Eliminations vs targets
   - `showAnswer: true` vs `showAnswer: false`

3. **Mock data**: When adding new highlight scenarios, add corresponding mock variants

## Test Artifact Lifecycle

Test runs write three artifact directories under `frontend/`, all gitignored and all regenerable:

- `allure-results/` - Allure result JSON from vitest (`allure-vitest`) and Playwright
  (`allure-playwright`). Reset automatically at the start of every run by
  `test/clean-allure-results.ts` (wired into the vitest `globalSetup` and
  `e2e/global-setup.ts`), so it always contains exactly one run's output. Setting
  `ALLURE_SKIP_CLEAN` to a non-empty value skips the reset; the aggregate targets
  (`make test`, `make check-full`) use it to combine several suites into one report after a
  single up-front `make allure-clean`.
- `test-results/` and `playwright-report/` - Playwright's per-run output and HTML report.
  Playwright itself recreates these each run.

Ownership: the Docker Compose test targets (`make test-e2e`, `make test-integration`) pass
`DOCKER_USER="$(id -u):$(id -g)"` so the container writes these directories as your user. Raw
`docker compose -f docker-compose.test.yml` invocations default to root (the CI shape); export
`DOCKER_USER` yourself if you invoke compose directly and want user-owned artifacts. A checkout
holding root-owned artifacts from an old run makes `npx playwright test` fail with `EACCES` on
`test-results/.last-run.json`; recover with `make allure-clean`, which falls back to a dockerized
`rm` when plain `rm` cannot remove root-owned files.

The Vite dev server does not watch any of these directories (`server.watch.ignored` in
`vite.config.ts`), so their contents can never exhaust inotify watchers and block `npm run dev`.

## Reference

For universal testing principles, see: `~/.config/opencode/rules/testing-guidelines.md`
