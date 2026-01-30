import { test, expect, Page } from '@playwright/test';
import { setupGameAndWaitForBoard } from '../utils/board-wait';

/**
 * Autosolve Error Handling Tests
 *
 * Tests that the autosolve/hint system gracefully handles invalid board states.
 * These test edge cases where the user has entered incorrect values.
 * 
 * IMPORTANT: These tests are intentionally simple - they verify the system doesn't crash,
 * not that it solves the puzzle completely. Full solve tests are in slow/.
 *
 * Tag: @integration @autosolve @errors
 */

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: Page, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to find an empty cell in a specific row
async function findEmptyCellInRow(page: Page, rowHint: number): Promise<{ row: number; col: number } | null> {
  const emptyCell = page.locator(`[role="gridcell"][aria-label*="Row ${rowHint}"][aria-label*="empty"]`).first();
  if ((await emptyCell.count()) === 0) return null;

  const ariaLabel = await emptyCell.getAttribute('aria-label');
  const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
  if (!match) return null;

  return { row: parseInt(match[1]), col: parseInt(match[2]) };
}

// Helper to find a filled cell's digit in a specific row (to create conflict)
async function findFilledDigitInRow(page: Page, row: number): Promise<number | null> {
  const filledCells = page.locator(`[role="gridcell"][aria-label*="Row ${row}"][aria-label*="value"]`);
  const count = await filledCells.count();
  if (count === 0) return null;
  
  const ariaLabel = await filledCells.first().getAttribute('aria-label');
  const match = ariaLabel?.match(/value (\d)/);
  return match ? parseInt(match[1]) : null;
}

// Helper to find a filled cell's digit in a specific column
async function findFilledDigitInColumn(page: Page, col: number): Promise<number | null> {
  const filledCells = page.locator(`[role="gridcell"][aria-label*="Column ${col}"][aria-label*="value"]`);
  const count = await filledCells.count();
  if (count === 0) return null;
  
  const ariaLabel = await filledCells.first().getAttribute('aria-label');
  const match = ariaLabel?.match(/value (\d)/);
  return match ? parseInt(match[1]) : null;
}

// Helper to enter a digit into a cell
async function enterDigitInCell(page: Page, row: number, col: number, digit: number): Promise<void> {
  const cell = getCellLocator(page, row, col);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.keyboard.press(digit.toString());
  await page.waitForTimeout(100);
}

// Helper to use a few hints and verify system doesn't crash
async function useHintsAndVerifyStable(page: Page, hintCount: number = 3): Promise<boolean> {
  const hintButton = page.getByRole('button', { name: /Hint/i });
  
  for (let i = 0; i < hintCount; i++) {
    if (await hintButton.isEnabled().catch(() => false)) {
      await hintButton.click();
      await page.waitForTimeout(400);
    } else {
      break;
    }
  }
  
  // Verify page is still responsive by checking grid exists
  const grid = page.locator('[role="grid"]');
  return await grid.isVisible().catch(() => false);
}

test.describe('@integration Autosolve Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('autosolve handles invalid cell in row gracefully', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Find an empty cell in row 5
    const pos = await findEmptyCellInRow(page, 5);
    if (!pos) {
      // No empty cell in row 5, try row 4
      const pos2 = await findEmptyCellInRow(page, 4);
      expect(pos2).not.toBeNull();
      return;
    }

    // Find a digit that exists in this row (to create conflict)
    const conflictDigit = await findFilledDigitInRow(page, pos.row);
    
    if (conflictDigit) {
      // Enter the conflicting digit
      await enterDigitInCell(page, pos.row, pos.col, conflictDigit);
      
      // Use hints - system should handle gracefully (not crash)
      const isStable = await useHintsAndVerifyStable(page, 3);
      expect(isStable).toBeTruthy();
    }
    
    // Verify grid is still visible
    await expect(page.locator('[role="grid"]')).toBeVisible();
  });

  test('autosolve handles invalid cell in column gracefully', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Find an empty cell
    const pos = await findEmptyCellInRow(page, 6);
    if (!pos) {
      await expect(page.locator('[role="grid"]')).toBeVisible();
      return;
    }

    // Find a digit that exists in this column
    const conflictDigit = await findFilledDigitInColumn(page, pos.col);
    
    if (conflictDigit) {
      await enterDigitInCell(page, pos.row, pos.col, conflictDigit);
      const isStable = await useHintsAndVerifyStable(page, 3);
      expect(isStable).toBeTruthy();
    }
    
    await expect(page.locator('[role="grid"]')).toBeVisible();
  });

  test('autosolve handles duplicate in row gracefully', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Find two empty cells in the same row - capture positions BEFORE modifying
    let foundDuplicate = false;
    for (const row of [5, 4, 6, 3, 7]) {
      const emptyCells = page.locator(`[role="gridcell"][aria-label*="Row ${row}"][aria-label*="empty"]`);
      const count = await emptyCells.count();
      
      if (count >= 2) {
        // Extract positions of first two empty cells BEFORE modifying anything
        const firstLabel = await emptyCells.nth(0).getAttribute('aria-label');
        const secondLabel = await emptyCells.nth(1).getAttribute('aria-label');
        
        const firstMatch = firstLabel?.match(/Row (\d+), Column (\d+)/);
        const secondMatch = secondLabel?.match(/Row (\d+), Column (\d+)/);
        
        if (firstMatch && secondMatch) {
          const cell1 = { row: parseInt(firstMatch[1]), col: parseInt(firstMatch[2]) };
          const cell2 = { row: parseInt(secondMatch[1]), col: parseInt(secondMatch[2]) };
          
          // Now use stable cell references by position
          await enterDigitInCell(page, cell1.row, cell1.col, 1);
          await enterDigitInCell(page, cell2.row, cell2.col, 1); // Duplicate!
          
          // Use hints - should handle gracefully
          const isStable = await useHintsAndVerifyStable(page, 3);
          expect(isStable).toBeTruthy();
          foundDuplicate = true;
          break;
        }
      }
    }
    
    // If no duplicate scenario possible, just verify grid works
    if (!foundDuplicate) {
      const isStable = await useHintsAndVerifyStable(page, 2);
      expect(isStable).toBeTruthy();
    }
    
    await expect(page.locator('[role="grid"]')).toBeVisible();
  });

  test('autosolve handles duplicate in column gracefully', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Try different columns to find one with 2+ empty cells
    let foundDuplicate = false;
    for (const col of [5, 4, 6, 3, 7]) {
      const emptyCells = page.locator(`[role="gridcell"][aria-label*="Column ${col}"][aria-label*="empty"]`);
      const count = await emptyCells.count();
      
      if (count >= 2) {
        // Extract positions of first two empty cells BEFORE modifying anything
        const firstLabel = await emptyCells.nth(0).getAttribute('aria-label');
        const secondLabel = await emptyCells.nth(1).getAttribute('aria-label');
        
        const firstMatch = firstLabel?.match(/Row (\d+), Column (\d+)/);
        const secondMatch = secondLabel?.match(/Row (\d+), Column (\d+)/);
        
        if (firstMatch && secondMatch) {
          const cell1 = { row: parseInt(firstMatch[1]), col: parseInt(firstMatch[2]) };
          const cell2 = { row: parseInt(secondMatch[1]), col: parseInt(secondMatch[2]) };
          
          // Now use stable cell references by position
          await enterDigitInCell(page, cell1.row, cell1.col, 2);
          await enterDigitInCell(page, cell2.row, cell2.col, 2); // Duplicate!
          
          const isStable = await useHintsAndVerifyStable(page, 3);
          expect(isStable).toBeTruthy();
          foundDuplicate = true;
          break;
        }
      }
    }
    
    // If no duplicate scenario possible, just verify grid works
    if (!foundDuplicate) {
      const isStable = await useHintsAndVerifyStable(page, 2);
      expect(isStable).toBeTruthy();
    }
    
    await expect(page.locator('[role="grid"]')).toBeVisible();
  });

  test('hint button remains functional after error state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    const hintButton = page.getByRole('button', { name: /Hint/i });
    
    // Click hint several times
    for (let i = 0; i < 5; i++) {
      if (await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        await page.waitForTimeout(300);
      }
    }
    
    // Verify hint button is still there and functional
    await expect(hintButton).toBeVisible();
  });
});

test.describe('@integration Autosolve Error Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('undo can fix invalid state before continuing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Find an empty cell
    const pos = await findEmptyCellInRow(page, 5);
    if (!pos) {
      await expect(page.locator('[role="grid"]')).toBeVisible();
      return;
    }

    // Enter a digit (might conflict, might not)
    await enterDigitInCell(page, pos.row, pos.col, 9);

    // Undo
    const undoButton = page.locator('button[title="Undo"]');
    if (await undoButton.isEnabled().catch(() => false)) {
      await undoButton.click();
      await page.waitForTimeout(200);
    }

    // Use hints
    const isStable = await useHintsAndVerifyStable(page, 3);
    expect(isStable).toBeTruthy();
  });

  test('clear cell can fix invalid state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Find an empty cell
    const pos = await findEmptyCellInRow(page, 6);
    if (!pos) {
      await expect(page.locator('[role="grid"]')).toBeVisible();
      return;
    }

    // Enter a digit
    await enterDigitInCell(page, pos.row, pos.col, 5);

    // Clear it using erase or backspace
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.click();
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Use hints
    const isStable = await useHintsAndVerifyStable(page, 3);
    expect(isStable).toBeTruthy();
  });
});

test.describe('@integration Autosolve Error - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('autosolve handles errors on mobile viewport', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).click();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Use a few hints on mobile
    const isStable = await useHintsAndVerifyStable(page, 3);
    expect(isStable).toBeTruthy();
    
    await expect(page.locator('[role="grid"]')).toBeVisible();
  });
});
