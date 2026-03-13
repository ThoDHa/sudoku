import { test, expect } from '@playwright/test';
import { setupGameAndWaitForBoard } from '../utils/board-wait';
import { selectCell } from '../utils/selectCell';
import { allure } from 'allure-playwright';
import { EPICS, FEATURES, STORIES } from '../sdk/allure-utils';

/**
 * Multi-Select Feature Integration Tests
 *
 * Tests for drag-to-select functionality, bulk note entry, and multi-cell interactions.
 *
 * Tag: @integration @multi-select
 *
 * NOTE: These tests verify the multi-select feature works correctly
 * in a real browser environment using Playwright.
 */

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: any, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to check if a cell has a specific candidate
async function expectCandidateVisible(page: any, row: number, col: number, digit: number) {
  const cell = getCellLocator(page, row, col);
  await expect(cell.locator(`.candidate-${digit}`)).toBeVisible();
}

test.describe('@integration Multi-Select Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding modal
    await page.addInitScript(() => {
      localStorage.setItem('sudoku_onboarding_complete', 'true');
    });
    await setupGameAndWaitForBoard(page);
  });

  test('horizontal drag selects multiple cells in same row', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.MULTI_SELECT.HORIZONTAL_DRAG);

    // Find first empty cell in Row 2
    const startCell = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="empty"]').first();
    const startBox = await startCell.boundingBox();
    
    // Mouse down to start drag
    await startCell.dispatchEvent('mousedown');
    
    // Move to last cell in Row 2 (8 cells to the right)
    const endCell = page.locator('[role="gridcell"][aria-label*="Row 2"]').last();
    const endBox = await endCell.boundingBox();
    
    // Move mouse over end cell
    await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);
    await page.mouse.down();
    
    // Mouse up to finalize selection
    await page.mouse.up();
    
    // Wait for selection to update
    await page.waitForTimeout(100);
    
    // Verify cells 11-19 (indices 10-18) in Row 2 are visually selected
    // Check a few cells to verify multi-select styling
    await expect(page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 2"]').first()).toHaveClass(/multi-selected/);
    await expect(page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 3"]').first()).toHaveClass(/multi-selected/);
    await expect(page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 4"]').first()).toHaveClass(/multi-selected/);
  });

  test('vertical drag selects multiple cells in same column', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.MULTI_SELECT.VERTICAL_DRAG);

    // Find first empty cell in Column 1
    const startCell = page.locator('[role="gridcell"][aria-label*="Row 1"][aria-label*="Column 1, empty"]').first();
    const startBox = await startCell.boundingBox();
    
    // Mouse down to start drag
    await startCell.dispatchEvent('mousedown');
    
    // Move to last cell in Column 1 (8 cells down)
    const endCell = page.locator('[role="gridcell"][aria-label*="Column 1"]').last();
    const endBox = await endCell.boundingBox();
    
    // Move mouse over end cell
    await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);
    await page.mouse.down();
    
    // Mouse up to finalize selection
    await page.mouse.up();
    
    // Wait for selection to update
    await page.waitForTimeout(100);
    
    // Verify cells in Column 1 are visually selected
    await expect(page.locator('[role="gridcell"][aria-label*="Row 1"][aria-label*="Column 1"]').first()).toHaveClass(/multi-selected/);
    await expect(page.locator('[role="gridcell"][aria-label*="Row 3"][aria-label*="Column 1"]').first()).toHaveClass(/multi-selected/);
    await expect(page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="Column 1"]').first()).toHaveClass(/multi-selected/);
  });

  test('diagonal drag selects cells along diagonal path', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.MULTI_SELECT.DIAGONAL_DRAG);

    // Start at cell (0,0) - Row 1, Column 1
    const startCell = page.locator('[role="gridcell"][aria-label*="Row 1"][aria-label*="Column 1, empty"]').first();
    const startBox = await startCell.boundingBox();
    
    // Mouse down to start drag
    await startCell.dispatchEvent('mousedown');
    
    // Move diagonally to cell (4,4) - Row 5, Column 5
    const endCell = page.locator('[role="gridcell"][aria-label*="Row 5"][aria-label*="Column 5, empty"]').first();
    const endBox = await endCell.boundingBox();
    
    // Move mouse over end cell
    await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2);
    await page.mouse.down();
    
    // Mouse up to finalize selection
    await page.mouse.up();
    
    // Wait for selection to update
    await page.waitForTimeout(100);
    
    // Verify diagonal cells are selected
    await expect(page.locator('[role="gridcell"][aria-label*="Row 3"][aria-label*="Column 3"]').first()).toHaveClass(/multi-selected/);
    await expect(page.locator('[role="gridcell"][aria-label*="Row 4"][aria-label*="Column 4"]').first()).toHaveClass(/multi-selected/);
  });

  test('drag stops when encountering a given cell', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.MULTI_SELECT.GIVEN_BLOCKING);

    // Start at cell (1,1) - Row 2, Column 2
    const startCell = getCellLocator(page, 1, 1);
    
    // Enable notes mode
    await page.locator('[data-testid="notes-mode-toggle"]').click();
    
    // Mouse down to start drag
    await startCell.dispatchEvent('mousedown');
    
    // Try to drag past given cell at (2,2) - Row 3, Column 3
    // Given cells are typically set during game load
    const givenCell = getCellLocator(page, 2, 2);
    const givenBox = await givenCell.boundingBox();
    
    // Move mouse toward but not past given cell
    await page.mouse.move(givenBox.x, givenBox.y + 20);
    await page.mouse.down();
    
    // Mouse up to finalize selection
    await page.mouse.up();
    
    // Wait for selection to update
    await page.waitForTimeout(100);
    
    // Verify cells before given are selected
    await expect(startCell).toHaveClass(/multi-selected/);
    
    // Given cell should NOT be in multi-select
    await expect(givenCell).not.toHaveClass(/multi-selected/);
  });

  test('multi-select with digit button fills note in all selected cells', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.MULTI_SELECT.BULK_NOTE_ENTRY);

    // Enable notes mode
    await page.locator('[data-testid="notes-mode-toggle"]').click();
    
    // Select multiple cells in Row 2
    const cell11 = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 3, empty"]').first();
    const cell12 = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 4, empty"]').first();
    const cell13 = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 5, empty"]').first();
    
    // Drag to select cells 11-13
    await cell11.dispatchEvent('mousedown');
    await cell13.dispatchEvent('mouseenter');
    await page.mouse.up();
    await page.waitForTimeout(100);
    
    // Click digit button 7 to add notes
    await page.locator('[data-testid="digit-btn-7"]').click();
    await page.waitForTimeout(100);
    
    // Verify all three cells have candidate 7
    await expectCandidateVisible(page, 2, 3, 7);
    await expectCandidateVisible(page, 2, 4, 7);
    await expectCandidateVisible(page, 2, 5, 7);
  });

  test('multi-select does NOT fill digits in regular placement mode', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.MULTI_SELECT.NOTES_MODE_ONLY);

    // Ensure notes mode is OFF (regular digit placement mode)
    const notesToggle = page.locator('[data-testid="notes-mode-toggle"]');
    const isNotesModeOn = await notesToggle.getAttribute('aria-pressed');
    if (isNotesModeOn === 'true') {
      await notesToggle.click();
    }
    
    // Select multiple cells
    const cell11 = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 3, empty"]').first();
    const cell12 = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 4, empty"]').first();
    
    await cell11.dispatchEvent('mousedown');
    await cell12.dispatchEvent('mouseenter');
    await page.mouse.up();
    await page.waitForTimeout(100);
    
    // Get initial board state
    const cell11Initial = await cell11.getAttribute('aria-label');
    const cell12Initial = await cell12.getAttribute('aria-label');
    
    // Click digit button 7
    await page.locator('[data-testid="digit-btn-7"]').click();
    await page.waitForTimeout(100);
    
    // Verify only single cell was filled with digit (regular placement)
    // Multi-select should be ignored in regular placement mode
    const cell11After = await cell11.getAttribute('aria-label');
    const cell12After = await cell12.getAttribute('aria-label');
    
    // At most one cell should have value 7
    const hasValue11 = cell11After.includes(', value 7');
    const hasValue12 = cell12After.includes(', value 7');
    
    const cellsWithValue = (hasValue11 ? 1 : 0) + (hasValue12 ? 1 : 0);
    expect(cellsWithValue).toBeLessThanOrEqual(1);
  });

  test('clicking outside selection clears multi-select', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.MULTI_SELECT.CLEAR_SELECTION);

    // Enable notes mode
    await page.locator('[data-testid="notes-mode-toggle"]').click();
    
    // Select multiple cells
    const cell11 = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 3, empty"]').first();
    const cell13 = page.locator('[role="gridcell"][aria-label*="Row 2"][aria-label*="Column 5, empty"]').first();
    
    await cell11.dispatchEvent('mousedown');
    await cell13.dispatchEvent('mouseenter');
    await page.mouse.up();
    await page.waitForTimeout(100);
    
    // Verify multi-select is active
    await expect(cell11).toHaveClass(/multi-selected/);
    await expect(cell13).toHaveClass(/multi-selected/);
    
    // Click outside the game board (click header)
    await page.locator('h1').click();
    await page.waitForTimeout(100);
    
    // Verify multi-select is cleared
    await expect(cell11).not.toHaveClass(/multi-selected/);
    await expect(cell13).not.toHaveClass(/multi-selected/);
  });
});
