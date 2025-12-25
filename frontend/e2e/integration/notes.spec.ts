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
    // Find an empty cell and capture its position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    // Fail explicitly if no cell found
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();
    
    // Enter a candidate
    await page.keyboard.press('3');
    
    // Wait for state change with explicit condition
    await expect(cellByPosition).toContainText('3');
  });
});

test.describe('@integration Notes Mode - Multi-Fill Workflow', () => {
  /**
   * These tests verify the multi-fill workflow where user:
   * 1. Enables notes mode
   * 2. Clicks a digit button to select it (without selecting a cell first)
   * 3. Clicks on cells to add/remove that candidate
   * 
   * This is distinct from the flow where user selects a cell first, then types digits.
   */
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-multifill-test?d=easy', { waitUntil: 'networkidle' });
    await page.waitForSelector('[role="grid"]', { timeout: 30000 });
    await page.waitForSelector('[role="gridcell"][aria-label*="value"]', { timeout: 30000 });
  });

  test('multi-fill adds candidate to cell by clicking digit then cell', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Click digit 4 first (no cell selected)
    const digit4Button = page.locator('button[aria-label^="Enter 4,"]');
    await digit4Button.click();
    
    // Wait for digit selection to register
    await expect(digit4Button).toHaveClass(/ring-2/);
    
    // Find an empty cell and capture its position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    // Fail explicitly if no cell found
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    
    await cellByPosition.scrollIntoViewIfNeeded();
    
    // Click the cell - should add candidate 4
    await cellByPosition.click();
    
    // Verify candidate was added with explicit wait
    await expect(cellByPosition).toContainText('4');
  });

  test('multi-fill works when selecting digit BEFORE enabling notes mode (regression test)', async ({ page }) => {
    // This is a critical regression test: the user selects a digit FIRST,
    // THEN enables notes mode, THEN clicks cells. The candidate should be
    // added (not a digit placed). This tests for stale closure bugs in handleCellClick.
    
    // 1. First select a digit WHILE NOTES MODE IS OFF
    const digit5Button = page.locator('button[aria-label^="Enter 5,"]');
    await digit5Button.click();
    await expect(digit5Button).toHaveClass(/ring-2/);
    
    // 2. THEN enable notes mode (this is the critical order)
    const notesButton = page.locator('button[title="Notes mode"]');
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Verify digit is still highlighted after toggling notes mode
    await expect(digit5Button).toHaveClass(/ring-2/);
    
    // 3. Find an empty cell
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator for stability
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    await cellByPosition.scrollIntoViewIfNeeded();
    
    // 4. Click the cell - should add candidate 5 (NOT place digit 5)
    await cellByPosition.click();
    
    // Verify: cell should contain candidate "5" as small text, not as main digit
    // The cell should still be described as "empty" in aria-label (candidates don't fill the cell)
    await expect(cellByPosition).toContainText('5');
    
    // Additional verification: the aria-label should still say "empty" or contain "candidates"
    // because a candidate was added, not a digit placed
    const newAriaLabel = await cellByPosition.getAttribute('aria-label');
    // If it was a digit placement, the cell would no longer be "empty"
    // With candidates, it should either still say "empty" or mention "candidates"
    expect(newAriaLabel).toMatch(/empty|candidates/i);
  });

  test('multi-fill clicking same cell twice toggles candidate off', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Click digit 4 first (no cell selected)
    const digit4Button = page.locator('button[aria-label^="Enter 4,"]');
    await digit4Button.click();
    
    // Wait for digit selection to register (check for ring-2 highlight)
    await expect(digit4Button).toHaveClass(/ring-2/);
    
    // Find an empty cell and capture its position for stable re-querying
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    // Fail explicitly if no cell found (don't silently pass)
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator that won't change with state
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    
    await cellByPosition.scrollIntoViewIfNeeded();
    
    // Click once - should add candidate 4
    await cellByPosition.click();
    
    // Wait for state change with explicit condition (not arbitrary timeout)
    await expect(cellByPosition).toContainText('4');
    
    // Click again - should REMOVE candidate 4
    await cellByPosition.click();
    
    // Wait for state change with explicit condition
    await expect(cellByPosition).not.toContainText('4');
  });

  test('multi-fill adds candidate to multiple cells', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Click digit 7 first (no cell selected)
    const digit7Button = page.locator('button[aria-label^="Enter 7,"]');
    await digit7Button.click();
    
    // Wait for digit selection to register
    await expect(digit7Button).toHaveClass(/ring-2/);
    
    // Find first empty cell and capture position
    const emptyCellLocator1 = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await expect(emptyCellLocator1).toBeVisible({ timeout: 5000 });
    
    const ariaLabel1 = await emptyCellLocator1.getAttribute('aria-label');
    const match1 = ariaLabel1?.match(/Row (\d+), Column (\d+)/);
    expect(match1).toBeTruthy();
    const [, row1, col1] = match1!;
    const cell1ByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row1}, Column ${col1}"]`);
    
    // Find second empty cell and capture position
    const emptyCellLocator2 = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    await expect(emptyCellLocator2).toBeVisible({ timeout: 5000 });
    
    const ariaLabel2 = await emptyCellLocator2.getAttribute('aria-label');
    const match2 = ariaLabel2?.match(/Row (\d+), Column (\d+)/);
    expect(match2).toBeTruthy();
    const [, row2, col2] = match2!;
    const cell2ByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row2}, Column ${col2}"]`);
    
    // Click first cell
    await cell1ByPosition.scrollIntoViewIfNeeded();
    await cell1ByPosition.click();
    await expect(cell1ByPosition).toContainText('7');
    
    // Click second cell
    await cell2ByPosition.scrollIntoViewIfNeeded();
    await cell2ByPosition.click();
    await expect(cell2ByPosition).toContainText('7');
    
    // Verify both cells still have the candidate
    await expect(cell1ByPosition).toContainText('7');
    await expect(cell2ByPosition).toContainText('7');
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
    // Find an empty cell and capture its position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    // Fail explicitly if no cell found
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();
    
    // Add candidate
    await page.keyboard.press('4');
    await expect(cellByPosition).toContainText('4');
    
    // Remove by pressing same digit
    await page.keyboard.press('4');
    await expect(cellByPosition).not.toContainText('4');
  });

  test('erase clears all candidates from cell', async ({ page }) => {
    // Find an empty cell and capture its position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    
    // Fail explicitly if no cell found
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();
    
    // Add multiple candidates
    await page.keyboard.press('2');
    await expect(cellByPosition).toContainText('2');
    await page.keyboard.press('5');
    await expect(cellByPosition).toContainText('5');
    await page.keyboard.press('8');
    await expect(cellByPosition).toContainText('8');
    
    // Erase all using keyboard (Backspace or Delete)
    await page.keyboard.press('Backspace');
    
    // Verify cell is empty - wait for text to be cleared
    await expect(cellByPosition).toHaveText('');
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

    // Verify digit button is highlighted (has ring-2 class indicating selection)
    await expect(digitButton).toHaveClass(/ring-2/);

    // Find an empty cell and capture its position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    
    // Fail explicitly if no cell found
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);

    // Click the cell to toggle the candidate
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();
    
    // Wait for candidate to be added
    await expect(cellByPosition).toContainText('1');

    // CRITICAL: Verify the digit button is STILL highlighted
    // This was the regression - highlight would disappear after candidate operation
    await expect(digitButton).toHaveClass(/ring-2/);
  });

  test('digit highlight persists after adding multiple candidates', async ({ page }) => {
    // Enable notes mode
    const notesButton = page.locator('button[title="Notes mode"]');
    await notesButton.click();

    // Highlight digit "5"
    const digit5Button = page.locator('button[aria-label^="Enter 5,"]');
    await digit5Button.click();

    // Verify initial highlight
    await expect(digit5Button).toHaveClass(/ring-2/);

    // Find empty cells and capture their positions
    const emptyCellsLocator = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]');
    
    // Collect positions of up to 3 empty cells
    const cellPositions: Array<{row: string, col: string}> = [];
    const count = Math.min(await emptyCellsLocator.count(), 3);
    
    for (let i = 0; i < count; i++) {
      const cell = emptyCellsLocator.nth(i);
      await expect(cell).toBeVisible({ timeout: 5000 });
      const ariaLabel = await cell.getAttribute('aria-label');
      const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
      if (match) {
        cellPositions.push({ row: match[1], col: match[2] });
      }
    }
    
    expect(cellPositions.length).toBeGreaterThan(0);

    // Click cells to add candidates using position-based locators
    for (const pos of cellPositions) {
      const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${pos.row}, Column ${pos.col}"]`);
      await cellByPosition.scrollIntoViewIfNeeded();
      await cellByPosition.click();
      await expect(cellByPosition).toContainText('5');
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

    // Verify digit is highlighted
    await expect(digit3Button).toHaveClass(/ring-2/);

    // Find an empty cell and capture its position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 7"][aria-label*="empty"]').first();
    
    // Fail explicitly if no cell found
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    // Capture stable position identifier
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    
    // Use position-based locator
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);

    // Click the cell to ADD the candidate (since digit 3 is highlighted)
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();

    // Wait for candidate to be added
    await expect(cellByPosition).toContainText('3');

    // Verify digit highlight still active after adding
    await expect(digit3Button).toHaveClass(/ring-2/);

    // Click the same cell to REMOVE the candidate (toggle off)
    await cellByPosition.click();

    // Wait for candidate to be removed
    await expect(cellByPosition).not.toContainText('3');

    // CRITICAL: Digit highlight should STILL be active after removing candidate
    // This was the specific regression case
    await expect(digit3Button).toHaveClass(/ring-2/);
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
    
    // Find first empty cell and capture position
    const cell1Locator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await expect(cell1Locator).toBeVisible({ timeout: 5000 });
    
    const ariaLabel1 = await cell1Locator.getAttribute('aria-label');
    const match1 = ariaLabel1?.match(/Row (\d+), Column (\d+)/);
    expect(match1).toBeTruthy();
    const [, row1, col1] = match1!;
    const cell1ByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row1}, Column ${col1}"]`);
    
    // Find second empty cell and capture position
    const cell2Locator = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    await expect(cell2Locator).toBeVisible({ timeout: 5000 });
    
    const ariaLabel2 = await cell2Locator.getAttribute('aria-label');
    const match2 = ariaLabel2?.match(/Row (\d+), Column (\d+)/);
    expect(match2).toBeTruthy();
    const [, row2, col2] = match2!;
    const cell2ByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row2}, Column ${col2}"]`);
    
    // Add notes to first cell
    await cell1ByPosition.scrollIntoViewIfNeeded();
    await cell1ByPosition.click();
    await page.keyboard.press('1');
    await expect(cell1ByPosition).toContainText('1');
    await page.keyboard.press('2');
    await expect(cell1ByPosition).toContainText('2');
    
    // Switch to second cell
    await cell2ByPosition.scrollIntoViewIfNeeded();
    await cell2ByPosition.click();
    await page.keyboard.press('8');
    await expect(cell2ByPosition).toContainText('8');
    await page.keyboard.press('9');
    await expect(cell2ByPosition).toContainText('9');
    
    // Go back to first cell and verify notes are still there
    await cell1ByPosition.scrollIntoViewIfNeeded();
    await cell1ByPosition.click();
    
    await expect(cell1ByPosition).toContainText('1');
    await expect(cell1ByPosition).toContainText('2');
  });

  test('notes persist when toggling notes mode off and on', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-mode-persist-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    const notesButton = page.locator('button[title="Notes mode"]');
    
    // Find an empty cell and capture position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    
    // Enable notes and add candidates
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();
    await page.keyboard.press('3');
    await expect(cellByPosition).toContainText('3');
    await page.keyboard.press('6');
    await expect(cellByPosition).toContainText('6');
    
    // Toggle notes mode off
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
    
    // Toggle notes mode back on
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    // Verify candidates still exist
    await expect(cellByPosition).toContainText('3');
    await expect(cellByPosition).toContainText('6');
  });

  test('placing a digit clears notes from that cell', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/notes-digit-clear-test?d=easy');
    await page.waitForSelector('[role="grid"]', { timeout: 20000 });
    
    const notesButton = page.locator('button[title="Notes mode"]');
    
    // Find an empty cell and capture position
    const emptyCellLocator = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await expect(emptyCellLocator).toBeVisible({ timeout: 5000 });
    
    const ariaLabel = await emptyCellLocator.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    expect(match).toBeTruthy();
    const [, row, col] = match!;
    const cellByPosition = page.locator(`[role="gridcell"][aria-label*="Row ${row}, Column ${col}"]`);
    
    // Add notes
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
    
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();
    await page.keyboard.press('4');
    await expect(cellByPosition).toContainText('4');
    await page.keyboard.press('7');
    await expect(cellByPosition).toContainText('7');
    
    // Switch to digit mode and place a digit using multi-fill workflow
    await notesButton.click();
    await expect(notesButton).toHaveAttribute('aria-pressed', 'false');
    
    // Use multi-fill: first click digit button, then click cell
    const digit5Button = page.locator('button[aria-label^="Enter 5,"]');
    await digit5Button.click();
    await cellByPosition.scrollIntoViewIfNeeded();
    await cellByPosition.click();
    
    // Wait for digit to be placed and verify
    await expect(cellByPosition).toContainText('5');
    // The digit should be the main content, not candidates
    // In digit mode, a placed digit should replace candidates
    await expect(cellByPosition).not.toContainText('4');
    await expect(cellByPosition).not.toContainText('7');
  });
});
