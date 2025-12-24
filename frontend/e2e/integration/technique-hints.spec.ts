import { test, expect } from '@playwright/test';

/**
 * Technique Hints Integration Tests
 * 
 * Tests for the "Give Technique" feature - shows technique name and explanation
 * without applying the move to the board. This helps players learn which
 * technique to use without giving away the specific move.
 * 
 * Tag: @integration @technique-hints
 */

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
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Should have "Got it" close button indicating modal is open
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
  });

  test('technique modal shows technique name', async ({ page }) => {
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Modal should contain technique name in heading
    const modalHeading = page.locator('h2.text-xl');
    await expect(modalHeading).toBeVisible({ timeout: 5000 });
    const headingText = await modalHeading.textContent();
    expect(headingText).toBeTruthy();
    expect(headingText!.length).toBeGreaterThan(0);
  });

  test('technique hint does NOT apply the move to the board', async ({ page }) => {
    // Count empty cells before
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Click technique hint button
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Wait for modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    
    // Count empty cells after - should be unchanged
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCellsAfter).toEqual(emptyCellsBefore);
    
    // Close modal
    await gotItButton.click();
  });

  test('can close technique modal with Got it button', async ({ page }) => {
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Close modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    await gotItButton.click();
    
    // Modal should be gone
    await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
  });

  test('can close technique modal by clicking backdrop', async ({ page }) => {
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Wait for modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    
    // Click backdrop (the dark overlay)
    const backdrop = page.locator('.bg-black\\/50');
    await backdrop.click({ position: { x: 10, y: 10 } });
    
    // Modal should be gone
    await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
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
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    
    // Should be enabled initially
    await expect(techniqueButton).toBeEnabled();
    
    // Use technique hint
    await techniqueButton.click();
    
    // Close modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    await gotItButton.click();
    await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
    
    // Button should now be disabled
    await expect(techniqueButton).toBeDisabled();
  });

  test('technique hint button re-enables after user makes a move', async ({ page }) => {
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    
    // Use technique hint
    await techniqueButton.click();
    
    // Close modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    await gotItButton.click();
    await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
    
    // Button should be disabled
    await expect(techniqueButton).toBeDisabled();
    
    // Click digit button first to enter multi-fill mode (highlights the digit)
    const digitButton = page.locator('button[aria-label^="Enter 4,"]');
    await digitButton.click();
    
    // Find an empty cell in a lower row (row 5+) that won't be obscured by sticky header
    // Row 5, Column 1 is empty based on the puzzle
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Button should be enabled again
    await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
  });

  test('technique hint button re-enables after user erases a cell', async ({ page }) => {
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
    
    // Close modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
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
  });

  test('technique hint button re-enables after using regular hint', async ({ page }) => {
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    const hintButton = page.locator('button:has-text("Hint")');
    
    // Use technique hint first
    await techniqueButton.click();
    
    // Close modal
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    await gotItButton.click();
    await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
    
    // Button should be disabled
    await expect(techniqueButton).toBeDisabled();
    
    // Use regular hint
    await hintButton.click();
    await page.waitForTimeout(500);
    
    // Technique button should be enabled again
    await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
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
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    const hintButton = page.locator('button:has-text("Hint")');
    
    // Use 1 technique hint
    await techniqueButton.click();
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
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
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    await gotItButton.click();
    await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
    
    // Use 1 regular hint (this also re-enables technique button)
    await hintButton.click();
    await page.waitForTimeout(500);
    
    // Technique button should be enabled again
    await expect(techniqueButton).toBeEnabled({ timeout: 3000 });
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
    // Count empty cells before
    const emptyCellsBefore = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    
    // Find technique button
    const techniqueButton = page.locator('button:has-text("Technique"), button:has-text("?")').first();
    await techniqueButton.click();
    
    // Modal should appear
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    
    // Board should NOT have changed
    const emptyCellsAfter = await page.locator('[role="gridcell"][aria-label*="empty"]').count();
    expect(emptyCellsAfter).toEqual(emptyCellsBefore);
    
    // Close modal
    await gotItButton.click();
  });

  test('technique modal fits within mobile viewport', async ({ page }) => {
    const techniqueButton = page.locator('button:has-text("Technique"), button:has-text("?")').first();
    await techniqueButton.click();
    
    // Modal should be visible and fit within viewport
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    
    const box = await gotItButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Button should be within viewport
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
      expect(box.y + box.height).toBeLessThanOrEqual(667);
    }
    
    // Close modal
    await gotItButton.click();
    await expect(gotItButton).not.toBeVisible({ timeout: 3000 });
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
    
    // Click technique hint without selecting a cell first
    const techniqueButton = page.getByRole('button', { name: /Technique/i });
    await techniqueButton.click();
    
    // Modal should still appear
    const gotItButton = page.getByRole('button', { name: /Got it/i });
    await expect(gotItButton).toBeVisible({ timeout: 5000 });
    
    await gotItButton.click();
  });
});
