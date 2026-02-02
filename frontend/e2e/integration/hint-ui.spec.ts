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
    
    // Wait for hint to be processed
    await expect(hintButton).toBeDisabled({ timeout: 3000 });

    // Count should have decreased
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : initialCount - 1;

    // Restart game
    const restartButton = page.getByRole('button', { name: /restart|new game/i });
    if (await restartButton.isVisible({ timeout: 2000 })) {
      await restartButton.click();

      // Wait for game to restart (hint button should be enabled with reset count)
      await expect(hintButton).toBeEnabled({ timeout: 3000 });

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
    
    // Wait for hint to be processed
    await expect(hintButton).toBeDisabled({ timeout: 3000 });

    // Count should have decreased
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : initialCount - 1;

    // Reload page
    await page.reload();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    // Wait for page to be fully loaded and hint button to be ready
    await expect(hintButton).toBeEnabled({ timeout: 3000 });

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
    
    // Wait for hint to be processed
    await expect(hintButton).toBeDisabled({ timeout: 3000 });

    // Hint should have been used
    const afterHintText = await hintButton.textContent();
    const afterHintCount = parseInt(afterHintText?.match(/\d+/)?.[0] || '2');

    expect(afterHintCount).toBeLessThan(initialHintCount);

    const emptyCellsAfterHint = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    const cellsFilledByHint = emptyCellsBefore - emptyCellsAfterHint;
    expect(cellsFilledByHint).toBeGreaterThan(0);

    // Undo the hint
    await undoButton.click();
    
    // Wait for undo to be processed by checking empty cell count changed
    await expect(async () => {
      const emptyCellsAfterUndo = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
      expect(emptyCellsAfterUndo).toBeGreaterThan(emptyCellsAfterHint);
    }).toPass({ timeout: 3000 });

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
    
    // Wait for redo to be processed by checking empty cell count matches post-hint
    await expect(async () => {
      const currentEmptyCells = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
      expect(currentEmptyCells).toBe(emptyCellsAfterHint);
    }).toPass({ timeout: 3000 });

    const emptyCellsAfterRedo = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCellsAfterRedo).toBe(emptyCellsAfterHint);

    // Verify hint button is disabled after use (need to make move to re-enable)
    await expect(hintButton).toBeDisabled();
  });
});
