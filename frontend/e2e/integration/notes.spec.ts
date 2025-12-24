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
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
  });

  test('notes button toggles notes mode on', async ({ page }) => {
    const notesButton = page.locator('button[title="Notes mode"]');
    
    // Initially notes mode should be off (button not active)
    await expect(notesButton).toBeVisible();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
    
    // Click to enable notes mode
    await notesButton.click();
    
    // Button should now indicate active state
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('notes button toggles notes mode off', async ({ page }) => {
    const notesButton = page.locator('button[title="Notes mode"]');
    
    // Enable notes mode
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Disable notes mode
    await notesButton.click();
    
    // Button should return to inactive state
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('keyboard shortcut N toggles notes mode', async ({ page }) => {
    const notesButton = page.locator('button[title="Notes mode"]');
    
    // Verify initial state
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
    
    // Press N to enable
    await page.keyboard.press('n');
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Press N to disable
    await page.keyboard.press('n');
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('@integration Notes Mode - Adding Candidates', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-add-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('entering digit in notes mode adds candidate', async ({ page }) => {
    // Find an empty cell in lower rows (avoid header overlap)
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      
      // Enter a candidate
      await page.keyboard.press('3');
      await page.waitForTimeout(300);
      
      // Check for candidate display - the cell should contain '3' now
      const cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('3');
    }
  });

  test('multiple candidates can be added to same cell', async ({ page }) => {
    // Find an empty cell in lower rows
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.scrollIntoViewIfNeeded();
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
    // Find an empty cell in lower rows
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 7"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      
      // Click number button for 7 (use the digit button with aria-label)
      const numberButton = page.locator('button[aria-label^="Enter 7"]');
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
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    // Use a unique seed to avoid any caching/interference issues
    await page.goto('/notes-remove-unique-seed?d=easy', { waitUntil: 'networkidle' });
    // Wait for the grid AND for at least one cell to have a value (puzzle loaded)
    await page.waitForSelector('[role="grid"]', { timeout: 30000 });
    await page.waitForSelector('[role="gridcell"][aria-label*="value"]', { timeout: 30000 });
    
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('pressing same digit removes candidate', async ({ page }) => {
    // Find an empty cell in lower rows
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.scrollIntoViewIfNeeded();
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
    // Find an empty cell in lower rows
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      
      // Add multiple candidates
      await page.keyboard.press('2');
      await page.keyboard.press('5');
      await page.keyboard.press('8');
      await page.waitForTimeout(300);
      
      // Erase all using keyboard (Backspace or Delete)
      await page.keyboard.press('Backspace');
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
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/highlight-persist-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
  });

  test('digit highlight persists after toggling candidate in notes mode', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');

    // Find the digit "1" button and click to highlight
    const digitButton = page.locator('button[aria-label^="Enter 1,"]');
    await digitButton.click();
    await page.waitForTimeout(200);

    // Verify digit button is highlighted (has ring-2 class indicating selection)
    await expect(digitButton).toHaveClass(/ring-2/);

    // Find an empty cell in lower rows
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();

    if (await emptyCell.count() > 0) {
      // Click the empty cell to toggle the candidate
      await emptyCell.scrollIntoViewIfNeeded();
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
    const digit5Button = page.locator('button[aria-label^="Enter 5,"]');
    await digit5Button.click();
    await page.waitForTimeout(200);

    // Verify initial highlight
    await expect(digit5Button).toHaveClass(/ring-2/);

    // Find empty cells in lower rows
    const emptyCells = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]');

    // Click multiple empty cells to add candidates
    for (let i = 0; i < 3; i++) {
      const cell = emptyCells.nth(i);
      if (await cell.count() > 0) {
        await cell.scrollIntoViewIfNeeded();
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

    // First, highlight digit 3 (before selecting a cell)
    const digit3Button = page.locator('button[aria-label^="Enter 3,"]');
    await digit3Button.click();
    await page.waitForTimeout(200);

    // Verify digit is highlighted
    await expect(digit3Button).toHaveClass(/ring-2/);

    // Find an empty cell in lower rows
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 7"][aria-label*="empty"]').first();

    if (await emptyCell.count() > 0) {
      // Click the cell to ADD the candidate (since digit 3 is highlighted)
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      await page.waitForTimeout(200);

      // Verify candidate was added
      let cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('3');

      // Verify digit highlight still active after adding
      await expect(digit3Button).toHaveClass(/ring-2/);

      // Click the same cell to REMOVE the candidate (toggle off)
      await emptyCell.scrollIntoViewIfNeeded();
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
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-persist-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Find two empty cells in lower rows
    const cell1 = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const cell2 = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    
    if (await cell1.count() > 0 && await cell2.count() > 0) {
      // Add notes to first cell
      await cell1.scrollIntoViewIfNeeded();
      await cell1.click();
      await page.keyboard.press('1');
      await page.keyboard.press('2');
      await page.waitForTimeout(200);
      
      // Switch to second cell
      await cell2.scrollIntoViewIfNeeded();
      await cell2.click();
      await page.keyboard.press('8');
      await page.keyboard.press('9');
      await page.waitForTimeout(200);
      
      // Go back to first cell and verify notes are still there
      await cell1.scrollIntoViewIfNeeded();
      await cell1.click();
      await page.waitForTimeout(200);
      
      const cell1Content = await cell1.textContent();
      expect(cell1Content).toContain('1');
      expect(cell1Content).toContain('2');
    }
  });

  test('notes persist when toggling notes mode off and on', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-mode-persist-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    const notesButton = page.locator('button[title="Notes mode"]');
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      // Enable notes and add candidates
      await notesButton.click();
      await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
      
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      await page.keyboard.press('3');
      await page.keyboard.press('6');
      await page.waitForTimeout(300);
      
      // Toggle notes mode off
      await notesButton.click();
      await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
      
      // Toggle notes mode back on
      await notesButton.click();
      await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
      
      // Verify candidates still exist
      const cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('3');
      expect(cellContent).toContain('6');
    }
  });

  test('placing a digit clears notes from that cell', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-digit-clear-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    const notesButton = page.locator('button[title="Notes mode"]');
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    if (await emptyCell.count() > 0) {
      // Capture the cell position before any changes
      const ariaLabel = await emptyCell.getAttribute('aria-label');
      const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
      const row = match ? parseInt(match[1]) : 5;
      const col = match ? parseInt(match[2]) : 1;
      
      // Add notes
      await notesButton.click();
      await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
      
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      await page.keyboard.press('4');
      await page.keyboard.press('7');
      await page.waitForTimeout(200);
      
      // Verify candidates were added
      let cellContent = await emptyCell.textContent();
      expect(cellContent).toContain('4');
      expect(cellContent).toContain('7');
      
      // Switch to digit mode and place a digit using multi-fill workflow
      await notesButton.click();
      await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
      
      // Use multi-fill: first click digit button, then click cell
      const digit5Button = page.locator('button[aria-label^="Enter 5,"]');
      await digit5Button.click();
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      await page.waitForTimeout(300);
      
      // Use position-based locator to find the same cell (now has value 5)
      const cellAfter = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
      const cellContentAfter = await cellAfter.textContent();
      expect(cellContentAfter).toContain('5');
      // The digit should be the main content, not candidates
      // In digit mode, a placed digit should replace candidates
      expect(cellContentAfter).not.toContain('4');
      expect(cellContentAfter).not.toContain('7');
    }
  });
});
