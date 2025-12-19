import { test, expect } from '@playwright/test';

/**
 * Notes Mode Integration Tests
 * 
 * Tests for toggling notes mode, adding/removing candidates,
 * and verifying notes persistence.
 * 
 * Tag: @integration @notes
 */

test.describe('@integration Notes Mode - Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/notes-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('notes button toggles notes mode on', async ({ page }) => {
    const notesButton = page.locator('button[title*="Notes"]');
    
    // Initially notes mode should be off (button not active)
    await expect(notesButton).toBeVisible();
    
    // Click to enable notes mode
    await notesButton.click();
    
    // Button should now indicate active state
    await expect(notesButton).toHaveClass(/active|bg-blue|bg-primary|pressed/);
  });

  test('notes button toggles notes mode off', async ({ page }) => {
    const notesButton = page.locator('button[title*="Notes"]');
    
    // Enable notes mode
    await notesButton.click();
    await expect(notesButton).toHaveClass(/active|bg-blue|bg-primary|pressed/);
    
    // Disable notes mode
    await notesButton.click();
    
    // Button should return to inactive state
    await expect(notesButton).not.toHaveClass(/active|pressed/);
  });

  test('keyboard shortcut N toggles notes mode', async ({ page }) => {
    const notesButton = page.locator('button[title*="Notes"]');
    
    // Press N to enable
    await page.keyboard.press('n');
    await page.waitForTimeout(200);
    await expect(notesButton).toHaveClass(/active|bg-blue|bg-primary|pressed/);
    
    // Press N to disable
    await page.keyboard.press('n');
    await page.waitForTimeout(200);
    await expect(notesButton).not.toHaveClass(/active|pressed/);
  });
});

test.describe('@integration Notes Mode - Adding Candidates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/notes-add-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    // Enable notes mode
    const notesButton = page.locator('button[title*="Notes"]');
    await notesButton.click();
  });

  test('entering digit in notes mode adds candidate', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      
      // Enter a candidate
      await page.keyboard.press('3');
      await page.waitForTimeout(300);
      
      // Check for candidate display (usually in a smaller font or grid)
      const candidateGrid = emptyCell.locator('.candidate-grid, .candidates, .pencil-marks');
      const hasCandidate = await candidateGrid.count() > 0 || await emptyCell.locator(':text("3")').count() > 0;
      
      expect(hasCandidate).toBeTruthy();
    }
  });

  test('multiple candidates can be added to same cell', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      
      // Add multiple candidates
      await page.keyboard.press('1');
      await page.waitForTimeout(150);
      await page.keyboard.press('5');
      await page.waitForTimeout(150);
      await page.keyboard.press('9');
      await page.waitForTimeout(300);
      
      // Verify all three candidates are present
      const cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('1');
      expect(cellContent).toContain('5');
      expect(cellContent).toContain('9');
    }
  });

  test('number buttons add candidates in notes mode', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      
      // Click number button for 7
      const numberButton = page.locator('button:has-text("7")').first();
      await numberButton.click();
      await page.waitForTimeout(300);
      
      // Verify candidate was added
      const cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('7');
    }
  });
});

test.describe('@integration Notes Mode - Removing Candidates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/notes-remove-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    // Enable notes mode
    const notesButton = page.locator('button[title*="Notes"]');
    await notesButton.click();
  });

  test('pressing same digit removes candidate', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      
      // Add candidate
      await page.keyboard.press('4');
      await page.waitForTimeout(200);
      
      let cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('4');
      
      // Remove by pressing same digit
      await page.keyboard.press('4');
      await page.waitForTimeout(300);
      
      cellContent = await emptyCell.textContent();
      expect(cellContent).not.toContain('4');
    }
  });

  test('erase clears all candidates from cell', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      
      // Add multiple candidates
      await page.keyboard.press('2');
      await page.keyboard.press('5');
      await page.keyboard.press('8');
      await page.waitForTimeout(300);
      
      // Erase all
      const eraseButton = page.locator('button[title="Erase"]');
      await eraseButton.click();
      await page.waitForTimeout(300);
      
      // Verify cell is empty
      const cellContent = await emptyCell.textContent();
      expect(cellContent?.trim()).toBeFalsy();
    }
  });
});

test.describe('@integration Notes Mode - Digit Highlight Persistence', () => {
  /**
   * This test verifies the fix for a regression where digit highlighting
   * would disappear after toggling candidates in notes mode.
   * 
   * Expected behavior: When a digit is highlighted (for multi-fill workflow),
   * adding or removing candidates should NOT clear that highlight.
   */
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/highlight-persist-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('digit highlight persists after toggling candidate in notes mode', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');

    // Find the digit "1" button and click to highlight
    const digitButton = page.locator('button[aria-label*="Enter 1"]');
    await digitButton.click();
    await page.waitForTimeout(200);

    // Verify digit button is highlighted (has ring-2 class indicating selection)
    await expect(digitButton).toHaveClass(/ring-2/);

    // Find an empty cell (one without .given class and without a filled digit)
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();

    if (await emptyCell.count() > 0) {
      // Click the empty cell to toggle the candidate
      await emptyCell.click();
      await page.waitForTimeout(300);

      // CRITICAL: Verify the digit button is STILL highlighted
      // This was the regression - highlight would disappear after candidate operation
      await expect(digitButton).toHaveClass(/ring-2/);
    }
  });

  test('digit highlight persists after adding multiple candidates', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();

    // Highlight digit "5"
    const digit5Button = page.locator('button[aria-label*="Enter 5"]');
    await digit5Button.click();
    await page.waitForTimeout(200);

    // Verify initial highlight
    await expect(digit5Button).toHaveClass(/ring-2/);

    // Find empty cells
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });

    // Click multiple empty cells to add candidates
    for (let i = 0; i < 3; i++) {
      const cell = emptyCells.nth(i);
      if (await cell.count() > 0) {
        await cell.click();
        await page.waitForTimeout(150);
      }
    }

    // CRITICAL: Digit highlight should still be active after all operations
    await expect(digit5Button).toHaveClass(/ring-2/);
  });

  test('digit highlight persists when removing candidate', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();

    // Find an empty cell
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();

    if (await emptyCell.count() > 0) {
      // First, add a candidate manually
      await emptyCell.click();
      await page.keyboard.press('3');
      await page.waitForTimeout(200);

      // Verify candidate was added
      let cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('3');

      // Now highlight digit 3
      const digit3Button = page.locator('button[aria-label*="Enter 3"]');
      await digit3Button.click();
      await page.waitForTimeout(200);

      // Verify digit is highlighted
      await expect(digit3Button).toHaveClass(/ring-2/);

      // Click the same cell to REMOVE the candidate (toggle off)
      await emptyCell.click();
      await page.waitForTimeout(300);

      // Verify candidate was removed
      cellContent = await emptyCell.textContent();
      expect(cellContent).not.toContain('3');

      // CRITICAL: Digit highlight should STILL be active after removing candidate
      // This was the specific regression case
      await expect(digit3Button).toHaveClass(/ring-2/);
    }
  });
});

test.describe('@integration Notes Mode - Persistence', () => {
  test('notes persist when switching between cells', async ({ page }) => {
    await page.goto('/game/notes-persist-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    // Enable notes mode
    const notesButton = page.locator('button[title*="Notes"]');
    await notesButton.click();
    
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const cell1 = emptyCells.nth(0);
    const cell2 = emptyCells.nth(1);
    
    if (await cell1.count() > 0 && await cell2.count() > 0) {
      // Add notes to first cell
      await cell1.click();
      await page.keyboard.press('1');
      await page.keyboard.press('2');
      await page.waitForTimeout(200);
      
      // Switch to second cell
      await cell2.click();
      await page.keyboard.press('8');
      await page.keyboard.press('9');
      await page.waitForTimeout(200);
      
      // Go back to first cell and verify notes are still there
      await cell1.click();
      await page.waitForTimeout(200);
      
      const cell1Content = await cell1.textContent();
      expect(cell1Content).toContain('1');
      expect(cell1Content).toContain('2');
    }
  });

  test('notes persist when toggling notes mode off and on', async ({ page }) => {
    await page.goto('/game/notes-mode-persist-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const notesButton = page.locator('button[title*="Notes"]');
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      // Enable notes and add candidates
      await notesButton.click();
      await emptyCell.click();
      await page.keyboard.press('3');
      await page.keyboard.press('6');
      await page.waitForTimeout(300);
      
      // Toggle notes mode off
      await notesButton.click();
      await page.waitForTimeout(200);
      
      // Toggle notes mode back on
      await notesButton.click();
      await page.waitForTimeout(200);
      
      // Verify candidates still exist
      const cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('3');
      expect(cellContent).toContain('6');
    }
  });

  test('placing a digit clears notes from that cell', async ({ page }) => {
    await page.goto('/game/notes-digit-clear-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    const notesButton = page.locator('button[title*="Notes"]');
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      // Add notes
      await notesButton.click();
      await emptyCell.click();
      await page.keyboard.press('4');
      await page.keyboard.press('7');
      await page.waitForTimeout(200);
      
      // Switch to digit mode and place a digit
      await notesButton.click();
      await page.keyboard.press('5');
      await page.waitForTimeout(300);
      
      // Verify only the digit is shown, not the candidates
      const cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('5');
      // The small candidate numbers should be gone
      const candidateGrid = emptyCell.locator('.candidate-grid, .candidates');
      await expect(candidateGrid).toHaveCount(0);
    }
  });
});
