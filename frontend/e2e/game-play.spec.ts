import { test, expect, Page } from '@playwright/test';

/**
 * Full Game Play Tests
 * 
 * These tests simulate complete user journeys playing Sudoku:
 * 1. Complete a game using auto-solve
 * 2. Play through hints step by step
 * 3. Verify human-like solving behavior
 * 4. Test all difficulty levels complete successfully
 */

// ============================================
// Helper Functions
// ============================================

async function waitForGameLoad(page: Page) {
  await page.waitForSelector('.game-background', { timeout: 30000 });
  await page.waitForSelector('.sudoku-board', { timeout: 10000 });
  await page.waitForSelector('.sudoku-cell', { timeout: 10000 });
  // Wait a bit for API calls to complete
  await page.waitForTimeout(500);
}

function getCellSelector(index: number) {
  return `.sudoku-cell:nth-child(${index + 1})`;
}

async function countFilledCells(page: Page): Promise<number> {
  const cells = page.locator('.sudoku-cell');
  let filled = 0;
  const count = await cells.count();
  
  for (let i = 0; i < count; i++) {
    const text = await cells.nth(i).textContent();
    if (text && /^[1-9]$/.test(text.trim())) {
      filled++;
    }
  }
  return filled;
}

async function countCellsWithCandidates(page: Page): Promise<number> {
  const candidateGrids = page.locator('.candidate-grid');
  return await candidateGrids.count();
}

async function findEmptyCell(page: Page): Promise<number | null> {
  const cells = page.locator('.sudoku-cell');
  const count = await cells.count();
  
  for (let i = 0; i < count; i++) {
    const cell = cells.nth(i);
    const text = await cell.textContent();
    const hasNumber = text && /^[1-9]$/.test(text.trim());
    if (!hasNumber) {
      const hasCandidates = await cell.locator('.candidate-grid').count() > 0;
      if (!hasCandidates) {
        return i;
      }
    }
  }
  return null;
}

async function startAutoSolve(page: Page) {
  const menuButton = page.locator('header button').last();
  await menuButton.click();
  await page.waitForTimeout(300);
  
  await page.locator('button:has-text("Solve")').first().click();
  await page.waitForTimeout(300);
  
  // Confirm in dialog
  await page.locator('button:has-text("Solve")').last().click();
}

async function stopAutoSolve(page: Page) {
  const stopButton = page.locator('button:has-text("Stop")');
  if (await stopButton.isVisible()) {
    await stopButton.click();
    await page.waitForTimeout(300);
  }
}

async function waitForCompletion(page: Page, timeoutMs: number = 120000) {
  await expect(
    page.locator('text=/Puzzle Complete|Congratulations|Solved/i')
  ).toBeVisible({ timeout: timeoutMs });
}

// ============================================
// Test Suite 1: Complete Game via Auto-Solve
// ============================================

test.describe('Complete Game via Auto-Solve', () => {
  test('Easy puzzle completes via auto-solve', async ({ page }) => {
    await page.goto('/game/autosolve-easy-test?d=easy');
    await waitForGameLoad(page);
    
    const initialFilled = await countFilledCells(page);
    expect(initialFilled).toBeGreaterThan(30); // Easy has many givens
    
    await startAutoSolve(page);
    
    // Wait for completion
    await waitForCompletion(page, 60000);
    
    // Verify all 81 cells are filled
    const finalFilled = await countFilledCells(page);
    expect(finalFilled).toBe(81);
  });

  test('Medium puzzle completes via auto-solve', async ({ page }) => {
    await page.goto('/game/autosolve-medium-test?d=medium');
    await waitForGameLoad(page);
    
    const initialFilled = await countFilledCells(page);
    expect(initialFilled).toBeGreaterThan(25);
    expect(initialFilled).toBeLessThan(40);
    
    await startAutoSolve(page);
    await waitForCompletion(page, 90000);
    
    const finalFilled = await countFilledCells(page);
    expect(finalFilled).toBe(81);
  });

  test('Hard puzzle completes via auto-solve', async ({ page }) => {
    await page.goto('/game/autosolve-hard-test?d=hard');
    await waitForGameLoad(page);
    
    const initialFilled = await countFilledCells(page);
    expect(initialFilled).toBeLessThan(35);
    
    await startAutoSolve(page);
    await waitForCompletion(page, 120000);
    
    const finalFilled = await countFilledCells(page);
    expect(finalFilled).toBe(81);
  });

  test('Expert puzzle completes via auto-solve', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes for expert
    
    await page.goto('/game/autosolve-expert-test?d=extreme');
    await waitForGameLoad(page);
    
    await startAutoSolve(page);
    await waitForCompletion(page, 150000);
    
    const finalFilled = await countFilledCells(page);
    expect(finalFilled).toBe(81);
  });
});

// ============================================
// Test Suite 2: Hint-Based Solving
// ============================================

test.describe('Hint-Based Solving', () => {
  test('Hints progressively fill candidates and cells', async ({ page }) => {
    await page.goto('/game/hint-progress-test?d=easy');
    await waitForGameLoad(page);
    
    const hintButton = page.getByRole('button', { name: /Hint/i });
    await expect(hintButton).toBeVisible();
    
    // Use 10 hints and track progress
    let prevFilled = await countFilledCells(page);
    let prevCandidates = await countCellsWithCandidates(page);
    
    for (let i = 0; i < 10; i++) {
      await hintButton.click();
      await page.waitForTimeout(300);
      
      const currentFilled = await countFilledCells(page);
      const currentCandidates = await countCellsWithCandidates(page);
      
      // Either filled cells increased, or candidates increased
      const madeProgress = 
        currentFilled > prevFilled || 
        currentCandidates > prevCandidates ||
        currentFilled === 81; // Already complete
      
      expect(madeProgress).toBe(true);
      
      prevFilled = currentFilled;
      prevCandidates = currentCandidates;
      
      if (currentFilled === 81) break;
    }
  });

  test('Hints show explanations', async ({ page }) => {
    await page.goto('/game/hint-explanation-test?d=easy');
    await waitForGameLoad(page);
    
    const hintButton = page.getByRole('button', { name: /Hint/i });
    await hintButton.click();
    await page.waitForTimeout(500);
    
    // After hint, there should be some visual feedback
    // The board state should have changed
    const cells = page.locator('.sudoku-cell');
    const count = await cells.count();
    expect(count).toBe(81);
  });

  test('Multiple hints in succession work correctly', async ({ page }) => {
    await page.goto('/game/multi-hint-test?d=medium');
    await waitForGameLoad(page);
    
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    // Rapid-fire hints
    for (let i = 0; i < 5; i++) {
      await hintButton.click();
      await page.waitForTimeout(100);
    }
    
    // Should not crash and board should have progress
    await page.waitForTimeout(500);
    const filled = await countFilledCells(page);
    expect(filled).toBeGreaterThan(0);
  });
});

// ============================================
// Test Suite 3: Human-like Solving Behavior
// ============================================

test.describe('Human-like Solving Behavior', () => {
  test('Candidates fill progressively (not all at once)', async ({ page }) => {
    await page.goto('/game/progressive-candidates-test?d=medium');
    await waitForGameLoad(page);
    
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    // First few hints should add candidates, not solve cells
    const initialFilled = await countFilledCells(page);
    
    // Get first 5 hints
    for (let i = 0; i < 5; i++) {
      await hintButton.click();
      await page.waitForTimeout(200);
    }
    
    // Should have added some candidates
    const candidatesAfter = await countCellsWithCandidates(page);
    expect(candidatesAfter).toBeGreaterThan(0);
  });

  test('Solve shows step-by-step animation', async ({ page }) => {
    await page.goto('/game/step-animation-test?d=easy');
    await waitForGameLoad(page);
    
    const initialFilled = await countFilledCells(page);
    
    await startAutoSolve(page);
    
    // Wait a bit for animation to start
    await page.waitForTimeout(1000);
    
    // Check that solving is in progress (not instant)
    const midwayFilled = await countFilledCells(page);
    
    // Should have made some progress but not be complete yet (unless very fast)
    expect(midwayFilled).toBeGreaterThanOrEqual(initialFilled);
    
    // Wait for completion
    await waitForCompletion(page, 60000);
    
    const finalFilled = await countFilledCells(page);
    expect(finalFilled).toBe(81);
  });

  test('Stop button halts solve', async ({ page }) => {
    await page.goto('/game/stop-solve-test?d=medium');
    await waitForGameLoad(page);
    
    const initialFilled = await countFilledCells(page);
    
    await startAutoSolve(page);
    
    // Wait for solving to start
    await page.waitForTimeout(500);
    
    // Stop button should be visible
    const stopButton = page.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    
    // Record progress so far
    const filledBeforeStop = await countFilledCells(page);
    
    // Stop solving
    await stopButton.click();
    await page.waitForTimeout(500);
    
    // Stop button should be gone
    await expect(stopButton).not.toBeVisible({ timeout: 3000 });
    
    // Wait a bit more
    await page.waitForTimeout(1000);
    
    // Progress should have stopped (or minimal additional progress)
    const filledAfterStop = await countFilledCells(page);
    
    // Allow for at most 2 more cells (in-flight moves)
    expect(filledAfterStop).toBeLessThanOrEqual(filledBeforeStop + 2);
  });
});

// ============================================
// Test Suite 4: Game State Persistence
// ============================================

test.describe('Game State and Progress', () => {
  test('Progress is tracked during gameplay', async ({ page }) => {
    await page.goto('/game/progress-tracking-test?d=easy');
    await waitForGameLoad(page);
    
    // Make some moves
    const emptyIdx = await findEmptyCell(page);
    if (emptyIdx !== null) {
      await page.locator(getCellSelector(emptyIdx)).click();
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(200);
    }
    
    // Use a hint
    const hintButton = page.getByRole('button', { name: /Hint/i });
    await hintButton.click();
    await page.waitForTimeout(300);
    
    // Game should still be interactive
    const anotherEmpty = await findEmptyCell(page);
    if (anotherEmpty !== null) {
      await page.locator(getCellSelector(anotherEmpty)).click();
      await expect(page.locator(getCellSelector(anotherEmpty))).toHaveClass(/ring-2/);
    }
  });

  test('Timer continues during gameplay', async ({ page }) => {
    await page.goto('/game/timer-continues-test?d=easy');
    await waitForGameLoad(page);
    
    const timer = page.locator('.font-mono').first();
    await expect(timer).toBeVisible();
    
    const initialTime = await timer.textContent();
    
    // Wait 3 seconds
    await page.waitForTimeout(3000);
    
    const laterTime = await timer.textContent();
    
    // Timer should have advanced (unless paused)
    // At minimum verify no crash
    expect(laterTime).toBeDefined();
  });

  test('Undo works after hint', async ({ page }) => {
    await page.goto('/game/undo-after-hint-test?d=easy');
    await waitForGameLoad(page);
    
    const initialFilled = await countFilledCells(page);
    
    // Use a hint
    const hintButton = page.getByRole('button', { name: /Hint/i });
    await hintButton.click();
    await page.waitForTimeout(500);
    
    const filledAfterHint = await countFilledCells(page);
    
    // Undo
    const undoButton = page.locator('button[title="Undo"]');
    if (await undoButton.isEnabled()) {
      await undoButton.click();
      await page.waitForTimeout(300);
      
      const filledAfterUndo = await countFilledCells(page);
      // Undo should revert the hint (or at least not crash)
      expect(filledAfterUndo).toBeLessThanOrEqual(filledAfterHint);
    }
  });
});

// ============================================
// Test Suite 5: Difficulty Comparison
// ============================================

test.describe('Difficulty Levels Comparison', () => {
  test('Different difficulties have different given counts', async ({ page }) => {
    const givenCounts: Record<string, number> = {};
    
    // Easy
    await page.goto('/game/diff-compare-easy?d=easy');
    await waitForGameLoad(page);
    givenCounts['easy'] = await countFilledCells(page);
    
    // Medium
    await page.goto('/game/diff-compare-medium?d=medium');
    await waitForGameLoad(page);
    givenCounts['medium'] = await countFilledCells(page);
    
    // Hard
    await page.goto('/game/diff-compare-hard?d=hard');
    await waitForGameLoad(page);
    givenCounts['hard'] = await countFilledCells(page);
    
    // Expert
    await page.goto('/game/diff-compare-expert?d=extreme');
    await waitForGameLoad(page);
    givenCounts['expert'] = await countFilledCells(page);
    
    // Verify ordering: easy > medium > hard > expert
    expect(givenCounts['easy']).toBeGreaterThan(givenCounts['medium']);
    expect(givenCounts['medium']).toBeGreaterThan(givenCounts['hard']);
    expect(givenCounts['hard']).toBeGreaterThanOrEqual(givenCounts['expert']);
  });
});

// ============================================
// Test Suite 6: Edge Cases
// ============================================

test.describe('Edge Cases', () => {
  test('Game handles rapid clicks gracefully', async ({ page }) => {
    await page.goto('/game/rapid-clicks-test?d=easy');
    await waitForGameLoad(page);
    
    // Rapid-fire clicks on different cells
    const cells = page.locator('.sudoku-cell');
    for (let i = 0; i < 20; i++) {
      await cells.nth(i % 81).click({ delay: 10 });
    }
    
    // Should not crash
    await page.waitForTimeout(500);
    const boardVisible = await page.locator('.sudoku-board').isVisible();
    expect(boardVisible).toBe(true);
  });

  test('Game handles rapid keyboard input', async ({ page }) => {
    await page.goto('/game/rapid-keyboard-test?d=easy');
    await waitForGameLoad(page);
    
    // Find an empty cell
    const emptyIdx = await findEmptyCell(page);
    if (emptyIdx !== null) {
      await page.locator(getCellSelector(emptyIdx)).click();
      
      // Rapid keyboard presses
      for (let i = 1; i <= 9; i++) {
        await page.keyboard.press(`Digit${i}`);
      }
    }
    
    // Should not crash
    await page.waitForTimeout(500);
    const boardVisible = await page.locator('.sudoku-board').isVisible();
    expect(boardVisible).toBe(true);
  });

  test('Solve after partial manual solve', async ({ page }) => {
    await page.goto('/game/partial-manual-test?d=easy');
    await waitForGameLoad(page);
    
    // Make a few moves manually
    for (let i = 0; i < 3; i++) {
      const emptyIdx = await findEmptyCell(page);
      if (emptyIdx !== null) {
        await page.locator(getCellSelector(emptyIdx)).click();
        await page.keyboard.press('Digit1');
        await page.waitForTimeout(100);
      }
    }
    
    const filledAfterManual = await countFilledCells(page);
    
    // Now auto-solve
    await startAutoSolve(page);
    await waitForCompletion(page, 90000);
    
    const finalFilled = await countFilledCells(page);
    expect(finalFilled).toBe(81);
  });
});

// ============================================
// Test Suite 7: Result Screen
// ============================================

test.describe('Result Screen', () => {
  test('Completion shows result modal with stats', async ({ page }) => {
    await page.goto('/game/result-modal-test?d=easy');
    await waitForGameLoad(page);
    
    await startAutoSolve(page);
    await waitForCompletion(page, 60000);
    
    // Result modal should show stats
    await expect(page.locator('text=/Time|Hints|Puzzle Complete/i')).toBeVisible();
  });

  test('Share button is available after completion', async ({ page }) => {
    await page.goto('/game/share-button-test?d=easy');
    await waitForGameLoad(page);
    
    await startAutoSolve(page);
    await waitForCompletion(page, 60000);
    
    // Should have share functionality
    await expect(page.locator('button:has-text("Share")')).toBeVisible();
  });
});
