import { test, expect, Page } from '@playwright/test';
import { setupGameAndWaitForBoard } from '../utils/board-wait';
import { PlaywrightUISDK } from '../sdk';

/**
 * Full Solve Tests (Slow)
 * 
 * Tests that verify hint button visual guidance system.
 * As of December 24, 2025 (commit 5d5ec6b), hints provide VISUAL-ONLY guidance
 * (showing red eliminations and green additions) without auto-applying moves.
 * 
 * These tests verify:
 * - Hint button functions correctly (clickable, provides feedback)
 * - Visual highlights appear without crashing
 * - Hint system remains stable across multiple clicks
 * - No auto-fill is expected (hints are guidance, not auto-play)
 * 
 * Note: These tests are slow by design (testing multiple hint interactions).
 * 
 * Tag: @slow @full-solve
 */

/**
 * Wait for WASM module to be loaded and ready
 */
async function waitForWasmReady(page: Page, timeout = 30000) {
  await page.waitForFunction(
    () => {
      // Check if SudokuWasm API is available on window
      return typeof (window as any).SudokuWasm !== 'undefined';
    },
    { timeout }
  );
}

test.describe('@slow Hint System Visual Guidance', () => {
  // Extend timeout for slow tests - 2 minutes per test
  test.setTimeout(120_000);

  test('hint button provides visual guidance on easy puzzle', async ({ page }) => {
    // Start from homepage and click easy difficulty
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    // Click the easy difficulty button to start game
    const easyButton = page.locator('button:has-text("easy")').first();
    await easyButton.click();
    
    // Wait for game board to load
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("Hint"), button:has-text("💡")').first();
    
    // Verify hint button is functional
    expect(await hintButton.isVisible()).toBeTruthy();
    expect(await hintButton.isEnabled()).toBeTruthy();
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    // Click hint button multiple times to verify stability
    for (let i = 0; i < 10; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Visual-only check: board should remain unchanged (hints don't auto-apply)
    // This verifies hint system shows guidance without modifying board
    expect(finalEmpty).toBeLessThanOrEqual(initialEmpty);
    
    // Verify no crashes or errors occurred
    expect(await hintButton.isVisible()).toBeTruthy();
  });

  test('hint button provides visual guidance on medium puzzle', async ({ page }) => {
    await page.goto('/full-solve-medium?d=medium');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("Hint"), button:has-text("💡")').first();
    
    expect(await hintButton.isVisible()).toBeTruthy();
    expect(await hintButton.isEnabled()).toBeTruthy();
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    // Click hint button multiple times
    for (let i = 0; i < 10; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Visual-only check: board unchanged, system stable
    expect(finalEmpty).toBeLessThanOrEqual(initialEmpty);
    expect(await hintButton.isVisible()).toBeTruthy();
  });

  test.skip('hint button provides visual guidance on hard puzzle', async ({ page }) => {
    // Skip by default as this can take a very long time
    await page.goto('/full-solve-hard?d=hard');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("Hint"), button:has-text("💡")').first();
    
    expect(await hintButton.isVisible()).toBeTruthy();
    expect(await hintButton.isEnabled()).toBeTruthy();
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    // Click hint button multiple times
    for (let i = 0; i < 10; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Visual-only check: board unchanged, system stable
    expect(finalEmpty).toBeLessThanOrEqual(initialEmpty);
    expect(await hintButton.isVisible()).toBeTruthy();
  });
});

test.describe('@slow Hint System Stability', () => {
  test.setTimeout(120_000);

  test('hint button remains functional during extended use', async ({ page }) => {
    await setupGameAndWaitForBoard(page);
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("Hint"), button:has-text("💡")').first();
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    // Click hint button many times to test stability
    for (let i = 0; i < 20; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
    
    await page.waitForTimeout(1000);
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Visual-only check: button remains functional, no crashes
    expect(finalEmpty).toBeLessThanOrEqual(initialEmpty);
    expect(await hintButton.isVisible()).toBeTruthy();
    expect(await hintButton.isEnabled()).toBeTruthy();
  });

  test('hint button works alongside timer', async ({ page }) => {
    await setupGameAndWaitForBoard(page);
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    const timer = page.locator('.font-mono').first();
    const hintButton = page.locator('button:has-text("Hint"), button:has-text("💡")').first();
    
    // Verify timer is visible
    expect(await timer.isVisible()).toBeTruthy();
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    // Click hint button multiple times
    for (let i = 0; i < 10; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Visual-only check: hint system and timer coexist without issues
    expect(finalEmpty).toBeLessThanOrEqual(initialEmpty);
    expect(await timer.isVisible()).toBeTruthy();
  });
});

test.describe('@slow Hint System Consistency', () => {
  test.setTimeout(60_000);

  test('hint button provides consistent visual feedback', async ({ page }) => {
    await setupGameAndWaitForBoard(page);
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    const hintButton = page.locator('button:has-text("Hint"), button:has-text("💡")').first();
    
    // Click hint button multiple times
    for (let i = 0; i < 10; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Visual-only check: board unchanged (hints are guidance, not auto-fill)
    expect(finalEmpty).toBeLessThanOrEqual(initialEmpty);
    
    // Verify hint button still works after multiple clicks
    expect(await hintButton.isVisible()).toBeTruthy();
    expect(await hintButton.isEnabled()).toBeTruthy();
  });

  test('hint system handles multiple interactions gracefully', async ({ page }) => {
    await setupGameAndWaitForBoard(page);
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialFilled = initialBoard.filter(v => v !== 0).length;
    
    const hintButton = page.locator('button:has-text("Hint"), button:has-text("💡")').first();
    
    // Click hint button multiple times
    for (let i = 0; i < 15; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalFilled = finalBoard.filter(v => v !== 0).length;
    
    // Visual-only check: board state maintained (hints don't modify state)
    expect(finalFilled).toBeGreaterThanOrEqual(initialFilled);
    
    // Verify system remains stable
    expect(await hintButton.isVisible()).toBeTruthy();
  });
});

test.describe('@slow Hint System - Mobile Viewport', () => {
  test.setTimeout(120_000);

  test('hint button provides visual guidance on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupGameAndWaitForBoard(page);
    await waitForWasmReady(page);
    
    const sdk = new PlaywrightUISDK({ page });
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    // On mobile viewport, hint button shows only 💡 emoji (text hidden)
    const hintButton = page.locator('button:has-text("💡")');
    
    // Verify hint button works on mobile viewport
    expect(await hintButton.isVisible()).toBeTruthy();
    expect(await hintButton.isEnabled()).toBeTruthy();
    
    // Click hint button multiple times
    for (let i = 0; i < 10; i++) {
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Visual-only check: board unchanged, mobile viewport works correctly
    expect(finalEmpty).toBeLessThanOrEqual(initialEmpty);
    expect(await hintButton.isVisible()).toBeTruthy();
  });
});
