import { test, expect } from '@playwright/test';
import { PlaywrightUISDK } from '../sdk';

/**
 * Full Solve Tests (Slow)
 * 
 * These tests complete entire puzzles using hints and are intentionally slow.
 * Mark with .skip for regular CI runs, or use test.slow() for extended timeout.
 * 
 * Tag: @slow @full-solve
 */

test.describe('@slow Full Puzzle Solve', () => {
  // Extend timeout for slow tests - 5 minutes
  test.slow();

  test('complete an easy puzzle using hints only', async ({ page }) => {
    await page.goto('/full-solve-easy?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    let iterations = 0;
    const maxIterations = 100;
    let solved = false;
    
    while (!solved && iterations < maxIterations) {
      // Check if puzzle is solved
      const board = await sdk.readBoardFromDOM();
      const emptyCount = board.filter(v => v === 0).length;
      
      if (emptyCount === 0) {
        solved = true;
        break;
      }
      
      // Use a hint if button is enabled
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        // No more hints available, check for completion modal
        break;
      }
      
      iterations++;
    }
    
    // Verify puzzle is solved
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmptyCount = finalBoard.filter(v => v === 0).length;
    
    expect(finalEmptyCount).toBe(0);
    expect(solved || iterations >= maxIterations).toBeTruthy();
  });

  test('complete a medium puzzle using hints only', async ({ page }) => {
    await page.goto('/full-solve-medium?d=medium');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
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
      
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(600);
      } else {
        break;
      }
      
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmptyCount = finalBoard.filter(v => v === 0).length;
    
    // Medium puzzles should be solvable
    expect(finalEmptyCount).toBe(0);
  });

  test.skip('complete a hard puzzle using hints only', async ({ page }) => {
    // Skip by default as this can take a very long time
    await page.goto('/full-solve-hard?d=hard');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
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
      
      if (await hintButton.isEnabled()) {
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
  test.slow();

  test('victory modal appears when puzzle is completed', async ({ page }) => {
    await page.goto('/victory-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    let iterations = 0;
    const maxIterations = 100;
    
    // Solve the puzzle
    while (iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      const emptyCount = board.filter(v => v === 0).length;
      
      if (emptyCount === 0) {
        break;
      }
      
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
      
      iterations++;
    }
    
    // Wait for victory modal
    await page.waitForTimeout(1000);
    
    // Check for victory/completion UI
    const victoryModal = page.locator('[role="dialog"], .modal, .victory, .congrat, .complete');
    const victoryText = page.locator(':text("Congratulations"), :text("Solved"), :text("Complete"), :text("Victory"), :text("Well done")');
    
    const hasVictoryUI = await victoryModal.first().isVisible().catch(() => false) ||
                         await victoryText.first().isVisible().catch(() => false);
    
    expect(hasVictoryUI).toBeTruthy();
  });

  test('timer stops when puzzle is completed', async ({ page }) => {
    await page.goto('/timer-stop-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    const timer = page.locator('.font-mono').first();
    
    // Solve the puzzle quickly
    let iterations = 0;
    while (iterations < 100) {
      const board = await sdk.readBoardFromDOM();
      if (board.filter(v => v === 0).length === 0) break;
      
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(300);
      } else {
        break;
      }
      iterations++;
    }
    
    // Record timer value
    await page.waitForTimeout(500);
    const timerValue1 = await timer.textContent();
    
    // Wait a bit
    await page.waitForTimeout(2000);
    
    // Timer should not have changed (puzzle is complete)
    const timerValue2 = await timer.textContent();
    
    expect(timerValue1).toBe(timerValue2);
  });
});

test.describe('@slow Full Solve - Progress Tracking', () => {
  test.slow();

  test('cell count decreases as puzzle is solved', async ({ page }) => {
    await page.goto('/progress-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    // Get initial empty count
    const initialBoard = await sdk.readBoardFromDOM();
    const initialEmpty = initialBoard.filter(v => v === 0).length;
    
    // Use 5 hints
    for (let i = 0; i < 5; i++) {
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(500);
      }
    }
    
    // Get final empty count
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    // Should have fewer empty cells
    expect(finalEmpty).toBeLessThan(initialEmpty);
  });

  test('all 81 cells filled when puzzle is complete', async ({ page }) => {
    await page.goto('/all-cells-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    // Solve completely
    let iterations = 0;
    while (iterations < 100) {
      const board = await sdk.readBoardFromDOM();
      if (board.filter(v => v === 0).length === 0) break;
      
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(400);
      } else {
        break;
      }
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    
    // All 81 cells should have values 1-9
    expect(finalBoard.length).toBe(81);
    expect(finalBoard.every(v => v >= 1 && v <= 9)).toBeTruthy();
  });
});

test.describe('@slow Full Solve - Mobile', () => {
  test.slow();

  test('can complete puzzle on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/mobile-solve-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const sdk = new PlaywrightUISDK({ page });
    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    let iterations = 0;
    const maxIterations = 100;
    
    while (iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      if (board.filter(v => v === 0).length === 0) break;
      
      if (await hintButton.isVisible() && await hintButton.isEnabled()) {
        await hintButton.tap();
        await page.waitForTimeout(500);
      } else {
        break;
      }
      iterations++;
    }
    
    const finalBoard = await sdk.readBoardFromDOM();
    const finalEmpty = finalBoard.filter(v => v === 0).length;
    
    expect(finalEmpty).toBe(0);
  });
});
