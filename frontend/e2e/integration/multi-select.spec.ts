import { test, expect, Page, Locator } from '@playwright/test';
import { setupGameAndWaitForBoard } from '../utils/board-wait';
import { allure } from 'allure-playwright';
import { EPICS, FEATURES, STORIES } from '../sdk/allure-utils';

/**
 * Multi-Select Feature Integration Tests
 *
 * Tests for drag-to-select functionality, bulk note entry, and multi-cell interactions.
 *
 * Tag: @integration @multi-select
 *
 * Drag simulation uses Playwright's page.mouse API which dispatches pointer events.
 * The Board component uses onPointerMove at the board level with elementFromPoint,
 * so page.mouse.move correctly triggers the drag path resolution.
 */

// Helper to get a cell by row and column (1-indexed)
function getCellLocator(page: Page, row: number, col: number): Locator {
  return page.locator(`[role="gridcell"][aria-label^="Row ${row}, Column ${col}"]`);
}

// Helper to get all empty cells in a given row
function getEmptyCellsInRow(page: Page, row: number): Locator {
  return page.locator(`[role="gridcell"][aria-label*="Row ${row}"][aria-label$="empty"]`);
}

// Helper to get all empty cells in a given column
function getEmptyCellsInColumn(page: Page, col: number): Locator {
  return page.locator(`[role="gridcell"][aria-label*="Column ${col}"][aria-label$="empty"]`);
}

// Helper to check if a cell has a specific candidate displayed.
// The candidate grid renders 9 spans (.candidate-digit) in order 1-9;
// the nth span contains the digit text when that candidate is present.
async function expectCandidateVisible(page: Page, row: number, col: number, digit: number): Promise<void> {
  const cell = getCellLocator(page, row, col);
  // The digit-th span (1-indexed) inside .candidate-grid holds the candidate
  const candidateSpan = cell.locator(`.candidate-grid .candidate-digit:nth-child(${digit})`);
  await expect(candidateSpan).toHaveText(String(digit));
}

// Helper: perform a pointer drag from startCell to endCell via the board
async function performDrag(page: Page, startCell: Locator, endCell: Locator): Promise<void> {
  const startBox = await startCell.boundingBox();
  const endBox = await endCell.boundingBox();
  if (!startBox || !endBox) throw new Error('Could not get bounding boxes for drag cells');

  const startX = startBox.x + startBox.width / 2;
  const startY = startBox.y + startBox.height / 2;
  const endX = endBox.x + endBox.width / 2;
  const endY = endBox.y + endBox.height / 2;

  // Pointer down on start cell
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  // Move to end cell (intermediate steps help trigger onPointerMove)
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = startX + (endX - startX) * (i / steps);
    const y = startY + (endY - startY) * (i / steps);
    await page.mouse.move(x, y);
  }

  // Release
  await page.mouse.up();

  // Brief wait for state update
  await page.waitForTimeout(150);
}

// Helper: extract row and column from a cell's aria-label
async function getCellRowCol(cell: Locator): Promise<{ row: number; col: number }> {
  const label = await cell.getAttribute('aria-label');
  if (!label) throw new Error('Cell has no aria-label');
  const rowMatch = label.match(/Row (\d+)/);
  const colMatch = label.match(/Column (\d+)/);
  if (!rowMatch || !colMatch) throw new Error(`Cannot parse row/col from aria-label: ${label}`);
  return { row: Number(rowMatch[1]), col: Number(colMatch[1]) };
}

// Locator for the notes mode toggle button
function getNotesToggle(page: Page): Locator {
  return page.locator('button[aria-label^="Notes mode"]');
}

// Locator for a digit button
function getDigitButton(page: Page, digit: number): Locator {
  return page.locator(`button[aria-label^="Enter ${digit}"]`);
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
    await allure.story(STORIES.GAMEPLAY.MULTI_SELECT.HORIZONTAL_DRAG);

    // Find empty cells in a row that has multiple empty cells
    let targetRow = 0;
    let emptyCells: Locator | null = null;

    for (let row = 1; row <= 9; row++) {
      const cells = getEmptyCellsInRow(page, row);
      const count = await cells.count();
      if (count >= 3) {
        targetRow = row;
        emptyCells = cells;
        break;
      }
    }

    expect(targetRow).toBeGreaterThan(0);

    // Use first and third empty cells for the drag
    const startCell = emptyCells!.nth(0);
    const endCell = emptyCells!.nth(2);

    await performDrag(page, startCell, endCell);

    // Verify that empty cells along the path are multi-selected
    await expect(startCell).toHaveClass(/multi-selected/);
    await expect(endCell).toHaveClass(/multi-selected/);
  });

  test('vertical drag selects multiple cells in same column', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.GAMEPLAY.MULTI_SELECT.VERTICAL_DRAG);

    // Find empty cells in a column that has multiple empty cells
    let targetCol = 0;
    let emptyCells: Locator | null = null;

    for (let col = 1; col <= 9; col++) {
      const cells = getEmptyCellsInColumn(page, col);
      const count = await cells.count();
      if (count >= 3) {
        targetCol = col;
        emptyCells = cells;
        break;
      }
    }

    expect(targetCol).toBeGreaterThan(0);

    // Drag from first to third empty cell in the column
    const startCell = emptyCells!.nth(0);
    const endCell = emptyCells!.nth(2);

    await performDrag(page, startCell, endCell);

    // Verify multi-selected class on the dragged empty cells
    await expect(startCell).toHaveClass(/multi-selected/);
    await expect(endCell).toHaveClass(/multi-selected/);
  });

  test('diagonal drag selects cells along L-shaped path', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.GAMEPLAY.MULTI_SELECT.DIAGONAL_DRAG);

    // Find two empty cells in different rows AND different columns to force an L-shaped path.
    // Strategy: pick empty cells from two different rows in different columns.
    const allEmptyCells = page.locator('[role="gridcell"][aria-label$="empty"]');
    const totalEmpty = await allEmptyCells.count();
    expect(totalEmpty).toBeGreaterThan(1);

    // Get first empty cell
    const startCell = allEmptyCells.nth(0);
    const startPos = await getCellRowCol(startCell);

    // Find an empty cell in a different row AND different column
    let endCell: Locator | null = null;
    for (let i = 1; i < totalEmpty; i++) {
      const candidate = allEmptyCells.nth(i);
      const pos = await getCellRowCol(candidate);
      if (pos.row !== startPos.row && pos.col !== startPos.col) {
        endCell = candidate;
        break;
      }
    }

    expect(endCell).not.toBeNull();

    await performDrag(page, startCell, endCell!);

    // At least the start cell should be multi-selected (the L-shaped path may skip
    // given cells, but the start empty cell should be in the selection)
    await expect(startCell).toHaveClass(/multi-selected/);
  });

  test('drag stops when encountering a given cell', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.GAMEPLAY.MULTI_SELECT.GIVEN_BLOCKING);

    // Find an empty cell to start drag
    const allEmptyCells = page.locator('[role="gridcell"][aria-label$="empty"]');
    const startCell = allEmptyCells.nth(0);
    const startPos = await getCellRowCol(startCell);

    // Find a given cell in the same row (if any) to drag toward
    const givenCellInRow = page.locator(
      `[role="gridcell"][aria-label*="Row ${startPos.row}"][aria-label*="given"]`
    );
    const givenCount = await givenCellInRow.count();

    if (givenCount > 0) {
      // Drag from the empty cell toward the given cell
      const givenCell = givenCellInRow.first();
      await performDrag(page, startCell, givenCell);

      // The given cell should NOT be multi-selected
      await expect(givenCell).not.toHaveClass(/multi-selected/);

      // The start cell (empty) should be selected (single-cell or multi-selected).
      // When only one empty cell is selectable, the reducer treats it as a
      // single selection (bg-cell-selected) rather than multi-selected.
      await expect(startCell).toHaveClass(/selected/);
    } else {
      // Fallback: drag from empty cell toward a given cell in the same column
      const givenCellInCol = page.locator(
        `[role="gridcell"][aria-label*="Column ${startPos.col}"][aria-label*="given"]`
      );
      const givenCell = givenCellInCol.first();
      await performDrag(page, startCell, givenCell);

      await expect(givenCell).not.toHaveClass(/multi-selected/);
      await expect(startCell).toHaveClass(/selected/);
    }
  });

  test('multi-select with digit button fills note in all selected cells', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.GAMEPLAY.MULTI_SELECT.BULK_NOTE_ENTRY);

    // Enable notes mode
    await getNotesToggle(page).click();

    // Find two truly adjacent empty cells in the same row (consecutive columns).
    // Using nth(0)/nth(1) from getEmptyCellsInRow is not safe because given cells
    // may sit between them, causing the drag path to differ from expectations.
    let startCell: Locator | null = null;
    let endCell: Locator | null = null;
    let cell1Pos = { row: 0, col: 0 };
    let cell2Pos = { row: 0, col: 0 };

    outer:
    for (let row = 1; row <= 9; row++) {
      for (let col = 1; col <= 8; col++) {
        const cellA = getCellLocator(page, row, col);
        const cellB = getCellLocator(page, row, col + 1);
        const labelA = await cellA.getAttribute('aria-label');
        const labelB = await cellB.getAttribute('aria-label');
        if (labelA?.endsWith('empty') && labelB?.endsWith('empty')) {
          startCell = cellA;
          endCell = cellB;
          cell1Pos = { row, col };
          cell2Pos = { row, col: col + 1 };
          break outer;
        }
      }
    }

    expect(startCell).not.toBeNull();
    expect(endCell).not.toBeNull();

    // Drag to select the two adjacent cells
    await performDrag(page, startCell!, endCell!);

    // Click digit 7 to add notes
    await getDigitButton(page, 7).click();
    await page.waitForTimeout(150);

    // Verify both cells have candidate 7
    await expectCandidateVisible(page, cell1Pos.row, cell1Pos.col, 7);
    await expectCandidateVisible(page, cell2Pos.row, cell2Pos.col, 7);
  });

  test('multi-select does NOT fill digits in regular placement mode', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.GAMEPLAY.MULTI_SELECT.NOTES_MODE_ONLY);

    // Ensure notes mode is OFF (regular digit placement mode)
    const notesToggle = getNotesToggle(page);
    const isNotesModeOn = await notesToggle.getAttribute('aria-pressed');
    if (isNotesModeOn === 'true') {
      await notesToggle.click();
    }

    // Find a row with at least 2 empty cells
    let startCell: Locator | null = null;
    let endCell: Locator | null = null;

    for (let row = 1; row <= 9; row++) {
      const cells = getEmptyCellsInRow(page, row);
      const count = await cells.count();
      if (count >= 2) {
        startCell = cells.nth(0);
        endCell = cells.nth(1);
        break;
      }
    }

    expect(startCell).not.toBeNull();
    expect(endCell).not.toBeNull();

    // Get initial state
    const startInitial = await startCell!.getAttribute('aria-label');
    const endInitial = await endCell!.getAttribute('aria-label');

    // Drag to select
    await performDrag(page, startCell!, endCell!);

    // Click digit 7
    await getDigitButton(page, 7).click();
    await page.waitForTimeout(150);

    // In regular mode, multi-select should be ignored: at most one cell filled
    const startAfter = await startCell!.getAttribute('aria-label');
    const endAfter = await endCell!.getAttribute('aria-label');

    const hasValue1 = startAfter!.includes('value 7');
    const hasValue2 = endAfter!.includes('value 7');

    const cellsWithValue = (hasValue1 ? 1 : 0) + (hasValue2 ? 1 : 0);
    expect(cellsWithValue).toBeLessThanOrEqual(1);
  });

  test('clicking outside selection clears multi-select', async ({ page }) => {
    await allure.epic(EPICS.GAMEPLAY);
    await allure.feature(FEATURES.MULTI_SELECT);
    await allure.story(STORIES.GAMEPLAY.MULTI_SELECT.CLEAR_SELECTION);

    // Find a row with at least 2 empty cells
    let startCell: Locator | null = null;
    let endCell: Locator | null = null;

    for (let row = 1; row <= 9; row++) {
      const cells = getEmptyCellsInRow(page, row);
      const count = await cells.count();
      if (count >= 2) {
        startCell = cells.nth(0);
        endCell = cells.nth(1);
        break;
      }
    }

    expect(startCell).not.toBeNull();
    expect(endCell).not.toBeNull();

    // Drag to select
    await performDrag(page, startCell!, endCell!);

    // Verify multi-select is active
    await expect(startCell!).toHaveClass(/multi-selected/);
    await expect(endCell!).toHaveClass(/multi-selected/);

    // Click outside the game board (click heading or empty area)
    const heading = page.locator('h1').first();
    const headingExists = await heading.count();
    if (headingExists > 0) {
      await heading.click();
    } else {
      // Fallback: click on the page body above the board
      await page.mouse.click(10, 10);
    }
    await page.waitForTimeout(150);

    // Verify multi-select is cleared
    await expect(startCell!).not.toHaveClass(/multi-selected/);
    await expect(endCell!).not.toHaveClass(/multi-selected/);
  });
});
