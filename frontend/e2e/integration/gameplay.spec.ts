import { test, expect } from '@playwright/test';
import { PlaywrightUISDK } from '../sdk';

/**
 * Gameplay Integration Tests
 * 
 * Tests for cell selection, digit entry, clear, undo/redo operations.
 * Includes mobile touch interaction tests.
 * 
 * Tag: @integration @gameplay
 */

test.describe('@integration Gameplay - Cell Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/gameplay-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('clicking an empty cell selects it', async ({ page }) => {
    const cells = page.locator('.sudoku-cell');
    
    // Find an empty cell (no pre-filled digit)
    const emptyCell = cells.filter({ hasNot: page.locator('.given') }).first();
    await emptyCell.click();
    
    // Check the cell is selected (has selection styling)
    await expect(emptyCell).toHaveClass(/selected|active|highlight/);
  });

  test('clicking a given cell selects it but prevents editing', async ({ page }) => {
    const givenCell = page.locator('.sudoku-cell.given').first();
    
    if (await givenCell.count() > 0) {
      await givenCell.click();
      
      // Verify the cell is selected
      await expect(givenCell).toHaveClass(/selected|active|highlight/);
      
      // Try to enter a different digit
      const originalText = await givenCell.textContent();
      await page.keyboard.press('5');
      
      // Given cells should not change
      await expect(givenCell).toHaveText(originalText || '');
    }
  });

  test('clicking a different cell changes selection', async ({ page }) => {
    const cells = page.locator('.sudoku-cell');
    
    const cell1 = cells.nth(0);
    const cell2 = cells.nth(10);
    
    await cell1.click();
    await expect(cell1).toHaveClass(/selected|active|highlight/);
    
    await cell2.click();
    await expect(cell2).toHaveClass(/selected|active|highlight/);
  });
});

test.describe('@integration Gameplay - Digit Entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/digit-entry-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('keyboard entry 1-9 places digits in selected cell', async ({ page }) => {
    const sdk = new PlaywrightUISDK({ page });
    
    // Find an empty cell
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      
      // Enter digit 7
      await page.keyboard.press('7');
      
      // Wait for the digit to appear
      await page.waitForTimeout(300);
      
      // Verify digit was placed
      await expect(emptyCell).toContainText('7');
    }
  });

  test('number button clicks place digits', async ({ page }) => {
    // Find an empty cell
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      
      // Click number button for 3
      const numberButton = page.locator('button:has-text("3")').first();
      await numberButton.click();
      
      await page.waitForTimeout(300);
      
      // Verify digit was placed
      await expect(emptyCell).toContainText('3');
    }
  });

  test('all digits 1-9 can be entered via keyboard', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    
    for (let digit = 1; digit <= 9; digit++) {
      const cell = emptyCells.nth(digit - 1);
      
      if (await cell.count() > 0) {
        await cell.click();
        await page.keyboard.press(digit.toString());
        await page.waitForTimeout(100);
        
        // Verify digit appears in cell
        const cellText = await cell.textContent();
        expect(cellText).toContain(digit.toString());
      }
    }
  });
});

test.describe('@integration Gameplay - Clear Cell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/clear-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('erase button clears a user-entered digit', async ({ page }) => {
    // Find an empty cell and enter a digit
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      await page.keyboard.press('5');
      await page.waitForTimeout(300);
      
      // Verify digit is there
      await expect(emptyCell).toContainText('5');
      
      // Click erase button
      const eraseButton = page.locator('button[title="Erase"]');
      await eraseButton.click();
      
      await page.waitForTimeout(300);
      
      // Verify cell is now empty (no main digit)
      const cellText = await emptyCell.textContent();
      expect(cellText?.includes('5')).toBeFalsy();
    }
  });

  test('backspace key clears a user-entered digit', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      await page.keyboard.press('8');
      await page.waitForTimeout(300);
      
      await expect(emptyCell).toContainText('8');
      
      // Use backspace to clear
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
      
      const cellText = await emptyCell.textContent();
      expect(cellText?.includes('8')).toBeFalsy();
    }
  });

  test('delete key clears a user-entered digit', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      await page.keyboard.press('2');
      await page.waitForTimeout(300);
      
      await expect(emptyCell).toContainText('2');
      
      // Use delete to clear
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);
      
      const cellText = await emptyCell.textContent();
      expect(cellText?.includes('2')).toBeFalsy();
    }
  });
});

test.describe('@integration Gameplay - Undo/Redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/undo-redo-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('undo button reverts last move', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      // Enter a digit
      await emptyCell.click();
      await page.keyboard.press('4');
      await page.waitForTimeout(300);
      
      await expect(emptyCell).toContainText('4');
      
      // Click undo
      const undoButton = page.locator('button[title="Undo"]');
      await undoButton.click();
      await page.waitForTimeout(300);
      
      // Verify digit is removed
      const cellText = await emptyCell.textContent();
      expect(cellText?.includes('4')).toBeFalsy();
    }
  });

  test('keyboard shortcut Ctrl+Z triggers undo', async ({ page, browserName }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.click();
      await page.keyboard.press('6');
      await page.waitForTimeout(300);
      
      await expect(emptyCell).toContainText('6');
      
      // Ctrl+Z (or Cmd+Z on Mac)
      const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+z`);
      await page.waitForTimeout(300);
      
      const cellText = await emptyCell.textContent();
      expect(cellText?.includes('6')).toBeFalsy();
    }
  });

  test('multiple undo operations work sequentially', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    
    // Make multiple moves
    const cell1 = emptyCells.nth(0);
    const cell2 = emptyCells.nth(1);
    
    if (await cell1.count() > 0 && await cell2.count() > 0) {
      await cell1.click();
      await page.keyboard.press('1');
      await page.waitForTimeout(200);
      
      await cell2.click();
      await page.keyboard.press('2');
      await page.waitForTimeout(200);
      
      const undoButton = page.locator('button[title="Undo"]');
      
      // Undo second move
      await undoButton.click();
      await page.waitForTimeout(200);
      
      let cell2Text = await cell2.textContent();
      expect(cell2Text?.includes('2')).toBeFalsy();
      
      // Undo first move
      await undoButton.click();
      await page.waitForTimeout(200);
      
      let cell1Text = await cell1.textContent();
      expect(cell1Text?.includes('1')).toBeFalsy();
    }
  });
});

test.describe('@integration Gameplay - Mobile Touch', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/game/mobile-touch-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('tap selects cell on mobile', async ({ page }) => {
    const cells = page.locator('.sudoku-cell');
    const cell = cells.nth(20);
    
    // Simulate touch tap
    await cell.tap();
    
    await expect(cell).toHaveClass(/selected|active|highlight/);
  });

  test('number pad buttons work on mobile', async ({ page }) => {
    const emptyCells = page.locator('.sudoku-cell').filter({ hasNot: page.locator('.given') });
    const emptyCell = emptyCells.first();
    
    if (await emptyCell.count() > 0) {
      await emptyCell.tap();
      
      // Tap number button
      const numberButton = page.locator('button:has-text("5")').first();
      await numberButton.tap();
      
      await page.waitForTimeout(300);
      
      await expect(emptyCell).toContainText('5');
    }
  });

  test('control buttons accessible on mobile viewport', async ({ page }) => {
    // Verify all main control buttons are visible
    await expect(page.locator('button[title="Undo"]')).toBeVisible();
    await expect(page.locator('button[title*="Notes"]')).toBeVisible();
    await expect(page.locator('button[title="Erase"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Hint/i })).toBeVisible();
  });

  test('board fits within mobile viewport', async ({ page }) => {
    const board = page.locator('.sudoku-board');
    const boardBox = await board.boundingBox();
    
    expect(boardBox).not.toBeNull();
    if (boardBox) {
      // Board should fit within viewport width with some margin
      expect(boardBox.width).toBeLessThanOrEqual(375);
      expect(boardBox.x).toBeGreaterThanOrEqual(0);
    }
  });
});
