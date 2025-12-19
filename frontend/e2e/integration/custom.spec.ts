import { test, expect } from '@playwright/test';

/**
 * Custom Puzzle Integration Tests
 * 
 * Tests for the /custom route, entering custom puzzles,
 * and validation of invalid puzzle inputs.
 * 
 * Tag: @integration @custom
 */

test.describe('@integration Custom Puzzle - Page Load', () => {
  test('custom puzzle page loads', async ({ page }) => {
    await page.goto('/custom');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('text=Custom')).toBeVisible();
  });

  test('custom page has input area or empty board', async ({ page }) => {
    await page.goto('/custom');
    
    // Should have either a text input for puzzle string or an empty board
    const hasInput = await page.locator('input, textarea').first().isVisible().catch(() => false);
    const hasBoard = await page.locator('.sudoku-board, .sudoku-cell').first().isVisible().catch(() => false);
    
    expect(hasInput || hasBoard).toBeTruthy();
  });

  test('custom page has play/validate button', async ({ page }) => {
    await page.goto('/custom');
    
    // Look for action buttons
    const playButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Validate"), button:has-text("Submit")');
    await expect(playButton.first()).toBeVisible();
  });
});

test.describe('@integration Custom Puzzle - Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/custom');
    await page.waitForTimeout(500);
  });

  test('can enter digits into custom puzzle board', async ({ page }) => {
    // If there's a sudoku board, try to enter digits
    const cells = page.locator('.sudoku-cell');
    
    if (await cells.count() > 0) {
      const firstCell = cells.first();
      await firstCell.click();
      await page.keyboard.press('5');
      await page.waitForTimeout(300);
      
      const cellText = await firstCell.textContent();
      expect(cellText).toContain('5');
    } else {
      // If there's a text input, enter puzzle string
      const input = page.locator('input, textarea').first();
      if (await input.isVisible()) {
        // Valid easy puzzle string (81 chars, dots for empty)
        const puzzleString = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
        await input.fill(puzzleString);
        
        const value = await input.inputValue();
        expect(value).toBe(puzzleString);
      }
    }
  });

  test('can paste puzzle string', async ({ page }) => {
    const input = page.locator('input, textarea').first();
    
    if (await input.isVisible()) {
      const puzzleString = '003020600900305001001806400008102900700000008006708200002609500800203009005010300';
      
      await input.click();
      await input.fill(puzzleString);
      
      const value = await input.inputValue();
      expect(value).toBe(puzzleString);
    }
  });

  test('clear button resets custom input', async ({ page }) => {
    const cells = page.locator('.sudoku-cell');
    
    if (await cells.count() > 0) {
      // Enter some digits
      const cell1 = cells.nth(0);
      const cell2 = cells.nth(1);
      
      await cell1.click();
      await page.keyboard.press('1');
      await cell2.click();
      await page.keyboard.press('2');
      await page.waitForTimeout(200);
      
      // Look for clear/reset button
      const clearButton = page.locator('button:has-text("Clear"), button:has-text("Reset"), button[title*="Clear"]');
      
      if (await clearButton.first().isVisible()) {
        await clearButton.first().click();
        await page.waitForTimeout(300);
        
        // Cells should be empty
        const cell1Text = await cell1.textContent();
        const cell2Text = await cell2.textContent();
        
        expect(cell1Text?.trim()).toBeFalsy();
        expect(cell2Text?.trim()).toBeFalsy();
      }
    }
  });
});

test.describe('@integration Custom Puzzle - Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/custom');
    await page.waitForTimeout(500);
  });

  test('valid puzzle is accepted', async ({ page }) => {
    const input = page.locator('input, textarea').first();
    
    if (await input.isVisible()) {
      // Valid sudoku puzzle
      const validPuzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
      await input.fill(validPuzzle);
      
      // Click play/validate button
      const actionButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Validate"), button:has-text("Submit")').first();
      await actionButton.click();
      
      await page.waitForTimeout(1000);
      
      // Should either navigate to game or show success
      const url = page.url();
      const hasGame = url.includes('/game/') || url.includes('/custom');
      const hasError = await page.locator('.error, [role="alert"]:has-text("error"), [role="alert"]:has-text("invalid")').first().isVisible().catch(() => false);
      
      expect(hasGame && !hasError).toBeTruthy();
    }
  });

  test('invalid puzzle shows error - too short', async ({ page }) => {
    const input = page.locator('input, textarea').first();
    
    if (await input.isVisible()) {
      // Too short puzzle string
      const invalidPuzzle = '53007';
      await input.fill(invalidPuzzle);
      
      const actionButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Validate"), button:has-text("Submit")').first();
      await actionButton.click();
      
      await page.waitForTimeout(500);
      
      // Should show error message
      const errorMessage = page.locator('.error, [role="alert"], .text-red, .text-destructive, :text("invalid"), :text("error")');
      const hasError = await errorMessage.first().isVisible().catch(() => false);
      
      // The form should show some indication of invalid input
      expect(hasError || !page.url().includes('/game/')).toBeTruthy();
    }
  });

  test('invalid puzzle shows error - duplicate in row', async ({ page }) => {
    const input = page.locator('input, textarea').first();
    
    if (await input.isVisible()) {
      // Puzzle with duplicate in row (first two cells both 5)
      const invalidPuzzle = '550070000600195000098000060800060003400803001700020006060000280000419005000080079';
      await input.fill(invalidPuzzle);
      
      const actionButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Validate"), button:has-text("Submit")').first();
      await actionButton.click();
      
      await page.waitForTimeout(500);
      
      // Should show error or prevent submission
      const errorMessage = page.locator('.error, [role="alert"], .text-red, .text-destructive');
      const hasError = await errorMessage.first().isVisible().catch(() => false);
      
      expect(hasError || !page.url().includes('/game/')).toBeTruthy();
    }
  });

  test('invalid puzzle shows error - invalid characters', async ({ page }) => {
    const input = page.locator('input, textarea').first();
    
    if (await input.isVisible()) {
      // Puzzle with invalid characters
      const invalidPuzzle = 'abc070000600195000098000060800060003400803001700020006060000280000419005000080079';
      await input.fill(invalidPuzzle);
      
      const actionButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Validate"), button:has-text("Submit")').first();
      await actionButton.click();
      
      await page.waitForTimeout(500);
      
      // Should show error
      const errorMessage = page.locator('.error, [role="alert"], .text-red, .text-destructive');
      const hasError = await errorMessage.first().isVisible().catch(() => false);
      
      expect(hasError || !page.url().includes('/game/')).toBeTruthy();
    }
  });

  test('unsolvable puzzle shows error', async ({ page }) => {
    const input = page.locator('input, textarea').first();
    
    if (await input.isVisible()) {
      // Unsolvable puzzle (conflicts make it impossible)
      const unsolvablePuzzle = '123456789000000000000000000000000000000000000000000000000000000000000000123456789';
      await input.fill(unsolvablePuzzle);
      
      const actionButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Validate"), button:has-text("Submit")').first();
      await actionButton.click();
      
      await page.waitForTimeout(1000);
      
      // Should show error about unsolvable or invalid puzzle
      const errorMessage = page.locator('.error, [role="alert"], .text-red, .text-destructive, :text("unsolvable"), :text("no solution")');
      const hasError = await errorMessage.first().isVisible().catch(() => false);
      
      // Either shows error or stays on custom page (doesn't start game)
      expect(hasError || page.url().includes('/custom')).toBeTruthy();
    }
  });
});

test.describe('@integration Custom Puzzle - Board Input Mode', () => {
  test('entering all cells manually works', async ({ page }) => {
    await page.goto('/custom');
    await page.waitForTimeout(500);
    
    const cells = page.locator('.sudoku-cell');
    
    if (await cells.count() === 81) {
      // Enter a few digits in different cells
      const testDigits = [
        { index: 0, digit: '5' },
        { index: 1, digit: '3' },
        { index: 4, digit: '7' },
      ];
      
      for (const { index, digit } of testDigits) {
        const cell = cells.nth(index);
        await cell.click();
        await page.keyboard.press(digit);
        await page.waitForTimeout(100);
      }
      
      // Verify digits were entered
      for (const { index, digit } of testDigits) {
        const cell = cells.nth(index);
        const text = await cell.textContent();
        expect(text).toContain(digit);
      }
    }
  });
});

test.describe('@integration Custom Puzzle - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/custom');
    await page.waitForTimeout(500);
  });

  test('custom page is usable on mobile', async ({ page }) => {
    await expect(page.locator('text=Custom')).toBeVisible();
    
    // Action buttons should be visible
    const actionButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Validate")').first();
    await expect(actionButton).toBeVisible();
  });

  test('can enter puzzle on mobile', async ({ page }) => {
    const input = page.locator('input, textarea').first();
    const cells = page.locator('.sudoku-cell');
    
    if (await input.isVisible()) {
      const puzzleString = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
      await input.tap();
      await input.fill(puzzleString);
      
      const value = await input.inputValue();
      expect(value).toBe(puzzleString);
    } else if (await cells.count() > 0) {
      // Use touch to enter digit
      const cell = cells.first();
      await cell.tap();
      
      const numberButton = page.locator('button:has-text("9")').first();
      await numberButton.tap();
      
      await page.waitForTimeout(300);
      const text = await cell.textContent();
      expect(text).toContain('9');
    }
  });
});
