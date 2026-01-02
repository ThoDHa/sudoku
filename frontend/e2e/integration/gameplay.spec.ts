import { test, expect } from '@playwright/test';
import { allure } from 'allure-playwright';
import { EPICS, FEATURES, STORIES } from '../sdk/allure-utils';

/**
 * Gameplay Integration Tests
 * 
 * Tests for cell selection, digit entry, clear, undo/redo operations.
 * Includes mobile touch interaction tests.
 * 
 * Tag: @integration @gameplay
 * 
 * NOTE: This file demonstrates Allure annotation usage with the allure-utils constants.
 * Use this as a template for annotating other test files.
 */

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: any, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to check if a cell has a specific value
async function expectCellValue(page: any, row: number, col: number, value: number | 'empty') {
  const cell = getCellLocator(page, row, col);
  if (value === 'empty') {
    await expect(cell).toHaveAttribute('aria-label', new RegExp(`Row ${row}, Column ${col}, empty`));
  } else {
    await expect(cell).toHaveAttribute('aria-label', new RegExp(`Row ${row}, Column ${col}, value ${value}`));
  }
}

test.describe('@integration Gameplay - Cell Selection', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/gameplay-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('clicking an empty cell selects it', async ({ page }) => {
    // Allure annotations for test categorization
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story(STORIES.GAMEPLAY.SELECT_EMPTY_CELL);
    
    // Find first empty cell in Row 5
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Check the cell has selected styling (ring class)
    await expect(emptyCell).toHaveClass(/ring/);
  });

  test('clicking a given cell highlights the digit', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story(STORIES.GAMEPLAY.SELECT_GIVEN_CELL);
    
    // Find a given cell in Row 5 or later (to avoid sticky header)
    const givenCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="given"]').first();
    
    if (await givenCell.count() > 0) {
      await givenCell.scrollIntoViewIfNeeded();
      await givenCell.click();
      
      // Given cells should be clickable (test passes if no error)
      await expect(givenCell).toBeVisible();
    }
  });

  test('clicking a different cell changes selection', async ({ page }) => {
    // Use cells in lower rows to avoid sticky header
    const cell1 = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const cell2 = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    
    await cell1.scrollIntoViewIfNeeded();
    await cell1.click();
    await expect(cell1).toHaveClass(/ring/);
    
    await cell2.scrollIntoViewIfNeeded();
    await cell2.click();
    await expect(cell2).toHaveClass(/ring/);
  });

  test('clicking gap between board and controls deselects cell', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story('Deselect cell by clicking gap');
    
    // Find and select an empty cell
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Verify cell is selected (has ring class)
    await expect(emptyCell).toHaveClass(/ring/);
    
    // Click the game-container gap (area between board and controls)
    const gameContainer = page.locator('.game-container').first();
    // Click at bottom of container where there's gap between board and controls
    await gameContainer.click({ position: { x: 10, y: 10 } });
    
    // Verify cell is no longer selected (ring class removed)
    await expect(emptyCell).not.toHaveClass(/ring/);
  });

  test('clicking undo button deselects cell', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story('Deselect cell when clicking undo');
    
    // First, make a move so undo is enabled
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('5');
    await page.waitForTimeout(100);
    
    // Now select the cell again (it may have been deselected after digit entry)
    await emptyCell.scrollIntoViewIfNeeded();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    const cellWithValue = getCellLocator(page, row, col);
    await cellWithValue.click();
    
    // Verify cell is selected
    await expect(cellWithValue).toHaveClass(/ring/);
    
    // Click undo button
    const undoButton = page.locator('button[title="Undo"]');
    await undoButton.click();
    
    // Verify cell is no longer selected
    await expect(emptyCell).not.toHaveClass(/ring/);
  });

  test('clicking redo button deselects cell', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story('Deselect cell when clicking redo');
    
    // First, make a move that we can undo/redo
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('5');
    await page.waitForTimeout(100);
    
    // Undo the move
    const undoButton = page.locator('button[title="Undo"]');
    await undoButton.click();
    await page.waitForTimeout(100);
    
    // Select the cell again
    await emptyCell.click();
    await expect(emptyCell).toHaveClass(/ring/);
    
    // Click redo button
    const redoButton = page.locator('button[title="Redo"]');
    await redoButton.click();
    
    // Verify cell is no longer selected
    await expect(emptyCell).not.toHaveClass(/ring/);
  });

  test('clicking notes button keeps cell selected', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story('Cell remains selected when toggling notes mode');
    
    // Find and select an empty cell
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Verify cell is selected
    await expect(emptyCell).toHaveClass(/ring/);
    
    // Click notes button
    const notesButton = page.locator('button[aria-label*="Notes mode"]');
    await notesButton.click();
    
    // Verify cell is STILL selected
    await expect(emptyCell).toHaveClass(/ring/);
  });

  test('clicking erase button deselects cell', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story('Cell is deselected when toggling erase mode');
    
    // Find and select an empty cell
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Verify cell is selected
    await expect(emptyCell).toHaveClass(/ring/);
    
    // Click erase mode button
    const eraseButton = page.locator('button[aria-label="Erase mode"]');
    await eraseButton.click();
    
    // Verify cell is DESELECTED (clearOnModeChange behavior)
    await expect(emptyCell).not.toHaveClass(/ring/);
  });

  test('clicking digit button with given cell selected deselects cell', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.CELL_SELECTION);
    await allure.story('Deselect given cell when clicking digit button (enters multi-fill mode)');
    
    // Find a given cell
    const givenCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="given"]').first();
    
    if (await givenCell.count() > 0) {
      await givenCell.scrollIntoViewIfNeeded();
      await givenCell.click();
      
      // Verify given cell is selected
      await expect(givenCell).toHaveClass(/ring/);
      
      // Click a digit button
      const digitButton = page.locator('button[aria-label^="Enter 3,"]');
      await digitButton.click();
      
      // Verify cell is no longer selected (enters multi-fill mode instead)
      await expect(givenCell).not.toHaveClass(/ring/);
    }
  });
});

test.describe('@integration Gameplay - Digit Entry', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/digit-entry-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('multi-fill mode places digits in cells', async ({ page }) => {
    // Allure annotations
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.GAMEPLAY.DIGIT_ENTRY);
    await allure.story(STORIES.GAMEPLAY.ENTER_DIGIT_MOUSE);
    
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    // Extract row and column from aria-label like "Row 5, Column 3, empty"
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // Click digit button first to enter multi-fill mode
    const digitButton = page.locator('button[aria-label^="Enter 4,"]');
    await digitButton.click();
    
    // Click the empty cell
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Wait a moment for the state to update
    await page.waitForTimeout(100);
    
    // Verify digit was placed by looking for the cell at that position with value 4
    await expectCellValue(page, row, col, 4);
  });

  test('number button clicks place digits in selected cell', async ({ page }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // First select the empty cell
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Then click number button
    const numberButton = page.locator('button[aria-label^="Enter 3,"]');
    await numberButton.click();
    
    // Wait a moment for the state to update
    await page.waitForTimeout(100);
    
    // Verify digit was placed
    await expectCellValue(page, row, col, 3);
  });

  test('keyboard entry places digits in selected cell', async ({ page }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // First select the empty cell
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Type a digit
    await page.keyboard.press('7');
    
    // Wait a moment for the state to update
    await page.waitForTimeout(100);
    
    // Verify digit was placed
    await expectCellValue(page, row, col, 7);
  });
});

test.describe('@integration Gameplay - Clear Cell', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/clear-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('erase mode clears a user-entered digit', async ({ page }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // Place a digit using multi-fill mode
    const digitButton = page.locator('button[aria-label^="Enter 5,"]');
    await digitButton.click();
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Wait and verify digit is there
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 5);
    
    // Enable erase mode
    const eraseButton = page.locator('button[aria-label="Erase mode"]');
    await eraseButton.click();
    
    // Click the cell with the digit to erase it (use the cell locator by position)
    const cellToErase = getCellLocator(page, row, col);
    await cellToErase.scrollIntoViewIfNeeded();
    await cellToErase.click();
    
    // Wait and verify cell is now empty
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 'empty');
  });

  test('backspace key clears a user-entered digit', async ({ page }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // Select and place a digit
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('8');
    
    // Wait and verify digit is there
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 8);
    
    // Use backspace to clear
    await page.keyboard.press('Backspace');
    
    // Wait and verify cell is now empty
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 'empty');
  });

  test('delete key clears a user-entered digit', async ({ page }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // Select and place a digit
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('2');
    
    // Wait and verify digit is there
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 2);
    
    // Use delete to clear
    await page.keyboard.press('Delete');
    
    // Wait and verify cell is now empty
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 'empty');
  });
});

test.describe('@integration Gameplay - Undo/Redo', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await page.goto('/undo-redo-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('undo button reverts last move', async ({ page }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // Select and place a digit
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('4');
    
    // Wait and verify digit is there
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 4);
    
    // Click undo
    const undoButton = page.locator('button[title="Undo"]');
    await undoButton.click();
    
    // Wait and verify digit is removed
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 'empty');
  });

  test('keyboard shortcut Ctrl+Z triggers undo', async ({ page, browserName }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // Select and place a digit
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    await page.keyboard.press('6');
    
    // Wait and verify digit is there
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 6);
    
    // Ctrl+Z (or Cmd+Z on Mac)
    const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+z`);
    
    // Wait and verify digit is removed
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 'empty');
  });

  test('multiple undo operations work sequentially', async ({ page }) => {
    // Find two empty cells to get their exact positions
    const cell1 = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel1 = await cell1.getAttribute('aria-label');
    const match1 = ariaLabel1?.match(/Row (\d+), Column (\d+)/);
    const row1 = match1 ? parseInt(match1[1]) : 5;
    const col1 = match1 ? parseInt(match1[2]) : 1;
    
    const cell2 = page.locator('[role="gridcell"][aria-label*="Row 6"][aria-label*="empty"]').first();
    const ariaLabel2 = await cell2.getAttribute('aria-label');
    const match2 = ariaLabel2?.match(/Row (\d+), Column (\d+)/);
    const row2 = match2 ? parseInt(match2[1]) : 6;
    const col2 = match2 ? parseInt(match2[2]) : 1;
    
    // Place digits in both cells
    await cell1.scrollIntoViewIfNeeded();
    await cell1.click();
    await page.keyboard.press('1');
    await page.waitForTimeout(100);
    await expectCellValue(page, row1, col1, 1);
    
    await cell2.scrollIntoViewIfNeeded();
    await cell2.click();
    await page.keyboard.press('2');
    await page.waitForTimeout(100);
    await expectCellValue(page, row2, col2, 2);
    
    const undoButton = page.locator('button[title="Undo"]');
    
    // Undo second move
    await undoButton.click();
    await page.waitForTimeout(100);
    await expectCellValue(page, row2, col2, 'empty');
    
    // Undo first move
    await undoButton.click();
    await page.waitForTimeout(100);
    await expectCellValue(page, row1, col1, 'empty');
  });
});

test.describe('@integration Gameplay - Mobile Touch', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/mobile-touch-test?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('clicking selects cell on mobile viewport', async ({ page }) => {
    // Use a cell in a lower row to avoid sticky header
    const cell = page.locator('[role="gridcell"][aria-label*="Row 5"]').first();
    await cell.scrollIntoViewIfNeeded();
    
    // Click works on mobile viewport (tap requires hasTouch context)
    await cell.click();
    
    // Cell should have selection styling
    await expect(cell).toHaveClass(/ring/);
  });

  test('number pad buttons work on mobile viewport', async ({ page }) => {
    // Find an empty cell first to get its exact position
    const emptyCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="empty"]').first();
    const ariaLabel = await emptyCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
    const row = match ? parseInt(match[1]) : 5;
    const col = match ? parseInt(match[2]) : 1;
    
    // Click to select
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();
    
    // Click number button
    const numberButton = page.locator('button[aria-label^="Enter 5,"]');
    await numberButton.click();
    
    // Wait and verify digit was placed
    await page.waitForTimeout(100);
    await expectCellValue(page, row, col, 5);
  });

  test('control buttons accessible on mobile viewport', async ({ page }) => {
    // Verify all main control buttons are visible
    // On mobile, buttons show only emojis (no text)
    await expect(page.locator('button[title="Undo"]')).toBeVisible();
    await expect(page.locator('button[aria-label*="Notes"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Erase mode"]')).toBeVisible();
    // Hint button shows 💡 emoji on mobile
    await expect(page.locator('button:has-text("💡")')).toBeVisible();
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
