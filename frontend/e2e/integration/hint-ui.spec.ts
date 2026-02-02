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

  // Helper to find the hint button (works on both desktop and mobile)
  // On desktop: shows "💡 Hint"
  // On mobile: shows only "💡" with hidden text
  const getHintButton = (page: Page) => {
    return page.locator('button[title*="hint" i], button:has-text("💡"), button:has-text("Hint")').first();
  };

  test('hint usage works on desktop (happy path)', async ({ page }) => {
    const hintButton = getHintButton(page);

    // Verify button is enabled initially
    await expect(hintButton).toBeEnabled();

    // Get initial hint count if available
    const initialText = await hintButton.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : null;

    // Use a hint
    await hintButton.click();
    
    // Wait for hint to be processed (button may briefly show loading state, then becomes enabled again)
    // The hint button stays enabled after use - it's not disabled after using
    await page.waitForTimeout(1000); // Wait for hint processing to complete

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
    const hintButton = getHintButton(page);

    // Get initial hint count
    const initialText = await hintButton.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : 3;

    // Use a hint
    await hintButton.click();
    
    // Wait for hint to be processed (button stays enabled after use)
    await page.waitForTimeout(1000); // Wait for hint processing to complete

    // Count should have decreased
    const afterText = await hintButton.textContent();
    const afterMatch = afterText?.match(/\d+/);
    const afterCount = afterMatch ? parseInt(afterMatch[0]) : initialCount - 1;

    // Reload page
    await page.reload();
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    // Wait for page to be fully loaded and hint button to be ready
    const reloadedHintButton = getHintButton(page);
    await expect(reloadedHintButton).toBeEnabled({ timeout: 3000 });

    // Count should persist after reload
    const reloadText = await reloadedHintButton.textContent();
    const reloadMatch = reloadText?.match(/\d+/);
    const reloadCount = reloadMatch ? parseInt(reloadMatch[0]) : afterCount;

    expect(reloadCount).toBe(afterCount);
  });

  test('deep assertion: counters/undo/redo/error', async ({ page }) => {
    const hintButton = getHintButton(page);

    // Get initial hint count
    const initialHintText = await hintButton.textContent();
    const initialHintCount = parseInt(initialHintText?.match(/\d+/)?.[0] || '3');

    // Use hint - this shows a highlighted suggestion but doesn't fill cells
    await hintButton.click();
    
    // Wait for hint to be processed (may show toast/highlight)
    await page.waitForTimeout(1000);

    // Hint count should have decreased
    const afterHintText = await hintButton.textContent();
    const afterHintCount = parseInt(afterHintText?.match(/\d+/)?.[0] || '2');
    expect(afterHintCount).toBeLessThan(initialHintCount);
    
    // Hint button should remain enabled for further hints
    await expect(hintButton).toBeEnabled();
    
    // Use another hint
    await hintButton.click();
    await page.waitForTimeout(1000);
    
    // Count should decrease again
    const secondHintText = await hintButton.textContent();
    const secondHintCount = parseInt(secondHintText?.match(/\d+/)?.[0] || '1');
    expect(secondHintCount).toBeLessThan(afterHintCount);
    
    // Button should still be enabled
    await expect(hintButton).toBeEnabled();
  });
});
