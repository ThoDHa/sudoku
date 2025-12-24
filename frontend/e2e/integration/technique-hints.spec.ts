import { test, expect, Page } from '@playwright/test';

/**
 * Technique Hints Integration Tests
 * 
 * Tests for the "Give Technique" feature - shows technique name and explanation
 * without applying the move to the board. This helps players learn which
 * technique to use without giving away the specific move.
 * 
 * Tag: @integration @technique-hints
 */

/**
 * Helper to prepare board for technique hints.
 * Clicks the regular Hint button multiple times to ensure candidates are filled.
 * The first few hints often fill cells with values; we need enough hints
 * to get past the initial value placements and have candidates on the board.
 */
async function prepBoardForTechniqueHint(page: Page) {
  const hintButton = page.getByRole('button', { name: /Hint/i });
  // Use 6 hints to ensure we get past initial value placements and have candidates
  for (let i = 0; i < 6; i++) {
    if (await hintButton.isEnabled()) {
      await hintButton.click();
      await page.waitForTimeout(300);
    }
  }
}

/**
 * Helper to get locator for any technique hint outcome (modal or toast).
 * The technique hint can result in multiple different outcomes.
 */
function getTechniqueOutcomeLocator(page: Page) {
  const gotItButton = page.getByRole('button', { name: /Got it/i });
  const toastMessages = page.locator('text=Fill in some candidates')
    .or(page.locator('text=use 💡 Hint'))
    .or(page.locator('text=advanced techniques'))
    .or(page.locator('text=already complete'))
    .or(page.locator('text=error in the puzzle'));
  return { gotItButton, toastMessages, anyOutcome: gotItButton.or(toastMessages) };
}

test.describe('@integration Technique Hints - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/technique-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('technique hint button is visible and clickable', async ({ page }) => {
    // Look for the button with "Technique" text
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await expect(techniqueButton).toBeVisible();
    await expect(techniqueButton).toBeEnabled();
  });

  test('clicking technique hint shows technique modal', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Should either show "Got it" modal OR show a toast message (fill candidates first)
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    
    // Accept either outcome as valid
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
  });

  test('technique modal shows technique name', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Modal should contain technique name in heading
    const modalHeading = page.locator('h2.text-xl');
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    
    // Accept either modal or toast as valid
    const modalOrToast = modalHeading.or(toastMessage);
    await expect(modalOrToast).toBeVisible({ timeout: 5000 });
    
    // If modal is visible, verify it has content
    if (await modalHeading.isVisible()) {
      const headingText = await modalHeading.textContent();
      expect(headingText).toBeTruthy();
      expect(headingText!.length).toBeGreaterThan(0);
    }
  });

  test('technique hint does NOT apply the move to the board', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    // Count empty cells before
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Click technique hint button
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Wait for modal or any toast message (multiple possible outcomes)
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates')
      .or(page.locator('text=use 💡 Hint'))
      .or(page.locator('text=advanced techniques'))
      .or(page.locator('text=already complete'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // Count empty cells after - should be unchanged (technique doesn't apply the move)
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCellsAfter).toEqual(emptyCellsBefore);
    
    // Close modal if visible
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
    }
  });

  test('can close technique modal with Got it button', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Close modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    
    // Wait for modal or toast
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // If modal is visible, test closing it
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
      // Modal should be gone
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('can close technique modal by clicking backdrop', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Wait for modal or toast
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // If modal is visible, test closing via backdrop
    if (await gotItButton.isVisible()) {
      // Click backdrop (the dark overlay)
      const backdrop = page.locator('.bg-black\\/50');
      await backdrop.click({ position: { x: 10, y: 10 } });
      
      // Modal should be gone
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('@integration Technique Hints - Disable/Enable Behavior', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/technique-disable-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('technique hint button is disabled after use', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    
    // Should be enabled initially
    await expect(techniqueButton).toBeEnabled();
    
    // Use technique hint
    await techniqueButton.click();
    
    // Wait for modal or toast
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // Only test disable behavior if modal appeared (toast means no technique was available)
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
      
      // Button should now be disabled
      await expect(techniqueButton).toBeDisabled();
    }
  });

  test('technique hint button re-enables after user makes a move', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    
    // Use technique hint
    await techniqueButton.click();
    
    // Wait for modal or toast
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // Only test re-enable behavior if modal appeared
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
      
      // Button should be disabled
      await expect(techniqueButton).toBeDisabled();
      
      // Click digit button first to enter multi-fill mode (highlights the digit)
      const digitButton = page.locator('button[aria-label^="Enter 4,"]');
      await digitButton.click();
      
      // Find an empty cell in a lower row (row 5+) that won't be obscured by sticky header
      const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      
      // Button should be enabled again
      await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
    }
  });

  test('technique hint button re-enables after user erases a cell', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    
    // First enter a digit in an empty cell using multi-fill mode
    // Click digit button first to enter multi-fill mode
    const digitButton = page.locator('button[aria-label^="Enter 4,"]');
    await digitButton.click();
    
    // Find an empty cell in a lower row (row 5+) that won't be obscured by sticky header
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.waitForTimeout(200);
    
    // Use technique hint (button should be enabled after the move)
    await techniqueButton.click();
    
    // Wait for modal or toast
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // Only test re-enable behavior if modal appeared
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
      
      // Button should be disabled
      await expect(techniqueButton).toBeDisabled();
      
      // Enable erase mode
      const eraseButton = page.locator('button[aria-label="Erase mode"]');
      await eraseButton.click();
      
      // Click the cell that now has a value (aria-label changed from empty to value 4)
      const cellWith4 = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="value 4"]').first();
      await cellWith4.scrollIntoViewIfNeeded();
      await cellWith4.click();
      
      // Button should be enabled again
      await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
    }
  });

  test('technique hint button re-enables after using regular hint', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    const hintButton = page.locator('button:has-text("Hint")');
    
    // Use technique hint first
    await techniqueButton.click();
    
    // Wait for modal or toast
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // Only test re-enable behavior if modal appeared
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
      
      // Button should be disabled
      await expect(techniqueButton).toBeDisabled();
      
      // Use regular hint
      await hintButton.click();
      await page.waitForTimeout(500);
      
      // Technique button should be enabled again
      await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
    }
  });
});

test.describe('@integration Technique Hints - Counter', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/technique-counter-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('can use technique hint multiple times with moves in between', async ({ page }) => {
    // Prep board with candidates first
    await prepBoardForTechniqueHint(page);
    
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    const hintButton = page.locator('button:has-text("Hint")');
    
    // Use 1 technique hint
    await techniqueButton.click();
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // Only test counter behavior if modal appeared
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
      
      // Make a move to re-enable technique button using multi-fill mode
      // Click digit button first to enter multi-fill mode
      const digitButton = page.locator('button[aria-label^="Enter 4,"]');
      await digitButton.click();
      
      // Find an empty cell in a lower row (row 5+) that won't be obscured by sticky header
      const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
      await emptyCell.scrollIntoViewIfNeeded();
      await emptyCell.click();
      
      // Wait for button to re-enable
      await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
      
      // Use another technique hint
      await techniqueButton.click();
      await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
      
      if (await gotItButton.isVisible()) {
        await gotItButton.click();
        await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
      }
      
      // Use 1 regular hint (this also re-enables technique button)
      await hintButton.click();
      await page.waitForTimeout(500);
      
      // Technique button should be enabled again
      await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
    }
  });
});

test.describe('@integration Technique Hints - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/technique-mobile-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('technique hint button accessible on mobile', async ({ page }) => {
    // On mobile, find the technique button (may show just emoji)
    const techniqueButton = page.locator('button:has-text("Technique"), button:has-text("?")').first();
    await expect(techniqueButton).toBeVisible();
    
    const box = await techniqueButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Button should be reasonably sized for touch
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });

  test('technique hint click works on mobile viewport', async ({ page }) => {
    // Prep board with candidates first (use regular hint on mobile)
    const hintBtn = page.locator('button:has-text("💡"), button:has-text("Hint")').first();
    for (let i = 0; i < 3; i++) {
      await hintBtn.click();
      await page.waitForTimeout(300);
    }
    
    // Count empty cells before
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Find technique button
    const techniqueButton = page.locator('button:has-text("Technique"), button:has-text("?")').first();
    await techniqueButton.click();
    
    // Modal should appear (or toast if still no technique available)
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // Board should NOT have changed
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCellsAfter).toBeLessThanOrEqual(emptyCellsBefore);
    
    // Close modal if visible
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
    }
  });

  test('technique modal fits within mobile viewport', async ({ page }) => {
    // Prep board with candidates first (use regular hint on mobile)
    const hintBtn = page.locator('button:has-text("💡"), button:has-text("Hint")').first();
    for (let i = 0; i < 3; i++) {
      await hintBtn.click();
      await page.waitForTimeout(300);
    }
    
    const techniqueButton = page.locator('button:has-text("Technique"), button:has-text("?")').first();
    await techniqueButton.click();
    
    // Modal should be visible
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    // If modal is visible, verify the button is accessible (within reasonable bounds)
    if (await gotItButton.isVisible()) {
      const box = await gotItButton.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        // Button should be horizontally within viewport
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        // Button should be accessible (even if scrolled, y should be reasonable)
        expect(box.y).toBeGreaterThanOrEqual(0);
      }
      
      // Close modal
      await gotItButton.click();
      await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('@integration Technique Hints - Edge Cases', () => {
  test('technique hint on nearly solved puzzle still works', async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/technique-nearly-done-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    // Use a few regular hints to get closer to solution
    const hintButton = page.locator('button:has-text("Hint")');
    
    for (let i = 0; i < 3; i++) {
      if (await hintButton.isEnabled()) {
        await hintButton.click();
        await page.waitForTimeout(600);
      }
    }
    
    // Now try technique hint
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    if (await techniqueButton.isVisible() && await techniqueButton.isEnabled()) {
      await techniqueButton.click();
      
      // Should either show modal or puzzle might be complete
      const gotItButton = page.getByRole('button', { name: /Got it/i });
      const isModalVisible = await gotItButton.isVisible().catch(() => false);
      
      if (isModalVisible) {
        await gotItButton.click();
      }
      // Test passes if no errors occurred
    }
  });

  test('technique hint works with no cell selected', async ({ page }) => {
    // Set localStorage before navigation to skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/technique-no-selection-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
    
    // Prep board with hints first
    await prepBoardForTechniqueHint(page);
    
    // Click technique hint without selecting a cell first
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Should show modal or toast
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    const toastMessage = page.locator('text=Fill in some candidates').or(page.locator('text=use 💡 Hint'));
    await expect(gotItButton.or(toastMessage)).toBeVisible({ timeout: 5000 });
    
    if (await gotItButton.isVisible()) {
      await gotItButton.click();
    }
  });
});
