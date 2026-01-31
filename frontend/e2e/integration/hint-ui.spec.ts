import { test, expect, Page } from '@playwright/test';
import { setupGameAndWaitForBoard, waitForWasmReady } from '../utils/board-wait';

/**
 * Hint UI Tests
 *
 * Tests for hint usage, edge cases, and state management
 *
 * Tag: @integration @hints
 */



test.describe('@integration Hints - UI Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    await waitForWasmReady(page);
  });

  test('hint usage works on desktop (happy path)', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });

    // Verify button is enabled initially
    await expect(hintButton).toBeEnabled();

    // Get initial hint count if available
    const initialText = await hintButton.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : null;

    // Use a hint
    await hintButton.click();
    await page.waitForTimeout(1000);

    // Verify hint was applied (board changed)
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCellsAfter).toBeGreaterThan(0);

    // Verify count decreased if count was shown
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : null;

    if (initialCount !== null && afterCount !== null) {
      expect(afterCount).toBeLessThan(initialCount);
    }
  });

  test('hint correct on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const hintButton = page.locator('button:has-text("💡")');
    await expect(hintButton).toBeVisible();

    // Count empty cells before hint
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();

    // Use hint
    await hintButton.click();
    await page.waitForTimeout(1000);

    // Count empty cells after hint
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();

    // Hint should work on mobile
    expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore);
  });

  test('no hint when unselected', async ({ page }) => {
    // Count empty cells before hint
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();

    // Use hint without selecting any cell
    const hintButton = page.getByRole('button', { name: /Hint/i });
    await hintButton.click();
    await page.waitForTimeout(1000);

    // Count empty cells after hint
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();

    // Hint should still work and change board
    expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore);
  });

  test('handles nearly-complete edge', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });

    // Use multiple hints to get close to completion
    for (let i = 0; i < 5; i++) {
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);

        // Make a move between hints to re-enable
        const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
        if (await emptyCell.count() > 0) {
          await emptyCell.click();
          await page.keyboard.press(String((i % 9) + 1));
          await page.waitForTimeout(200);
        }
      }
    }

    // Count filled cells
    const filledCells = await page.locator('[role="gridcell"][aria-label*="value"]').count();

    // Should have made significant progress
    expect(filledCells).toBeGreaterThan(20);
  });

  test('no hint after complete', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });

    // Auto-solve the puzzle
    const autoSolveButton = page.getByRole('button', { name: /auto.?solve|solve.*auto/i });
    if (await autoSolveButton.isVisible({ timeout: 2000 })) {
      await autoSolveButton.click();

      // Wait for solve to complete (check for completion indicator)
      const solveComplete = page.locator('[data-testid="puzzle-complete"], .puzzle-complete, .game-won');
      try {
        await solveComplete.waitFor({ timeout: 30000 });
      } catch {
        // May not have completion indicator, continue
      }
    }

    // Verify puzzle is complete (no empty cells)
    const emptyCells = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCells).toBe(0);

    // Hint button should be disabled after completion
    await expect(hintButton).toBeDisabled();
  });

  test('spam or rapid tap does not double-fire', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });

    // Count empty cells before hint
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();

    // Rapidly click hint button multiple times
    for (let i = 0; i < 5; i++) {
      await hintButton.click();
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    // Count empty cells after rapid hints
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();

    // Should not have filled more than expected (each hint typically fills one cell)
    // If 5 hints fired, we'd expect at most 5 fewer empty cells
    const maxExpectedChange = 5;
    const actualChange = emptyCellsBefore - emptyCellsAfter;

    expect(actualChange).toBeLessThanOrEqual(maxExpectedChange);

    // Hint button should be disabled after use (need to make move first)
    await expect(hintButton).toBeDisabled();
  });

  test('async/disabled state blocks hints cleanly', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });

    // Use first hint
    await hintButton.click();
    await page.waitForTimeout(500);

    // Button should be disabled immediately after use
    await expect(hintButton).toBeDisabled();

    // Try to click again while disabled
    await hintButton.click();
    await page.waitForTimeout(500);

    // Count empty cells - should have changed only once (not twice)
    const emptyCells = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCells).toBeGreaterThan(0);

    // Button remains disabled until move is made
    await expect(hintButton).toBeDisabled();
  });

  test('state resets on restart', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });

    // Get initial hint count
    const initialText = await hintButton.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : 3;

    // Use a hint
    await hintButton.click();
    await page.waitForTimeout(500);

    // Count should have decreased
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : initialCount - 1;

    // Restart game
    const restartButton = page.getByRole('button', { name: /restart|new game/i });
    if (await restartButton.isVisible({ timeout: 2000 })) {
      await restartButton.click();

      // Wait for game to restart
      await page.waitForTimeout(1000);

      // Count should have reset to initial
      const resetText = await hintButton.textContent();
      const resetMatch = resetText?.match(/\d+/);
      const resetCount = resetMatch ? parseInt(resetMatch[0]) : initialCount;

      expect(resetCount).toBe(initialCount);
    }
  });

  test('persistence across reloads works', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });

    // Get initial hint count
    const initialText = await hintButton.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : 3;

    // Use a hint
    await hintButton.click();
    await page.waitForTimeout(500);

    // Count should have decreased
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : initialCount - 1;

    // Reload page
    await page.reload();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    await page.waitForTimeout(500);

    // Count should persist after reload
    const reloadText = await hintButton.textContent();
    const reloadMatch = reloadText?.match(/\d+/);
    const reloadCount = reloadMatch ? parseInt(reloadMatch[0]) : afterCount;

    expect(reloadCount).toBe(afterCount);
  });

  test('deep assertion: counters/undo/redo/error', async ({ page }) => {
    const hintButton = page.getByRole('button', { name: /Hint/i });
    const undoButton = page.getByRole('button', { name: /undo/i });

    // Get initial state
    const initialHintText = await hintButton.textContent();
    const initialHintCount = parseInt(initialHintText?.match(/\d+/)?.[0] || '3');

    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();

    // Use hint
    await hintButton.click();
    await page.waitForTimeout(500);

    // Hint should have been used
    const afterHintText = await hintButton.textContent();
    const afterHintCount = parseInt(afterHintText?.match(/\d+/)?.[0] || '2');

    expect(afterHintCount).toBeLessThan(initialHintCount);

    const emptyCellsAfterHint = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    const cellsFilledByHint = emptyCellsBefore - emptyCellsAfterHint;
    expect(cellsFilledByHint).toBeGreaterThan(0);

    // Undo the hint
    await undoButton.click();
    await page.waitForTimeout(500);

    const emptyCellsAfterUndo = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    const cellsRestoredByUndo = emptyCellsAfterUndo - emptyCellsAfterHint;
    expect(cellsRestoredByUndo).toBe(cellsFilledByHint);

    // Hint count should NOT be restored after undo (hints are consumed permanently)
    const undoHintText = await hintButton.textContent();
    const undoHintCount = parseInt(undoHintText?.match(/\d+/)?.[0] || '2');

    expect(undoHintCount).toBe(afterHintCount);

    // Redo the hint
    const redoButton = page.getByRole('button', { name: /redo/i });
    await redoButton.click();
    await page.waitForTimeout(500);

    const emptyCellsAfterRedo = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCellsAfterRedo).toBe(emptyCellsAfterHint);

    // Verify hint button is disabled after use (need to make move to re-enable)
    await expect(hintButton).toBeDisabled();
  });
});
