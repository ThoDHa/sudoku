/**
 * SELECTION STATE REGRESSION E2E TESTS
 * 
 * The Ultimate E2E Test Fortress - Prevents Selection Demons from Ever Returning
 * 
 * Created by Sun Wukong - Tôn Ngộ Không to guard the realm against regression demons
 * 
 * These tests verify the COMPLETE user workflows for selection behavior,
 * ensuring both digit entry deselection and outside-click deselection work properly
 * in all scenarios and directions.
 * 
 * Tag: @integration @regression @selection
 */

import { test, expect } from '@playwright/test';

// Test configuration for different game difficulties
const TEST_URLS = [
  '/keyboard456?d=easy',
  '/keyboard456?d=medium', 
  '/keyboard456?d=hard'
];

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: any, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to verify cell is selected (has focus ring)
async function expectCellSelected(cell: any) {
  await expect(cell).toHaveClass(/ring-2.*ring-accent|ring-accent.*ring-2/);
}

// Helper to verify cell is NOT selected (no focus ring)
async function expectCellNotSelected(cell: any) {
  // Allow UI focus/selection management to settle in slower environments (CI containers etc.)
  // Use a slightly larger timeout to tolerate slower CI and worker fallback scenarios
  // Check both focus and selection class with a modest timeout to reduce flakes while keeping assertions meaningful
  // Prefer semantic focus check, fall back to class check for visual verification
  await expect(cell).not.toBeFocused({ timeout: 1000 )
  // Also ensure the cell is not tabbable (no tabindex=0)
  const tabindex = await cell.getAttribute('tabindex');
  expect(tabindex).not.toBe('0');
  // Also ensure the visual selection ring class is gone
  await expect(cell).not.toHaveClass(/ring-2.*ring-accent|ring-accent.*ring-2/, { timeout: 1000 )
}

// Helper to find any empty cell on the board
async function findEmptyCell(page: any): Promise<{ row: number; col: number } | null> {
  const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]');
  const count = await emptyCells.count();
  
  if (count === 0) return null;
  
  const firstEmpty = emptyCells.first();
  const ariaLabel = await firstEmpty.getAttribute('aria-label');
  const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
  
  return match ? { row: parseInt(match[1]), col: parseInt(match[2]) } : null;
}

// Helper to count currently selected cells
async function countSelectedCells(page: any): Promise<number> {
  return await page.locator('[role="gridcell"][class*="ring-accent"]').count();
}

// Helper to get outside-click coordinates for each direction
async function getOutsideClickCoordinates(page: any) {
  const board = page.getByRole("grid", { name: "Sudoku puzzle" })).first();
  const boardBox = await board.boundingBox();
  
  if (!boardBox) throw new Error('Could not find sudoku board');
  
  const padding = 50; // Click this many pixels outside the board
  
  return {
    above: { x: boardBox.x + boardBox.width / 2, y: boardBox.y - padding },
    below: { x: boardBox.x + boardBox.width / 2, y: boardBox.y + boardBox.height + padding },
    left: { x: boardBox.x - padding, y: boardBox.y + boardBox.height / 2 },
    right: { x: boardBox.x + boardBox.width + padding, y: boardBox.y + boardBox.height / 2 },
    topLeft: { x: boardBox.x - padding, y: boardBox.y - padding },
    topRight: { x: boardBox.x + boardBox.width + padding, y: boardBox.y - padding },
    bottomLeft: { x: boardBox.x - padding, y: boardBox.y + boardBox.height + padding },
    bottomRight: { x: boardBox.x + boardBox.width + padding, y: boardBox.y + boardBox.height + padding }
  };
}

test.describe('@regression Selection State - Comprehensive Demon Prevention', () => {
  
  // Test each difficulty level to ensure behavior is consistent
  for (const testUrl of TEST_URLS) {
    const difficulty = testUrl.includes('easy') ? 'Easy' : testUrl.includes('medium') ? 'Medium' : 'Hard';
    
    test.describe(`${difficulty} Difficulty`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(testUrl);
        await page.getByRole("grid", { name: "Sudoku puzzle" }).waitFor({ timeout: 15000 )
      )

      test.describe('Digit Entry Deselection Behavior', () => {
        
        test('cell deselects after single digit entry', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Click to select cell
          await cell.click();
          await expectCellSelected(cell);
          
          // Enter digit
          await page.keyboard.press('7');
          await page.waitForTimeout(100);
          
          // CRITICAL: Cell should be deselected after digit entry
          await expectCellNotSelected(cell);
          
          // Verify no cells are selected
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('cell deselects after each digit in sequence', async ({ page }) => {
          const emptyCells = await page.locator('[role="gridcell"][aria-label*="empty"]');
          const cellCount = Math.min(await emptyCells.count(), 5); // Test first 5 empty cells
          
          test.skip(cellCount === 0, 'No empty cells available for testing');
          
          const digits = ['1', '2', '3', '4', '5'];
          
          for (let i = 0; i < cellCount; i++) {
            const cell = emptyCells.nth(i);
            
            // Select cell
            await cell.click();
            await expectCellSelected(cell);
            
            // Enter digit
            await page.keyboard.press(digits[i]);
            await page.waitForTimeout(100);
            
            // Cell should deselect
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        )

        test('cell deselects when overwriting existing digit', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Place initial digit
          await cell.click();
          await expectCellSelected(cell);
          await page.keyboard.press('3');
          await expectCellNotSelected(cell);
          
          // Overwrite with different digit
          await cell.click();
          await expectCellSelected(cell);
          await page.keyboard.press('8');
          await expectCellNotSelected(cell);
          
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('cell deselects when clearing digit (backspace)', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Place digit first
          await cell.click();
          await page.keyboard.press('9');
          await expectCellNotSelected(cell);
          
          // Clear digit with backspace
          await cell.click();
          await expectCellSelected(cell);
          await page.keyboard.press('Backspace');
          await expectCellNotSelected(cell);
          
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('cell deselects when clearing digit (delete)', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Place digit first
          await cell.click();
          await page.keyboard.press('6');
          await expectCellNotSelected(cell);
          
          // Clear digit with delete
          await cell.click();
          await expectCellSelected(cell);
          await page.keyboard.press('Delete');
          await expectCellNotSelected(cell);
          
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('selection preserved during notes mode operations', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Select cell and enter notes mode
          await cell.click();
          await expectCellSelected(cell);
          
          // Toggle notes mode (usually 'n' key or similar)
          await page.keyboard.press('n');
          await page.waitForTimeout(100);
          
          // Add candidates in notes mode
          await page.keyboard.press('1');
          await page.keyboard.press('2');
          await page.keyboard.press('3');
          await page.waitForTimeout(100);
          
          // Cell should still be selected in notes mode
          await expectCellSelected(cell);
          
          // Exit notes mode
          await page.keyboard.press('n');
          await page.waitForTimeout(100);
          
          // Cell should still be selected
          await expectCellSelected(cell);
        )
      )

      test.describe('Outside-Click Deselection - All Directions', () => {
        
        test('deselects when clicking above puzzle', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          // Select cell
          await cell.click();
          await expectCellSelected(cell);
          
          // Click above puzzle
          await page.mouse.click(coords.above.x, coords.above.y);
          await page.waitForTimeout(100);
          
          // Should deselect
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('deselects when clicking below puzzle', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.below.x, coords.below.y);
          await page.waitForTimeout(100);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('deselects when clicking left of puzzle', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.left.x, coords.left.y);
          await page.waitForTimeout(100);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('deselects when clicking right of puzzle', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.right.x, coords.right.y);
          await page.waitForTimeout(100);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('deselects when clicking in all corner directions', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          const corners = [
            { name: 'top-left', coord: coords.topLeft },
            { name: 'top-right', coord: coords.topRight },
            { name: 'bottom-left', coord: coords.bottomLeft },
            { name: 'bottom-right', coord: coords.bottomRight }
          ];
          
          for (const corner of corners) {
            // Select cell
            await cell.click();
            await expectCellSelected(cell);
            
            // Click in corner
            await page.mouse.click(corner.coord.x, corner.coord.y);
            await page.waitForTimeout(100);
            
            // Should deselect
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        )
      )

      test.describe('Game Controls Interaction', () => {
        
        test('preserves selection when clicking game controls', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Select cell
          await cell.click();
          await expectCellSelected(cell);
          
          // Click various game controls (if they exist)
          const controls = [
            '[data-testid="undo-button"]',
            '[data-testid="redo-button"]', 
            '[data-testid="notes-toggle"]',
            '[data-testid="hint-button"]',
            '.digit-pad button', // Digit pad buttons
            '[role="button"][aria-label*="digit"]'
          ];
          
          for (const controlSelector of controls) {
            const control = page.locator(controlSelector).first();
            
            if (await control.count() > 0) {
              await control.click();
              await page.waitForTimeout(100);
              
              // Selection should be preserved when clicking game controls
              await expectCellSelected(cell);
            }
          }
        )

        test('digit pad interaction preserves then deselects appropriately', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Select cell
          await cell.click();
          await expectCellSelected(cell);
          
          // Click digit pad button (if it exists)
          const digitButton = page.locator('.digit-pad button').first();
          
          if (await digitButton.count() > 0) {
            await digitButton.click();
            await page.waitForTimeout(100);
            
            // Should deselect after digit entry via pad
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        )
      )

      test.describe('Arrow Navigation After Deselection', () => {
        
        test('arrow keys have no effect when no cell is selected', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Select, enter digit (causes deselection)
          await cell.click();
          await page.keyboard.press('4');
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
          
          // Try arrow navigation with no selection
          await page.keyboard.press('ArrowRight');
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowLeft');
          await page.keyboard.press('ArrowUp');
          await page.waitForTimeout(100);
          
          // Should still have no selection
          expect(await countSelectedCells(page)).toBe(0);
        )

        test('arrow navigation works after manual cell reselection', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Select, enter digit (causes deselection)
          await cell.click();
          await page.keyboard.press('5');
          await expectCellNotSelected(cell);
          
          // Manually reselect the cell
          await cell.click();
          await expectCellSelected(cell);
          
          // Now arrow navigation should work
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(100);
          
          // Some other cell should now be selected
          expect(await countSelectedCells(page)).toBe(1);
          await expectCellNotSelected(cell); // Original cell should not be selected
        )
      )

      test.describe('Rapid Interaction Stress Tests', () => {
        
        test('handles rapid click-digit-click sequences', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          const digits = ['1', '2', '3', '4', '5'];
          
          for (const digit of digits) {
            // Rapid sequence: click -> digit -> verify deselection
            await cell.click();
            await expectCellSelected(cell);
            
            await page.keyboard.press(digit);
            await page.waitForTimeout(50); // Shorter timeout for stress test
            
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        )

        test('handles rapid outside clicks in multiple directions', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          const clickSequence = [
            coords.above, coords.right, coords.below, coords.left,
            coords.topRight, coords.bottomLeft, coords.topLeft, coords.bottomRight
          ];
          
          for (const clickCoord of clickSequence) {
            // Select cell
            await cell.click();
            await expectCellSelected(cell);
            
            // Rapid outside click
            await page.mouse.click(clickCoord.x, clickCoord.y);
            await page.waitForTimeout(25); // Very fast for stress test
            
            // Should deselect
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        )

        test('maintains correct state during mixed rapid interactions', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          // Mixed interaction sequence: select, digit, outside-click, select, arrow, etc.
          const sequence = [
            { action: 'select', target: cell },
            { action: 'digit', key: '1' },
            { action: 'select', target: cell },
            { action: 'outside-click', coord: coords.above },
            { action: 'select', target: cell },
            { action: 'arrow', key: 'ArrowRight' },
            { action: 'digit', key: '2' },
            { action: 'outside-click', coord: coords.below }
          ];
          
          let expectedSelectionCount = 0;
          
          for (const step of sequence) {
            switch (step.action) {
              case 'select':
                await step.target.click();
                expectedSelectionCount = 1;
                break;
              case 'digit':
                await page.keyboard.press(step.key);
                expectedSelectionCount = 0; // Deselects after digit
                break;
              case 'outside-click':
                await page.mouse.click(step.coord.x, step.coord.y);
                expectedSelectionCount = 0; // Deselects
                break;
              case 'arrow':
                await page.keyboard.press(step.key);
                // Arrow behavior depends on current selection
                break;
            }
            
            await page.waitForTimeout(25);
            
            // Verify selection count matches expected
            const actualCount = await countSelectedCells(page);
            if (step.action !== 'arrow') { // Arrow results can vary
              expect(actualCount).toBe(expectedSelectionCount);
            }
          }
        )
      )

      test.describe('Cross-Browser Compatibility', () => {
        
        test('consistent behavior across user agent variations', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Test basic selection/deselection cycle
          await cell.click();
          await expectCellSelected(cell);
          
          await page.keyboard.press('7');
          await page.waitForTimeout(100);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
          
          // Test outside click deselection
          const coords = await getOutsideClickCoordinates(page);
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.above.x, coords.above.y);
          await page.waitForTimeout(100);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        )
      )
    )
  }
)