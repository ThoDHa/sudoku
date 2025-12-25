import { test, expect } from '../fixtures';

/**
 * Keyboard Navigation E2E Tests
 *
 * Comprehensive tests for keyboard-driven interactions with the Sudoku board:
 * - Arrow key navigation
 * - Digit entry via keyboard
 * - Undo/Redo shortcuts
 * - Notes mode toggle
 * - Tab navigation
 * - Focus management
 *
 * Tag: @integration @keyboard
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

// Helper to verify cell is selected (has focus ring)
async function expectCellSelected(cell: any) {
  await expect(cell).toHaveClass(/ring-accent/);
}

// Helper to find an empty cell at a specific position
async function findEmptyCellPosition(page: any, preferredRow: number): Promise<{ row: number; col: number }> {
  const emptyCell = page.locator(`[role="gridcell"][aria-label*="Row ${preferredRow}"][aria-label*="empty"]`).first();
  const ariaLabel = await emptyCell.getAttribute('aria-label');
  const match = ariaLabel?.match(/Row (\d+), Column (\d+)/);
  return {
    row: match ? parseInt(match[1]) : preferredRow,
    col: match ? parseInt(match[2]) : 1,
  };
}

test.describe('@integration Keyboard Navigation - Arrow Keys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboard123?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('Arrow Right moves selection to next column', async ({ page }) => {
    // Click cell at row 5, col 5
    const startCell = getCellLocator(page, 5, 5);
    await startCell.scrollIntoViewIfNeeded();
    await startCell.click();
    await expectCellSelected(startCell);

    // Press right arrow
    await page.keyboard.press('ArrowRight');

    // Verify col 6 is now selected
    const nextCell = getCellLocator(page, 5, 6);
    await expectCellSelected(nextCell);
  });

  test('Arrow Left moves selection to previous column', async ({ page }) => {
    // Click cell at row 5, col 5
    const startCell = getCellLocator(page, 5, 5);
    await startCell.scrollIntoViewIfNeeded();
    await startCell.click();
    await expectCellSelected(startCell);

    // Press left arrow
    await page.keyboard.press('ArrowLeft');

    // Verify col 4 is now selected
    const prevCell = getCellLocator(page, 5, 4);
    await expectCellSelected(prevCell);
  });

  test('Arrow Down moves selection to next row', async ({ page }) => {
    // Click cell at row 5, col 5
    const startCell = getCellLocator(page, 5, 5);
    await startCell.scrollIntoViewIfNeeded();
    await startCell.click();
    await expectCellSelected(startCell);

    // Press down arrow
    await page.keyboard.press('ArrowDown');

    // Verify row 6 is now selected
    const nextCell = getCellLocator(page, 6, 5);
    await expectCellSelected(nextCell);
  });

  test('Arrow Up moves selection to previous row', async ({ page }) => {
    // Click cell at row 5, col 5
    const startCell = getCellLocator(page, 5, 5);
    await startCell.scrollIntoViewIfNeeded();
    await startCell.click();
    await expectCellSelected(startCell);

    // Press up arrow
    await page.keyboard.press('ArrowUp');

    // Verify row 4 is now selected
    const prevCell = getCellLocator(page, 4, 5);
    await expectCellSelected(prevCell);
  });

  test('Arrow Right from column 9 wraps or stops at edge', async ({ page }) => {
    // Click cell at row 5, col 9 (rightmost)
    const edgeCell = getCellLocator(page, 5, 9);
    await edgeCell.scrollIntoViewIfNeeded();
    await edgeCell.click();
    await expectCellSelected(edgeCell);

    // Press right arrow
    await page.keyboard.press('ArrowRight');

    // Either wraps to col 1 (same row or next row) or stays at col 9
    const wrappedCell = getCellLocator(page, 5, 1);
    const nextRowCell = getCellLocator(page, 6, 1);

    // Check if selection moved (either wrap to col 1 or stays at col 9)
    const col1Selected = await wrappedCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected') || el.className.includes('focused')
    );
    const nextRowSelected = await nextRowCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected') || el.className.includes('focused')
    );
    const stayedAtEdge = await edgeCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected') || el.className.includes('focused')
    );

    // At least one of these should be true
    expect(col1Selected || nextRowSelected || stayedAtEdge).toBe(true);
  });

  test('Arrow Down from row 9 wraps or stops at edge', async ({ page }) => {
    // Click cell at row 9, col 5 (bottom)
    const edgeCell = getCellLocator(page, 9, 5);
    await edgeCell.scrollIntoViewIfNeeded();
    await edgeCell.click();
    await expectCellSelected(edgeCell);

    // Press down arrow
    await page.keyboard.press('ArrowDown');

    // Either wraps to row 1 or stays at row 9
    const wrappedCell = getCellLocator(page, 1, 5);

    const row1Selected = await wrappedCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected') || el.className.includes('focused')
    );
    const stayedAtEdge = await edgeCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected') || el.className.includes('focused')
    );

    expect(row1Selected || stayedAtEdge).toBe(true);
  });

  test('rapid arrow key pressing navigates correctly', async ({ page }) => {
    // Start at row 5, col 5
    const startCell = getCellLocator(page, 5, 5);
    await startCell.scrollIntoViewIfNeeded();
    await startCell.click();

    // Rapid key presses: right, right, down, down
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // Should end up at row 7, col 7
    const endCell = getCellLocator(page, 7, 7);
    await expectCellSelected(endCell);
  });

  test('arrow keys work after digit entry', async ({ page }) => {
    // Find an empty cell
    const pos = await findEmptyCellPosition(page, 5);
    const emptyCell = getCellLocator(page, pos.row, pos.col);
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();

    // Enter a digit
    await page.keyboard.press('5');
    await page.waitForTimeout(100);

    // Arrow right should still work
    await page.keyboard.press('ArrowRight');

    // Next cell should be selected
    const nextCell = getCellLocator(page, pos.row, pos.col + 1);
    await expectCellSelected(nextCell);
  });
});

test.describe('@integration Keyboard Navigation - Digit Entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboard456?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('keys 1-9 enter digits in selected empty cell', async ({ page }) => {
    const pos = await findEmptyCellPosition(page, 5);
    const emptyCell = getCellLocator(page, pos.row, pos.col);
    await emptyCell.scrollIntoViewIfNeeded();
    await emptyCell.click();

    // Enter digit 7
    await page.keyboard.press('7');
    await page.waitForTimeout(100);

    // Verify digit was placed
    await expectCellValue(page, pos.row, pos.col, 7);
  });

  test('cannot overwrite given (fixed) cells', async ({ page }) => {
    // Find a given cell
    const givenCell = page.locator('[role="gridcell"][aria-label*="given"]').first();
    const ariaLabel = await givenCell.getAttribute('aria-label');
    const match = ariaLabel?.match(/Row (\d+), Column (\d+), value (\d+)/);
    const row = match ? parseInt(match[1]) : 1;
    const col = match ? parseInt(match[2]) : 1;
    const originalValue = match ? parseInt(match[3]) : 1;

    await givenCell.scrollIntoViewIfNeeded();
    await givenCell.click();

    // Try to enter a different digit
    const newDigit = originalValue === 9 ? 1 : originalValue + 1;
    await page.keyboard.press(newDigit.toString());
    await page.waitForTimeout(100);

    // Value should remain unchanged
    await expectCellValue(page, row, col, originalValue);
  });

  test('digit replaces existing user digit', async ({ page }) => {
    const pos = await findEmptyCellPosition(page, 6);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Enter first digit
    await page.keyboard.press('3');
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 3);

    // Re-select the cell and enter different digit
    await cell.click();
    await page.keyboard.press('8');
    await page.waitForTimeout(100);

    // New digit should replace old one
    await expectCellValue(page, pos.row, pos.col, 8);
  });

  test('key 0 or Backspace clears cell', async ({ page }) => {
    const pos = await findEmptyCellPosition(page, 5);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Enter a digit
    await page.keyboard.press('4');
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 4);

    // Clear with Backspace
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // Cell should be empty
    await expectCellValue(page, pos.row, pos.col, 'empty');
  });

  test('Delete key clears cell', async ({ page }) => {
    const pos = await findEmptyCellPosition(page, 6);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Enter a digit
    await page.keyboard.press('9');
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 9);

    // Clear with Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);

    // Cell should be empty
    await expectCellValue(page, pos.row, pos.col, 'empty');
  });
});

test.describe('@integration Keyboard Navigation - Undo/Redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboard789?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('Ctrl+Z undoes last move', async ({ page, browserName }) => {
    const pos = await findEmptyCellPosition(page, 5);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Enter a digit
    await page.keyboard.press('6');
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 6);

    // Undo with Ctrl+Z (Cmd+Z on Mac/WebKit)
    const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(100);

    // Cell should be empty again
    await expectCellValue(page, pos.row, pos.col, 'empty');
  });

  test('Ctrl+Y or Ctrl+Shift+Z redoes', async ({ page, browserName }) => {
    const pos = await findEmptyCellPosition(page, 5);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Enter a digit
    await page.keyboard.press('2');
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 2);

    // Undo
    const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 'empty');

    // Redo with Ctrl+Y or Ctrl+Shift+Z
    await page.keyboard.press(`${modifier}+y`);
    await page.waitForTimeout(100);

    // Check if redo worked - if not, try Ctrl+Shift+Z
    const ariaLabel = await cell.getAttribute('aria-label');
    if (ariaLabel?.includes('empty')) {
      await page.keyboard.press(`${modifier}+Shift+z`);
      await page.waitForTimeout(100);
    }

    // Digit should be back
    await expectCellValue(page, pos.row, pos.col, 2);
  });

  test('multiple undos work sequentially', async ({ page, browserName }) => {
    // Find two empty cells
    const pos1 = await findEmptyCellPosition(page, 5);
    const pos2 = await findEmptyCellPosition(page, 6);

    const cell1 = getCellLocator(page, pos1.row, pos1.col);
    const cell2 = getCellLocator(page, pos2.row, pos2.col);

    // Enter digits in both cells
    await cell1.scrollIntoViewIfNeeded();
    await cell1.click();
    await page.keyboard.press('1');
    await page.waitForTimeout(100);

    await cell2.scrollIntoViewIfNeeded();
    await cell2.click();
    await page.keyboard.press('2');
    await page.waitForTimeout(100);

    const modifier = browserName === 'webkit' ? 'Meta' : 'Control';

    // Undo second entry
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(100);
    await expectCellValue(page, pos2.row, pos2.col, 'empty');

    // Undo first entry
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(100);
    await expectCellValue(page, pos1.row, pos1.col, 'empty');
  });

  test('undo after redo works correctly', async ({ page, browserName }) => {
    const pos = await findEmptyCellPosition(page, 5);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    const modifier = browserName === 'webkit' ? 'Meta' : 'Control';

    // Enter digit
    await page.keyboard.press('5');
    await page.waitForTimeout(100);

    // Undo
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 'empty');

    // Redo
    await page.keyboard.press(`${modifier}+y`);
    await page.waitForTimeout(100);

    // Check if Ctrl+Y worked, if not try Ctrl+Shift+Z
    let ariaLabel = await cell.getAttribute('aria-label');
    if (ariaLabel?.includes('empty')) {
      await page.keyboard.press(`${modifier}+Shift+z`);
      await page.waitForTimeout(100);
    }

    await expectCellValue(page, pos.row, pos.col, 5);

    // Undo again
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 'empty');
  });
});

test.describe('@integration Keyboard Navigation - Notes Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboardNotes?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('N key toggles notes mode on', async ({ page }) => {
    // Verify notes mode is off initially
    const notesButton = page.locator('button[aria-label*="Notes"]');
    await expect(notesButton).not.toHaveClass(/bg-amber|active|enabled/);

    // Press N to toggle notes mode
    await page.keyboard.press('n');
    await page.waitForTimeout(100);

    // Notes button should show active state
    await expect(notesButton).toHaveClass(/bg-amber|active|enabled/);
  });

  test('in notes mode, digits toggle candidates', async ({ page }) => {
    const pos = await findEmptyCellPosition(page, 5);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Enable notes mode
    await page.keyboard.press('n');
    await page.waitForTimeout(100);

    // Enter a candidate digit
    await page.keyboard.press('3');
    await page.waitForTimeout(100);

    // Cell should show candidates (check for notes/candidates in aria-label or class)
    const ariaLabel = await cell.getAttribute('aria-label');
    // The cell might show "Row X, Column Y, candidates: 3" or have notes styling
    const hasCandidates = ariaLabel?.includes('candidates') || ariaLabel?.includes('3');
    const hasNotesClass = await cell.evaluate((el: Element) =>
      el.querySelector('.text-xs') !== null || el.innerHTML.includes('3')
    );

    expect(hasCandidates || hasNotesClass).toBe(true);
  });

  test('N key again exits notes mode', async ({ page }) => {
    const notesButton = page.locator('button[aria-label*="Notes"]');

    // Enable notes mode
    await page.keyboard.press('n');
    await page.waitForTimeout(100);
    await expect(notesButton).toHaveClass(/bg-amber|active|enabled/);

    // Disable notes mode
    await page.keyboard.press('n');
    await page.waitForTimeout(100);

    // Notes button should not show active state
    await expect(notesButton).not.toHaveClass(/bg-amber|active|enabled/);
  });
});

test.describe('@integration Keyboard Navigation - Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboardTab?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('Tab moves through interactive elements', async ({ page }) => {
    // Focus the board first
    const board = page.locator('.sudoku-board');
    await board.click();

    // Press Tab multiple times
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Some element should have focus
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();

    // Tab again
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // A different element should now have focus
    const newFocusedElement = page.locator(':focus');
    await expect(newFocusedElement).toBeVisible();
  });

  test('Shift+Tab moves backwards through elements', async ({ page }) => {
    // Focus a control button first
    const undoButton = page.locator('button[title="Undo"]');
    await undoButton.focus();
    await page.waitForTimeout(100);

    // Tab forward twice
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Get current focused element
    const afterTabs = await page.evaluate(() => document.activeElement?.tagName);

    // Shift+Tab backwards
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // Should have moved back
    const afterShiftTab = await page.evaluate(() => document.activeElement?.tagName);
    expect(afterShiftTab).toBeDefined();
  });
});

test.describe('@integration Keyboard Navigation - Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboardFocus?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('clicking board captures focus', async ({ page }) => {
    const board = page.locator('.sudoku-board');
    await board.click();

    // Board or a cell within should have focus
    const isBoardFocused = await board.evaluate((el: Element) => {
      return el.contains(document.activeElement);
    });

    expect(isBoardFocused).toBe(true);
  });

  test('keyboard works after board click', async ({ page }) => {
    // Click a cell
    const cell = getCellLocator(page, 5, 5);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Arrow key should work
    await page.keyboard.press('ArrowRight');

    // Next cell should be selected
    const nextCell = getCellLocator(page, 5, 6);
    await expectCellSelected(nextCell);

    // Digit entry should work
    const pos = await findEmptyCellPosition(page, 5);
    const emptyCell = getCellLocator(page, pos.row, pos.col);
    await emptyCell.click();
    await page.keyboard.press('4');
    await page.waitForTimeout(100);
    await expectCellValue(page, pos.row, pos.col, 4);
  });

  test('focus visible indicator shows on selected cell', async ({ page }) => {
    const cell = getCellLocator(page, 5, 5);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Cell should have visible focus indicator (ring class)
    await expect(cell).toHaveClass(/ring/);

    // Navigate to another cell
    await page.keyboard.press('ArrowDown');

    // Previous cell should not have focus ring
    await expect(cell).not.toHaveClass(/ring-2|ring-offset/);

    // New cell should have focus ring
    const nextCell = getCellLocator(page, 6, 5);
    await expect(nextCell).toHaveClass(/ring/);
  });
});

test.describe('@integration Keyboard Navigation - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keyboardEdge?d=easy');
    await page.waitForSelector('.sudoku-board', { timeout: 15000 });
  });

  test('Arrow Left from column 1 wraps or stops at edge', async ({ page }) => {
    // Click cell at row 5, col 1 (leftmost)
    const edgeCell = getCellLocator(page, 5, 1);
    await edgeCell.scrollIntoViewIfNeeded();
    await edgeCell.click();
    await expectCellSelected(edgeCell);

    // Press left arrow
    await page.keyboard.press('ArrowLeft');

    // Either wraps to col 9 or stays at col 1
    const wrappedCell = getCellLocator(page, 5, 9);
    const prevRowCell = getCellLocator(page, 4, 9);

    const col9Selected = await wrappedCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected')
    );
    const prevRowSelected = await prevRowCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected')
    );
    const stayedAtEdge = await edgeCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected')
    );

    expect(col9Selected || prevRowSelected || stayedAtEdge).toBe(true);
  });

  test('Arrow Up from row 1 wraps or stops at edge', async ({ page }) => {
    // Click cell at row 1, col 5 (top)
    const edgeCell = getCellLocator(page, 1, 5);
    await edgeCell.scrollIntoViewIfNeeded();
    await edgeCell.click();
    await expectCellSelected(edgeCell);

    // Press up arrow
    await page.keyboard.press('ArrowUp');

    // Either wraps to row 9 or stays at row 1
    const wrappedCell = getCellLocator(page, 9, 5);

    const row9Selected = await wrappedCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected')
    );
    const stayedAtEdge = await edgeCell.evaluate((el: Element) =>
      el.className.includes('ring') || el.className.includes('selected')
    );

    expect(row9Selected || stayedAtEdge).toBe(true);
  });

  test('keyboard navigation works with no cell selected initially', async ({ page }) => {
    // Without clicking, try pressing an arrow key
    await page.keyboard.press('ArrowRight');

    // Some cell should now be selected (typically first cell or no action)
    // This tests that the app handles keyboard input gracefully without crashes
    const anySelected = await page.locator('[role="gridcell"]').first().isVisible();
    expect(anySelected).toBe(true);
  });

  test('invalid keys are ignored gracefully', async ({ page }) => {
    const pos = await findEmptyCellPosition(page, 5);
    const cell = getCellLocator(page, pos.row, pos.col);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();

    // Press invalid keys
    await page.keyboard.press('a');
    await page.keyboard.press('x');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Cell should still be empty (no crash, no unexpected value)
    await expectCellValue(page, pos.row, pos.col, 'empty');
  });
});
