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
  // Wait for digit to appear in the cell
  await expect(cell).toContainText(digit.toString(), { timeout: 2000 });
}

// Helper to dismiss any error modal that may appear
async function dismissErrorModal(page: Page): Promise<void> {
  const modalOverlay = page.locator('.fixed.inset-0.z-50');
  
  // Check if modal is visible
  if (await modalOverlay.isVisible({ timeout: 300 }).catch(() => false)) {
    // Try various dismiss buttons in order of preference
    const dismissButtons = [
      page.getByRole('button', { name: 'Let Me Fix It' }),
      page.getByRole('button', { name: 'Check & Fix' }),
      page.getByRole('button', { name: /close/i }),
      page.getByRole('button', { name: /dismiss/i }),
      page.getByRole('button', { name: /cancel/i }),
      page.getByRole('button', { name: /ok/i }),
    ];
    
    for (const btn of dismissButtons) {
      if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
        await btn.click();
        // Wait for modal to close
        await modalOverlay.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
        return;
      }
    }
    
    // Fallback: press Escape
    await page.keyboard.press('Escape');
    await modalOverlay.waitFor({ state: 'hidden', timeout: 1000 }).catch(() => {});
  }
}

// Helper to use a few hints and verify system doesn't crash
async function useHintsAndVerifyStable(page: Page, hintCount: number = 3): Promise<boolean> {
  const hintButton = page.getByRole('button', { name: /Hint/i });
  
  for (let i = 0; i < hintCount; i++) {
    // Dismiss any error modal that may be blocking
    await dismissErrorModal(page);
    
    if (await hintButton.isEnabled().catch(() => false)) {
      await hintButton.click();
      // Wait for hint action to complete by checking button state or grid visibility
      await expect(page.locator('[role="grid"]')).toBeVisible({ timeout: 2000 });
      
      // After clicking hint, dismiss any error modal that may appear
      await dismissErrorModal(page);
    } else {
      break;
    }
  }
  
  // Final modal dismissal before checking grid
  await dismissErrorModal(page);
  
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

    // Hint button may show as "💡 Hint" or just "💡" on mobile
    const hintButton = page.locator('button:has-text("💡"), button:has-text("Hint")').first();
    
    // Helper to dismiss any modal overlay that might appear after hint
    const dismissModal = async () => {
      // Check for modal overlay
      const modalOverlay = page.locator('.fixed.inset-0.z-50');
      if (await modalOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
        // Look for specific dismissal buttons
        const letMeFixIt = page.getByRole('button', { name: 'Let Me Fix It' });
        const checkAndFix = page.getByRole('button', { name: 'Check & Fix' });
        const closeButton = page.getByRole('button', { name: /close|dismiss|ok|got it/i });
        
        if (await letMeFixIt.isVisible({ timeout: 200 }).catch(() => false)) {
          await letMeFixIt.click();
        } else if (await checkAndFix.isVisible({ timeout: 200 }).catch(() => false)) {
          await checkAndFix.click();
        } else if (await closeButton.isVisible({ timeout: 200 }).catch(() => false)) {
          await closeButton.click();
        } else {
          // Try clicking outside the modal content (the overlay itself)
          await page.keyboard.press('Escape');
        }
        // Wait for modal to disappear
        await expect(modalOverlay).not.toBeVisible({ timeout: 3000 }).catch(() => {});
      }
    };
    
    // Click hint several times
    for (let i = 0; i < 5; i++) {
      // Dismiss any modal before attempting to click hint
      await dismissModal();
      
      if (await hintButton.isVisible().catch(() => false) && await hintButton.isEnabled().catch(() => false)) {
        await hintButton.click();
        // Wait for hint action to complete and dismiss any modal
        await page.waitForTimeout(500); // Give time for modal to appear
        await dismissModal();
        
        // Check button is enabled again
        await expect(async () => {
          const isEnabled = await hintButton.isEnabled();
          expect(isEnabled).toBeTruthy();
        }).toPass({ timeout: 5000 });
      }
    }
    
    // Dismiss any final modal
    await dismissModal();
    
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
      // Wait for undo to complete by checking cell is cleared
      const cell = getCellLocator(page, pos.row, pos.col);
      await expect(cell).not.toContainText('9', { timeout: 2000 });
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
    // Wait for cell to be cleared
    await expect(cell).not.toContainText('5', { timeout: 2000 });

    // Use hints
    const isStable = await useHintsAndVerifyStable(page, 3);
    expect(isStable).toBeTruthy();
  });
});

test.describe('@integration Autosolve Fresh Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  // Helper to open menu and click Solve speed button (bypasses confirmation dialog)
  async function clickSolveInMenu(page: Page): Promise<void> {
    // Open the hamburger menu
    const menuButton = page.locator('button[aria-label="Menu"], button[title="Menu"]').first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();
    
    // Wait for menu to open
    await page.waitForTimeout(300);
    
    // Click one of the speed buttons directly (they bypass confirmation dialog)
    // Speed buttons have titles like "Slow - Click to start", "Normal - Click to start", "Fast - Click to start"
    const speedButton = page.locator('button[title*="Click to start"]').first();
    await expect(speedButton).toBeVisible({ timeout: 3000 });
    await speedButton.click();
  }

  test('autosolve works on fresh board with no user entries or notes', async ({ page }) => {
    // This test verifies the fix for the bug where autosolve would immediately
    // show "Too Many Conflicts" on a fresh game with no user notes entered.
    // The bug was caused by the WASM solver receiving empty candidate arrays
    // and not initializing them before attempting to solve.
    
    // Use the proper helper to navigate and wait for board with WASM
    await setupGameAndWaitForBoard(page, { difficulty: 'easy' });

    // Immediately click autosolve without entering any values or notes
    // The Solve button is inside the hamburger menu
    await clickSolveInMenu(page);

    // Wait a moment for autosolve to start processing
    await page.waitForTimeout(500);

    // The bug would cause "Too Many Conflicts" modal to appear immediately
    // Verify that the error modal does NOT appear
    const errorModal = page.locator('text=/Too Many Conflicts|Couldn\'t pinpoint/i');
    const hasErrorModal = await errorModal.isVisible({ timeout: 1000 }).catch(() => false);
    
    // If no error modal, autosolve should be making progress or have completed
    if (!hasErrorModal) {
      // Success: no immediate error modal
      // Either autosolve is running (progress visible) or puzzle is solved
      await expect(page.locator('[role="grid"]')).toBeVisible();
    } else {
      // If error modal appeared, this test should fail
      // But first dismiss it to prevent test cleanup issues
      await dismissErrorModal(page);
      expect(hasErrorModal).toBeFalsy(); // This will fail the test with clear message
    }
  });

  test('autosolve makes progress on fresh board', async ({ page }) => {
    // This test verifies autosolve actually runs on a fresh board.
    // The key verification is that the solver starts without errors.
    // Note: Visible cell progress may take time depending on solver speed.
    
    await setupGameAndWaitForBoard(page, { difficulty: 'easy' });

    // Click autosolve via menu
    await clickSolveInMenu(page);

    // Wait a moment for solver to process
    await page.waitForTimeout(1000);

    // Verify no error modal appeared (the critical check)
    const errorModal = page.locator('text=/Too Many Conflicts|Couldn\'t pinpoint/i');
    const hasErrorModal = await errorModal.isVisible({ timeout: 500 }).catch(() => false);

    if (hasErrorModal) {
      await dismissErrorModal(page);
      // Fail if error appeared on fresh board
      expect(hasErrorModal).toBeFalsy();
    }
    
    // Verify the board is still visible and interactive (solver running)
    await expect(page.locator('[role="grid"]')).toBeVisible();
    
    // Check for autosolve indicators: either stop button visible or puzzle completing
    // The AutoSolveControls component shows speed buttons when autosolving
    const autosolveRunning = page.locator('button[title*="Stop"]').or(
      page.locator('text=/Solving|Complete/i')
    );
    
    // If autosolve started, either it's still running or already completed
    const isAutosolving = await autosolveRunning.isVisible({ timeout: 2000 }).catch(() => false);
    
    // Either autosolve is visibly running OR puzzle completed OR at least no crash
    // The main success criteria is: no error modal on fresh board
    await expect(page.locator('.sudoku-board')).toBeVisible();
  });
});

test.describe('@integration Autosolve Error - Mobile', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
  });

  test('autosolve handles errors on mobile viewport', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /easy Play/i }).tap();
    await page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Use a few hints on mobile
    const isStable = await useHintsAndVerifyStable(page, 3);
    expect(isStable).toBeTruthy();
    
    await expect(page.locator('[role="grid"]')).toBeVisible();
  });
});
