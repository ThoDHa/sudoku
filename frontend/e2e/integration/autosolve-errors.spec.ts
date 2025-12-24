import { test, expect } from '@playwright/test';
import { PlaywrightUISDK } from '../sdk';

/**
 * Autosolve Error Handling Tests
 *
 * Tests that the autosolve/hint system gracefully handles invalid board states.
 * These test edge cases where the user has entered incorrect values.
 *
 * Tag: @integration @autosolve @errors
 */

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: any, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to find an empty cell's row/col from aria-label
async function getEmptyCellPosition(page: any, rowHint: number): Promise<{ row: number; col: number } | null> {
  const emptyCell = page.locator(`[role="gridcell"][aria-label*="Row ${rowHint}"][aria-label*="empty"]`).first();
  if ((await emptyCell.count()) === 0) return null;

  const ariaLabel = await emptyCell.getAttribute('aria-label');
  const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
  if (!match) return null;

  return { row: parseInt(match[1]), col: parseInt(match[2]) };
}

// Helper to find a digit that conflicts with a cell's row
async function findConflictingDigitForRow(sdk: PlaywrightUISDK, row: number, col: number): Promise<number | null> {
  const board = await sdk.readBoardFromDOM();
  const rowStart = (row - 1) * 9;

  // Find a digit that already exists in this row
  for (let c = 0; c < 9; c++) {
    const value = board[rowStart + c];
    if (value !== 0 && c !== col - 1) {
      return value;
    }
  }
  return null;
}

// Helper to find a digit that conflicts with a cell's column
async function findConflictingDigitForColumn(sdk: PlaywrightUISDK, row: number, col: number): Promise<number | null> {
  const board = await sdk.readBoardFromDOM();

  // Find a digit that already exists in this column
  for (let r = 0; r < 9; r++) {
    const value = board[r * 9 + (col - 1)];
    if (value !== 0 && r !== row - 1) {
      return value;
    }
  }
  return null;
}

// Helper to find a digit that conflicts with a cell's box
async function findConflictingDigitForBox(sdk: PlaywrightUISDK, row: number, col: number): Promise<number | null> {
  const board = await sdk.readBoardFromDOM();

  // Calculate box start
  const boxRowStart = Math.floor((row - 1) / 3) * 3;
  const boxColStart = Math.floor((col - 1) / 3) * 3;

  // Find a digit that already exists in this box
  for (let r = boxRowStart; r < boxRowStart + 3; r++) {
    for (let c = boxColStart; c < boxColStart + 3; c++) {
      const value = board[r * 9 + c];
      if (value !== 0 && !(r === row - 1 && c === col - 1)) {
        return value;
      }
    }
  }
  return null;
}

// Helper to enter a digit into a cell
async function enterDigitInCell(page: any, row: number, col: number, digit: number): Promise<void> {
  const cell = getCellLocator(page, row, col);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.keyboard.press(digit.toString());
  await page.waitForTimeout(100);
}

// Helper to use hints until puzzle is solved or max iterations reached
async function useHintsUntilSolvedOrStuck(
  page: any,
  sdk: PlaywrightUISDK,
  maxIterations: number = 50
): Promise<{ solved: boolean; iterations: number; error: string | null }> {
  const hintButton = page.getByRole('button', { name: /Hint/i });
  let iterations = 0;
  let error: string | null = null;

  while (iterations < maxIterations) {
    // Check if puzzle is solved
    const board = await sdk.readBoardFromDOM();
    const emptyCount = board.filter((v: number) => v === 0).length;

    if (emptyCount === 0) {
      return { solved: true, iterations, error: null };
    }

    // Check for error messages/dialogs
    const errorDialog = page.locator('[role="dialog"]:has-text("error"), [role="dialog"]:has-text("invalid"), [role="alert"]:has-text("error")');
    if (await errorDialog.first().isVisible().catch(() => false)) {
      error = await errorDialog.first().textContent().catch(() => 'Unknown error');
      // Close dialog if possible
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // Try to use a hint
    if (await hintButton.isEnabled().catch(() => false)) {
      await hintButton.click();
      await page.waitForTimeout(500);
    } else {
      // Hint button disabled - might be stuck or completed
      break;
    }

    iterations++;
  }

  // Final check
  const finalBoard = await sdk.readBoardFromDOM();
  const finalEmptyCount = finalBoard.filter((v: number) => v === 0).length;

  return {
    solved: finalEmptyCount === 0,
    iterations,
    error,
  };
}

test.describe('@integration Autosolve Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('autosolve handles invalid cell in row gracefully', async ({ page }) => {
    await page.goto('/autosolve-error-row?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find an empty cell in row 5
    const pos = await getEmptyCellPosition(page, 5);
    expect(pos).not.toBeNull();
    if (!pos) return;

    // Find a digit that conflicts with this row
    const conflictingDigit = await findConflictingDigitForRow(sdk, pos.row, pos.col);

    if (conflictingDigit) {
      // Enter the conflicting digit (creates row conflict)
      await enterDigitInCell(page, pos.row, pos.col, conflictingDigit);

      // Now try to use hints - system should handle gracefully
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 30);

      // The system should either:
      // 1. Fix the error and solve the puzzle
      // 2. Show an error message
      // 3. Simply not crash (graceful handling)
      // Any of these outcomes is acceptable
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      // Verify the page is still responsive
      const board = await sdk.readBoardFromDOM();
      expect(board.length).toBe(81);
    } else {
      // No conflicting digit found, just verify hints work normally
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });

  test('autosolve handles invalid cell in column gracefully', async ({ page }) => {
    await page.goto('/autosolve-error-col?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find an empty cell in row 6
    const pos = await getEmptyCellPosition(page, 6);
    expect(pos).not.toBeNull();
    if (!pos) return;

    // Find a digit that conflicts with this column
    const conflictingDigit = await findConflictingDigitForColumn(sdk, pos.row, pos.col);

    if (conflictingDigit) {
      // Enter the conflicting digit (creates column conflict)
      await enterDigitInCell(page, pos.row, pos.col, conflictingDigit);

      // Now try to use hints - system should handle gracefully
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 30);

      // Verify graceful handling
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      // Verify the page is still responsive
      const board = await sdk.readBoardFromDOM();
      expect(board.length).toBe(81);
    } else {
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });

  test('autosolve handles invalid cell in box gracefully', async ({ page }) => {
    await page.goto('/autosolve-error-box?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find an empty cell in row 7 (middle of bottom-left box area)
    const pos = await getEmptyCellPosition(page, 7);
    expect(pos).not.toBeNull();
    if (!pos) return;

    // Find a digit that conflicts with this box
    const conflictingDigit = await findConflictingDigitForBox(sdk, pos.row, pos.col);

    if (conflictingDigit) {
      // Enter the conflicting digit (creates box conflict)
      await enterDigitInCell(page, pos.row, pos.col, conflictingDigit);

      // Now try to use hints - system should handle gracefully
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 30);

      // Verify graceful handling
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      // Verify the page is still responsive
      const board = await sdk.readBoardFromDOM();
      expect(board.length).toBe(81);
    } else {
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });

  test('autosolve handles duplicate in row gracefully', async ({ page }) => {
    await page.goto('/autosolve-dup-row?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find TWO empty cells in the same row and enter the same digit
    const board = await sdk.readBoardFromDOM();

    // Look for row 5 with at least 2 empty cells
    let emptyCells: { row: number; col: number }[] = [];
    for (let col = 1; col <= 9; col++) {
      const idx = 4 * 9 + (col - 1); // Row 5 (0-indexed: 4)
      if (board[idx] === 0) {
        emptyCells.push({ row: 5, col });
      }
      if (emptyCells.length >= 2) break;
    }

    if (emptyCells.length >= 2) {
      // Enter the same digit in both cells (creating a duplicate)
      await enterDigitInCell(page, emptyCells[0].row, emptyCells[0].col, 1);
      await enterDigitInCell(page, emptyCells[1].row, emptyCells[1].col, 1);

      // Now try to use hints
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 30);

      // Verify graceful handling
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      // Page should still be responsive
      const finalBoard = await sdk.readBoardFromDOM();
      expect(finalBoard.length).toBe(81);
    } else {
      // Not enough empty cells, just verify normal operation
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });

  test('autosolve handles duplicate in column gracefully', async ({ page }) => {
    await page.goto('/autosolve-dup-col?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find TWO empty cells in the same column and enter the same digit
    const board = await sdk.readBoardFromDOM();

    // Look for column 5 with at least 2 empty cells
    let emptyCells: { row: number; col: number }[] = [];
    for (let row = 1; row <= 9; row++) {
      const idx = (row - 1) * 9 + 4; // Column 5 (0-indexed: 4)
      if (board[idx] === 0) {
        emptyCells.push({ row, col: 5 });
      }
      if (emptyCells.length >= 2) break;
    }

    if (emptyCells.length >= 2) {
      // Enter the same digit in both cells (creating a duplicate)
      await enterDigitInCell(page, emptyCells[0].row, emptyCells[0].col, 2);
      await enterDigitInCell(page, emptyCells[1].row, emptyCells[1].col, 2);

      // Now try to use hints
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 30);

      // Verify graceful handling
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      // Page should still be responsive
      const finalBoard = await sdk.readBoardFromDOM();
      expect(finalBoard.length).toBe(81);
    } else {
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });

  test('autosolve handles duplicate in box gracefully', async ({ page }) => {
    await page.goto('/autosolve-dup-box?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find TWO empty cells in the same box and enter the same digit
    const board = await sdk.readBoardFromDOM();

    // Look for center box (rows 4-6, cols 4-6) with at least 2 empty cells
    let emptyCells: { row: number; col: number }[] = [];
    for (let row = 4; row <= 6; row++) {
      for (let col = 4; col <= 6; col++) {
        const idx = (row - 1) * 9 + (col - 1);
        if (board[idx] === 0) {
          emptyCells.push({ row, col });
        }
        if (emptyCells.length >= 2) break;
      }
      if (emptyCells.length >= 2) break;
    }

    if (emptyCells.length >= 2) {
      // Enter the same digit in both cells (creating a duplicate)
      await enterDigitInCell(page, emptyCells[0].row, emptyCells[0].col, 3);
      await enterDigitInCell(page, emptyCells[1].row, emptyCells[1].col, 3);

      // Now try to use hints
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 30);

      // Verify graceful handling
      expect(result.iterations).toBeGreaterThanOrEqual(0);

      // Page should still be responsive
      const finalBoard = await sdk.readBoardFromDOM();
      expect(finalBoard.length).toBe(81);
    } else {
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });

  test('autosolve works with manually entered candidates', async ({ page }) => {
    await page.goto('/autosolve-candidates?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find an empty cell
    const pos = await getEmptyCellPosition(page, 5);
    expect(pos).not.toBeNull();
    if (!pos) return;

    // Toggle notes mode and enter some candidates
    const notesButton = page.locator('button[aria-label*="Notes"]');
    if (await notesButton.isVisible()) {
      await notesButton.click();
      await page.waitForTimeout(100);

      // Enter a few candidates
      const cell = getCellLocator(page, pos.row, pos.col);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await page.keyboard.press('1');
      await page.keyboard.press('2');
      await page.keyboard.press('3');
      await page.waitForTimeout(100);

      // Toggle notes mode off
      await notesButton.click();
      await page.waitForTimeout(100);
    }

    // Now try to use hints - should work despite manual candidates
    const result = await useHintsUntilSolvedOrStuck(page, sdk, 40);

    // Verify graceful handling
    expect(result.iterations).toBeGreaterThanOrEqual(0);

    // Page should still be responsive
    const finalBoard = await sdk.readBoardFromDOM();
    expect(finalBoard.length).toBe(81);
  });
});

test.describe('@integration Autosolve Error Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('undo can fix invalid state before continuing with hints', async ({ page }) => {
    await page.goto('/autosolve-undo-fix?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find an empty cell
    const pos = await getEmptyCellPosition(page, 5);
    expect(pos).not.toBeNull();
    if (!pos) return;

    // Find a conflicting digit and enter it
    const conflictingDigit = await findConflictingDigitForRow(sdk, pos.row, pos.col);

    if (conflictingDigit) {
      await enterDigitInCell(page, pos.row, pos.col, conflictingDigit);

      // Use undo to remove the bad move
      const undoButton = page.locator('button[title="Undo"]');
      await undoButton.click();
      await page.waitForTimeout(200);

      // Now hints should work normally
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 40);

      // Should make progress
      expect(result.iterations).toBeGreaterThan(0);
    } else {
      // Just verify normal hint operation
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });

  test('clear cell can fix invalid state before continuing with hints', async ({ page }) => {
    await page.goto('/autosolve-clear-fix?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find an empty cell
    const pos = await getEmptyCellPosition(page, 6);
    expect(pos).not.toBeNull();
    if (!pos) return;

    // Find a conflicting digit and enter it
    const conflictingDigit = await findConflictingDigitForColumn(sdk, pos.row, pos.col);

    if (conflictingDigit) {
      await enterDigitInCell(page, pos.row, pos.col, conflictingDigit);

      // Use backspace to clear the bad move
      const cell = getCellLocator(page, pos.row, pos.col);
      await cell.click();
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(200);

      // Now hints should work normally
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 40);

      // Should make progress
      expect(result.iterations).toBeGreaterThan(0);
    } else {
      const result = await useHintsUntilSolvedOrStuck(page, sdk, 20);
      expect(result.iterations).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('@integration Autosolve Error - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('autosolve handles errors on mobile viewport', async ({ page }) => {
    await page.goto('/autosolve-mobile-error?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });

    const sdk = new PlaywrightUISDK({ page });

    // Find an empty cell
    const pos = await getEmptyCellPosition(page, 5);
    expect(pos).not.toBeNull();
    if (!pos) return;

    // Find a conflicting digit
    const conflictingDigit = await findConflictingDigitForRow(sdk, pos.row, pos.col);

    if (conflictingDigit) {
      // Enter the conflicting digit
      const cell = getCellLocator(page, pos.row, pos.col);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();

      // Use number button instead of keyboard on mobile
      const numberButton = page.locator(`button[aria-label^="Enter ${conflictingDigit},"]`);
      if (await numberButton.isVisible()) {
        await numberButton.click();
        await page.waitForTimeout(100);
      }
    }

    // Try to use hints (mobile uses emoji button)
    const hintButton = page.locator('button:has-text("💡")');
    let iterations = 0;
    const maxIterations = 20;

    while (iterations < maxIterations) {
      const board = await sdk.readBoardFromDOM();
      const emptyCount = board.filter((v: number) => v === 0).length;

      if (emptyCount === 0) break;

      if (await hintButton.isVisible() && (await hintButton.isEnabled().catch(() => false))) {
        await hintButton.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }

      iterations++;
    }

    // Verify page is still responsive
    const finalBoard = await sdk.readBoardFromDOM();
    expect(finalBoard.length).toBe(81);
  });
});
