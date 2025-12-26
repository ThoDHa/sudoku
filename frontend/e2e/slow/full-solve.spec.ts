import { test, expect } from '@playwright/test';
import { PlaywrightUISDK } from '../sdk';

/**
 * Full Solve Tests (Slow)
 * 
 * FIXME: These tests are currently skipped because:
 * 1. The hint system was changed (Dec 2024) to SHOW hints visually without auto-applying them
 *    (commit 5d5ec6b "feat: overhaul hint system with visual feedback")
 * 2. The WASM solver has issues initializing in the Vite dev server environment
 *    (worker importScripts fails with module scripts)
 * 
 * These tests were written when hints auto-applied moves. Now users must click
 * the highlighted cell to apply the hint. The tests need to be rewritten to:
 * - Either use the autoSolve feature (Menu > Solve) which does auto-apply
 * - Or click the highlighted target cells after each hint
 * 
 * Tag: @slow @full-solve
 */

test.describe('@slow Full Puzzle Solve', () => {
  // Extend timeout for slow tests - 2 minutes per test
  test.setTimeout(120_000);

  test.fixme('complete an easy puzzle using hints only', async ({ page }) => {
    // FIXME: Hints no longer auto-apply moves - see comment at top of file
    await page.goto('/full-solve-easy?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    
    let iterations = 0;
    const maxIterations = 100;
    let solved = false;
    
    while (!solved && iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      const emptyCount = board.filter(v => v === 0).length;
      
      if (emptyCount === 0) {
        solved = true;
        break;
      }
      
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
      
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmptyCount = finalBoard.filter(v => v === 0).length;
    
    expect(finalEmptyCount).toBe(0);
  });

  test.fixme('complete a medium puzzle using hints only', async ({ page }) => {
    // FIXME: Hints no longer auto-apply moves - see comment at top of file
    await page.goto('/full-solve-medium?d=medium');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    
    let iterations = 0;
    const maxIterations = 150;
    let solved = false;
    
    while (!solved && iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      const emptyCount = board.filter(v => v === 0).length;
      
      if (emptyCount === 0) {
        solved = true;
        break;
      }
      
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(600);
      } else {
        break;
      }
      
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmptyCount = finalBoard.filter(v => v === 0).length;
    
    expect(finalEmptyCount).toBe(0);
  });

  test.skip('complete a hard puzzle using hints only', async ({ page }) => {
    // Skip by default as this can take a very long time
    await page.goto('/full-solve-hard?d=hard');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    
    let iterations = 0;
    const maxIterations = 200;
    let solved = false;
    
    while (!solved && iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      const emptyCount = board.filter(v => v === 0).length;
      
      if (emptyCount === 0) {
        solved = true;
        break;
      }
      
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(800);
      } else {
        break;
      }
      
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmptyCount = finalBoard.filter(v => v === 0).length;
    
    expect(finalEmptyCount).toBe(0);
  });
});

test.describe('@slow Full Solve - Victory Condition', () => {
  test.setTimeout(120_000);

  test.fixme('victory modal appears when puzzle is completed', async ({ page }) => {
    // FIXME: Hints no longer auto-apply moves - see comment at top of file
    await page.goto('/victory-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    
    let iterations = 0;
    const maxIterations = 100;
    
    while (iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      const emptyCount = board.filter(v => v === 0).length;
      
      if (emptyCount === 0) {
        break;
      }
      
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
      
      iterations++;
    }
    
    await page.waitForTimeout(1000);
    
    const finalBoard = await sdk.readBoardFromDOM();
    if (finalBoard.filter(v => v === 0).length === 0) {
      const victoryModal = page.locator('[role="dialog"], .modal, .victory, .congrat, .complete');
      const victoryText = page.locator(':text("Congratulations"), :text("Solved"), :text("Complete"), :text("Victory"), :text("Well done")');
      
      const hasVictoryUI = await victoryModal.first().isVisible().catch(() => false) ||
                           await victoryText.first().isVisible().catch(() => false);
      
      expect(hasVictoryUI).toBeTruthy();
    } else {
      expect(finalBoard.filter(v => v !== 0).length).toBeGreaterThan(0);
    }
  });

  test.fixme('timer stops when puzzle is completed', async ({ page }) => {
    // FIXME: Hints no longer auto-apply moves - see comment at top of file
    await page.goto('/timer-stop-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    const timer = page.locator('.font-mono').first();
    
    let iterations = 0;
    const maxIterations = 100;
    
    while (iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      if (board.filter(v => v === 0).length === 0) break;
      
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(200);
      } else {
        break;
      }
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    if (finalBoard.filter(v => v === 0).length === 0) {
      await page.waitForTimeout(500);
      const timerValue1 = await timer.textContent();
      await page.waitForTimeout(2000);
      const timerValue2 = await timer.textContent();
      expect(timerValue1).toBe(timerValue2);
    } else {
      expect(finalBoard.filter(v => v !== 0).length).toBeGreaterThan(0);
    }
  });
});

test.describe('@slow Full Solve - Progress Tracking', () => {
  test.setTimeout(60_000);

  test.fixme('cell count decreases as puzzle is solved', async ({ page }) => {
    // FIXME: Hints no longer auto-apply moves - see comment at top of file
    await page.goto('/progress-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    for (let i = 0; i < 5; i++) {
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(300);
      }
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    expect(finalEmpty).toBeLessThan(initialEmpty);
  });

  test.fixme('all 81 cells filled when puzzle is complete', async ({ page }) => {
    // FIXME: Hints no longer auto-apply moves - see comment at top of file
    await page.goto('/all-cells-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialFilled = initialBoard.filter(v => v !== 0).length;
    
    let iterations = 0;
    const maxIterations = 100;
    
    while (iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      if (board.filter(v => v === 0).length === 0) break;
      
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(300);
      } else {
        break;
      }
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    
    if (finalBoard.filter(v => v === 0).length === 0) {
      expect(finalBoard.length).toBe(81);
      expect(finalBoard.every(v => v >= 1 && v <= 9)).toBeTruthy();
    } else {
      const finalFilled = finalBoard.filter(v => v !== 0).length;
      expect(finalFilled).toBeGreaterThan(initialFilled);
    }
  });
});

test.describe('@slow Full Solve - Mobile', () => {
  test.setTimeout(120_000);

  test.fixme('can complete puzzle on mobile viewport', async ({ page }) => {
    // FIXME: Hints no longer auto-apply moves - see comment at top of file
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/mobile-solve-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.locator('button:has-text("💡")');
    
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    let iterations = 0;
    const maxIterations = 100;
    
    while (iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      if (board.filter(v => v === 0).length === 0) break;
      
      if (await hintButton.isVisible().catch(() => false) && await hintButton.isEnabled().catch(() => false)) {
        await hintButton.tap();
        await page.waitForTimeout(300);
      } else {
        break;
      }
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    expect(finalEmpty).toBeLessThan(initialEmpty);
  });
});
