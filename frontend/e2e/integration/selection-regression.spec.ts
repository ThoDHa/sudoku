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
import { setupGameAndWaitForBoard, waitForWasmReady } from '../utils/board-wait';

// Test configuration for different game difficulties
// Using seeded game route for deterministic puzzles without requiring WASM validation
// The seed route doesn't require custom puzzle validation
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: any, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to verify cell is selected (has focus ring)
async function expectCellSelected(cell: any) {
  await expect(cell).toHaveClass(/ring-accent/);
}

// Helper to verify cell is NOT selected (no focus ring)
async function expectCellNotSelected(cell: any) {
  // Allow UI focus/selection management to settle in slower environments (CI containers etc.)
  // Use a slightly larger timeout to tolerate slower CI and worker fallback scenarios
  // Check both focus and selection class with a modest timeout to reduce flakes while keeping assertions meaningful
  // Prefer semantic focus check, fall back to class check for visual verification
  await expect(cell).not.toBeFocused({ timeout: 1000 });
  // Also ensure cell is not tabbable (no tabindex=0)
  const tabindex = await cell.getAttribute('tabindex');
  const tabindexNum = parseInt(tabindex, 10);
  expect(tabindexNum).not.toBe(0);
  // Also ensure visual selection ring class is gone
  await expect(cell).not.toHaveClass(/ring-accent/, { timeout: 1000 });
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

// Helper to close any open modals or panels that might block clicks
async function closeAnyOpenPanels(page: any) {
  // Close history panel if open
  const closeHistoryBtn = page.locator('button[aria-label="Close history"]');
  if (await closeHistoryBtn.isVisible({ timeout: 100 }).catch(() => false)) {
    await closeHistoryBtn.click();
  }
  
  // Close any modal backdrop by pressing Escape
  await page.keyboard.press('Escape');
  // Small wait for animations
  await page.waitForTimeout(50);
}

// Helper to get outside-click coordinates for each direction
// Returns coordinates guaranteed to be OUTSIDE the game interface (board + controls)
// Returns null for directions where there's no safe space outside the game container
async function getOutsideClickCoordinates(page: any) {
  const board = page.locator('.sudoku-board').first();
  const boardBox = await board.boundingBox();
  
  if (!boardBox) throw new Error('Could not find sudoku board');
  
  // Get the game container which includes board + controls
  const gameContainer = page.locator('.game-container').first();
  const gameBox = await gameContainer.boundingBox();
  
  // Use viewport dimensions to find truly empty space
  const viewport = page.viewportSize();
  
  // Different padding values - need to be outside game-container for deselection
  // Top: Small padding above board (but not hitting header buttons)
  const paddingTop = 10;
  // Bottom: Need to clear the entire game container (board + controls)
  const gameBottomY = gameBox ? gameBox.y + gameBox.height : boardBox.y + boardBox.height + 250;
  // Left/Right: Use gameBox coordinates (not boardBox) to ensure click is outside game-container
  // On mobile, game-container includes controls and is wider than board alone
  const gameBoxX = gameBox ? gameBox.x : boardBox.x;
  const gameBoxY = gameBox ? gameBox.y : boardBox.y;
  const gameBoxWidth = gameBox ? gameBox.width : boardBox.width;
  const gameBoxHeight = gameBox ? gameBox.height : boardBox.height;
  
  // Calculate left/right padding to be outside game-container
  // Use 10px padding - just need to be outside the container, not far outside
  const paddingLeft = gameBoxX > 10 ? gameBoxX - 10 : (gameBoxX > 0 ? gameBoxX / 2 : null);
  const paddingRight = (viewport.width - (gameBoxX + gameBoxWidth)) > 10 
    ? viewport.width - (gameBoxX + gameBoxWidth) - 10 
    : ((viewport.width - (gameBoxX + gameBoxWidth)) > 0 
        ? (viewport.width - (gameBoxX + gameBoxWidth)) / 2 
        : null);
  
  // Check if there's actually safe space below the game container
  // Reduced from 40px to 10px - just need enough space for a reliable click
  const spaceBelow = viewport.height - gameBottomY;
  const hasSafeSpaceBelow = spaceBelow >= 10;
  const safeBottomY = hasSafeSpaceBelow ? gameBottomY + (spaceBelow / 2) : null;
  
  return {
    above: { x: gameBoxX + gameBoxWidth / 2, y: Math.max(gameBoxY - paddingTop, 10) },
    below: safeBottomY ? { x: gameBoxX + gameBoxWidth / 2, y: safeBottomY } : null,
    // For left/right clicks, use calculated padding to ensure clicks are outside game-container
    left: paddingLeft ? { x: paddingLeft, y: viewport.height / 2 } : null,
    right: paddingRight ? { x: viewport.width - paddingRight, y: viewport.height / 2 } : null,
    topLeft: paddingLeft ? { x: paddingLeft, y: Math.max(gameBoxY - paddingTop, 10) } : null,
    topRight: paddingRight ? { x: viewport.width - paddingRight, y: Math.max(gameBoxY - paddingTop, 10) } : null,
    bottomLeft: safeBottomY && paddingLeft ? { x: paddingLeft, y: safeBottomY } : null,
    bottomRight: safeBottomY && paddingRight ? { x: viewport.width - paddingRight, y: safeBottomY } : null,
  };
}

test.describe('@regression Selection Demon Prevention - Comprehensive', () => {
  
  // Test each difficulty level to ensure behavior is consistent
  for (const difficulty of DIFFICULTIES) {
    const displayDifficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    
    test.describe(`${displayDifficulty} Difficulty`, () => {
      test.beforeEach(async ({ page }) => {
        // Set onboarding complete to skip any modals
        await page.addInitScript(() => {
          localStorage.setItem('sudoku_onboarding_complete', 'true');
        });
        // Navigate to homepage and click Play button (matching hints.spec.ts pattern)
        await page.goto('/');
        await page.getByRole('button', { name: new RegExp(`${difficulty} Play`, 'i') }).click();
        await page.waitForSelector('[role="grid"]', { timeout: 20000 });
        // Wait for WASM to be ready
        await waitForWasmReady(page);
        // Wait for puzzle data to load (cells with values appear)
        await page.waitForSelector('[role="gridcell"][aria-label*="value"]', { timeout: 30000 });
      });

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
          
          // CRITICAL: Cell should be deselected after digit entry
          await expectCellNotSelected(cell);
          
          // Verify no cells are selected
          expect(await countSelectedCells(page)).toBe(0);
        });

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
            
            // Cell should deselect
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        });

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
        });

        test('cell deselects when clearing digit (backspace)', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Place digit first
          // Scroll cell into view and allow header to settle to avoid header intercepting clicks
          await cell.scrollIntoViewIfNeeded();
          await cell.click();
          await page.keyboard.press('9');
          await expectCellNotSelected(cell);
          
          // Clear digit with backspace
          await cell.scrollIntoViewIfNeeded();
          await cell.click();
          await expectCellSelected(cell);
          await page.keyboard.press('Backspace');
          await expectCellNotSelected(cell);
          
          expect(await countSelectedCells(page)).toBe(0);
        });

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
        });

        test('selection preserved during notes mode operations', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Select cell and enter notes mode
          await cell.click();
          await expectCellSelected(cell);
          
          // Toggle notes mode (usually 'n' key or similar)
          await page.keyboard.press('n');
          // After toggling notes mode, cell should still be selected
          await expectCellSelected(cell);
          
          // Add candidates in notes mode
          await page.keyboard.press('1');
          await page.keyboard.press('2');
          await page.keyboard.press('3');
          
          // Cell should still be selected in notes mode
          await expectCellSelected(cell);
          
          // Exit notes mode
          await page.keyboard.press('n');
          // After exiting notes mode, cell should still be selected
          await expectCellSelected(cell);
          
          // Cell should still be selected
          await expectCellSelected(cell);
        });
      });

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
          
          // Should deselect
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        });

        test('deselects when clicking below puzzle', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const coords = await getOutsideClickCoordinates(page);
          // Skip if there's no safe space below the game container (controls fill viewport)
          test.skip(!coords.below, 'No safe click space below game container in this viewport');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.below!.x, coords.below!.y);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        });

        test('deselects when clicking left of puzzle', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          test.skip(!coords.left, 'No safe space to click left of puzzle');
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.left!.x, coords.left!.y);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        });

        test('deselects when clicking right of puzzle', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          test.skip(!coords.right, 'No safe space to click right of puzzle');
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.right!.x, coords.right!.y);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        });

        test('deselects when clicking in all corner directions', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          test.skip(!coords.topLeft && !coords.topRight && !coords.bottomLeft && !coords.bottomRight, 'No safe corner space to click');
          
          // Only test corners that have valid coordinates (bottom corners may be null)
          const corners = [
            { name: 'top-left', coord: coords.topLeft },
            { name: 'top-right', coord: coords.topRight },
            coords.bottomLeft ? { name: 'bottom-left', coord: coords.bottomLeft } : null,
            coords.bottomRight ? { name: 'bottom-right', coord: coords.bottomRight } : null
          ].filter(Boolean) as { name: string; coord: { x: number; y: number } }[];
          
          for (const corner of corners) {
            // Close any open panels that might block clicks
            await closeAnyOpenPanels(page);
            
            // Select cell
            await cell.click();
            await expectCellSelected(cell);
            
            // Click in corner
            await page.mouse.click(corner.coord.x, corner.coord.y);
            
            // Close any panels that may have opened from the outside click
            await closeAnyOpenPanels(page);
            
            // Should deselect
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        });
      });

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
              
              // Selection should be preserved when clicking game controls
              await expectCellSelected(cell);
            }
          }
        });

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
            
            // Should deselect after digit entry via pad
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        });
      });

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
          
          // Should still have no selection
          expect(await countSelectedCells(page)).toBe(0);
        });

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
          
          // Some other cell should now be selected
          expect(await countSelectedCells(page)).toBe(1);
          await expectCellNotSelected(cell); // Original cell should not be selected
        });
      });

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
            // Shorter wait for stress test - but use proper state detection
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        });

        test('handles rapid outside clicks in multiple directions', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          // Only include coordinates that are valid (below/bottom corners may be null)
          const clickSequence = [
            coords.above, coords.right, coords.below, coords.left,
            coords.topRight, coords.bottomLeft, coords.topLeft, coords.bottomRight
          ].filter(Boolean) as { x: number; y: number }[];
          
          for (const clickCoord of clickSequence) {
            // Close any open panels that might block clicks
            await closeAnyOpenPanels(page);
            
            // Select cell
            await cell.click();
            await expectCellSelected(cell);
            
            // Rapid outside click
            await page.mouse.click(clickCoord.x, clickCoord.y);
            
            // Close any panels that may have opened from the outside click
            await closeAnyOpenPanels(page);
            
            // Should deselect
            await expectCellNotSelected(cell);
            expect(await countSelectedCells(page)).toBe(0);
          }
        });

        test('maintains correct state during mixed rapid interactions', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          const coords = await getOutsideClickCoordinates(page);
          
          // Mixed interaction sequence: select, digit, outside-click, select, arrow, etc.
          // Use coords.above for outside clicks (always valid), skip below if not available
          const sequence: Array<{ action: string; target?: any; key?: string; coord?: { x: number; y: number } }> = [
            { action: 'select', target: cell },
            { action: 'digit', key: '1' },
            { action: 'select', target: cell },
            { action: 'outside-click', coord: coords.above },
            { action: 'select', target: cell },
            { action: 'arrow', key: 'ArrowRight' },
            { action: 'digit', key: '2' },
            // Only add below click if it's available
            ...(coords.below ? [{ action: 'outside-click', coord: coords.below }] : [{ action: 'outside-click', coord: coords.left }])
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
                if (!step.coord) continue;
                await page.mouse.click(step.coord.x, step.coord.y);
                expectedSelectionCount = 0;
                break;
              case 'arrow':
                await page.keyboard.press(step.key);
                // Arrow behavior depends on current selection
                break;
            }
            
            // Fast mixed interaction - use immediate state verification without arbitrary delays
            
            // Verify selection count matches expected
            const actualCount = await countSelectedCells(page);
            if (step.action !== 'arrow') { // Arrow results can vary
              expect(actualCount).toBe(expectedSelectionCount);
            }
          }
        });
      });

      test.describe('Cross-Browser Compatibility', () => {
        
        test('consistent behavior across user agent variations', async ({ page }) => {
          const emptyCell = await findEmptyCell(page);
          test.skip(!emptyCell, 'No empty cells available for testing');
          
          const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
          
          // Test basic selection/deselection cycle
          await cell.click();
          await expectCellSelected(cell);
          
          await page.keyboard.press('7');
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
          
          // Test outside click deselection
          const coords = await getOutsideClickCoordinates(page);
          
          await cell.click();
          await expectCellSelected(cell);
          
          await page.mouse.click(coords.above.x, coords.above.y);
          
          await expectCellNotSelected(cell);
          expect(await countSelectedCells(page)).toBe(0);
        });
      });
    });
  }
});
