# Testing Guidelines: How to Write Tests That Actually Fail When Broken

## Overview

This document captures lessons learned from investigating why unit tests passed when bugs existed in the highlighting system. Follow these guidelines to ensure your tests actually catch bugs.

## The Core Problem

**Tests that pass when bugs exist are worse than no tests at all** because they provide false confidence.

## Root Causes Identified

### 1. Testing the Wrong Thing

**Anti-pattern:**
```typescript
// ❌ WRONG: Tests cell background, not candidate styling
expect(cells[40]?.className).toContain('bg-cell-primary')
```

**Problem:** The bug was in candidate digit styling (`text-hint-text` class), but tests only checked cell backgrounds (`bg-cell-primary`).

**Solution:**
```typescript
// ✓ CORRECT: Test the actual thing that can break
const digit5 = candidateDigits?.[4]
expect(digit5?.className).toContain('text-hint-text')
expect(digit3?.className).not.toContain('text-hint-text')
```

### 2. Mock Data Doesn't Match Reality

**Anti-pattern:**
```typescript
// ❌ WRONG: Always uses digit: 5, never tests edge cases
export const createMockMoveHighlight = () => ({
  digit: 5,
  // ...
})
```

**Problem:** Real bugs occurred with `digit: 0` (multi-digit techniques), but mocks never tested this.

**Solution:**
```typescript
// ✓ CORRECT: Create variants for edge cases
const multiDigitHighlight = createMockMoveHighlight({
  digit: 0,  // Multi-digit technique
  targets: [/* multiple cells */],
  eliminations: [/* multiple eliminations */]
})
```

### 3. Testing State, Not Rendering

**Anti-pattern:**
```typescript
// ❌ WRONG: Tests hook state in isolation
expect(result.current.currentHighlight).toEqual(mockMove)
```

**Problem:** Hook state is correct, but the component rendering logic that consumes it is broken.

**Solution:**
```typescript
// ✓ CORRECT: Test the rendered output
const { container } = render(<Board {...props} />)
const candidateDigits = container.querySelectorAll('.candidate-digit')
expect(candidateDigits[4]?.className).toContain('text-hint-text')
```

## Mandatory Validation Steps

### For Every New Test

1. **Write the test first** (TDD)
2. **Verify it fails** - Run the test, confirm it fails
3. **Implement the fix**
4. **Verify it passes** - Run the test, confirm it passes
5. **Break the code again** - Intentionally reintroduce the bug
6. **Verify it fails again** - Confirm the test catches the regression
7. **Restore the fix**

### For Every Bug Fix

1. **Write a test that fails with the bug** - Before fixing
2. **Verify the test fails** - Proves it catches the bug
3. **Apply the fix**
4. **Verify the test passes**
5. **Commit the test WITH the fix** - Not after

## Testing Checklist

Before considering a feature "tested", verify:

### Visual Rendering Tests

- [ ] Do tests check CSS classes on individual elements (not just containers)?
- [ ] Do tests verify specific elements, not just "something rendered"?
- [ ] Do tests check both positive AND negative cases?

### Mock Data Quality

- [ ] Do mocks include edge cases (0, null, empty, multiple)?
- [ ] Do mocks reflect real-world scenarios?
- [ ] Are there multiple mock variants for different scenarios?

### Integration vs Unit

- [ ] Do integration tests verify state → render pipeline?
- [ ] Do unit tests cover conditional logic branches?
- [ ] Are there tests at multiple levels (unit, integration, E2E)?

### Regression Prevention

- [ ] Does every bug have a regression test?
- [ ] Was the regression test verified by breaking the code?
- [ ] Is the regression test specific enough to catch the exact bug?

## Common Anti-Patterns to Avoid

### 1. Testing Implementation Details

```typescript
// ❌ AVOID: Tests internal state, not behavior
expect(component.state.highlight).toBe(5)

// ✓ PREFER: Tests rendered output
expect(screen.getByText('5')).toHaveClass('text-hint-text')
```

### 2. Over-Mocking

```typescript
// ❌ AVOID: Mocks away the thing you're testing
jest.mock('./highlightLogic')

// ✓ PREFER: Test real logic with realistic inputs
const highlight = { digit: 5, targets: [...] }
```

### 3. Testing Happy Path Only

```typescript
// ❌ AVOID: Only tests success case
it('highlights the digit', () => { ... })

// ✓ PREFER: Tests edge cases and failure modes
describe('edge cases', () => {
  it('handles digit: 0 (multi-digit techniques)', () => { ... })
  it('handles no candidates', () => { ... })
  it('handles multiple candidates', () => { ... })
})
```

### 4. Assertions That Can't Fail

```typescript
// ❌ AVOID: Always true
expect(cell.className).toBeDefined()

// ✓ PREFER: Specific assertion that can fail
expect(cell.className).toContain('bg-cell-primary')
expect(cell.className).not.toContain('bg-cell-secondary')
```

## E2E Test Guidelines

### When E2E Tests Are Appropriate

- User-visible behavior that spans multiple components
- Visual rendering that's hard to test in unit tests
- Critical user flows

### E2E Test Best Practices

1. **Be specific about what you're checking**
   ```typescript
   // ❌ AVOID: Vague check
   expect(await page.locator('.cell').count()).toBe(81)
   
   // ✓ PREFER: Specific check
   const greenDigits = await page.evaluate(() => {
     return [...document.querySelectorAll('.candidate-digit')]
       .filter(el => el.className.includes('text-hint-text'))
       .map(el => el.textContent)
   })
   expect(greenDigits).toEqual(['5'])
   ```

2. **Don't rely on timing**
   ```typescript
   // ❌ AVOID: Arbitrary waits
   await page.waitForTimeout(1000)
   
   // ✓ PREFER: Wait for specific condition
   await expect(page.locator('.text-hint-text')).toBeVisible()
   ```

3. **Capture meaningful state**
   ```typescript
   // ✓ PREFER: Capture and assert on specific data
   const highlightState = await captureHighlightState(page)
   const buggyCells = highlightState.filter(cell => 
     cell.allCandidates.length > 1 && cell.greenDigits.length > 1
   )
   expect(buggyCells.length).toBe(0)
   ```

## Adding New Mock Variants

When you discover a new edge case:

1. **Add a new mock factory or variant**
2. **Document what scenario it represents**
3. **Use it in at least one test**

Example:
```typescript
// Add to test-utils/gameHelpers.ts

export const createMultiDigitTechniqueHighlight = (
  overrides?: Partial<MoveHighlight>
): MoveHighlight => ({
  step_index: 0,
  technique: 'Naked Pair',
  action: 'eliminate',
  digit: 0,  // Multi-digit: no single digit
  targets: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
  eliminations: [
    { row: 0, col: 2, digit: 3 },
    { row: 0, col: 2, digit: 5 },
  ],
  explanation: 'Naked pair eliminates 3 and 5 from other cells',
  refs: { title: 'Naked Pair', slug: 'naked-pair', url: '/techniques/naked-pair' },
  highlights: {
    primary: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  },
  ...overrides,
})
```

## Summary

**Golden Rule:** A test is only valuable if it would have failed when a real bug existed.

**Validation:** Always verify your tests by intentionally breaking the code and confirming the test fails.

**Coverage:** Test the actual behavior that can break, not just that something happened.
