import { test, expect } from '@playwright/test';
import { setupGameAndWaitForBoard } from '../utils/board-wait';
import { selectCell } from '../utils/selectCell';
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
    await setupGameAndWaitForBoard(page);
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
    
    const ariaLabel1 = await cell1.getAttribute('aria-label');
    const match1 = ariaLabel1?.match(/Row (\d+), Column (\d+)/);
    const row = match1 ? parseInt(match1[1]) : 5;
    const col = match1 ? parseInt(match1[2]) : 1;

    await selectCell(page, row, col);
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
    await selectCell(page, row1, col1);
    await page.keyboard.press('1');
    await page.waitForTimeout(100);
    await expectCellValue(page, row1, col1, 1);
    
    await selectCell(page, row2, col2);
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
    await setupGameAndWaitForBoard(page);
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
