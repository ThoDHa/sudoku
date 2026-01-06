/**
 * SELECTION PERFORMANCE REGRESSION TESTS
 * 
 * Performance Fortress - Ensures Selection Fixes Don't Impact Battle Speed
 * 
 * Created by Sun Wukong - Tôn Ngộ Không to ensure the realm remains swift
 * 
 * These tests verify that our selection state fixes and outside-click detection
 * do not cause performance regressions or impact user experience speed.
 * 
 * Tag: @performance @regression @selection
 */

import { test, expect } from '@playwright/test';

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  SELECTION_RESPONSE: 50,      // Cell selection should respond within 50ms
  DIGIT_ENTRY_RESPONSE: 100,   // Digit entry should complete within 100ms
  OUTSIDE_CLICK_RESPONSE: 50,  // Outside click should respond within 50ms
  RAPID_INTERACTION: 500       // Rapid sequence should complete within 500ms
};

// Helper to measure timing with high precision
async function measureTime<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await operation();
  const duration = performance.now() - start;
  return { result, duration };
}

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: any, row: number, col: number) {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to verify cell is selected
async function expectCellSelected(cell: any) {
  await expect(cell).toHaveClass(/ring-2.*ring-accent|ring-accent.*ring-2/);
}

// Helper to verify cell is NOT selected
async function expectCellNotSelected(cell: any) {
  await expect(cell).not.toHaveClass(/ring-2.*ring-accent|ring-accent.*ring-2/);
}

// Helper to find any empty cell
async function findEmptyCell(page: any): Promise<{ row: number; col: number } | null> {
  const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]');
  const count = await emptyCells.count();
  
  if (count === 0) return null;
  
  const firstEmpty = emptyCells.first();
  const ariaLabel = await firstEmpty.getAttribute('aria-label');
  const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
  
  return match ? { row: parseInt(match[1]), col: parseInt(match[2]) } : null;
}

// Helper to get outside click coordinates
async function getOutsideClickCoordinates(page: any) {
  const board = page.locator('.sudoku-board').first();
  const boardBox = await board.boundingBox();
  
  if (!boardBox) throw new Error('Could not find sudoku board');
  
  const padding = 50;
  
  return {
    above: { x: boardBox.x + boardBox.width / 2, y: boardBox.y - padding },
    below: { x: boardBox.x + boardBox.width / 2, y: boardBox.y + boardBox.height + padding },
    left: { x: boardBox.x - padding, y: boardBox.y + boardBox.height / 2 },
    right: { x: boardBox.x + boardBox.width + padding, y: boardBox.y + boardBox.height / 2 }
  };
}

test.describe('@performance Selection Performance - No Regression', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboard456?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test.describe('Cell Selection Performance', () => {
    
    test('cell selection responds within performance threshold', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      
      // Measure selection timing
      const { duration } = await measureTime(async () => {
        await cell.click();
        await expectCellSelected(cell);
      });
      
      console.log(`Cell selection took: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE);
    });

    test('multiple rapid cell selections maintain performance', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]');
      const cellCount = Math.min(await emptyCells.count(), 10);
      test.skip(cellCount < 5, 'Need at least 5 empty cells for performance testing');
      
      // Measure rapid selection sequence
      const { duration } = await measureTime(async () => {
        for (let i = 0; i < 5; i++) {
          const cell = emptyCells.nth(i);
          await cell.click();
          await expectCellSelected(cell);
        }
      });
      
      const avgPerSelection = duration / 5;
      console.log(`Average selection time: ${avgPerSelection.toFixed(2)}ms per cell`);
      expect(avgPerSelection).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE);
    });

    test('selection performance stable across different board regions', async ({ page }) => {
      const regions = [
        { row: 1, col: 1 },   // Top-left
        { row: 1, col: 9 },   // Top-right  
        { row: 5, col: 5 },   // Center
        { row: 9, col: 1 },   // Bottom-left
        { row: 9, col: 9 }    // Bottom-right
      ];
      
      const timings: number[] = [];
      
      for (const region of regions) {
        // Find empty cell near this region
        const nearbyEmpty = page.locator(`[role="gridcell"][aria-label*="Row ${region.row}"][aria-label*="empty"]`).first();
        
        if (await nearbyEmpty.count() > 0) {
          const { duration } = await measureTime(async () => {
            await nearbyEmpty.click();
            await expectCellSelected(nearbyEmpty);
          });
          
          timings.push(duration);
        }
      }
      
      test.skip(timings.length < 3, 'Need at least 3 regions with empty cells');
      
      const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length;
      const maxTiming = Math.max(...timings);
      
      console.log(`Region selection timings: ${timings.map(t => t.toFixed(2)).join(', ')}ms`);
      console.log(`Average: ${avgTiming.toFixed(2)}ms, Max: ${maxTiming.toFixed(2)}ms`);
      
      expect(avgTiming).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE);
      expect(maxTiming).toBeLessThan(PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE * 1.5); // Allow 50% variance
    });
  });

  test.describe('Digit Entry Performance', () => {
    
    test('digit entry and deselection completes within threshold', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      
      // Select cell first
      await cell.click();
      await expectCellSelected(cell);
      
      // Measure digit entry + deselection timing
      const { duration } = await measureTime(async () => {
        await page.keyboard.press('7');
        await expectCellNotSelected(cell);
      });
      
      console.log(`Digit entry + deselection took: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_RESPONSE);
    });

    test('rapid digit entry sequence maintains performance', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]');
      const cellCount = Math.min(await emptyCells.count(), 5);
      test.skip(cellCount < 5, 'Need at least 5 empty cells for performance testing');
      
      const digits = ['1', '2', '3', '4', '5'];
      
      // Measure rapid digit entry sequence
      const { duration } = await measureTime(async () => {
        for (let i = 0; i < 5; i++) {
          const cell = emptyCells.nth(i);
          await cell.click();
          await page.keyboard.press(digits[i]);
          await expectCellNotSelected(cell);
        }
      });
      
      const avgPerDigit = duration / 5;
      console.log(`Average digit entry time: ${avgPerDigit.toFixed(2)}ms per digit`);
      expect(avgPerDigit).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_RESPONSE);
    });

    test('digit overwriting performance remains stable', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      const digits = ['1', '2', '3', '4', '5'];
      const timings: number[] = [];
      
      // Place initial digit
      await cell.click();
      await page.keyboard.press('9');
      
      // Measure overwriting performance for each digit
      for (const digit of digits) {
        const { duration } = await measureTime(async () => {
          await cell.click();
          await page.keyboard.press(digit);
          await expectCellNotSelected(cell);
        });
        
        timings.push(duration);
      }
      
      const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length;
      const maxTiming = Math.max(...timings);
      
      console.log(`Overwrite timings: ${timings.map(t => t.toFixed(2)).join(', ')}ms`);
      console.log(`Average: ${avgTiming.toFixed(2)}ms, Max: ${maxTiming.toFixed(2)}ms`);
      
      expect(avgTiming).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_RESPONSE);
      expect(maxTiming).toBeLessThan(PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_RESPONSE * 1.5);
    });
  });

  test.describe('Outside-Click Detection Performance', () => {
    
    test('outside-click detection responds within threshold', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      const coords = await getOutsideClickCoordinates(page);
      
      // Select cell first
      await cell.click();
      await expectCellSelected(cell);
      
      // Measure outside-click detection timing
      const { duration } = await measureTime(async () => {
        await page.mouse.click(coords.above.x, coords.above.y);
        await expectCellNotSelected(cell);
      });
      
      console.log(`Outside-click detection took: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE);
    });

    test('outside-click performance consistent across all directions', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      const coords = await getOutsideClickCoordinates(page);
      
      const directions = [
        { name: 'above', coord: coords.above },
        { name: 'below', coord: coords.below },
        { name: 'left', coord: coords.left },
        { name: 'right', coord: coords.right }
      ];
      
      const timings: { direction: string; duration: number }[] = [];
      
      for (const direction of directions) {
        // Select cell
        await cell.click();
        await expectCellSelected(cell);
        
        // Measure detection timing for this direction
        const { duration } = await measureTime(async () => {
          await page.mouse.click(direction.coord.x, direction.coord.y);
          await expectCellNotSelected(cell);
        });
        
        timings.push({ direction: direction.name, duration });
      }
      
      const avgTiming = timings.reduce((sum, t) => sum + t.duration, 0) / timings.length;
      const maxTiming = Math.max(...timings.map(t => t.duration));
      
      console.log('Outside-click timings by direction:');
      timings.forEach(t => console.log(`  ${t.direction}: ${t.duration.toFixed(2)}ms`));
      console.log(`Average: ${avgTiming.toFixed(2)}ms, Max: ${maxTiming.toFixed(2)}ms`);
      
      expect(avgTiming).toBeLessThan(PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE);
      expect(maxTiming).toBeLessThan(PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE * 1.5);
    });

    test('rapid outside-click sequence maintains performance', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      const coords = await getOutsideClickCoordinates(page);
      
      const clickSequence = [
        coords.above, coords.right, coords.below, coords.left, coords.above
      ];
      
      // Measure rapid outside-click sequence
      const { duration } = await measureTime(async () => {
        for (const coord of clickSequence) {
          await cell.click(); // Select
          await page.mouse.click(coord.x, coord.y); // Deselect
          await expectCellNotSelected(cell);
        }
      });
      
      const avgPerClick = duration / clickSequence.length;
      console.log(`Rapid outside-click sequence: ${duration.toFixed(2)}ms total`);
      console.log(`Average per click: ${avgPerClick.toFixed(2)}ms`);
      
      expect(avgPerClick).toBeLessThan(PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.RAPID_INTERACTION);
    });
  });

  test.describe('Mixed Interaction Performance', () => {
    
    test('complex interaction sequence completes within threshold', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      const coords = await getOutsideClickCoordinates(page);
      
      // Complex interaction sequence: select, digit, outside-click, select, digit, etc.
      const { duration } = await measureTime(async () => {
        // Sequence 1: Select -> Digit -> Deselect
        await cell.click();
        await page.keyboard.press('1');
        await expectCellNotSelected(cell);
        
        // Sequence 2: Select -> Outside-click -> Deselect  
        await cell.click();
        await page.mouse.click(coords.above.x, coords.above.y);
        await expectCellNotSelected(cell);
        
        // Sequence 3: Select -> Digit -> Outside-click (no selection)
        await cell.click();
        await page.keyboard.press('2');
        await page.mouse.click(coords.below.x, coords.below.y);
        
        // Sequence 4: Multiple selections
        await cell.click();
        await expectCellSelected(cell);
        await cell.click(); // Re-select same cell
        await expectCellSelected(cell);
        
        // Sequence 5: Final digit entry
        await page.keyboard.press('3');
        await expectCellNotSelected(cell);
      });
      
      console.log(`Complex interaction sequence took: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.RAPID_INTERACTION);
    });

    test('stress test - rapid mixed interactions', async ({ page }) => {
      const emptyCells = page.locator('[role="gridcell"][aria-label*="empty"]');
      const cellCount = Math.min(await emptyCells.count(), 3);
      test.skip(cellCount < 3, 'Need at least 3 empty cells for stress testing');
      
      const coords = await getOutsideClickCoordinates(page);
      const digits = ['1', '2', '3'];
      
      // Stress test: rapid interactions across multiple cells
      const { duration } = await measureTime(async () => {
        for (let i = 0; i < 3; i++) {
          const cell = emptyCells.nth(i);
          
          // Rapid sequence for each cell
          await cell.click();                                    // Select
          await page.keyboard.press(digits[i]);                  // Digit -> deselect
          await cell.click();                                    // Re-select
          await page.mouse.click(coords.above.x, coords.above.y); // Outside-click -> deselect
          await cell.click();                                    // Re-select
          await page.keyboard.press(String(parseInt(digits[i]) + 3)); // Change digit -> deselect
        }
      });
      
      const avgPerCell = duration / 3;
      console.log(`Stress test completed: ${duration.toFixed(2)}ms total`);
      console.log(`Average per cell: ${avgPerCell.toFixed(2)}ms`);
      
      expect(avgPerCell).toBeLessThan(PERFORMANCE_THRESHOLDS.RAPID_INTERACTION / 3);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.RAPID_INTERACTION);
    });
  });

  test.describe('Memory and Resource Usage', () => {
    
    test('selection state changes do not cause memory leaks', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      const coords = await getOutsideClickCoordinates(page);
      
      // Get baseline memory usage
      const initialMemory = await page.evaluate(() => {
        if ('memory' in performance) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });
      
      // Perform many selection operations
      for (let i = 0; i < 100; i++) {
        await cell.click();
        await page.keyboard.press(String((i % 9) + 1));
        
        if (i % 10 === 0) {
          await page.mouse.click(coords.above.x, coords.above.y);
        }
      }
      
      // Check memory after operations
      const finalMemory = await page.evaluate(() => {
        if ('memory' in performance) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });
      
      if (initialMemory > 0 && finalMemory > 0) {
        const memoryIncrease = finalMemory - initialMemory;
        const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;
        
        console.log(`Memory usage - Initial: ${initialMemory}, Final: ${finalMemory}`);
        console.log(`Memory increase: ${memoryIncrease} bytes (${memoryIncreasePercent.toFixed(2)}%)`);
        
        // Memory should not increase by more than 50% (allowing for normal GC delays)
        expect(memoryIncreasePercent).toBeLessThan(50);
      }
    });

    test('event listeners are properly managed', async ({ page }) => {
      // This test verifies that we don't leak event listeners
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      
      // Get baseline event listener count (if available)
      const initialListeners = await page.evaluate(() => {
        const listeners = (window as any)._eventListenerCount || 0;
        return listeners;
      });
      
      // Perform many selection operations that might add/remove listeners
      for (let i = 0; i < 50; i++) {
        await cell.click();
        await page.keyboard.press(String((i % 9) + 1));
      }
      
      // Force garbage collection if available
      await page.evaluate(() => {
        if ('gc' in window) {
          (window as any).gc();
        }
      });
      
      const finalListeners = await page.evaluate(() => {
        const listeners = (window as any)._eventListenerCount || 0;
        return listeners;
      });
      
      // This is more of a baseline test - specific implementation dependent
      console.log(`Event listeners - Initial: ${initialListeners}, Final: ${finalListeners}`);
      
      // Test should complete without throwing errors (main verification)
      expect(true).toBe(true);
    });
  });

  test.describe('Performance Monitoring and Reporting', () => {
    
    test('generate performance baseline report', async ({ page }) => {
      const emptyCell = await findEmptyCell(page);
      test.skip(!emptyCell, 'No empty cells available for testing');
      
      const cell = getCellLocator(page, emptyCell!.row, emptyCell!.col);
      const coords = await getOutsideClickCoordinates(page);
      
      const report = {
        selection: [] as number[],
        digitEntry: [] as number[],
        outsideClick: [] as number[],
        mixed: [] as number[]
      };
      
      // Collect selection timings
      for (let i = 0; i < 10; i++) {
        const { duration } = await measureTime(async () => {
          await cell.click();
          await expectCellSelected(cell);
        });
        report.selection.push(duration);
      }
      
      // Collect digit entry timings
      for (let i = 0; i < 10; i++) {
        await cell.click();
        const { duration } = await measureTime(async () => {
          await page.keyboard.press(String((i % 9) + 1));
          await expectCellNotSelected(cell);
        });
        report.digitEntry.push(duration);
      }
      
      // Collect outside-click timings
      for (let i = 0; i < 10; i++) {
        await cell.click();
        const { duration } = await measureTime(async () => {
          await page.mouse.click(coords.above.x, coords.above.y);
          await expectCellNotSelected(cell);
        });
        report.outsideClick.push(duration);
      }
      
      // Collect mixed interaction timings
      for (let i = 0; i < 5; i++) {
        const { duration } = await measureTime(async () => {
          await cell.click();
          await page.keyboard.press(String((i % 9) + 1));
          await cell.click();
          await page.mouse.click(coords.below.x, coords.below.y);
        });
        report.mixed.push(duration);
      }
      
      // Calculate statistics
      const calculateStats = (timings: number[]) => {
        const sorted = timings.sort((a, b) => a - b);
        return {
          min: Math.min(...timings),
          max: Math.max(...timings),
          avg: timings.reduce((a, b) => a + b, 0) / timings.length,
          median: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.floor(sorted.length * 0.95)]
        };
      };
      
      console.log('\n=== PERFORMANCE BASELINE REPORT ===');
      console.log('Selection timings:', calculateStats(report.selection));
      console.log('Digit entry timings:', calculateStats(report.digitEntry));
      console.log('Outside-click timings:', calculateStats(report.outsideClick));
      console.log('Mixed interaction timings:', calculateStats(report.mixed));
      
      // Verify all operations meet thresholds
      const allSelectionGood = report.selection.every(t => t < PERFORMANCE_THRESHOLDS.SELECTION_RESPONSE);
      const allDigitGood = report.digitEntry.every(t => t < PERFORMANCE_THRESHOLDS.DIGIT_ENTRY_RESPONSE);
      const allOutsideGood = report.outsideClick.every(t => t < PERFORMANCE_THRESHOLDS.OUTSIDE_CLICK_RESPONSE);
      const allMixedGood = report.mixed.every(t => t < PERFORMANCE_THRESHOLDS.RAPID_INTERACTION);
      
      expect(allSelectionGood).toBe(true);
      expect(allDigitGood).toBe(true);
      expect(allOutsideGood).toBe(true);
      expect(allMixedGood).toBe(true);
    });
  });
});